# Sale corrections & protected Danger Zone

Two things were added:

1. **A wrong sale can be fixed** — staff report the mistake, the admin corrects the
   record, and the dashboard/reports stop showing the wrong number.
2. **Backup & reset are protected** — a JSON backup, then password (and optionally an
   e-mail code) before anything is deleted.

---

## 1. Install the backend (required — 2 minutes)

Supabase Dashboard → **SQL Editor** → *New query* → paste the whole file
[`supabase/migrations/20260727_corrections_and_danger_zone.sql`](../supabase/migrations/20260727_corrections_and_danger_zone.sql)
→ **Run**.

The script only *adds* tables, columns and functions. It never drops or edits existing data.

It assumes your tables are `sales`, `tanks`, `credit_customers`, `staff` and `admins`
in schema `public`, and that `sales` has `staff_id`, `fuel_type`, `liters`, `total_etb`,
`payment_method`, `credit_customer_id`, `voided`, `created_at`. If a name differs on your
project, change it at the four places marked `-- << SCHEMA` before running.

Until the script is run, the app still works — the new pages simply show
*"Backend not installed — run supabase/migrations/…"* instead of failing.

### Check it worked

Open `debug.html`, or run in the SQL editor:

```sql
select proname from pg_proc
 where proname in ('admin_correct_sale','staff_report_sale_issue','admin_reset_all_data');
```

## 2. Optional: e-mail confirmation codes

Only needed if you want a code sent to the owner's e-mail (as a second lock, or for when
the admin password is forgotten).

```bash
supabase functions deploy send-danger-code
supabase secrets set RESEND_API_KEY=re_xxxxx MAIL_FROM="MAGPMS <alerts@yourdomain.com>"
```

Then in the app: **Backup & Danger Zone → Confirmation Settings** → type the e-mail →
tick *Also require an e-mail code* if you want both → Save.

Any mail provider works — replace the `sendEmail()` body in
`supabase/functions/send-danger-code/index.ts`.

The code is generated and stored by the function (service role) and checked by
`admin_verify_danger_code`. It never passes through the browser, expires in 10 minutes,
allows 5 wrong tries, and is limited to 3 codes per 10 minutes.

---

## How the correction flow works

**Staff** (Dashboard → *My Recent Sales* → **⚠ Report**)

* Picks what is wrong (amount / liters / payment / other), the correct value if known,
  and a short note. Works hours after the sale — there is no time limit.
* Staff **cannot** change the sale. The row is only flagged, and shows `reported`
  until the admin decides.

**Admin** (menu → **🛠 Corrections**, badge shows how many are waiting)

* Dashboard shows a warning banner while reports are open, because the totals on
  screen are wrong until they are resolved.
* **✎ Fix sale** opens the correction dialog pre-filled with what the staff member
  claims; **Reject** closes the report with a reason the staff member can read.
* Any sale can also be corrected directly from **Sales → ✎ Fix**, without a report.

**What a correction does** (`admin_correct_sale`)

* Give the correct **liters** *or* the correct **amount** — the other is recalculated at
  the unit price that sale was actually sold at, so liters and money never disagree.
* Tank stock moves by the liters difference.
* Credit balances: the old charge comes off the old customer, the new charge goes on.
* Old and new values, the reason and the admin name are written to `sale_corrections`,
  and the sale is stamped `corrected_at` / `corrected_by`. Corrected rows show a
  `fixed` tag in the Sales table.
* Voided sales cannot be corrected — void is final, correction is for wrong numbers.

Because the reports (`daily_report`, `fuel_report`, `staff_report_v2`) read from `sales`,
they are correct again as soon as the fix is applied — including the 2 o'clock row that
was wrong all afternoon.

---

## How the Danger Zone is protected

Menu → **🛟 Backup & Danger Zone**.

**JSON backup** — one file with prices, tanks, nozzles, staff, credit customers, sales,
expenses, shifts, readings, attendance and 90 days of daily totals. On the phone it opens
the Android "save file" dialog (`AndroidBridge.saveFile`); in a browser it downloads.
The dashboard nags when the last backup is older than a week.

**Reset ALL data** now needs all four of these:

1. A JSON backup taken in the last 24 hours — otherwise the reset is refused and it
   offers to take one first.
2. Typing the phrase `RESET ALL DATA`.
3. The admin password (re-checked with `login_admin`), or a 6-digit e-mail code —
   both when *Also require an e-mail code* is on.
4. A final confirmation whose button stays disabled for 8 seconds.

A mis-tap therefore cannot delete anything: every single step is cancellable and nothing
is sent to the server until the last one.

The reset deletes sales, expenses, shifts, nozzle readings, attendance, corrections and
reports, and sets credit balances to zero. **Staff accounts, tanks, nozzles and prices
are kept.** Every reset is recorded in `data_reset_log` (who, when, how many rows).

The server enforces the phrase and the e-mail token as well, so the guard cannot be
skipped by calling the RPC directly.

---

## Security notes

* All new tables have RLS enabled with **no policies**, so the public anon key cannot
  read them. Only the `SECURITY DEFINER` functions above can.
* `admin_get_security_settings` returns a masked address (`o***r@mail.com`), never the
  full e-mail.
* To change the confirmation e-mail you must type the full new address — it is
  write-only from the app.

## Where these pages run

`MainActivity` loads the published website
(`https://magmps.github.io/magpms2/index.html`), not the copies in `app/src/main/assets/`.
Publish the same four files — `admin.html`, `staff.html`, `index.html`, `js/ui.js`,
`css/theme.css`, `config.js` — to that site for the phones to pick the changes up.

---

## Installing the app

Every push to `main` publishes an installable APK under
[**Releases**](../../releases) — a permanent link, no GitHub login needed to download it.

On the phone: open the newest release, tap `MAGPMS-vX.Y-buildN.apk`, allow *install from
this source*. It installs over the old app and keeps nothing on the device except the
login session, which is cleared once by the move to the bundled pages.

Two checks run on every pull request:

* **pages** — syntax-checks the web app that ships in the APK (`node tools/check-pages.js`,
  runs locally too), so a typo in `admin.html` fails CI instead of reaching a phone as a
  blank screen.
* **build** — compiles the Android app.
