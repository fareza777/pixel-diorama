// Game definitions: resources, biomes, buildings, recipes, quests, achievements, events, progression.
// All player-visible text is English (the game's default language).

export const RES = {
  wood: { name: 'Wood', price: 4, icon: 'wood' },
  stone: { name: 'Stone', price: 5, icon: 'stone' },
  food: { name: 'Food', price: 3, icon: 'food' },
  ore: { name: 'Iron Ore', price: 9, icon: 'ore' },
  sand: { name: 'Sand', price: 3, icon: 'sand' },
  crystal: { name: 'Crystal', price: 24, icon: 'crystal' },
  plank: { name: 'Planks', price: 11, icon: 'plank', crafted: true },
  brick: { name: 'Bricks', price: 13, icon: 'brick', crafted: true },
  glass: { name: 'Glass', price: 12, icon: 'glass', crafted: true },
  tool: { name: 'Tools', price: 32, icon: 'tool', crafted: true },
  essence: { name: 'Magic Essence', price: 80, icon: 'essence', crafted: true },
};
export const RES_KEYS = Object.keys(RES);

// ---------------------------------------------------------------- biomes

export const BIOMES = {
  desa: {
    name: 'Green Village', short: 'Village', unlock: 1, cost: 0,
    desc: 'A green valley with a little pond, where it all begins.',
    weather: { clear: 5, cloudy: 3, rain: 2, fog: 1 },
    sky: { moon: 1, milky: 0.35 }, palette: 'Harbour',
    look: { saturation: 1.12 },
    audio: { water: 0.25, birds: 1, crickets: 1 },
    loops: {},
    bonus: { food: 1.2 }, color: '#6eb156',
  },
  hutan: {
    name: 'Pine Forest', short: 'Forest', unlock: 3, cost: 600,
    desc: 'A dense, misty forest with a clear river. Plenty of wood.',
    weather: { clear: 3, cloudy: 3, rain: 3, fog: 3 },
    sky: { moon: 1, milky: 0.4 }, palette: 'Autumn',
    look: { saturation: 1.08 },
    audio: { water: 0.45, birds: 1.3, crickets: 1 },
    loops: {},
    bonus: { wood: 1.6 }, color: '#2f6a46',
  },
  pantai: {
    name: 'Tropical Beach', short: 'Beach', unlock: 5, cost: 1500,
    desc: 'White sand, coconut palms and a blue sea that mirrors the sky.',
    weather: { clear: 6, cloudy: 2, rain: 2, storm: 1 },
    sky: { moon: 1, milky: 0.6 }, palette: 'Harbour',
    look: { saturation: 1.18 },
    audio: { water: 0.95, birds: 0.6, crickets: 0.6 },
    loops: { cicadas: 0.5 },
    bonus: { food: 1.3, sand: 1.4 }, color: '#e5cf99',
  },
  gunung: {
    name: 'Snowy Peaks', short: 'Peaks', unlock: 8, cost: 3200,
    desc: 'Snowy summits with iron ore and auroras at night.',
    weather: { clear: 3, cloudy: 3, snow: 4, fog: 1 },
    sky: { moon: 1, milky: 0.7, aurora: 0.8 }, palette: 'Winter',
    look: { saturation: 1.05 },
    audio: { water: 0.15, birds: 0.4, crickets: 0.2 },
    loops: { howl: 0.25 },
    bonus: { ore: 1.6, stone: 1.4 }, color: '#e7eef8',
  },
  gurun: {
    name: 'Desert Oasis', short: 'Desert', unlock: 11, cost: 5200,
    desc: 'Golden dunes, cacti and an oasis in the middle of the desert.',
    weather: { clear: 8, cloudy: 2, fog: 1, storm: 1 },
    sky: { moon: 1, milky: 1 }, palette: 'Autumn',
    look: { saturation: 1.15 },
    audio: { water: 0.2, birds: 0.3, crickets: 0.8 },
    loops: { cicadas: 0.35 },
    bonus: { sand: 1.8, glass: 1.3 }, color: '#e7b44c',
  },
  kota: {
    name: 'Neon City', short: 'City', unlock: 14, cost: 8000,
    desc: 'A modern city with neon lights and streets that shine in the rain.',
    weather: { clear: 4, cloudy: 3, rain: 4, storm: 1, fog: 1 },
    sky: { moon: 0.8, milky: 0 }, palette: 'Neon',
    look: { saturation: 1.12 },
    audio: { water: 0, birds: 0.4, crickets: 0.2 },
    loops: { traffic: 0.6 },
    bonus: { coin: 1.5 }, color: '#8a8fa8',
  },
  fantasi: {
    name: 'Fantasy Isle', short: 'Fantasy', unlock: 18, cost: 12000,
    desc: 'A magical island of purple grass, glowing crystals and giant mushrooms.',
    weather: { clear: 5, cloudy: 2, fog: 2, snow: 1 },
    sky: { moon: 1, milky: 1, aurora: 1 }, palette: 'Neon',
    look: { saturation: 1.2 },
    audio: { water: 0.35, birds: 0.8, crickets: 1 },
    loops: { hum: 0.5 },
    bonus: { crystal: 1.6, essence: 1.3 }, color: '#b58cff',
  },
};
export const BIOME_KEYS = Object.keys(BIOMES);

// Default building colours for each biome style: walls, roof, trim.
export const STYLE = {
  desa: { wall: '#efe5d2', roof: '#b8483a', trim: '#5e3f2b', stone: '#8b8d96' },
  hutan: { wall: '#a5774c', roof: '#3f6e4f', trim: '#5a3a22', stone: '#7a7c84' },
  pantai: { wall: '#f2e2bf', roof: '#d9b26a', trim: '#8a5a38', stone: '#c9b48a' },
  gunung: { wall: '#7e5b48', roof: '#3b4f7a', trim: '#2c2a4a', stone: '#9fb7d4' },
  gurun: { wall: '#e0b27a', roof: '#c8752f', trim: '#7a4a2a', stone: '#d8a35c' },
  kota: { wall: '#8d919c', roof: '#4a4d57', trim: '#e8dcc8', stone: '#6a6e78' },
  fantasi: { wall: '#f4e6ff', roof: '#ff5d9e', trim: '#7b3dff', stone: '#8a7fc0' },
};

// Paint schemes the player can apply to buildings (index 0 = biome default).
export const PAINTS = [
  { name: 'Original', wall: null, roof: null },
  { name: 'Brick Red', wall: '#c9533f', roof: '#3f4552' },
  { name: 'Ocean Blue', wall: '#86b8e8', roof: '#27305f' },
  { name: 'Leaf Green', wall: '#cfe3b4', roof: '#3d7a4b' },
  { name: 'Sunny Yellow', wall: '#ffd77a', roof: '#a8402f' },
  { name: 'Snow White', wall: '#f6f3ea', roof: '#5f7fa8' },
  { name: 'Wood Brown', wall: '#9a6a46', roof: '#5a3a22' },
  { name: 'Lavender', wall: '#c9b8ef', roof: '#6b4a8a' },
  { name: 'Gold', wall: '#f2d27a', roof: '#c8752f', unlock: 'ach_rich' },
  { name: 'Neon', wall: '#2a2e3a', roof: '#ff3d8b', unlock: 'ach_city' },
  { name: 'Crystal', wall: '#bfe9ff', roof: '#7b3dff', unlock: 'ach_magic' },
];

