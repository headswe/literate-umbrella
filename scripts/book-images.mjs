// Draws the book's illustrations with OpenAI's GPT image model.
//   OPENAI_API_KEY=sk-... npm run bok:bilder            only pictures that are missing
//   OPENAI_API_KEY=sk-... npm run bok:bilder -- k1-handen omslag   redo these
// Settings: OPENAI_IMAGE_MODEL (default gpt-image-1), OPENAI_IMAGE_QUALITY (low|medium|high, default medium).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../public/bok/', import.meta.url));
const OUT = join(DIR, 'bilder');
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

if (!KEY) {
  console.error('Sätt OPENAI_API_KEY först (din nyckel från platform.openai.com).');
  process.exit(1);
}

const { stil, bilder } = JSON.parse(await readFile(join(DIR, 'bilder.json'), 'utf8'));
const wanted = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

const exists = (f) => access(f).then(() => true, () => false);

let made = 0, failed = 0;
for (const b of bilder) {
  const file = join(OUT, `${b.id}.webp`);
  if (wanted.length ? !wanted.includes(b.id) : await exists(file)) continue;
  process.stdout.write(`${b.id} … `);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: `${stil}\n\n${b.prompt}`,
        size: b.storlek || '1536x1024',
        quality: QUALITY,
        output_format: 'webp',
        output_compression: 82,
        n: 1,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || res.statusText);
    await writeFile(file, Buffer.from(json.data[0].b64_json, 'base64'));
    made++;
    console.log('klar');
  } catch (e) {
    failed++;
    console.log('misslyckades:', e.message);
  }
}
console.log(`${made} nya bilder, ${failed} misslyckades.`);
if (failed) process.exitCode = 1;
