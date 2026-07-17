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