// ---------------------------------------------------------------- buildings
// cost: coins plus resources. jobs: worker slots. produce: per worker per game hour.
// happy: { amount, radius } adds to the mood of residents nearby. leisure: NPCs spend evenings here.

export const BUILDINGS = {
  balai: {
    name: 'Town Hall', cat: 'special', size: 2, cost: {}, unlock: 99, fixed: true,
    desc: 'The heart of the island. Home of the Mayor and a meeting spot for villagers.',
    housing: 0, storage: 300, happy: { amount: 6, radius: 4 }, leisure: true,
  },
  rumah: {
    name: 'House', cat: 'home', size: 1, cost: { coins: 60, wood: 10 }, unlock: 1,
    desc: 'A cozy house for 3 villagers. Upgrade it to fit more.', housing: 3, housingPerLevel: 2, tax: 1.6,
  },
  vila: {
    name: 'Villa', cat: 'home', size: 2, cost: { coins: 380, plank: 25, brick: 20 }, unlock: 9,
    desc: 'A big home for 10 villagers, with its own garden.', housing: 10, housingPerLevel: 4, tax: 2.2, happy: { amount: 4, radius: 2 },
  },
  apartemen: {
    name: 'Apartment', cat: 'home', size: 1, cost: { coins: 420, brick: 30, glass: 15 }, unlock: 14, biomes: ['kota'],
    desc: 'A tall building with many windows for 9 city folk.', housing: 9, housingPerLevel: 4, tax: 2.4,
  },
  ladang: {
    name: 'Farm', cat: 'prod', size: 2, cost: { coins: 80, wood: 15 }, unlock: 1, notBiomes: ['kota'],
    desc: 'Grows wheat and veggies. Produces food.', jobs: 2, produce: { food: 2.2 },
  },
  penebang: {
    name: 'Lumber Hut', cat: 'prod', size: 1, cost: { coins: 50, stone: 5 }, unlock: 1, notBiomes: ['kota'],
    desc: 'Chops wood. Faster with lots of trees nearby.', jobs: 2, produce: { wood: 1.4 }, nearNode: ['tree', 'pine', 'palm', 'mushroom'],
  },
  tambang: {
    name: 'Quarry', cat: 'prod', size: 1, cost: { coins: 70, wood: 15 }, unlock: 2,
    desc: 'Breaks stone. Faster near rocks.', jobs: 2, produce: { stone: 1.2 }, nearNode: ['rock', 'ore'],
  },
  nelayan: {
    name: 'Fishing Dock', cat: 'prod', size: 1, cost: { coins: 110, wood: 25 }, unlock: 4, needWater: true,
    desc: 'Must be built by the water. Catches fish for food.', jobs: 2, produce: { food: 2.8 },
  },
  bijih: {
    name: 'Ore Mine', cat: 'prod', size: 1, cost: { coins: 150, plank: 15, stone: 20 }, unlock: 6,
    desc: 'Digs up iron ore for making tools.', jobs: 3, produce: { ore: 0.8 }, nearNode: ['rock', 'ore'],
  },
  pasir: {
    name: 'Sand Pit', cat: 'prod', size: 1, cost: { coins: 90, wood: 15 }, unlock: 5, biomes: ['pantai', 'gurun'],
    desc: 'Collects sand for making glass.', jobs: 2, produce: { sand: 1.5 },
  },
  kristal: {
    name: 'Crystal Tower', cat: 'prod', size: 1, cost: { coins: 500, glass: 20, brick: 20 }, unlock: 18, biomes: ['fantasi'],
    desc: 'Harvests magic crystals from the night air.', jobs: 2, produce: { crystal: 0.45 },
  },
  kincir: {
    name: 'Windmill', cat: 'prod', size: 1, cost: { coins: 120, plank: 20 }, unlock: 4, notBiomes: ['kota'],
    desc: 'Farms within 4 tiles produce 30% more.', jobs: 1, boost: { type: 'ladang', radius: 4, amount: 0.3 },
  },
  gudang: {
    name: 'Warehouse', cat: 'service', size: 1, cost: { coins: 80, wood: 20, stone: 10 }, unlock: 2,
    desc: 'Adds 250 resource storage.', storage: 250, storagePerLevel: 150,
  },
  bengkel: {
    name: 'Workshop', cat: 'service', size: 1, cost: { coins: 100, wood: 20, stone: 10 }, unlock: 2,
    desc: 'Unlocks Crafting and adds a queue slot.', jobs: 2, craftSlots: 1,
  },
  pasar: {
    name: 'Market', cat: 'service', size: 2, cost: { coins: 150, wood: 30, stone: 15 }, unlock: 3,
    desc: 'Unlocks trading and draws shoppers. Earns coins.', jobs: 2, produce: { coins: 3 }, leisure: true, happy: { amount: 4, radius: 3 },
  },
  kedai: {
    name: 'Diner', cat: 'service', size: 1, cost: { coins: 120, wood: 15, plank: 10 }, unlock: 3,
    desc: 'Where villagers eat dinner and unwind. Earns coins.', jobs: 2, produce: { coins: 2 }, leisure: true, happy: { amount: 8, radius: 3 },
  },
  toko: {
    name: 'Shop', cat: 'service', size: 1, cost: { coins: 220, brick: 15, glass: 6 }, unlock: 7,
    desc: 'A little lit-up shop. Steady coin income.', jobs: 2, produce: { coins: 5 }, happy: { amount: 3, radius: 2 },
  },
  sumur: {
    name: 'Well', cat: 'deco', size: 1, cost: { coins: 30, stone: 10 }, unlock: 1,
    desc: 'Fresh water for nearby villagers.', happy: { amount: 5, radius: 3 }, leisure: true,
  },
  taman: {
    name: 'Park', cat: 'deco', size: 1, cost: { coins: 40, wood: 5 }, unlock: 2,
    desc: 'Flowers, benches and little trees. Villagers love to relax here.', happy: { amount: 8, radius: 3 }, leisure: true,
  },
  lampu: {
    name: 'Street Lamp', cat: 'deco', size: 1, cost: { coins: 15, stone: 3 }, unlock: 1, small: true,
    desc: 'Lights up the night. Villagers feel safer.', happy: { amount: 2, radius: 2 },
  },
  pohon: {
    name: 'Shade Tree', cat: 'deco', size: 1, cost: { coins: 10 }, unlock: 1, small: true,
    desc: 'A pretty tree that gives shade.', happy: { amount: 2, radius: 2 },
  },
  bunga: {
    name: 'Flower Bed', cat: 'deco', size: 1, cost: { coins: 25 }, unlock: 2, small: true,
    desc: 'A colorful patch of flowers.', happy: { amount: 4, radius: 2 },
  },
  bangku: {
    name: 'Bench', cat: 'deco', size: 1, cost: { coins: 12, wood: 3 }, unlock: 1, small: true,
    desc: 'A comfy place to sit.', happy: { amount: 2, radius: 2 }, leisure: true,
  },
  airmancur: {
    name: 'Fountain', cat: 'deco', size: 1, cost: { coins: 180, stone: 30, brick: 10 }, unlock: 6,
    desc: 'A stone fountain that freshens up the square.', happy: { amount: 12, radius: 4 }, leisure: true,
  },
  monumen: {
    name: 'Monument', cat: 'deco', size: 1, cost: { coins: 320, stone: 40, tool: 6 }, unlock: 10,
    desc: 'A statue the whole island is proud of.', happy: { amount: 15, radius: 5 },
  },
  // ---- landmarks, one per island, only in their biome
  lumbung: {
    name: 'Grand Barn', cat: 'special', size: 2, cost: { coins: 400, plank: 30, brick: 15 }, unlock: 5, biomes: ['desa'], limit: 1,
    desc: 'The village icon. +500 storage and proud villagers.', storage: 500, happy: { amount: 12, radius: 6 }, landmark: true,
  },
  rumahpohon: {
    name: 'Treehouse', cat: 'special', size: 1, cost: { coins: 450, plank: 40 }, unlock: 4, biomes: ['hutan'], limit: 1,
    desc: 'A house high in a giant tree. The kids\' favorite spot.', happy: { amount: 14, radius: 6 }, leisure: true, landmark: true,
  },
  mercusuar: {
    name: 'Lighthouse', cat: 'special', size: 1, cost: { coins: 500, brick: 25, glass: 12 }, unlock: 6, biomes: ['pantai'], limit: 1,
    desc: 'A guiding light for ships at night.', happy: { amount: 16, radius: 7 }, landmark: true,
  },
  observatorium: {
    name: 'Observatory', cat: 'special', size: 2, cost: { coins: 900, brick: 30, glass: 25, tool: 8 }, unlock: 9, biomes: ['gunung'], limit: 1,
    desc: 'A telescope above the clouds. Auroras look even prettier.', happy: { amount: 18, radius: 7 }, landmark: true,
  },
  obelisk: {
    name: 'Sun Obelisk', cat: 'special', size: 1, cost: { coins: 1100, stone: 80, glass: 20 }, unlock: 12, biomes: ['gurun'], limit: 1,
    desc: 'An ancient pillar that glitters at sunset.', happy: { amount: 18, radius: 7 }, landmark: true,
  },
  menarajam: {
    name: 'Clock Tower', cat: 'special', size: 1, cost: { coins: 1500, brick: 50, glass: 30, tool: 10 }, unlock: 15, biomes: ['kota'], limit: 1,
    desc: 'The city clock that chimes every morning.', happy: { amount: 20, radius: 8 }, landmark: true,
  },
  pohonkehidupan: {
    name: 'Tree of Life', cat: 'special', size: 2, cost: { coins: 2500, crystal: 30, essence: 6 }, unlock: 19, biomes: ['fantasi'], limit: 1,
    desc: 'A glowing magic tree. The whole island is happy.', happy: { amount: 25, radius: 10 }, leisure: true, landmark: true,
  },
};
export const BUILD_CATS = [
  { id: 'home', name: 'Homes' },
  { id: 'prod', name: 'Production' },
  { id: 'service', name: 'Services' },
  { id: 'deco', name: 'Decor' },
  { id: 'special', name: 'Landmarks' },
];
export const MAX_LEVEL = 3;
export const upgradeCost = (def, level) => {
  const out = {};
  const k = level === 1 ? 1.2 : 2.2;
  for (const [r, v] of Object.entries(def.cost)) out[r] = Math.ceil(v * k);
  if (level >= 1 && !out.tool && (def.cat === 'prod' || def.cat === 'home')) out.tool = level;
  return out;
};

