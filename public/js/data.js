// Shared game data. Plain objects so both the browser and the server can import it.

export const WORLD_SIZE = 60;
// Islands made before the island grew keep their old size.
export const OLD_WORLD_SIZE = 44;

// Terrain kinds stored per tile.
export const T = { WATER: 0, SAND: 1, GRASS: 2, DIRT: 3 };

// Small SVG icons for things that have no emoji.
const svg = (body) => `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const HOE = svg('<rect x="2" y="13" width="2" height="2" fill="#6e4527"/><rect x="3" y="11" width="2" height="2" fill="#8a5a34"/><rect x="5" y="9" width="2" height="2" fill="#8a5a34"/><rect x="7" y="7" width="2" height="2" fill="#8a5a34"/><rect x="9" y="5" width="2" height="2" fill="#8a5a34"/><rect x="9" y="1" width="6" height="3" fill="#b4bcc4"/><rect x="13" y="4" width="2" height="4" fill="#9aa3ad"/><rect x="10" y="2" width="4" height="1" fill="#e3e8ee"/>');
const PINECONE = svg('<rect x="7" y="1" width="2" height="2" fill="#3f9c3f"/><rect x="5" y="3" width="6" height="2" fill="#8a5a34"/><rect x="4" y="5" width="8" height="2" fill="#a5754d"/><rect x="4" y="7" width="8" height="2" fill="#8a5a34"/><rect x="5" y="9" width="6" height="2" fill="#a5754d"/><rect x="6" y="11" width="4" height="2" fill="#8a5a34"/><rect x="7" y="13" width="2" height="1" fill="#6e4527"/>');
const SHOVEL = svg('<rect x="11" y="1" width="4" height="2" fill="#6e4527"/><rect x="12" y="3" width="2" height="1" fill="#6e4527"/><rect x="10" y="3" width="3" height="3" fill="#a5754d"/><rect x="8" y="5" width="3" height="3" fill="#8a5a34"/><rect x="6" y="7" width="3" height="2" fill="#a5754d"/><rect x="1" y="8" width="6" height="5" fill="#b4bcc4"/><rect x="2" y="13" width="4" height="2" fill="#9aa3ad"/><rect x="2" y="9" width="2" height="3" fill="#e3e8ee"/><rect x="3" y="15" width="2" height="1" fill="#9aa3ad"/>');
const DIRTPILE = svg('<rect x="6" y="5" width="4" height="2" fill="#a5754d"/><rect x="4" y="7" width="8" height="2" fill="#8f6140"/><rect x="2" y="9" width="12" height="3" fill="#86593a"/><rect x="1" y="12" width="14" height="2" fill="#6e4527"/><rect x="7" y="6" width="1" height="1" fill="#c99a63"/><rect x="5" y="9" width="1" height="1" fill="#c99a63"/><rect x="10" y="10" width="1" height="1" fill="#c99a63"/>');
const NET = svg('<rect x="7" y="1" width="6" height="1" fill="#e3e8ee"/><rect x="6" y="2" width="1" height="5" fill="#e3e8ee"/><rect x="13" y="2" width="1" height="5" fill="#e3e8ee"/><rect x="7" y="7" width="6" height="1" fill="#e3e8ee"/><rect x="7" y="2" width="6" height="5" fill="#cfe9f5" opacity=".55"/><rect x="9" y="2" width="1" height="5" fill="#ffffff" opacity=".6"/><rect x="11" y="2" width="1" height="5" fill="#ffffff" opacity=".6"/><rect x="7" y="4" width="6" height="1" fill="#ffffff" opacity=".6"/><rect x="5" y="8" width="2" height="2" fill="#8a5a34"/><rect x="3" y="10" width="2" height="2" fill="#8a5a34"/><rect x="1" y="12" width="2" height="3" fill="#6e4527"/>');
const CARROTSEED = svg('<rect x="7" y="2" width="2" height="4" fill="#4fae4a"/><rect x="5" y="3" width="2" height="2" fill="#63c759"/><rect x="9" y="3" width="2" height="2" fill="#63c759"/><rect x="4" y="7" width="8" height="6" fill="#d9c9a3"/><rect x="5" y="8" width="6" height="4" fill="#ff8a3d"/><rect x="4" y="13" width="8" height="1" fill="#b8a782"/>');
const BERRYSEED = svg('<rect x="7" y="2" width="2" height="4" fill="#4fae4a"/><rect x="5" y="3" width="2" height="2" fill="#63c759"/><rect x="9" y="3" width="2" height="2" fill="#63c759"/><rect x="4" y="7" width="8" height="6" fill="#d9c9a3"/><rect x="5" y="8" width="3" height="3" fill="#4a5bd6"/><rect x="8" y="9" width="3" height="3" fill="#6b7cf0"/><rect x="4" y="13" width="8" height="1" fill="#b8a782"/>');
const APPLESEED = svg('<rect x="6" y="2" width="4" height="2" fill="#5cbf52"/><rect x="5" y="4" width="6" height="3" fill="#6e4527"/><rect x="4" y="7" width="8" height="4" fill="#8a5a34"/><rect x="5" y="11" width="6" height="2" fill="#6e4527"/><rect x="6" y="8" width="2" height="2" fill="#c99a63"/>');

// Everything that can be in an inventory. `kind` decides how it is used.
export const ITEMS = {
  hand: { icon: '✋', name: 'Hand', kind: 'tool' },
  axe: { icon: '🪓', name: 'Yxa', kind: 'tool' },
  pickaxe: { icon: '⛏️', name: 'Hacka', kind: 'tool' },
  hoe: { svg: HOE, name: 'Jordhacka', kind: 'tool' },
  shovel: { svg: SHOVEL, name: 'Spade', kind: 'tool' },
  rod: { icon: '🎣', name: 'Fiskespö', kind: 'tool' },
  net: { svg: NET, name: 'Håv', kind: 'tool' },
  seed_tree: { one: 'ett trädfrö', plural: 'trädfrön', icon: '🌰', name: 'Trädfrö', kind: 'seed', grows: 'tree' },
  seed_pine: { one: 'en kotte', plural: 'kottar', svg: PINECONE, name: 'Kotte', kind: 'seed', grows: 'pine' },
  seed_fruit: { one: 'en äppelkärna', plural: 'äppelkärnor', svg: APPLESEED, name: 'Äppelkärna', kind: 'seed', grows: 'fruittree' },
  seed_carrot: { one: 'ett morotsfrö', plural: 'morotsfrön', svg: CARROTSEED, name: 'Morotsfrö', kind: 'seed', grows: 'carrot' },
  seed_berry: { one: 'ett blåbärsfrö', plural: 'blåbärsfrön', svg: BERRYSEED, name: 'Blåbärsfrö', kind: 'seed', grows: 'berrybush' },
  // Dug-up earth. Put it down to fill a hole, mend a road or build a hill.
  dirt: { svg: DIRTPILE, one: 'en hög jord', name: 'Jord', plural: 'högar jord', kind: 'place' },
  wood: { one: 'en bit trä', icon: '🪵', name: 'Trä', plural: 'bitar trä', kind: 'material' },
  stone: { one: 'en sten', icon: '🪨', name: 'Sten', plural: 'stenar', kind: 'material' },
  fruit: { one: 'ett äpple', icon: '🍎', name: 'Äpple', plural: 'äpplen', kind: 'material', eat: 20 },
  fish: { one: 'en fisk', icon: '🐟', name: 'Fisk', plural: 'fiskar', kind: 'material' },
  goldfish: { one: 'en guldfisk', icon: '🐠', name: 'Guldfisk', plural: 'guldfiskar', kind: 'material' },
  puffer: { one: 'en blåsfisk', icon: '🐡', name: 'Blåsfisk', plural: 'blåsfiskar', kind: 'material' },
  carrot: { one: 'en morot', icon: '🥕', name: 'Morot', plural: 'morötter', kind: 'material', eat: 20 },
  berry: { one: 'ett blåbär', icon: '🫐', name: 'Blåbär', plural: 'blåbär', kind: 'material', eat: 15 },
  // Small animals caught with the net, for the museum.
  butterfly: { one: 'en fjäril', icon: '🦋', name: 'Fjäril', plural: 'fjärilar', kind: 'material' },
  ladybug: { one: 'en nyckelpiga', icon: '🐞', name: 'Nyckelpiga', plural: 'nyckelpigor', kind: 'material' },
  bee: { one: 'ett bi', icon: '🐝', name: 'Bi', plural: 'bin', kind: 'material' },
  snail: { one: 'en snigel', icon: '🐌', name: 'Snigel', plural: 'sniglar', kind: 'material' },
  cricket: { one: 'en gräshoppa', icon: '🦗', name: 'Gräshoppa', plural: 'gräshoppor', kind: 'material' },
  caterpillar: { one: 'en larv', icon: '🐛', name: 'Larv', plural: 'larver', kind: 'material' },
  // Food made at the campfire. `eat`: seconds of running fast after eating it.
  grilled: { one: 'en grillad fisk', icon: '🍢', name: 'Grillad fisk', plural: 'grillade fiskar', kind: 'material', eat: 45 },
  soup: { one: 'en fisksoppa', icon: '🍲', name: 'Fisksoppa', plural: 'fisksoppor', kind: 'material', eat: 60 },
  pie: { one: 'en äppelpaj', icon: '🥧', name: 'Äppelpaj', plural: 'äppelpajer', kind: 'material', eat: 60 },
  muffin: { one: 'en blåbärsmuffins', icon: '🧁', name: 'Blåbärsmuffins', plural: 'blåbärsmuffins', kind: 'material', eat: 45 },
  carrotsoup: { one: 'en morotssoppa', icon: '🥣', name: 'Morotssoppa', plural: 'morotssoppor', kind: 'material', eat: 45 },
  flower: { one: 'en blomma', icon: '🌸', name: 'Blomma', plural: 'blommor', kind: 'material' },
  shell: { one: 'en snäcka', icon: '🐚', name: 'Snäcka', plural: 'snäckor', kind: 'material' },
  star: { one: 'en stjärna', icon: '⭐', name: 'Stjärna', plural: 'stjärnor', kind: 'material' },
};

export const ITEM_ORDER = Object.keys(ITEMS);

// What a brand new player carries.
export const STARTER_KIT = { axe: 1, pickaxe: 1, hoe: 1, shovel: 1, rod: 1, net: 1, seed_tree: 3, seed_carrot: 2, seed_berry: 1 };
// Tools everyone should have, even on islands made before the tool existed.
export const ALWAYS_TOOLS = ['axe', 'pickaxe', 'hoe', 'shovel', 'rod', 'net'];

// What the campfire can cook.
export const RECIPES = [
  { id: 'grilled', needs: { fish: 1 } },
  { id: 'soup', needs: { goldfish: 1, fruit: 1 } },
  { id: 'pie', needs: { fruit: 3 } },
  { id: 'muffin', needs: { berry: 2 } },
  { id: 'carrotsoup', needs: { carrot: 2 } },
];

// What bites when you fish, and how often.
export const CATCH = [['fish', 0.68], ['goldfish', 0.24], ['puffer', 0.08]];

// Little animals that visit the island, and how often each kind shows up.
export const BUGS = [['butterfly', 0.3], ['ladybug', 0.2], ['bee', 0.18], ['snail', 0.12], ['cricket', 0.12], ['caterpillar', 0.08]];

// Everything the museum can show.
export const COLLECTION = ['fish', 'goldfish', 'puffer', 'butterfly', 'ladybug', 'bee', 'snail', 'cricket', 'caterpillar'];

// Garden plants grow faster than trees.
export const CROP_MS = 40000;
// Highest a hill can be built.
export const MAX_HEIGHT = 4;

// Pets follow you around, say hello when you pat them and now and then find you something.
export const PETS = {
  dog: { name: 'Vovve', icon: '🐶', sound: 'Voff voff!' },
  cat: { name: 'Kissen', icon: '🐱', sound: 'Mjau!' },
  bunny: { name: 'Hoppe', icon: '🐰', sound: 'Nos nos!' },
  pig: { name: 'Nöffe', icon: '🐷', sound: 'Nöff nöff!' },
  frog: { name: 'Kvacke', icon: '🐸', sound: 'Kvack!' },
  panda: { name: 'Bambu', icon: '🐼', sound: 'Mums mums!' },
};
export const PET_FINDS = ['shell', 'shell', 'fruit', 'flower', 'seed_carrot', 'seed_berry', 'seed_fruit', 'star'];

// A whole day on the island takes 20 minutes: 14 of sunshine, a sunset, 4 of night and a
// sunrise. Everyone shares the same clock, so friends playing together see the same sky.
// ?time=night or ?time=day holds the clock still.
export const DAY_MS = 20 * 60000;
const fixedTime = typeof location !== 'undefined' && new URLSearchParams(location.search).get('time');
export function daylight(now) {
  if (fixedTime === 'night') return 0;
  if (fixedTime === 'day') return 1;
  const f = (now % DAY_MS) / DAY_MS;
  const ease = (t) => t * t * (3 - 2 * t);
  if (f < 0.7) return 1;
  if (f < 0.75) return 1 - ease((f - 0.7) / 0.05);
  if (f < 0.95) return 0;
  return ease((f - 0.95) / 0.05);
}

// Things on the island. `tool` is what you tap them with, `hp` how many hits before they are gone.
export const NATURE = {
  tree: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_tree', blocks: true },
  pine: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_pine', blocks: true },
  fruittree: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_fruit', blocks: true, apples: 3, appleRest: 45000 },
  rock: { tool: 'pickaxe', gives: 'stone', hp: 3, blocks: true },
  flower: { tool: 'hand', gives: 'flower', hp: 1, blocks: false },
  shell: { tool: 'hand', gives: 'shell', hp: 1, blocks: false },
  soil: { blocks: false },
  // Garden plants. Carrots are pulled up (the soil stays); bushes give berries again and again.
  carrot: { tool: 'hand', gives: 'carrot', blocks: false, crop: true },
  berrybush: { tool: 'hand', gives: 'berry', blocks: true, crop: true, berries: 3, berryRest: 40000 },
  bug: { blocks: false },
  // An X in the grass: something is buried here. Dig with the spade.
  buried: { blocks: false },
  sapling: { blocks: false },
};

// Things you can build. Costs come back when you pick them up again.
// `stack`: blocks pile up to this many. `flat`: you can walk on it. `animated`: needs redraws (fire).
export const BUILDS = {
  house: { name: 'Hus', art: 'ett', cat: 'home', cost: { wood: 10, stone: 6 }, size: 2 },
  museum: { name: 'Museum', art: 'ett', cat: 'home', cost: { wood: 8, stone: 8, star: 2 }, size: 2 },
  planks: { name: 'Träkloss', art: 'en', cat: 'block', cost: { wood: 2 }, stack: 4 },
  cobble: { name: 'Stenkloss', art: 'en', cat: 'block', cost: { stone: 2 }, stack: 4 },
  floor: { name: 'Trägolv', art: 'ett', cat: 'block', cost: { wood: 1 }, flat: true },
  path: { name: 'Stenväg', art: 'en', cat: 'block', cost: { stone: 1 }, flat: true },
  fence: { name: 'Staket', art: 'ett', cat: 'block', cost: { wood: 1 } },
  chair: { name: 'Stol', art: 'en', cat: 'furniture', cost: { wood: 2 } },
  table: { name: 'Bord', art: 'ett', cat: 'furniture', cost: { wood: 3 } },
  bench: { name: 'Bänk', art: 'en', cat: 'furniture', cost: { wood: 3 } },
  bed: { name: 'Säng', art: 'en', cat: 'furniture', cost: { wood: 4, flower: 2 } },
  shelf: { name: 'Bokhylla', art: 'en', cat: 'furniture', cost: { wood: 4 } },
  lamp: { name: 'Lykta', art: 'en', cat: 'furniture', cost: { wood: 1, stone: 1 } },
  pot: { name: 'Blomkruka', art: 'en', cat: 'decor', cost: { stone: 1, flower: 1 } },
  campfire: { name: 'Lägereld', art: 'en', cat: 'decor', cost: { wood: 2, stone: 2 }, animated: true },
  mailbox: { name: 'Brevlåda', art: 'en', cat: 'decor', cost: { wood: 2, stone: 1 } },
  fountain: { name: 'Snäckfontän', art: 'en', cat: 'decor', cost: { stone: 4, shell: 3 } },
  statue: { name: 'Enhörningsstaty', art: 'en', cat: 'decor', cost: { stone: 3, star: 1 } },
  rocket: { name: 'Rymdskepp', art: 'ett', cat: 'decor', cost: { stone: 4, wood: 2, star: 2 } },
  rainbow: { name: 'Regnbåge', art: 'en', cat: 'decor', cost: { flower: 4, star: 1 } },
  tent: { name: 'Tält', art: 'ett', cat: 'hidden', cost: {} },
};

export const BUILD_CATS = [
  { id: 'home', name: 'Hus åt nya vänner' },
  { id: 'block', name: 'Klossar' },
  { id: 'furniture', name: 'Möbler' },
  { id: 'decor', name: 'Pynt' },
];

// Friends who can move to the island. The first one lives in a tent from the start.
// voice: pitch and speed for the built-in speech, so every friend sounds like themselves.
export const VILLAGERS = [
  { id: 'stjarna', name: 'Stjärna', kind: 'unicorn', roof: '#ff7eb6', likes: ['rainbow', 'statue', 'pot'], gives: ['flower', 'fruit', 'seed_berry'], voice: { pitch: 1.6, rate: 1.0 } },
  { id: 'bosse', name: 'Bosse', kind: 'bear', roof: '#c0392b', likes: ['campfire', 'bench', 'table'], gives: ['fruit', 'wood'], voice: { pitch: 0.55, rate: 0.85 } },
  { id: 'pip', name: 'Pip', kind: 'robot', roof: '#4fb3ff', likes: ['rocket', 'lamp', 'mailbox'], gives: ['stone', 'wood'], voice: { pitch: 1.9, rate: 1.15 } },
  { id: 'lisa', name: 'Lisa', kind: 'bunny', roof: '#b48cff', likes: ['pot', 'bed', 'fountain'], gives: ['flower', 'seed_carrot', 'carrot'], voice: { pitch: 1.75, rate: 1.1 } },
  { id: 'rufus', name: 'Rufus', kind: 'fox', roof: '#e8742f', likes: ['campfire', 'shelf', 'lamp'], gives: ['wood', 'stone'], voice: { pitch: 1.1, rate: 1.05 } },
  { id: 'kvack', name: 'Kvack', kind: 'frog', roof: '#4fae4a', likes: ['fountain', 'bench', 'pot'], gives: ['shell', 'flower'], voice: { pitch: 0.8, rate: 1.0 } },
  { id: 'nisse', name: 'Nisse', kind: 'pig', roof: '#ff9cb8', likes: ['table', 'chair', 'campfire'], gives: ['fruit', 'seed_carrot', 'berry'], voice: { pitch: 1.3, rate: 0.9 } },
  { id: 'misse', name: 'Misse', kind: 'cat', roof: '#ffd23f', likes: ['bed', 'shelf', 'chair'], gives: ['shell', 'fish', 'seed_berry'], voice: { pitch: 1.45, rate: 0.95 } },
];

// How long a planted seed takes to become a tree.
export const GROW_MS = 60000;

export const AVATARS = [
  { id: 'unicorn', icon: '🦄', name: 'Enhörning' },
  { id: 'cat', icon: '🐱', name: 'Katt' },
  { id: 'dog', icon: '🐶', name: 'Hund' },
  { id: 'bunny', icon: '🐰', name: 'Kanin' },
  { id: 'frog', icon: '🐸', name: 'Groda' },
  { id: 'fox', icon: '🦊', name: 'Räv' },
  { id: 'panda', icon: '🐼', name: 'Panda' },
  { id: 'robot', icon: '🤖', name: 'Robot' },
];

export const ISLAND_NAMES = [
  'Solön', 'Stjärnön', 'Regnbågsön', 'Mysön', 'Blåbärsön', 'Molnön',
  'Glitterön', 'Kanelön', 'Drakön', 'Månön', 'Jordgubbsön', 'Äventyrsön',
];
