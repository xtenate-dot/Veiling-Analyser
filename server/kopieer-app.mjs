// Kopieert de app (HTML, CSS, JS, iconen) naar server/public, zodat de Worker hem zelf serveert.
// Draait automatisch bij elke `wrangler deploy` (zie [build] in wrangler.toml).
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const server = dirname(fileURLToPath(import.meta.url));
const bron = join(server, '..');
const doel = join(server, 'public');
// Alleen deze bestanden horen bij de app; README, SETUP, tests en de servercode gaan niet online
const TOEGESTAAN = /\.(html|css|js|json|png|svg|ico|webp|txt)$/i;
const NIET = new Set(['package.json', 'package-lock.json']);

rmSync(doel, { recursive: true, force: true });
mkdirSync(doel, { recursive: true });
let n = 0;
for (const naam of readdirSync(bron)) {
  const pad = join(bron, naam);
  if (statSync(pad).isFile() && TOEGESTAAN.test(naam) && !NIET.has(naam) && !naam.startsWith('.')) { cpSync(pad, join(doel, naam)); n++; }
}
cpSync(join(bron, 'icons'), join(doel, 'icons'), { recursive: true });
cpSync(join(bron, 'fonts'), join(doel, 'fonts'), { recursive: true });
// De website (homepagina, prijzen, veilinggids, verhalen, Engels) komt in de hoofdmap; de app blijft op /app
await import(new URL('../site/maak.mjs', import.meta.url));
cpSync(join(bron, 'site', 'www'), doel, { recursive: true });
mkdirSync(join(doel, 'site'), { recursive: true });
cpSync(join(bron, 'site', 'site.css'), join(doel, 'site', 'site.css'));
// Beveiligingskoppen voor alle pagina's
writeFileSync(join(doel, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: DENY',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '/sw.js',
  '  Cache-Control: no-cache',
  ''
].join('\n'));
console.log('App gekopieerd naar server/public: ' + n + ' bestanden + iconen');
