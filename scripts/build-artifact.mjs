// Bundles the game into one HTML page that can be published as a Claude artifact.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const THREE_VERSION = JSON.parse(await readFile('node_modules/three/package.json', 'utf8')).version;
const html = await readFile('public/index.html', 'utf8');
const out = await build({
  entryPoints: ['public/js/main.js'],
  bundle: true,
  format: 'esm',
  external: ['three'],
  minify: true,
  write: false,
  target: ['safari15', 'chrome100'],
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace('./vendor/three.module.min.js', `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module"[^>]*><\/script>/, `<script type="module">${js}</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/myson.html', head.trim() + '\n' + body.trim() + '\n');
console.log('dist/myson.html', ((head.length + body.length + js.length) / 1024).toFixed(1) + ' KB');
