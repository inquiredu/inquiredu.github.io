import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('the studio uses the winter desk in both lamp states, with no leftover autumn browns',async()=>{
  const css=await read('admin/editor.css');
  assert.match(css,/:root \{[^}]*--bg:#1A222B/);assert.match(css,/:root\[data-theme="light"\] \{[^}]*--bg:#EEF2F4/);
  for(const old of ['#262522','#201f1c','#3a3730','#c69e76','#2b2c25','#30322b','#151713d9'])assert.ok(!css.includes(old),old+' is an autumn color');
});
test('the studio follows the public page lamp and loads only the site fonts beyond its own origin',async()=>{
  const [html,theme]=await Promise.all([read('admin/index.html'),read('admin/theme.js')]);
  assert.match(theme,/localStorage\.getItem\('theme'\)/);assert.match(theme,/localStorage\.setItem\('theme', next\)/);
  assert.match(html,/<script src="theme\.js\?v=[\d.]+"><\/script>[\s\S]*editor\.css/,'theme.js runs before the stylesheet paints');
  assert.match(html,/id="lamp"[^>]*role="switch"/);
  const csp=html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp,/script-src 'self';/,'no third-party scripts');assert.match(csp,/style-src 'self' https:\/\/fonts\.googleapis\.com;/);assert.match(csp,/font-src https:\/\/fonts\.gstatic\.com;/);
});
