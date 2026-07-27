// MAGPMS CLOUD — Supabase config
const SUPABASE_URL = "https://vpakcpketkuuwmnmritg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dWTbItoNrx0zaAFXlHXzKA_Zp_kk2a9";

async function rpc(fn, params){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':SUPABASE_ANON_KEY,
      'Authorization':`Bearer ${SUPABASE_ANON_KEY}`
    },
    body:JSON.stringify(params||{})
  });
  return res.json();
}

// Supabase Edge Function call (used by the e-mail confirmation code).
async function edgeFn(name, body){
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':SUPABASE_ANON_KEY,
      'Authorization':`Bearer ${SUPABASE_ANON_KEY}`
    },
    body:JSON.stringify(body||{})
  });
  let out;
  try{ out = await res.json(); }catch(e){ out = {}; }
  if(!res.ok && out.success===undefined){
    out = {success:false, message: out.message || ('Confirmation e-mail service not available (HTTP '+res.status+')')};
  }
  return out;
}

// True when a Supabase reply is a PostgREST error (missing function, bad SQL…)
function rpcFailed(r){
  return !r || (typeof r === 'object' && !Array.isArray(r) && typeof r.code === 'string' && r.message !== undefined && r.success === undefined);
}