// Builds dist/bok/: the book reader as one Claude artifact page, with bok.json,
// bilder.json and bilder/*.jpg published beside it.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';

const SRC = 'public/bok/';
const OUT = 'dist/bok/';
const html = await readFile(SRC + 'index.html', 'utf8');
const css = await readFile(SRC + 'bok.css', 'utf8');
const js = (await readFile(SRC + 'bok.js', 'utf8')).replace(/<\/script/gi, '<\\/script');

const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta (charset|name="viewport")[^>]*>\s*/g, '')
  .replace(/<link rel="(manifest|icon)"[^>]*>\s*/g, '')
  .replace('<link rel="stylesheet" href="bok.css">', () => `<style>\n${css}</style>`);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace('<script type="module" src="bok.js"></script>', () => `<script type="module">\n${js}</script>`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(OUT + 'index.html', head.trim() + '\n' + body.trim() + '\n');
for (const f of ['bok.json', 'bilder.json']) await cp(SRC + f, OUT + f);
await cp(SRC + 'bilder', OUT + 'bilder', { recursive: true, filter: (f) => !f.endsWith('.gitkeep') });
console.log('dist/bok/ klar');
