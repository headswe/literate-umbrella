// Shared game data. Plain objects so both the browser and the server can import it.

export const WORLD_SIZE = 44;

// Terrain kinds stored per tile.
export const T = { WATER: 0, SAND: 1, GRASS: 2, DIRT: 3 };

// Things you can collect. `icon` is shown in the HUD, `name` is Swedish.
export const ITEMS = {
  wood: { icon: '🪵', name: 'Trä' },
  stone: { icon: '🪨', name: 'Sten' },
  fruit: { icon: '🍎', name: 'Äpple' },
  flower: { icon: '🌸', name: 'Blomma' },
  shell: { icon: '🐚', name: 'Snäcka' },
  star: { icon: '⭐', name: 'Stjärna' },
};

export const ITEM_ORDER = ['wood', 'stone', 'fruit', 'flower', 'shell', 'star'];

// Objects that live on the island and what tapping them gives.
// `uses` is how many times you can gather before it needs a rest (ms).
export const NATURE = {
  tree: { gives: 'wood', uses: 3, rest: 40000, blocks: true },
  pine: { gives: 'wood', uses: 3, rest: 40000, blocks: true },
  fruittree: { gives: 'fruit', uses: 3, rest: 45000, blocks: true },
  rock: { gives: 'stone', uses: 3, rest: 50000, blocks: true },
  flower: { gives: 'flower', once: true, blocks: false },
  shell: { gives: 'shell', once: true, blocks: false },
};

export const AVATARS = ['🦄', '🐱', '🐶', '🐰', '🐸', '🦊', '🐼', '🤖'];

export const ISLAND_NAMES = [
  'Solön', 'Stjärnön', 'Regnbågsön', 'Mysön', 'Blåbärsön', 'Molnön',
  'Glitterön', 'Kanelön', 'Drakön', 'Månön', 'Jordgubbsön', 'Äventyrsön',
];