// ---------------------------------------------------------------- crafting

export const RECIPES = [
  { id: 'plank', name: 'Planks', in: { wood: 3 }, out: { plank: 1 }, time: 6, unlock: 2 },
  { id: 'brick', name: 'Bricks', in: { stone: 3 }, out: { brick: 1 }, time: 8, unlock: 3 },
  { id: 'glass', name: 'Glass', in: { sand: 3 }, out: { glass: 1 }, time: 9, unlock: 5 },
  { id: 'tool', name: 'Tools', in: { plank: 1, ore: 2 }, out: { tool: 1 }, time: 14, unlock: 6 },
  { id: 'essence', name: 'Magic Essence', in: { crystal: 2, glass: 1 }, out: { essence: 1 }, time: 20, unlock: 18 },
  { id: 'meal', name: 'Warm Meal', in: { food: 5, wood: 1 }, out: { food: 8 }, time: 10, unlock: 4 },
];

// The mayor's gathering tool. Each tier gathers more per swing.
export const TOOL_TIERS = [
  { name: 'Bare Hands', yield: 1, cost: null },
  { name: 'Stone Axe', yield: 2, cost: { coins: 120, wood: 20, stone: 20 } },
  { name: 'Iron Axe', yield: 3, cost: { coins: 450, tool: 4, plank: 10 } },
  { name: 'Crystal Axe', yield: 5, cost: { coins: 1500, tool: 8, crystal: 10 } },
];

// ---------------------------------------------------------------- nature

// Gatherable nodes: what tapping them gives.
export const NODES = {
  tree: { name: 'Tree', res: 'wood', hp: 4, regrow: 18, sfx: 'chop' },
  pine: { name: 'Pine', res: 'wood', hp: 5, regrow: 20, sfx: 'chop' },
  palm: { name: 'Palm', res: 'wood', hp: 3, regrow: 16, sfx: 'chop', bonus: { food: 1 } },
  cactus: { name: 'Cactus', res: 'wood', hp: 2, regrow: 22, sfx: 'chop', bonus: { food: 1 } },
  bush: { name: 'Berry Bush', res: 'food', hp: 3, regrow: 10, sfx: 'harvest' },
  rock: { name: 'Boulder', res: 'stone', hp: 5, regrow: 30, sfx: 'pick' },
  ore: { name: 'Ore Vein', res: 'ore', hp: 4, regrow: 40, sfx: 'pick', bonus: { stone: 1 } },
  dune: { name: 'Sand Dune', res: 'sand', hp: 4, regrow: 12, sfx: 'harvest' },
  crystal: { name: 'Crystal Cluster', res: 'crystal', hp: 3, regrow: 48, sfx: 'sparkle' },
  mushroom: { name: 'Giant Mushroom', res: 'food', hp: 3, regrow: 14, sfx: 'harvest', bonus: { wood: 1 } },
};

