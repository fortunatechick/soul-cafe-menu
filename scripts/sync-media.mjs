/**
 * Copies item photos from /media into /public/menu and writes the manifest the
 * menu page reads.
 *
 * Drop a photo into /media named after the menu item — spacing, case and
 * punctuation do not matter ("Iced Latte.jpg", "iced-latte.png", "ICED_LATTE.webp"
 * all match the same item). Then:
 *
 *   npm run sync-media
 *
 * Items without a photo simply render text-only, so partial coverage is fine.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_DIR = path.join(root, 'media');
const OUT_DIR = path.join(root, 'public', 'menu');
const MANIFEST = path.join(root, 'src', 'data', 'media-manifest.json');
const MENU = path.join(root, 'src', 'data', 'menu.json');

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const menu = JSON.parse(fs.readFileSync(MENU, 'utf8'));
const items = menu.categories.flatMap((c) => c.items);

// slug -> item, plus a loose index so near-miss filenames still land
const bySlug = new Map(items.map((i) => [i.slug, i]));
const byLoose = new Map(items.map((i) => [i.slug.replace(/-/g, ''), i]));

fs.mkdirSync(OUT_DIR, { recursive: true });

// Start clean so renamed or deleted photos do not linger in /public.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.startsWith('.')) continue;
  fs.rmSync(path.join(OUT_DIR, f), { force: true });
}

const manifest = {};
const unmatched = [];
let copied = 0;

const files = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR) : [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!EXTS.has(ext)) continue;

  const base = path.basename(file, ext);
  const slug = slugify(base);
  const item = bySlug.get(slug) || byLoose.get(slug.replace(/-/g, ''));

  if (!item) {
    unmatched.push(file);
    continue;
  }

  const outName = `${item.slug}${ext}`;
  fs.copyFileSync(path.join(MEDIA_DIR, file), path.join(OUT_DIR, outName));
  manifest[item.slug] = `/menu/${outName}`;
  copied++;
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const withPhoto = Object.keys(manifest).length;
console.log(`✓ ${copied} photo(s) copied to public/menu`);
console.log(`  ${withPhoto} of ${items.length} menu items now have a photo`);

if (unmatched.length) {
  console.log(`\n⚠ ${unmatched.length} file(s) did not match a menu item:`);
  for (const f of unmatched) console.log(`   ${f}`);
  console.log('  Rename them to match an item name — see media/README.md for the list.');
}
