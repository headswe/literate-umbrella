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
  wood: { icon: '🪵', name: 'Trä', kind: 'material' },
  stone: { icon: '🪨', name: 'Sten', kind: 'material' },
  fruit: { icon: '🍎', name: 'Äpple', kind: 'material' },
  flower: { icon: '🌸', name: 'Blomma', kind: 'material' },
  shell: { icon: '🐚', name: 'Snäcka', kind: 'material' },
  star: { icon: '⭐', name: 'Stjärna', kind: 'material' },
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
  planks: { name: 'Träkloss', cat: 'block', cost: { wood: 2 }, stack: 4 },
  cobble: { name: 'Stenkloss', cat: 'block', cost: { stone: 2 }, stack: 4 },
  floor: { name: 'Trägolv', cat: 'block', cost: { wood: 1 }, flat: true },
  path: { name: 'Stenväg', cat: 'block', cost: { stone: 1 }, flat: true },
  fence: { name: 'Staket', cat: 'block', cost: { wood: 1 } },
  chair: { name: 'Stol', cat: 'furniture', cost: { wood: 2 } },
  table: { name: 'Bord', cat: 'furniture', cost: { wood: 3 } },
  bench: { name: 'Bänk', cat: 'furniture', cost: { wood: 3 } },
  bed: { name: 'Säng', cat: 'furniture', cost: { wood: 4, flower: 2 } },
  shelf: { name: 'Bokhylla', cat: 'furniture', cost: { wood: 4 } },
  lamp: { name: 'Lykta', cat: 'furniture', cost: { wood: 1, stone: 1 } },
  pot: { name: 'Blomkruka', cat: 'decor', cost: { stone: 1, flower: 1 } },
  campfire: { name: 'Lägereld', cat: 'decor', cost: { wood: 2, stone: 2 }, animated: true },
  mailbox: { name: 'Brevlåda', cat: 'decor', cost: { wood: 2, stone: 1 } },
  fountain: { name: 'Snäckfontän', cat: 'decor', cost: { stone: 4, shell: 3 } },
  statue: { name: 'Enhörningsstaty', cat: 'decor', cost: { stone: 3, star: 1 } },
  rocket: { name: 'Rymdskepp', cat: 'decor', cost: { stone: 4, wood: 2, star: 2 } },
  rainbow: { name: 'Regnbåge', cat: 'decor', cost: { flower: 4, star: 1 } },
};

export const BUILD_CATS = [
  { id: 'block', name: 'Klossar' },
  { id: 'furniture', name: 'Möbler' },
  { id: 'decor', name: 'Pynt' },
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
