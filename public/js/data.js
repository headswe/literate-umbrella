// Shared game data. Plain objects so both the browser and the server can import it.

export const WORLD_SIZE = 44;

// Terrain kinds stored per tile.
export const T = { WATER: 0, SAND: 1, GRASS: 2, DIRT: 3 };

// Small SVG icons for things that have no emoji.
const svg = (body) => `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const HOE = svg('<rect x="2" y="13" width="2" height="2" fill="#6e4527"/><rect x="3" y="11" width="2" height="2" fill="#8a5a34"/><rect x="5" y="9" width="2" height="2" fill="#8a5a34"/><rect x="7" y="7" width="2" height="2" fill="#8a5a34"/><rect x="9" y="5" width="2" height="2" fill="#8a5a34"/><rect x="9" y="1" width="6" height="3" fill="#b4bcc4"/><rect x="13" y="4" width="2" height="4" fill="#9aa3ad"/><rect x="10" y="2" width="4" height="1" fill="#e3e8ee"/>');
const PINECONE = svg('<rect x="7" y="1" width="2" height="2" fill="#3f9c3f"/><rect x="5" y="3" width="6" height="2" fill="#8a5a34"/><rect x="4" y="5" width="8" height="2" fill="#a5754d"/><rect x="4" y="7" width="8" height="2" fill="#8a5a34"/><rect x="5" y="9" width="6" height="2" fill="#a5754d"/><rect x="6" y="11" width="4" height="2" fill="#8a5a34"/><rect x="7" y="13" width="2" height="1" fill="#6e4527"/>');
const APPLESEED = svg('<rect x="6" y="2" width="4" height="2" fill="#5cbf52"/><rect x="5" y="4" width="6" height="3" fill="#6e4527"/><rect x="4" y="7" width="8" height="4" fill="#8a5a34"/><rect x="5" y="11" width="6" height="2" fill="#6e4527"/><rect x="6" y="8" width="2" height="2" fill="#c99a63"/>');

// Everything that can be in an inventory. `kind` decides how it is used.
export const ITEMS = {
  hand: { icon: '✋', name: 'Hand', kind: 'tool' },
  axe: { icon: '🪓', name: 'Yxa', kind: 'tool' },
  pickaxe: { icon: '⛏️', name: 'Hacka', kind: 'tool' },
  hoe: { svg: HOE, name: 'Jordhacka', kind: 'tool' },
  seed_tree: { icon: '🌰', name: 'Trädfrö', kind: 'seed', grows: 'tree' },
  seed_pine: { svg: PINECONE, name: 'Kotte', kind: 'seed', grows: 'pine' },
  seed_fruit: { svg: APPLESEED, name: 'Äppelkärna', kind: 'seed', grows: 'fruittree' },
  wood: { one: 'en bit trä', icon: '🪵', name: 'Trä', plural: 'bitar trä', kind: 'material' },
  stone: { one: 'en sten', icon: '🪨', name: 'Sten', plural: 'stenar', kind: 'material' },
  fruit: { one: 'ett äpple', icon: '🍎', name: 'Äpple', plural: 'äpplen', kind: 'material' },
  flower: { one: 'en blomma', icon: '🌸', name: 'Blomma', plural: 'blommor', kind: 'material' },
  shell: { one: 'en snäcka', icon: '🐚', name: 'Snäcka', plural: 'snäckor', kind: 'material' },
  star: { one: 'en stjärna', icon: '⭐', name: 'Stjärna', plural: 'stjärnor', kind: 'material' },
};

export const ITEM_ORDER = Object.keys(ITEMS);

// What a brand new player carries.
export const STARTER_KIT = { axe: 1, pickaxe: 1, hoe: 1, seed_tree: 3 };

// Things on the island. `tool` is what you tap them with, `hp` how many hits before they are gone.
export const NATURE = {
  tree: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_tree', blocks: true },
  pine: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_pine', blocks: true },
  fruittree: { tool: 'axe', gives: 'wood', hp: 3, seed: 'seed_fruit', blocks: true, apples: 3, appleRest: 45000 },
  rock: { tool: 'pickaxe', gives: 'stone', hp: 3, blocks: true },
  flower: { tool: 'hand', gives: 'flower', hp: 1, blocks: false },
  shell: { tool: 'hand', gives: 'shell', hp: 1, blocks: false },
  soil: { blocks: false },
  sapling: { blocks: false },
};

// Things you can build. Costs come back when you pick them up again.
// `stack`: blocks pile up to this many. `flat`: you can walk on it. `animated`: needs redraws (fire).
export const BUILDS = {
  house: { name: 'Hus', art: 'ett', cat: 'home', cost: { wood: 10, stone: 6 }, size: 2 },
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
export const VILLAGERS = [
  { id: 'stjarna', name: 'Stjärna', kind: 'unicorn', roof: '#ff7eb6', likes: ['rainbow', 'statue', 'pot'], gives: ['flower', 'fruit'] },
  { id: 'bosse', name: 'Bosse', kind: 'bear', roof: '#c0392b', likes: ['campfire', 'bench', 'table'], gives: ['fruit', 'wood'] },
  { id: 'pip', name: 'Pip', kind: 'robot', roof: '#4fb3ff', likes: ['rocket', 'lamp', 'mailbox'], gives: ['stone', 'wood'] },
  { id: 'lisa', name: 'Lisa', kind: 'bunny', roof: '#b48cff', likes: ['pot', 'bed', 'fountain'], gives: ['flower', 'fruit'] },
  { id: 'rufus', name: 'Rufus', kind: 'fox', roof: '#e8742f', likes: ['campfire', 'shelf', 'lamp'], gives: ['wood', 'stone'] },
  { id: 'kvack', name: 'Kvack', kind: 'frog', roof: '#4fae4a', likes: ['fountain', 'bench', 'pot'], gives: ['shell', 'flower'] },
  { id: 'nisse', name: 'Nisse', kind: 'pig', roof: '#ff9cb8', likes: ['table', 'chair', 'campfire'], gives: ['fruit', 'flower'] },
  { id: 'misse', name: 'Misse', kind: 'cat', roof: '#ffd23f', likes: ['bed', 'shelf', 'chair'], gives: ['shell', 'fruit'] },
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