// ---------------------------------------------------------------- people

export const FIRST_NAMES = [
  'Ayu', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko', 'Kirana', 'Lestari', 'Made', 'Nanda',
  'Oki', 'Putri', 'Rama', 'Sari', 'Tono', 'Umi', 'Wati', 'Yoga', 'Zahra', 'Bagas', 'Dimas', 'Intan', 'Laras', 'Raka',
  'Sekar', 'Tari', 'Wulan', 'Arif', 'Bayu', 'Cahya', 'Dian', 'Galih', 'Hana', 'Irfan', 'Kemal', 'Mega', 'Nisa', 'Pandu',
  'Rizky', 'Salsa', 'Teguh', 'Vina', 'Yudi', 'Anjani', 'Bima', 'Dara',
];
export const TRAITS = [
  { id: 'rajin', name: 'Hardworking', desc: 'Works 20% harder.', work: 1.2 },
  { id: 'ceria', name: 'Cheerful', desc: 'Mood bounces back quickly.', mood: 1.3 },
  { id: 'rakus', name: 'Foodie', desc: 'Eats more than others.', hunger: 1.4 },
  { id: 'kutubuku', name: 'Bookworm', desc: 'Loves quiet places.', leisure: 'taman' },
  { id: 'gaul', name: 'Outgoing', desc: 'Loves chatting with neighbors.', social: 1.5 },
  { id: 'pemalas', name: 'Laid-back', desc: 'Works a bit slower but rarely gets stressed.', work: 0.85, mood: 1.15 },
  { id: 'petualang', name: 'Adventurer', desc: 'Loves long walks.', wander: 1.6 },
];

// Lines NPCs say. Picked by context.
export const TALK = {
  happy: ['What a lovely day, Mayor!', 'I love living here.', 'Thanks for building this island.', 'Life keeps getting better.'],
  ok: ['Not bad, but it could be better.', 'Hope tomorrow is brighter.', 'Anything I can help with?'],
  sad: ['I haven\'t been very happy lately...', 'I wish there was a park near my home.', 'This island needs more fun.'],
  hungry: ['My tummy is rumbling. Food is running low!', 'We need another farm or fishing dock.'],
  homeless: ['I don\'t have a home yet...', 'Please build another house!'],
  jobless: ['I don\'t have a job yet.', 'Build a new workplace, I\'m ready to work!'],
  rain: ['Rain again! Good thing I brought an umbrella.', 'The rain makes me sleepy.'],
  snow: ['Brrr, it\'s cold!', 'The snow is so pretty.'],
  night: ['It\'s late, time to head home.', 'Look at all those stars!'],
  morning: ['Good morning!', 'A fresh morning for work.'],
  work: ['Work is going well today.', 'Almost done!'],
  festival: ['Festival time! Let\'s dance!', 'This music is so fun!'],
};

// ---------------------------------------------------------------- quests
// goal types: build(type, n) | pop(n) | have(res, n) | craft(n) | gather(n) | level(n) | island(id) | talk(n) | sell(n) | happy(n) | upgrade(n) | buildAny(n)

export const QUESTS = [
  { id: 'q1', title: 'First Home', desc: 'Build a House so new villagers can move in.', goals: [{ type: 'build', id: 'rumah', n: 1 }], reward: { coins: 60, xp: 30 } },
  { id: 'q2', title: 'Busy Hands', desc: 'Gather resources by tapping trees, rocks or bushes.', goals: [{ type: 'gather', n: 8 }], reward: { coins: 40, xp: 30, wood: 10 }, after: 'q1' },
  { id: 'q3', title: 'Food Supply', desc: 'Build a Farm to feed your villagers.', goals: [{ type: 'build', id: 'ladang', n: 1 }], reward: { coins: 80, xp: 40 }, after: 'q1' },
  { id: 'q4', title: 'Little Village', desc: 'Reach 6 villagers.', goals: [{ type: 'pop', n: 6 }], reward: { coins: 120, xp: 60, food: 20 }, after: 'q3' },
  { id: 'q5', title: 'Lumberjack', desc: 'Build a Lumber Hut.', goals: [{ type: 'build', id: 'penebang', n: 1 }], reward: { coins: 60, xp: 40 }, after: 'q2' },
  { id: 'q6', title: 'Village Workshop', desc: 'Build a Workshop, then craft 3 Planks.', goals: [{ type: 'build', id: 'bengkel', n: 1 }, { type: 'craft', n: 3 }], reward: { coins: 150, xp: 80, plank: 5 }, after: 'q5' },
  { id: 'q7', title: 'Flower Park', desc: 'Build a Park to make villagers happy.', goals: [{ type: 'build', id: 'taman', n: 1 }], reward: { coins: 70, xp: 50 }, after: 'q4' },
  { id: 'q8', title: 'Busy Market', desc: 'Build a Market, then sell 20 items.', goals: [{ type: 'build', id: 'pasar', n: 1 }, { type: 'sell', n: 20 }], reward: { coins: 200, xp: 100 }, after: 'q6' },
  { id: 'q9', title: 'Meet the Neighbors', desc: 'Chat with 5 villagers.', goals: [{ type: 'talk', n: 5 }], reward: { coins: 80, xp: 60 }, after: 'q4' },
  { id: 'q10', title: 'Happy Village', desc: 'Reach 70% happiness with 10 villagers.', goals: [{ type: 'pop', n: 10 }, { type: 'happy', n: 70 }], reward: { coins: 250, xp: 140 }, after: 'q7' },
  { id: 'q11', title: 'Into the Woods', desc: 'Unlock the Pine Forest island from the Map.', goals: [{ type: 'island', id: 'hutan' }], reward: { coins: 200, xp: 120, wood: 40 }, after: 'q8' },
  { id: 'q12', title: 'Renovation', desc: 'Upgrade 3 buildings.', goals: [{ type: 'upgrade', n: 3 }], reward: { coins: 220, xp: 120, tool: 2 }, after: 'q10' },
  { id: 'q13', title: 'Master Crafter', desc: 'Craft 25 items at the Workshop.', goals: [{ type: 'craft', n: 25 }], reward: { coins: 300, xp: 160 }, after: 'q12' },
  { id: 'q14', title: 'Dream Beach', desc: 'Unlock the Tropical Beach island.', goals: [{ type: 'island', id: 'pantai' }], reward: { coins: 400, xp: 220, sand: 40 }, after: 'q11' },
  { id: 'q15', title: 'Guiding Light', desc: 'Build a Lighthouse on the Tropical Beach.', goals: [{ type: 'build', id: 'mercusuar', n: 1 }], reward: { coins: 600, xp: 300 }, after: 'q14' },
  { id: 'q16', title: 'Small Town', desc: 'Reach 40 villagers across all islands.', goals: [{ type: 'pop', n: 40 }], reward: { coins: 700, xp: 350 }, after: 'q13' },
  { id: 'q17', title: 'Snowy Summit', desc: 'Unlock the Snowy Peaks.', goals: [{ type: 'island', id: 'gunung' }], reward: { coins: 800, xp: 400, ore: 30 }, after: 'q15' },
  { id: 'q18', title: 'Tool Expert', desc: 'Own 15 Tools.', goals: [{ type: 'have', id: 'tool', n: 15 }], reward: { coins: 900, xp: 420 }, after: 'q17' },
  { id: 'q19', title: 'Golden Oasis', desc: 'Unlock the Desert Oasis.', goals: [{ type: 'island', id: 'gurun' }], reward: { coins: 1200, xp: 520, glass: 20 }, after: 'q18' },
  { id: 'q20', title: 'City Lights', desc: 'Unlock Neon City.', goals: [{ type: 'island', id: 'kota' }], reward: { coins: 1800, xp: 700 }, after: 'q19' },
  { id: 'q21', title: 'Metropolis', desc: 'Reach 120 villagers in total.', goals: [{ type: 'pop', n: 120 }], reward: { coins: 2500, xp: 900 }, after: 'q20' },
  { id: 'q22', title: 'Wonderland', desc: 'Unlock the Fantasy Isle.', goals: [{ type: 'island', id: 'fantasi' }], reward: { coins: 3000, xp: 1200, crystal: 10 }, after: 'q21' },
  { id: 'q23', title: 'Tree of Life', desc: 'Plant the Tree of Life on the Fantasy Isle.', goals: [{ type: 'build', id: 'pohonkehidupan', n: 1 }], reward: { coins: 6000, xp: 2500 }, after: 'q22' },
];

