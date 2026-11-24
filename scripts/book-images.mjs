// Draws the book's illustrations with OpenAI's GPT image model.
//   OPENAI_API_KEY=sk-... npm run bok:bilder            only pictures that are missing
//   OPENAI_API_KEY=sk-... npm run bok:bilder -- k1-handen omslag   redo these
// Azure OpenAI instead: GPT_IMAGE_API=<deployment …/images/generations?api-version=… URL> GPT_IMAGE_KEY=<key>.
// Settings: OPENAI_IMAGE_MODEL (default gpt-image-1), OPENAI_IMAGE_QUALITY (low|medium|high, default medium).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../public/bok/', import.meta.url));
const OUT = join(DIR, 'bilder');
const AZURE = process.env.GPT_IMAGE_API;
const KEY = AZURE ? process.env.GPT_IMAGE_KEY : process.env.OPENAI_API_KEY;
const URL_ = AZURE || 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

if (!KEY) {
  console.error('Sätt OPENAI_API_KEY (eller GPT_IMAGE_API + GPT_IMAGE_KEY för Azure) först.');
  process.exit(1);
}

const { stil, bilder } = JSON.parse(await readFile(join(DIR, 'bilder.json'), 'utf8'));
const wanted = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

const exists = (f) => access(f).then(() => true, () => false);

let made = 0, failed = 0;
const todo = [];
for (const b of bilder) {
  if (wanted.length ? wanted.includes(b.id) : !(await exists(join(OUT, `${b.id}.jpg`)))) todo.push(b);
}
// One at a time by default (IMAGE_PARALLEL=n for more): low tiers allow about one picture a minute.
await Promise.all(Array.from({ length: Number(process.env.IMAGE_PARALLEL) || 1 }, async () => {
  for (let b; (b = todo.shift());) await draw(b);
}));
console.log(`${made} nya bilder, ${failed} misslyckades.`);
if (failed) process.exitCode = 1;

async function draw(b, forsok = 1) {
  const file = join(OUT, `${b.id}.jpg`);
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { ...(AZURE ? { 'api-key': KEY } : { authorization: `Bearer ${KEY}` }), 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(AZURE ? {} : { model: MODEL }),
        prompt: `${stil}\n\n${b.prompt}`,
        size: b.storlek || '1536x1024',
        quality: QUALITY,
        output_format: 'jpeg',
        output_compression: 82,
        n: 1,
      }),
    });
    const json = await res.json();
    if (res.status === 429 && forsok < 6) {
      const sek = Number(/retry after (\d+) sec/i.exec(json.error?.message || '')?.[1]) || 60;
      console.log(`${b.id}: väntar ${sek + 2} s (för många anrop)`);
      await new Promise((r) => setTimeout(r, (sek + 2) * 1000));
      return draw(b, forsok + 1);
    }
    if (!res.ok) throw new Error(json.error?.message || res.statusText);
    await writeFile(file, Buffer.from(json.data[0].b64_json, 'base64'));
    made++;
    console.log(`${b.id}: klar`);
  } catch (e) {
    failed++;
    console.log(`${b.id}: misslyckades: ${e.message}`);
  }
}
