#!/usr/bin/env node
/* Syntax-checks the web app that ships inside the APK.
   A typo in admin.html used to reach a phone before anyone noticed — the
   WebView just shows a blank page. Node built-ins only, no install needed.

   Run: node tools/check-pages.js */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const PAGES = ['index.html', 'staff.html', 'admin.html', 'debug.html'];
const SCRIPTS = ['js/ui.js', 'config.js'];

let failures = 0;
const ok = (what) => console.log(`  ok    ${what}`);
const fail = (what, err) => { failures++; console.log(`  FAIL  ${what}\n        ${err}`); };

function checkSource(label, source) {
  try { new vm.Script(source, { filename: label }); ok(label); }
  catch (e) { fail(label, e.message); }
}

console.log('Inline page scripts:');
for (const page of PAGES) {
  const file = path.join(ASSETS, page);
  if (!fs.existsSync(file)) { fail(page, 'file is missing'); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) checkSource(`${page} (inline script ${++n})`, m[1]);
  if (n === 0) console.log(`  --    ${page} (no inline script)`);

  // Every app page must pull in the shared helpers, in the right order.
  // debug.html is deliberately standalone (it inlines its own Supabase config).
  if (page === 'debug.html') continue;
  const cfg = html.indexOf('config.js');
  const ui = html.indexOf('js/ui.js');
  if (cfg === -1 || ui === -1) fail(page, 'does not load both config.js and js/ui.js');
  else if (ui < cfg) fail(page, 'loads js/ui.js before config.js (rpc wrapper would be skipped)');
}

console.log('Shared scripts:');
for (const script of SCRIPTS) {
  const file = path.join(ASSETS, script);
  if (!fs.existsSync(file)) { fail(script, 'file is missing'); continue; }
  checkSource(script, fs.readFileSync(file, 'utf8'));
}

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll pages parse.');
process.exit(failures ? 1 : 0);