// ---------------------------------------------------------------- achievements

export const ACHIEVEMENTS = [
  { id: 'ach_build1', name: 'First Stone', desc: 'Build 1 building.', stat: 'built', n: 1, reward: { coins: 20 } },
  { id: 'ach_build25', name: 'Architect', desc: 'Build 25 buildings.', stat: 'built', n: 25, reward: { coins: 250 } },
  { id: 'ach_build100', name: 'World Builder', desc: 'Build 100 buildings.', stat: 'built', n: 100, reward: { coins: 1200 } },
  { id: 'ach_gather50', name: 'Gatherer', desc: 'Gather 50 times.', stat: 'gathered', n: 50, reward: { coins: 80 } },
  { id: 'ach_gather500', name: 'Tireless', desc: 'Gather 500 times.', stat: 'gathered', n: 500, reward: { coins: 600 } },
  { id: 'ach_craft10', name: 'Skilled Hands', desc: 'Craft 10 items.', stat: 'crafted', n: 10, reward: { coins: 100 } },
  { id: 'ach_craft100', name: 'Masterpiece', desc: 'Craft 100 items.', stat: 'crafted', n: 100, reward: { coins: 800 } },
  { id: 'ach_pop10', name: 'Neighbors', desc: 'Reach 10 villagers.', stat: 'pop', n: 10, reward: { coins: 100 } },
  { id: 'ach_pop50', name: 'Small Town', desc: 'Reach 50 villagers.', stat: 'pop', n: 50, reward: { coins: 500 } },
  { id: 'ach_pop150', name: 'Metropolitan', desc: 'Reach 150 villagers.', stat: 'pop', n: 150, reward: { coins: 2000 } },
  { id: 'ach_rich', name: 'Tycoon', desc: 'Hold 10,000 coins at once.', stat: 'coins', n: 10000, reward: { xp: 500 }, unlocks: 'Gold Paint' },
  { id: 'ach_trade', name: 'Merchant', desc: 'Sell 200 items.', stat: 'sold', n: 200, reward: { coins: 400 } },
  { id: 'ach_talk', name: 'Friendly', desc: 'Chat with villagers 30 times.', stat: 'talked', n: 30, reward: { coins: 200 } },
  { id: 'ach_gift', name: 'Generous', desc: 'Give 10 gifts.', stat: 'gifts', n: 10, reward: { coins: 200 } },
  { id: 'ach_quest10', name: 'Village Hero', desc: 'Complete 10 quests.', stat: 'quests', n: 10, reward: { coins: 400 } },
  { id: 'ach_events', name: 'Full of Surprises', desc: 'Experience 10 random events.', stat: 'events', n: 10, reward: { coins: 300 } },
  { id: 'ach_chest', name: 'Treasure Hunter', desc: 'Find 5 treasure chests.', stat: 'chests', n: 5, reward: { coins: 400 } },
  { id: 'ach_cat', name: 'Cat Friend', desc: 'Find 3 lost cats.', stat: 'cats', n: 3, reward: { coins: 300 } },
  { id: 'ach_islands3', name: 'Explorer', desc: 'Unlock 3 islands.', stat: 'islands', n: 3, reward: { coins: 500 } },
  { id: 'ach_islands7', name: 'Island Emperor', desc: 'Unlock all 7 islands.', stat: 'islands', n: 7, reward: { coins: 5000 } },
  { id: 'ach_city', name: 'Neon Lights', desc: 'Unlock Neon City.', stat: 'kota', n: 1, reward: { coins: 300 }, unlocks: 'Neon Paint' },
  { id: 'ach_magic', name: 'Wizard', desc: 'Craft 5 Magic Essence.', stat: 'essence', n: 5, reward: { coins: 800 }, unlocks: 'Crystal Paint' },
  { id: 'ach_landmark', name: 'Iconic', desc: 'Build 3 landmarks.', stat: 'landmarks', n: 3, reward: { coins: 1500 } },
  { id: 'ach_days', name: 'Loyal', desc: 'Spend 30 days in this world.', stat: 'days', n: 30, reward: { coins: 700 } },
  { id: 'ach_streak', name: 'Regular Visitor', desc: 'Claim the Daily Reward 7 days in a row.', stat: 'streak', n: 7, reward: { coins: 700 } },
  { id: 'ach_level10', name: 'Senior Mayor', desc: 'Reach level 10.', stat: 'level', n: 10, reward: { coins: 800 } },
  { id: 'ach_level20', name: 'Legend', desc: 'Reach level 20.', stat: 'level', n: 20, reward: { coins: 4000 } },
];

// ---------------------------------------------------------------- random events

