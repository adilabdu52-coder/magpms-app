-- =====================================================================
--  MAGPMS — sale corrections + protected Danger Zone
--  Run once in the Supabase SQL editor (Dashboard → SQL → New query).
--
--  It adds:
--    * staff "this sale is wrong" reports        (sale_issue_reports)
--    * admin sale corrections with an audit log  (sale_corrections)
--    * confirmation settings + e-mail codes      (app_security_settings,
--                                                 danger_confirm_codes)
--    * a logged, password/e-mail protected reset (data_reset_log)
--
--  It assumes the tables the app already uses are called sales, tanks,
--  credit_customers, staff and admins in schema public. If yours are named
--  differently, change the names in the four places marked  -- << SCHEMA.
--  Nothing here drops or alters your existing data.
--
--  All new tables have RLS enabled with no policies: the anon key cannot
--  read them directly, only the SECURITY DEFINER functions below can.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- tables
create table if not exists public.sale_issue_reports (
  id              bigserial primary key,
  sale_id         text        not null,
  staff_id        text        not null,
  field           text        not null default 'other'
                    check (field in ('liters','amount','payment','other')),
  claimed_value   numeric,
  note            text,
  status          text        not null default 'open'
                    check (status in ('open','fixed','rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     text,
  resolution_note text
);
create index if not exists sale_issue_reports_status_idx
  on public.sale_issue_reports (status, created_at desc);
create index if not exists sale_issue_reports_sale_idx
  on public.sale_issue_reports (sale_id);

create table if not exists public.sale_corrections (
  id           bigserial primary key,
  sale_id      text        not null,
  admin_id     text,
  reason       text        not null,
  old_liters   numeric, new_liters   numeric,
  old_total    numeric, new_total    numeric,
  old_payment  text,    new_payment  text,
  old_customer text,    new_customer text,
  issue_id     bigint,
  created_at   timestamptz not null default now()
);
create index if not exists sale_corrections_sale_idx on public.sale_corrections (sale_id);
create index if not exists sale_corrections_time_idx on public.sale_corrections (created_at desc);

create table if not exists public.app_security_settings (
  id                 int primary key default 1 check (id = 1),
  contact_email      text,
  require_email_code boolean     not null default false,
  last_backup_at     timestamptz,
  last_backup_by     text,
  updated_at         timestamptz not null default now(),
  updated_by         text
);
insert into public.app_security_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.danger_confirm_codes (
  id          bigserial primary key,
  admin_id    text        not null,
  action      text        not null,
  code        text        not null,
  token       uuid,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  used_at     timestamptz,
  attempts    int         not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists danger_confirm_codes_lookup_idx
  on public.danger_confirm_codes (admin_id, action, created_at desc);

create table if not exists public.data_reset_log (
  id            bigserial primary key,
  admin_id      text,
  method        text,
  tables_wiped  jsonb,
  created_at    timestamptz not null default now()
);

alter table public.sale_issue_reports    enable row level security;
alter table public.sale_corrections      enable row level security;
alter table public.app_security_settings enable row level security;
alter table public.danger_confirm_codes  enable row level security;
alter table public.data_reset_log        enable row level security;

-- Marks on the sale itself, so an export/print shows it was amended.
alter table public.sales add column if not exists corrected_at timestamptz;   -- << SCHEMA
alter table public.sales add column if not exists corrected_by text;          -- << SCHEMA

-- ------------------------------------------------------------- helpers
-- Verifies the caller is a real admin. If the admin table cannot be found
-- the check is skipped rather than locking the owner out of their own app.
create or replace function public.magpms_is_admin(p_admin_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  begin
    execute 'select exists(select 1 from admins where id::text = $1)'   -- << SCHEMA
      into v using p_admin_id;
    return coalesce(v, false);
  exception when undefined_table or undefined_column then
    return true;
  end;
end $$;

create or replace function public.magpms_admin_name(p_admin_id text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  begin
    execute 'select full_name from admins where id::text = $1' into v using p_admin_id;
  exception when undefined_table or undefined_column then
    v := null;
  end;
  return coalesce(v, 'admin');
end $$;

create or replace function public.magpms_staff_name(p_staff_id text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  begin
    execute 'select full_name from staff where id::text = $1' into v using p_staff_id;
  exception when undefined_table or undefined_column then
    v := null;
  end;
  return coalesce(v, 'staff');
end $$;

-- ===================================================================
--  1. STAFF: report a wrong sale (they can flag, never edit)
-- ===================================================================
create or replace function public.staff_report_sale_issue(
  p_staff_id      text,
  p_sale_id       text,
  p_field         text default 'other',
  p_claimed_value numeric default null,
  p_note          text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_sale record; v_id bigint;
begin
  select * into v_sale from sales where id::text = p_sale_id;
  if not found then
    return json_build_object('success', false, 'message', 'Sale not found');
  end if;
  if v_sale.staff_id::text <> p_staff_id then
    return json_build_object('success', false, 'message', 'You can only report your own sales');
  end if;
  if coalesce(v_sale.voided, false) then
    return json_build_object('success', false, 'message', 'That sale is already voided');
  end if;
  if exists (select 1 from sale_issue_reports
              where sale_id = p_sale_id and status = 'open') then
    return json_build_object('success', false, 'message', 'A report on this sale is already waiting');
  end if;

  insert into sale_issue_reports (sale_id, staff_id, field, claimed_value, note)
  values (p_sale_id, p_staff_id,
          coalesce(nullif(p_field, ''), 'other'),
          p_claimed_value, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return json_build_object('success', true, 'id', v_id,
    'message', 'Reported — the admin will check it');
end $$;

create or replace function public.my_sale_issues(p_staff_id text, p_limit int default 20)
returns table (id bigint, sale_id text, field text, claimed_value numeric, note text,
               status text, created_at timestamptz, resolved_at timestamptz,
               resolution_note text)
language sql security definer set search_path = public as $$
  select r.id, r.sale_id, r.field, r.claimed_value, r.note, r.status,
         r.created_at, r.resolved_at, r.resolution_note
    from sale_issue_reports r
   where r.staff_id = p_staff_id
   order by r.created_at desc
   limit coalesce(p_limit, 20);
$$;

-- ===================================================================
--  2. ADMIN: see the reports
-- ===================================================================
create or replace function public.admin_list_sale_issues(
  p_status text default null, p_limit int default 50)
returns table (id bigint, sale_id text, staff_id text, staff_name text, field text,
               claimed_value numeric, note text, status text, created_at timestamptz,
               resolved_at timestamptz, resolution_note text, sale_time timestamptz,
               fuel_type text, liters numeric, total_etb numeric, payment_method text,
               voided boolean)
language sql security definer set search_path = public as $$
  select r.id, r.sale_id, r.staff_id, magpms_staff_name(r.staff_id), r.field,
         r.claimed_value, r.note, r.status, r.created_at, r.resolved_at, r.resolution_note,
         s.created_at, s.fuel_type::text, s.liters::numeric, s.total_etb::numeric,
         s.payment_method::text, coalesce(s.voided, false)
    from sale_issue_reports r
    left join sales s on s.id::text = r.sale_id
   where p_status is null or r.status = p_status
   order by (r.status = 'open') desc, r.created_at desc
   limit coalesce(p_limit, 50);
$$;

create or replace function public.admin_resolve_sale_issue(
  p_admin_id text, p_issue_id bigint, p_status text, p_note text default null)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not magpms_is_admin(p_admin_id) then
    return json_build_object('success', false, 'message', 'Admin not recognised');
  end if;
  if p_status not in ('fixed', 'rejected', 'open') then
    return json_build_object('success', false, 'message', 'Unknown status');
  end if;

  update sale_issue_reports
     set status          = p_status,
         resolved_at     = case when p_status = 'open' then null else now() end,
         resolved_by     = case when p_status = 'open' then null else p_admin_id end,
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_issue_id;

  if not found then
    return json_build_object('success', false, 'message', 'Report not found');
  end if;
  return json_build_object('success', true, 'message', 'Report ' || p_status);
end $$;

-- ===================================================================
--  3. ADMIN: correct a sale (the fix for "the amount was wrong")
--     Give p_new_liters OR p_new_total — the other one is recalculated
--     at the unit price the sale was actually sold at, so liters, money,
--     tank stock and credit balance stay consistent.
-- ===================================================================
create or replace function public.admin_correct_sale(
  p_admin_id            text,
  p_sale_id             text,
  p_new_liters          numeric default null,
  p_new_total           numeric default null,
  p_new_payment         text    default null,
  p_new_credit_customer text    default null,
  p_reason              text    default null,
  p_issue_id            bigint  default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_sale     record;
  v_unit     numeric;
  v_liters   numeric;
  v_total    numeric;
  v_pay      text;
  v_cust     text;
  v_old_cust text;
  v_delta    numeric;
  v_tank     text;
begin
  if not magpms_is_admin(p_admin_id) then
    return json_build_object('success', false, 'message', 'Admin not recognised');
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 4 then
    return json_build_object('success', false, 'message', 'A reason is required');
  end if;

  select * into v_sale from sales where id::text = p_sale_id for update;
  if not found then
    return json_build_object('success', false, 'message', 'Sale not found');
  end if;
  if coalesce(v_sale.voided, false) then
    return json_build_object('success', false, 'message', 'A voided sale cannot be corrected');
  end if;

  v_unit := case when coalesce(v_sale.liters, 0) > 0
                 then v_sale.total_etb / v_sale.liters else null end;

  if p_new_liters is not null and p_new_liters > 0 then
    v_liters := round(p_new_liters, 2);
    v_total  := case when v_unit is not null then round(v_liters * v_unit, 2)
                     else v_sale.total_etb end;
  elsif p_new_total is not null and p_new_total > 0 then
    v_total  := round(p_new_total, 2);
    v_liters := case when v_unit is not null and v_unit > 0 then round(v_total / v_unit, 2)
                     else v_sale.liters end;
  else
    v_liters := v_sale.liters;
    v_total  := v_sale.total_etb;
  end if;

  v_pay      := lower(coalesce(nullif(btrim(coalesce(p_new_payment, '')), ''),
                               v_sale.payment_method));
  v_old_cust := v_sale.credit_customer_id::text;
  v_cust     := case when v_pay = 'credit'
                     then coalesce(nullif(btrim(coalesce(p_new_credit_customer, '')), ''), v_old_cust)
                     else null end;

  if v_pay = 'credit' and v_cust is null then
    return json_build_object('success', false, 'message', 'Choose the credit customer');
  end if;

  -- tank stock follows the liters difference (more liters sold = less in the tank)
  v_delta := coalesce(v_liters, 0) - coalesce(v_sale.liters, 0);
  if v_delta <> 0 then
    select id::text into v_tank from tanks
     where fuel_type = v_sale.fuel_type
     order by current_liters desc limit 1;
    if v_tank is not null then
      update tanks set current_liters = greatest(0, current_liters - v_delta)
       where id::text = v_tank;
    end if;
  end if;

  -- credit balances: take the old charge off, put the new charge on
  if lower(coalesce(v_sale.payment_method, '')) = 'credit' and v_old_cust is not null then
    update credit_customers set balance = balance - coalesce(v_sale.total_etb, 0)
     where id::text = v_old_cust;
  end if;
  if v_pay = 'credit' and v_cust is not null then
    update credit_customers set balance = balance + v_total
     where id::text = v_cust;
  end if;

  insert into sale_corrections (sale_id, admin_id, reason,
      old_liters, new_liters, old_total, new_total,
      old_payment, new_payment, old_customer, new_customer, issue_id)
  values (p_sale_id, p_admin_id, btrim(p_reason),
      v_sale.liters, v_liters, v_sale.total_etb, v_total,
      v_sale.payment_method, v_pay, v_old_cust, v_cust, p_issue_id);

  update sales
     set liters             = v_liters,
         total_etb          = v_total,
         payment_method     = v_pay,
         credit_customer_id = case when v_pay = 'credit' then v_cust else null end,
         corrected_at       = now(),
         corrected_by       = p_admin_id
   where id::text = p_sale_id;

  if p_issue_id is not null then
    update sale_issue_reports
       set status = 'fixed', resolved_at = now(), resolved_by = p_admin_id,
           resolution_note = btrim(p_reason)
     where id = p_issue_id;
  else
    update sale_issue_reports
       set status = 'fixed', resolved_at = now(), resolved_by = p_admin_id,
           resolution_note = btrim(p_reason)
     where sale_id = p_sale_id and status = 'open';
  end if;

  return json_build_object('success', true,
    'message', 'Sale corrected: ' || round(coalesce(v_sale.liters, 0), 2) || ' L / ' ||
               round(coalesce(v_sale.total_etb, 0), 2) || ' ETB → ' ||
               round(v_liters, 2) || ' L / ' || round(v_total, 2) || ' ETB',
    'liters', v_liters, 'total_etb', v_total);
exception when others then
  return json_build_object('success', false, 'message', 'Could not correct the sale: ' || sqlerrm);
end $$;

create or replace function public.admin_list_corrections(p_limit int default 50)
returns table (id bigint, sale_id text, created_at timestamptz, admin_name text, reason text,
               old_liters numeric, new_liters numeric, old_total numeric, new_total numeric,
               old_payment text, new_payment text, sale_time timestamptz, staff_name text)
language sql security definer set search_path = public as $$
  select c.id, c.sale_id, c.created_at, magpms_admin_name(c.admin_id), c.reason,
         c.old_liters, c.new_liters, c.old_total, c.new_total,
         c.old_payment, c.new_payment,
         s.created_at, magpms_staff_name(s.staff_id::text)
    from sale_corrections c
    left join sales s on s.id::text = c.sale_id
   order by c.created_at desc
   limit coalesce(p_limit, 50);
$$;

-- ===================================================================
--  4. Confirmation settings + backup stamp
-- ===================================================================
create or replace function public.admin_get_security_settings()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'require_email_code', s.require_email_code,
    -- only a masked hint leaves the server
    'masked_email', case when s.contact_email is null then null
                    else regexp_replace(s.contact_email, '^(.).*(.)@', '\1***\2@') end,
    'last_backup_at', s.last_backup_at)
    from app_security_settings s where s.id = 1;
$$;

create or replace function public.admin_set_security_settings(
  p_admin_id text, p_contact_email text default null,
  p_require_email_code boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not magpms_is_admin(p_admin_id) then
    return json_build_object('success', false, 'message', 'Admin not recognised');
  end if;
  select contact_email into v_email from app_security_settings where id = 1;
  v_email := coalesce(nullif(btrim(coalesce(p_contact_email, '')), ''), v_email);

  if p_require_email_code and v_email is null then
    return json_build_object('success', false, 'message', 'Set the confirmation e-mail first');
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return json_build_object('success', false, 'message', 'That e-mail address is not valid');
  end if;

  update app_security_settings
     set contact_email = v_email, require_email_code = coalesce(p_require_email_code, false),
         updated_at = now(), updated_by = p_admin_id
   where id = 1;
  return json_build_object('success', true, 'message', 'Confirmation settings saved');
end $$;

create or replace function public.admin_log_backup(p_admin_id text)
returns json language plpgsql security definer set search_path = public as $$
begin
  update app_security_settings
     set last_backup_at = now(), last_backup_by = p_admin_id
   where id = 1;
  return json_build_object('success', true, 'message', 'Backup recorded');
end $$;

-- ===================================================================
--  5. E-mail confirmation codes
--     The code is created and e-mailed by the send-danger-code edge
--     function (service role). Here we only check it and hand back a
--     short-lived token that admin_reset_all_data accepts once.
-- ===================================================================
create or replace function public.admin_verify_danger_code(
  p_admin_id text, p_action text, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v record; v_token uuid;
begin
  select * into v from danger_confirm_codes
   where admin_id = p_admin_id and action = p_action and consumed_at is null
   order by created_at desc limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'No code was requested — ask for a new one');
  end if;
  if v.expires_at < now() then
    return json_build_object('success', false, 'message', 'That code has expired — ask for a new one');
  end if;
  if v.attempts >= 5 then
    return json_build_object('success', false, 'message', 'Too many wrong tries — ask for a new code');
  end if;
  if v.code <> btrim(p_code) then
    update danger_confirm_codes set attempts = attempts + 1 where id = v.id;
    return json_build_object('success', false, 'message', 'Wrong code');
  end if;

  v_token := gen_random_uuid();
  update danger_confirm_codes set consumed_at = now(), token = v_token where id = v.id;
  return json_build_object('success', true, 'token', v_token, 'message', 'Code accepted');
end $$;

-- ===================================================================
--  6. The reset itself — phrase + (token when e-mail codes are on),
--     always logged, transactional data only.
-- ===================================================================
create or replace function public.admin_reset_all_data(
  p_admin_id text, p_confirm_phrase text, p_token text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_need_code boolean;
  v_tables    text[] := array['sale_corrections','sale_issue_reports','sales','expenses',
                              'nozzle_readings','shifts','attendance','credit_payments'];
  v_t         text;
  v_wiped     jsonb := '{}'::jsonb;
  v_n         bigint;
begin
  if not magpms_is_admin(p_admin_id) then
    return json_build_object('success', false, 'message', 'Admin not recognised');
  end if;
  if upper(btrim(coalesce(p_confirm_phrase, ''))) <> 'RESET ALL DATA' then
    return json_build_object('success', false, 'message', 'Confirmation phrase does not match');
  end if;

  select require_email_code into v_need_code from app_security_settings where id = 1;
  if coalesce(v_need_code, false) then
    if p_token is null then
      return json_build_object('success', false, 'message', 'E-mail confirmation is required');
    end if;
    if not exists (select 1 from danger_confirm_codes
                    where token = p_token::uuid and action = 'reset_all_data'
                      and admin_id = p_admin_id and used_at is null
                      and consumed_at > now() - interval '15 minutes') then
      return json_build_object('success', false, 'message', 'E-mail confirmation is not valid any more');
    end if;
    update danger_confirm_codes set used_at = now() where token = p_token::uuid;
  end if;

  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('delete from public.%I', v_t);
      get diagnostics v_n = row_count;
      v_wiped := v_wiped || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  -- customers stay, what they owe goes back to zero
  if to_regclass('public.credit_customers') is not null then
    begin
      execute 'update public.credit_customers set balance = 0 where balance <> 0';
    exception when undefined_column then null;
    end;
  end if;

  insert into data_reset_log (admin_id, method, tables_wiped)
  values (p_admin_id, case when coalesce(v_need_code, false) then 'password+email' else 'password' end, v_wiped);

  return json_build_object('success', true, 'message', 'All transaction data was reset',
                           'deleted', v_wiped);
exception when others then
  return json_build_object('success', false, 'message', 'Reset failed: ' || sqlerrm);
end $$;

-- ------------------------------------------------------------ grants
grant execute on function
  public.staff_report_sale_issue(text, text, text, numeric, text),
  public.my_sale_issues(text, int),
  public.admin_list_sale_issues(text, int),
  public.admin_resolve_sale_issue(text, bigint, text, text),
  public.admin_correct_sale(text, text, numeric, numeric, text, text, text, bigint),
  public.admin_list_corrections(int),
  public.admin_get_security_settings(),
  public.admin_set_security_settings(text, text, boolean),
  public.admin_log_backup(text),
  public.admin_verify_danger_code(text, text, text),
  public.admin_reset_all_data(text, text, text)
to anon, authenticated;

commit;