// Only one event runs at a time, on the island where it started. Fields:
//   hours: duration (game hours), weight: how often it is picked among the eligible ones
//   conditions: minLevel, minPop, night (true/false), start: [fromHour, toHour) (may wrap midnight),
//     biomes / notBiomes, weatherIn / notWeather (current weather), needs (a finished building type)
//   kind: 'good' | 'bad' | 'visit' (announcement style), icon, flavor + effect lines + tip for the
//     announcement, desc for the short toast and the info sheet
//   fx (simulation hooks, read by game.js):
//     mult { res | coin | all: x }  production multipliers     type { buildingType: x }
//     tax: x (home taxes)  sell: x (+ sellNight: only 18:00-05:00)  build: x (construction speed)
//     refund: share of materials given back on placing   mood: +/- target mood   fun: leisure fun x
//     hunger / energy: need decay x   sleep: energy regain x   arrivals: newcomer chance x
//     weather: forced weather   aurora: aurora on   indoors: villagers shelter at home
//     gather: [h0, h1] villagers gather at the plaza (gatherFor: only the first N hours), pose
//     burnWood: wood burned per lived-in home per hour
//   props { kind, n, perHour, max }: tappable things the Mayor walks up to (see Game.collectEventProp)
//   host: a visiting character the Mayor can greet; npc: 'birthday' | 'sick'; prize: reward at the end
//   endWhenDone: the event ends as soon as every prop is found (or every villager is cured)
export const EVENTS = [
  // ---- the originals
  {
    id: 'caravan', name: 'Merchant Caravan', icon: 'coin', kind: 'good', hours: 3, weight: 3, minLevel: 2,
    desc: 'Traveling merchants are here! Sell prices +50% for 3 hours.',
    flavor: 'Wagons full of silk and spices roll into town. The merchants pay top coin for local goods.',
    effect: ['Market sell prices +50%'], fx: { sell: 1.5 },
  },
  {
    id: 'harvest', name: 'Bumper Harvest', icon: 'food', kind: 'good', hours: 4, weight: 3,
    desc: 'The soil is extra fertile. Double food production for 4 hours.',
    flavor: 'Fat pumpkins and golden wheat. The fields have never looked this good.',
    effect: ['Food production x2'], fx: { mult: { food: 2 } },
  },
  {
    id: 'festival', name: 'Village Festival', icon: 'festival', kind: 'good', hours: 3, weight: 2, minPop: 5, night: false,
    desc: 'Villagers are partying in the square! Happiness is up.',
    flavor: 'Music, dancing and far too much cake. Everyone heads to the town square!',
    effect: ['Happiness +10', 'Villagers dance at the plaza'], fx: { mood: 10, gather: [9, 21.5], pose: 'dance' },
  },
  {
    id: 'storm', name: 'Storm Incoming', icon: 'storm', kind: 'bad', hours: 2, weight: 2, notBiomes: ['gurun'],
    desc: 'A storm hits. Production is down 30% for a while.',
    flavor: 'Dark clouds roll in from the sea. Batten down the hatches!',
    effect: ['All production -30%', 'Villagers feel a little gloomy'], fx: { mult: { all: 0.7 }, mood: -6, weather: 'storm' },
  },
  {
    id: 'chest', name: 'Treasure Chest', icon: 'chest', kind: 'good', hours: 6, weight: 3,
    desc: 'A mysterious chest appeared on the island. Find it and open it!',
    flavor: 'Something shiny glints in the grass. Who could have left it there?',
    effect: ['Find the chest and tap it'],
  },
  {
    id: 'cat', name: 'Lost Cat', icon: 'heart', kind: 'visit', hours: 5, weight: 2, minPop: 3,
    desc: 'A villager\'s beloved cat is missing. Find it and tap it!',
    flavor: '"Mittens, where are you?" A worried villager is searching everywhere.',
    effect: ['Find the cat and tap it', 'The whole village cheers when it is found'],
  },
  {
    id: 'meteor', name: 'Meteor Shower', icon: 'meteor', kind: 'good', hours: 2, weight: 1, minLevel: 5, night: true,
    desc: 'Shooting stars scatter crystals and ore across the island.',
    flavor: 'Fiery streaks light up the night and land with a thud.',
    effect: ['New ore or crystal deposits appear'],
  },
  {
    id: 'visitor', name: 'Mysterious Wanderer', icon: 'compass', kind: 'visit', hours: 4, weight: 2,
    desc: 'A wanderer is passing through. Talk to them for a reward.',
    flavor: 'A cloaked traveler from far away has stopped to rest on your island.',
    effect: ['Tap the wanderer for a gift'],
  },
  {
    id: 'pest', name: 'Pest Attack', icon: 'bug', kind: 'bad', hours: 3, weight: 1, minLevel: 3,
    desc: 'Pests are attacking the farms. Food production is halved.',
    flavor: 'Hungry critters are nibbling the crops.',
    effect: ['Food production -50%'], fx: { mult: { food: 0.5 } },
  },
  {
    id: 'inspire', name: 'Team Spirit', icon: 'star', kind: 'good', hours: 4, weight: 2,
    desc: 'Villagers are fired up! All production +25%.',
    flavor: 'Someone gave a rousing speech at breakfast. Everyone is ready to work!',
    effect: ['All production +25%'], fx: { mult: { all: 1.25 } },
  },

  // ---- markets and festivals
  {
    id: 'nightmarket', name: 'Night Market', icon: 'lantern', kind: 'good', hours: 6, weight: 2, minLevel: 3, needs: 'pasar', start: [17.5, 21],
    desc: 'Lantern-lit stalls open after dark. Night sell prices +60%.',
    flavor: 'Paper lanterns, sizzling snacks and traders who stay up late. Sell after sunset for the best prices!',
    effect: ['Sell prices +60% after dark (18:00 to 05:00)', 'Markets earn +50% coins'],
    fx: { sell: 1.6, sellNight: true, type: { pasar: 1.5 }, fun: 1.3 },
  },
  {
    id: 'lantern', name: 'Lantern Festival', icon: 'lantern', kind: 'good', hours: 4, weight: 2, minPop: 4, start: [18, 21],
    desc: 'Glowing lanterns float into the night sky. Happiness up!',
    flavor: 'Every villager writes a wish on a paper lantern and lets it drift up to the stars.',
    effect: ['Happiness +12', 'Villagers gather at the plaza until late'],
    fx: { mood: 12, fun: 2, gather: [18, 23.9], pose: 'wave' },
  },
  {
    id: 'bard', name: 'Wandering Bard', icon: 'music', kind: 'visit', hours: 4, weight: 2, minPop: 3, start: [9, 16],
    desc: 'A bard plays at the plaza. Villagers dance and have fun!',
    flavor: 'A traveling musician tunes a lute by the town hall. Soon the whole village is dancing.',
    effect: ['Villagers dance at the plaza', 'Fun x2.5, happiness +8'], tip: 'Walk the Mayor up to the bard to request a song.',
    fx: { mood: 8, fun: 2.5, gather: [9, 20], gatherFor: 2.5, pose: 'dance' }, host: 'bard',
  },
  {
    id: 'birthday', name: 'Birthday Party', icon: 'cake', kind: 'good', hours: 8, weight: 2, minPop: 3, start: [8, 15],
    desc: 'It is a villager\'s birthday! Give them a gift for big friendship.',
    flavor: 'Balloons, candles and a big cake. Someone special turns a year older today!',
    effect: ['Gift the birthday villager: triple friendship and a present', 'Happiness +5'],
    tip: 'Look for the cake bubble, tap the villager and choose Gift.',
    fx: { mood: 5 }, npc: 'birthday',
  },
  {
    id: 'taxholiday', name: 'Tax Holiday', icon: 'gift', kind: 'good', hours: 6, weight: 1, minPop: 4,
    desc: 'No taxes today! Villagers are thrilled and newcomers flock in.',
    flavor: 'The Mayor declares a day off from taxes. Cheers echo through the streets!',
    effect: ['Homes pay no tax', 'Happiness +15, twice as many newcomers'],
    fx: { tax: 0, mood: 15, arrivals: 2 },
  },
  {
    id: 'royal', name: 'Royal Visit', icon: 'crown', kind: 'visit', hours: 6, weight: 1, minLevel: 6, minPop: 5, start: [8, 12],
    desc: 'Royalty is visiting! Keep happiness above 60% for a reward.',
    flavor: 'Trumpets! A royal carriage arrives and the whole island lines up to wave.',
    effect: ['Happiness above 60% at the end: a big royal reward', 'Villagers greet the royal at the plaza'],
    tip: 'Walk the Mayor up to the royal to greet them.',
    fx: { mood: 4, gather: [8, 20], gatherFor: 1.5, pose: 'wave' }, host: 'royal', prize: true,
  },
  {
    id: 'fishing', name: 'Fishing Tournament', icon: 'fish', kind: 'good', hours: 5, weight: 2, needs: 'nelayan', start: [7, 12],
    desc: 'Fishing contest! Docks catch x2.5 food. Prize at the end.',
    flavor: 'Rods ready! Fishers from every island compete for the biggest catch of the season.',
    effect: ['Fishing Docks produce x2.5 food', 'A coin prize at the end, based on the catch'],
    fx: { type: { nelayan: 2.5 }, fun: 1.2 }, prize: true,
  },
  {
    id: 'boom', name: 'Building Boom', icon: 'build', kind: 'good', hours: 4, weight: 2, minLevel: 3, start: [7, 15],
    desc: 'Builders are on fire! Construction x3 speed, 25% materials back.',
    flavor: 'A guild of master builders is in town, and they are bored. Put them to work!',
    effect: ['Construction 3x faster', '25% of materials refunded when you build'],
    fx: { build: 3, refund: 0.25 },
  },

  // ---- finding things
  {
    id: 'starfall', name: 'Starfall', icon: 'sparkle', kind: 'good', hours: 3, weight: 2, minLevel: 4, start: [20.5, 2], notWeather: ['rain', 'storm', 'snow'],
    desc: 'Shooting stars are falling! Tap fallen stars for Magic Essence.',
    flavor: 'The sky is raining light tonight. Some stars have landed on the island, still warm and glowing.',
    effect: ['Fallen stars land across the island', 'Each one gives Magic Essence and Crystal'],
    tip: 'Tap a glowing star and the Mayor will pick it up.',
    fx: { weather: 'clear', mood: 4 }, props: { kind: 'star', n: 2, perHour: 1, max: 5 },
  },
  {
    id: 'rainbow', name: 'Rainbow', icon: 'rainbow', kind: 'good', hours: 3, weight: 6, start: [8, 16], weatherIn: ['rain', 'storm'],
    desc: 'The rain stops and a rainbow appears! Coins +50%.',
    flavor: 'They say there is a pot of gold where the rainbow ends. Maybe it is true?',
    effect: ['Coin income +50%', 'A pot of gold is hidden somewhere'], tip: 'Find the pot of gold and tap it.',
    fx: { weather: 'clear', mult: { coin: 1.5 }, mood: 6 }, props: { kind: 'gold', n: 1 },
  },
  {
    id: 'mystery', name: 'Fog of Mystery', icon: 'fog', kind: 'good', hours: 5, weight: 2, minLevel: 3,
    desc: 'A strange fog rolls in. Hidden chests appeared!',
    flavor: 'In the thick mist something glitters. Old smugglers\' chests have washed up on the island.',
    effect: ['3 hidden treasure chests to find'], tip: 'Look for faint sparkles in the fog.',
    fx: { weather: 'fog' }, props: { kind: 'chest', n: 3 }, endWhenDone: true,
  },
  {
    id: 'treasure', name: 'Treasure Map', icon: 'map', kind: 'good', hours: 8, weight: 2, minLevel: 2,
    desc: 'An old map marks a dig spot with an X. Dig it up!',
    flavor: 'A torn map washed up in a bottle. X marks the spot!',
    effect: ['Find the red X and dig up the treasure'], tip: 'Look for the red X and the golden beam.',
    props: { kind: 'dig', n: 1 }, endWhenDone: true,
  },
  {
    id: 'puppy', name: 'Lost Puppy', icon: 'heart', kind: 'visit', hours: 5, weight: 2, start: [7, 18],
    desc: 'A little puppy wandered onto the island. Catch it!',
    flavor: 'Tiny paw prints everywhere, and a happy bark from the bushes. Someone has lost their puppy!',
    effect: ['Find the puppy and take it home', 'A reward, and happier villagers'],
    props: { kind: 'dog', n: 1 }, endWhenDone: true,
  },
  {
    id: 'hideseek', name: 'Hide and Seek', icon: 'people', kind: 'visit', hours: 4, weight: 2, minPop: 4, start: [9, 17],
    desc: 'The kids are hiding! Find all 3 for a prize.',
    flavor: '"Ready or not, here I come!" Three giggling kids are hiding around the island.',
    effect: ['Find the 3 hidden kids', 'Each one gives coins and XP'], tip: 'Look next to trees, rocks and bushes.',
    props: { kind: 'kid', n: 3 }, endWhenDone: true,
  },
  {
    id: 'spooky', name: 'Spooky Night', icon: 'ghost', kind: 'good', hours: 5, weight: 2, minLevel: 2, start: [19.5, 23],
    desc: 'Ghost lights drift through a purple fog. Catch wisps for crystals!',
    flavor: 'Owls hoot, the fog glows purple and little wisps float between the trees...',
    effect: ['Catch ghost wisps for Crystal and coins', 'Spooky stories: leisure fun +50%'],
    tip: 'Tap a wisp and the Mayor will catch it.',
    fx: { weather: 'fog', fun: 1.5 }, props: { kind: 'wisp', n: 3, perHour: 1, max: 6 },
  },

  // ---- challenges
  {
    id: 'bees', name: 'Bee Swarm', icon: 'bug', kind: 'bad', hours: 5, weight: 2, minLevel: 3, needs: 'ladang', start: [8, 16],
    desc: 'Bee swarms around the farms! Shoo them for honey.',
    flavor: 'Bzzzz! Swarms have settled near the fields and the farmers will not go near them.',
    effect: ['Food production -15% per swarm', 'Shoo each swarm away to collect its honey'], tip: 'Tap a swarm and the Mayor will shoo it.',
    props: { kind: 'bees', n: 3 }, endWhenDone: true,
  },
  {
    id: 'flu', name: 'Sniffles Going Around', icon: 'sickness', kind: 'bad', hours: 8, weight: 1, minPop: 4,
    desc: 'Some villagers caught a cold. Gift them food to help them recover.',
    flavor: 'Achoo! A cold is going around. Sick villagers tire quickly and slow down production.',
    effect: ['Sick villagers lose energy, production drops', 'Gift food to a sick villager to cure them'],
    tip: 'Sick villagers show a sneeze bubble. Tap one and choose Gift.',
    npc: 'sick', endWhenDone: true,
  },
  {
    id: 'heatwave', name: 'Heatwave', icon: 'sun', kind: 'bad', hours: 6, weight: 2, biomes: ['gurun', 'pantai', 'desa', 'kota'], start: [9, 14], notWeather: ['rain', 'storm', 'snow'],
    desc: 'Scorching heat! Villagers get hungry faster, cafés sell cold drinks.',
    flavor: 'The air shimmers and the cicadas never stop. Time for lemonade!',
    effect: ['Villagers get hungry 60% faster', 'Taverns and shops earn +60% coins'],
    fx: { weather: 'clear', hunger: 1.6, energy: 1.3, type: { kedai: 1.6, toko: 1.6 }, mood: -3, fun: 1.3 },
  },
  {
    id: 'coldsnap', name: 'Cold Snap', icon: 'snowflake', kind: 'bad', hours: 6, weight: 2, biomes: ['gunung', 'hutan', 'desa', 'fantasi'],
    desc: 'Freezing cold! Each home burns 1 wood an hour to stay cozy.',
    flavor: 'Frost creeps over the windows. Stack the firewood and light the fireplaces!',
    effect: ['Snow falls, production -15%', 'Homes burn 1 wood per hour; warm homes are happier'],
    fx: { weather: 'snow', mult: { all: 0.85 }, burnWood: 1 },
  },
  {
    id: 'sandstorm', name: 'Sandstorm', icon: 'wind', kind: 'bad', hours: 3, weight: 3, biomes: ['gurun'], start: [9, 17],
    desc: 'A sandstorm! Production -25%, but sand pits fill up x2.5.',
    flavor: 'A wall of sand rolls over the dunes. Everyone hurries indoors.',
    effect: ['All production -25%, sand x2.5', 'Villagers shelter indoors'],
    fx: { weather: 'fog', mult: { all: 0.75, sand: 2.5 }, indoors: true, mood: -4 },
  },

  // ---- nature
  {
    id: 'harvestmoon', name: 'Harvest Moon', icon: 'moon', kind: 'good', hours: 14, weight: 2, minLevel: 2, needs: 'ladang', notBiomes: ['kota'], start: [19, 23], notWeather: ['rain', 'storm'],
    desc: 'A huge orange moon rises. Food x2 and berry bushes regrow.',
    flavor: 'Old farmers say crops grown under the Harvest Moon grow twice as fast.',
    effect: ['Food production x2 until tomorrow', 'Every berry bush regrows at once'],
    fx: { weather: 'clear', mult: { food: 2 } },
  },
  {
    id: 'fireflies', name: 'Firefly Night', icon: 'sparkle', kind: 'good', hours: 6, weight: 2, notBiomes: ['kota', 'gunung'], start: [20, 23], notWeather: ['rain', 'storm', 'snow'],
    desc: 'Thousands of fireflies light up the night. Villagers sleep well.',
    flavor: 'A warm, still night. The meadows twinkle like a sky turned upside down.',
    effect: ['Happiness +8', 'Villagers regain energy 40% faster'], fx: { weather: 'clear', mood: 8, sleep: 1.4 },
  },
  {
    id: 'butterflies', name: 'Butterfly Migration', icon: 'butterfly', kind: 'good', hours: 5, weight: 2, biomes: ['desa', 'hutan', 'pantai', 'fantasi'], start: [8, 15], notWeather: ['rain', 'storm', 'snow'],
    desc: 'Clouds of butterflies pass by. Villagers love it!',
    flavor: 'Orange, blue and yellow wings flutter over every flower on the island.',
    effect: ['Happiness +6', 'Leisure is 50% more fun'], fx: { weather: 'clear', mood: 6, fun: 1.5 },
  },
  {
    id: 'aurora', name: 'Aurora Night', icon: 'crystal', kind: 'good', hours: 6, weight: 3, biomes: ['gunung', 'fantasi', 'hutan'], start: [20, 23.5], notWeather: ['rain', 'storm'],
    desc: 'Green lights dance in the sky. Crystal production x2!',
    flavor: 'Ribbons of green and violet light ripple across the stars, and the crystals hum along.',
    effect: ['Crystal production x2', 'Happiness +8'], fx: { weather: 'clear', aurora: true, mood: 8, mult: { crystal: 2 } },
  },
  {
    id: 'bloom', name: 'Bloom Festival', icon: 'flower', kind: 'good', hours: 5, weight: 3, minLevel: 2, biomes: ['fantasi', 'desa'], start: [8, 15],
    desc: 'Every flower blooms at once! Crystal and food +50%.',
    flavor: 'Petals swirl on the wind and the whole island smells of honey.',
    effect: ['Happiness +10', 'Crystal and food production +50%'], fx: { weather: 'clear', mood: 10, mult: { crystal: 1.5, food: 1.5 } },
  },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------- progression

export const xpForLevel = (l) => Math.round(80 * Math.pow(l, 1.55));
export const MAX_PLAYER_LEVEL = 30;

export const DAILY_REWARDS = [
  { coins: 100 },
  { coins: 150, wood: 20 },
  { coins: 200, stone: 20, food: 20 },
  { coins: 300, plank: 10 },
  { coins: 400, brick: 10, glass: 5 },
  { coins: 600, tool: 3 },
  { coins: 1000, crystal: 5, essence: 1 },
];

export const START = {
  coins: 500,
  res: { wood: 40, stone: 25, food: 40 },
  baseStorage: 400,
};

export const TIPS = [
  'Drag one finger to pan, pinch to zoom, and twist two fingers to rotate.',
  'Tap trees, rocks or bushes and the Mayor will gather them.',
  'Villagers work from morning to evening. At night they go home to sleep.',
  'Parks, wells and fountains make nearby villagers happier.',
  'Happy villagers pay more taxes and attract new villagers.',
  'Build Roads so villagers walk faster.',
  'Windmills speed up nearby Farms.',
  'Sell goods at the Market when the Merchant Caravan visits for big profits.',
  'Production keeps going while the game is closed, for up to 8 hours.',
  'Tap a building to upgrade, repaint, rotate or demolish it.',
];
