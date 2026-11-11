// Game definitions: resources, biomes, buildings, recipes, quests, achievements, events, progression.
// All text is Indonesian (the game's language).

export const RES = {
  wood: { name: 'Kayu', price: 4, icon: 'wood' },
  stone: { name: 'Batu', price: 5, icon: 'stone' },
  food: { name: 'Makanan', price: 3, icon: 'food' },
  ore: { name: 'Bijih Besi', price: 9, icon: 'ore' },
  sand: { name: 'Pasir', price: 3, icon: 'sand' },
  crystal: { name: 'Kristal', price: 24, icon: 'crystal' },
  plank: { name: 'Papan', price: 11, icon: 'plank', crafted: true },
  brick: { name: 'Bata', price: 13, icon: 'brick', crafted: true },
  glass: { name: 'Kaca', price: 12, icon: 'glass', crafted: true },
  tool: { name: 'Perkakas', price: 32, icon: 'tool', crafted: true },
  essence: { name: 'Esens Ajaib', price: 80, icon: 'essence', crafted: true },
};
export const RES_KEYS = Object.keys(RES);

// ---------------------------------------------------------------- biomes

export const BIOMES = {
  desa: {
    name: 'Desa Hijau', short: 'Desa', unlock: 1, cost: 0,
    desc: 'Lembah hijau dengan kolam kecil, tempat semuanya dimulai.',
    weather: { clear: 5, cloudy: 3, rain: 2, fog: 1 },
    sky: { moon: 1, milky: 0.35 }, palette: 'Harbour',
    look: { saturation: 1.12 },
    audio: { water: 0.25, birds: 1, crickets: 1 },
    loops: {},
    bonus: { food: 1.2 }, color: '#6eb156',
  },
  hutan: {
    name: 'Hutan Pinus', short: 'Hutan', unlock: 3, cost: 600,
    desc: 'Hutan lebat berkabut dengan sungai jernih. Kayu melimpah.',
    weather: { clear: 3, cloudy: 3, rain: 3, fog: 3 },
    sky: { moon: 1, milky: 0.4 }, palette: 'Autumn',
    look: { saturation: 1.08 },
    audio: { water: 0.45, birds: 1.3, crickets: 1 },
    loops: {},
    bonus: { wood: 1.6 }, color: '#2f6a46',
  },
  pantai: {
    name: 'Pantai Tropis', short: 'Pantai', unlock: 5, cost: 1500,
    desc: 'Pasir putih, pohon kelapa, dan laut biru yang memantulkan langit.',
    weather: { clear: 6, cloudy: 2, rain: 2, storm: 1 },
    sky: { moon: 1, milky: 0.6 }, palette: 'Harbour',
    look: { saturation: 1.18 },
    audio: { water: 0.95, birds: 0.6, crickets: 0.6 },
    loops: { cicadas: 0.5 },
    bonus: { food: 1.3, sand: 1.4 }, color: '#e5cf99',
  },
  gunung: {
    name: 'Pegunungan Salju', short: 'Gunung', unlock: 8, cost: 3200,
    desc: 'Puncak bersalju dengan bijih besi dan aurora di malam hari.',
    weather: { clear: 3, cloudy: 3, snow: 4, fog: 1 },
    sky: { moon: 1, milky: 0.7, aurora: 0.8 }, palette: 'Winter',
    look: { saturation: 1.05 },
    audio: { water: 0.15, birds: 0.4, crickets: 0.2 },
    loops: { howl: 0.25 },
    bonus: { ore: 1.6, stone: 1.4 }, color: '#e7eef8',
  },
  gurun: {
    name: 'Gurun Oasis', short: 'Gurun', unlock: 11, cost: 5200,
    desc: 'Bukit pasir keemasan, kaktus, dan oasis di tengah gurun.',
    weather: { clear: 8, cloudy: 2, fog: 1, storm: 1 },
    sky: { moon: 1, milky: 1 }, palette: 'Autumn',
    look: { saturation: 1.15 },
    audio: { water: 0.2, birds: 0.3, crickets: 0.8 },
    loops: { cicadas: 0.35 },
    bonus: { sand: 1.8, glass: 1.3 }, color: '#e7b44c',
  },
  kota: {
    name: 'Kota Neon', short: 'Kota', unlock: 14, cost: 8000,
    desc: 'Kota modern dengan lampu neon dan jalanan basah saat hujan.',
    weather: { clear: 4, cloudy: 3, rain: 4, storm: 1, fog: 1 },
    sky: { moon: 0.8, milky: 0 }, palette: 'Neon',
    look: { saturation: 1.12 },
    audio: { water: 0, birds: 0.4, crickets: 0.2 },
    loops: { traffic: 0.6 },
    bonus: { coin: 1.5 }, color: '#8a8fa8',
  },
  fantasi: {
    name: 'Pulau Fantasi', short: 'Fantasi', unlock: 18, cost: 12000,
    desc: 'Pulau ajaib berumput ungu, kristal bercahaya, dan jamur raksasa.',
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
  { name: 'Asli', wall: null, roof: null },
  { name: 'Bata Merah', wall: '#c9533f', roof: '#3f4552' },
  { name: 'Biru Laut', wall: '#86b8e8', roof: '#27305f' },
  { name: 'Hijau Daun', wall: '#cfe3b4', roof: '#3d7a4b' },
  { name: 'Kuning Cerah', wall: '#ffd77a', roof: '#a8402f' },
  { name: 'Putih Salju', wall: '#f6f3ea', roof: '#5f7fa8' },
  { name: 'Coklat Kayu', wall: '#9a6a46', roof: '#5a3a22' },
  { name: 'Lavender', wall: '#c9b8ef', roof: '#6b4a8a' },
  { name: 'Emas', wall: '#f2d27a', roof: '#c8752f', unlock: 'ach_rich' },
  { name: 'Neon', wall: '#2a2e3a', roof: '#ff3d8b', unlock: 'ach_city' },
  { name: 'Kristal', wall: '#bfe9ff', roof: '#7b3dff', unlock: 'ach_magic' },
];

// ---------------------------------------------------------------- buildings
// cost: coins plus resources. jobs: worker slots. produce: per worker per game hour.
// happy: { amount, radius } adds to the mood of residents nearby. leisure: NPCs spend evenings here.

export const BUILDINGS = {
  balai: {
    name: 'Balai Desa', cat: 'special', size: 2, cost: {}, unlock: 99, fixed: true,
    desc: 'Pusat pulau. Tempat tinggal Kepala Desa dan titik kumpul warga.',
    housing: 0, storage: 300, happy: { amount: 6, radius: 4 }, leisure: true,
  },
  rumah: {
    name: 'Rumah', cat: 'home', size: 1, cost: { coins: 60, wood: 10 }, unlock: 1,
    desc: 'Rumah mungil untuk 3 warga. Tingkatkan untuk menambah penghuni.', housing: 3, housingPerLevel: 2, tax: 1.6,
  },
  vila: {
    name: 'Vila', cat: 'home', size: 2, cost: { coins: 380, plank: 25, brick: 20 }, unlock: 9,
    desc: 'Rumah besar untuk 10 warga, dengan taman sendiri.', housing: 10, housingPerLevel: 4, tax: 2.2, happy: { amount: 4, radius: 2 },
  },
  apartemen: {
    name: 'Apartemen', cat: 'home', size: 1, cost: { coins: 420, brick: 30, glass: 15 }, unlock: 14, biomes: ['kota'],
    desc: 'Gedung tinggi berjendela untuk 9 warga kota.', housing: 9, housingPerLevel: 4, tax: 2.4,
  },
  ladang: {
    name: 'Ladang', cat: 'prod', size: 2, cost: { coins: 80, wood: 15 }, unlock: 1, notBiomes: ['kota'],
    desc: 'Menanam gandum dan sayur. Menghasilkan makanan.', jobs: 2, produce: { food: 2.2 },
  },
  penebang: {
    name: 'Pondok Penebang', cat: 'prod', size: 1, cost: { coins: 50, stone: 5 }, unlock: 1, notBiomes: ['kota'],
    desc: 'Menebang kayu. Lebih cepat bila banyak pohon di sekitar.', jobs: 2, produce: { wood: 1.4 }, nearNode: ['tree', 'pine', 'palm', 'mushroom'],
  },
  tambang: {
    name: 'Tambang Batu', cat: 'prod', size: 1, cost: { coins: 70, wood: 15 }, unlock: 2,
    desc: 'Memecah batu. Lebih cepat bila dekat bebatuan.', jobs: 2, produce: { stone: 1.2 }, nearNode: ['rock', 'ore'],
  },
  nelayan: {
    name: 'Dermaga Nelayan', cat: 'prod', size: 1, cost: { coins: 110, wood: 25 }, unlock: 4, needWater: true,
    desc: 'Harus di tepi air. Menangkap ikan untuk makanan.', jobs: 2, produce: { food: 2.8 },
  },
  bijih: {
    name: 'Tambang Bijih', cat: 'prod', size: 1, cost: { coins: 150, plank: 15, stone: 20 }, unlock: 6,
    desc: 'Menggali bijih besi untuk perkakas.', jobs: 3, produce: { ore: 0.8 }, nearNode: ['rock', 'ore'],
  },
  pasir: {
    name: 'Galian Pasir', cat: 'prod', size: 1, cost: { coins: 90, wood: 15 }, unlock: 5, biomes: ['pantai', 'gurun'],
    desc: 'Mengumpulkan pasir untuk membuat kaca.', jobs: 2, produce: { sand: 1.5 },
  },
  kristal: {
    name: 'Menara Kristal', cat: 'prod', size: 1, cost: { coins: 500, glass: 20, brick: 20 }, unlock: 18, biomes: ['fantasi'],
    desc: 'Memanen kristal ajaib dari udara malam.', jobs: 2, produce: { crystal: 0.45 },
  },
  kincir: {
    name: 'Kincir Angin', cat: 'prod', size: 1, cost: { coins: 120, plank: 20 }, unlock: 4, notBiomes: ['kota'],
    desc: 'Ladang dalam radius 4 petak menghasilkan 30% lebih banyak.', jobs: 1, boost: { type: 'ladang', radius: 4, amount: 0.3 },
  },
  gudang: {
    name: 'Gudang', cat: 'service', size: 1, cost: { coins: 80, wood: 20, stone: 10 }, unlock: 2,
    desc: 'Menambah kapasitas penyimpanan sumber daya sebanyak 250.', storage: 250, storagePerLevel: 150,
  },
  bengkel: {
    name: 'Bengkel', cat: 'service', size: 1, cost: { coins: 100, wood: 20, stone: 10 }, unlock: 2,
    desc: 'Membuka kerajinan dan menambah slot antrean.', jobs: 2, craftSlots: 1,
  },
  pasar: {
    name: 'Pasar', cat: 'service', size: 2, cost: { coins: 150, wood: 30, stone: 15 }, unlock: 3,
    desc: 'Membuka perdagangan dan menarik pembeli. Pendapatan koin.', jobs: 2, produce: { coins: 3 }, leisure: true, happy: { amount: 4, radius: 3 },
  },
  kedai: {
    name: 'Kedai', cat: 'service', size: 1, cost: { coins: 120, wood: 15, plank: 10 }, unlock: 3,
    desc: 'Tempat warga makan malam dan bersantai. Pendapatan koin.', jobs: 2, produce: { coins: 2 }, leisure: true, happy: { amount: 8, radius: 3 },
  },
  toko: {
    name: 'Toko', cat: 'service', size: 1, cost: { coins: 220, brick: 15, glass: 6 }, unlock: 7,
    desc: 'Toko kecil berlampu. Pendapatan koin yang stabil.', jobs: 2, produce: { coins: 5 }, happy: { amount: 3, radius: 2 },
  },
  sumur: {
    name: 'Sumur', cat: 'deco', size: 1, cost: { coins: 30, stone: 10 }, unlock: 1,
    desc: 'Air segar untuk warga sekitar.', happy: { amount: 5, radius: 3 }, leisure: true,
  },
  taman: {
    name: 'Taman', cat: 'deco', size: 1, cost: { coins: 40, wood: 5 }, unlock: 2,
    desc: 'Bunga, bangku, dan pohon kecil. Warga suka bersantai di sini.', happy: { amount: 8, radius: 3 }, leisure: true,
  },
  lampu: {
    name: 'Lampu Jalan', cat: 'deco', size: 1, cost: { coins: 15, stone: 3 }, unlock: 1, small: true,
    desc: 'Menerangi malam. Warga merasa lebih aman.', happy: { amount: 2, radius: 2 },
  },
  pohon: {
    name: 'Pohon Hias', cat: 'deco', size: 1, cost: { coins: 10 }, unlock: 1, small: true,
    desc: 'Pohon peneduh yang cantik.', happy: { amount: 2, radius: 2 },
  },
  bunga: {
    name: 'Kebun Bunga', cat: 'deco', size: 1, cost: { coins: 25 }, unlock: 2, small: true,
    desc: 'Petak bunga warna-warni.', happy: { amount: 4, radius: 2 },
  },
  bangku: {
    name: 'Bangku', cat: 'deco', size: 1, cost: { coins: 12, wood: 3 }, unlock: 1, small: true,
    desc: 'Tempat duduk santai.', happy: { amount: 2, radius: 2 }, leisure: true,
  },
  airmancur: {
    name: 'Air Mancur', cat: 'deco', size: 1, cost: { coins: 180, stone: 30, brick: 10 }, unlock: 6,
    desc: 'Air mancur batu yang menyegarkan alun-alun.', happy: { amount: 12, radius: 4 }, leisure: true,
  },
  monumen: {
    name: 'Monumen', cat: 'deco', size: 1, cost: { coins: 320, stone: 40, tool: 6 }, unlock: 10,
    desc: 'Patung kebanggaan pulau.', happy: { amount: 15, radius: 5 },
  },
  // ---- landmarks, one per island, only in their biome
  lumbung: {
    name: 'Lumbung Raya', cat: 'special', size: 2, cost: { coins: 400, plank: 30, brick: 15 }, unlock: 5, biomes: ['desa'], limit: 1,
    desc: 'Ikon desa. Penyimpanan +500 dan warga bangga.', storage: 500, happy: { amount: 12, radius: 6 }, landmark: true,
  },
  rumahpohon: {
    name: 'Rumah Pohon', cat: 'special', size: 1, cost: { coins: 450, plank: 40 }, unlock: 4, biomes: ['hutan'], limit: 1,
    desc: 'Rumah di atas pohon raksasa. Tempat favorit anak-anak.', happy: { amount: 14, radius: 6 }, leisure: true, landmark: true,
  },
  mercusuar: {
    name: 'Mercusuar', cat: 'special', size: 1, cost: { coins: 500, brick: 25, glass: 12 }, unlock: 6, biomes: ['pantai'], limit: 1,
    desc: 'Cahaya penuntun kapal di malam hari.', happy: { amount: 16, radius: 7 }, landmark: true,
  },
  observatorium: {
    name: 'Observatorium', cat: 'special', size: 2, cost: { coins: 900, brick: 30, glass: 25, tool: 8 }, unlock: 9, biomes: ['gunung'], limit: 1,
    desc: 'Teropong bintang di atas awan. Aurora tampak lebih indah.', happy: { amount: 18, radius: 7 }, landmark: true,
  },
  obelisk: {
    name: 'Obelisk Matahari', cat: 'special', size: 1, cost: { coins: 1100, stone: 80, glass: 20 }, unlock: 12, biomes: ['gurun'], limit: 1,
    desc: 'Tugu kuno yang berkilau saat senja.', happy: { amount: 18, radius: 7 }, landmark: true,
  },
  menarajam: {
    name: 'Menara Jam', cat: 'special', size: 1, cost: { coins: 1500, brick: 50, glass: 30, tool: 10 }, unlock: 15, biomes: ['kota'], limit: 1,
    desc: 'Jam kota yang berdentang setiap pagi.', happy: { amount: 20, radius: 8 }, landmark: true,
  },
  pohonkehidupan: {
    name: 'Pohon Kehidupan', cat: 'special', size: 2, cost: { coins: 2500, crystal: 30, essence: 6 }, unlock: 19, biomes: ['fantasi'], limit: 1,
    desc: 'Pohon ajaib yang bercahaya. Seluruh pulau bahagia.', happy: { amount: 25, radius: 10 }, leisure: true, landmark: true,
  },
};
export const BUILD_CATS = [
  { id: 'home', name: 'Hunian' },
  { id: 'prod', name: 'Produksi' },
  { id: 'service', name: 'Layanan' },
  { id: 'deco', name: 'Dekorasi' },
  { id: 'special', name: 'Ikon' },
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
  { id: 'plank', name: 'Papan', in: { wood: 3 }, out: { plank: 1 }, time: 6, unlock: 2 },
  { id: 'brick', name: 'Bata', in: { stone: 3 }, out: { brick: 1 }, time: 8, unlock: 3 },
  { id: 'glass', name: 'Kaca', in: { sand: 3 }, out: { glass: 1 }, time: 9, unlock: 5 },
  { id: 'tool', name: 'Perkakas', in: { plank: 1, ore: 2 }, out: { tool: 1 }, time: 14, unlock: 6 },
  { id: 'essence', name: 'Esens Ajaib', in: { crystal: 2, glass: 1 }, out: { essence: 1 }, time: 20, unlock: 18 },
  { id: 'meal', name: 'Bekal Hangat', in: { food: 5, wood: 1 }, out: { food: 8 }, time: 10, unlock: 4 },
];

// The mayor's gathering tool. Each tier gathers more per swing.
export const TOOL_TIERS = [
  { name: 'Tangan Kosong', yield: 1, cost: null },
  { name: 'Kapak Batu', yield: 2, cost: { coins: 120, wood: 20, stone: 20 } },
  { name: 'Kapak Besi', yield: 3, cost: { coins: 450, tool: 4, plank: 10 } },
  { name: 'Kapak Kristal', yield: 5, cost: { coins: 1500, tool: 8, crystal: 10 } },
];

// ---------------------------------------------------------------- nature

// Gatherable nodes: what tapping them gives.
export const NODES = {
  tree: { name: 'Pohon', res: 'wood', hp: 4, regrow: 18, sfx: 'chop' },
  pine: { name: 'Pinus', res: 'wood', hp: 5, regrow: 20, sfx: 'chop' },
  palm: { name: 'Kelapa', res: 'wood', hp: 3, regrow: 16, sfx: 'chop', bonus: { food: 1 } },
  cactus: { name: 'Kaktus', res: 'wood', hp: 2, regrow: 22, sfx: 'chop', bonus: { food: 1 } },
  bush: { name: 'Semak Beri', res: 'food', hp: 3, regrow: 10, sfx: 'harvest' },
  rock: { name: 'Batu Besar', res: 'stone', hp: 5, regrow: 30, sfx: 'pick' },
  ore: { name: 'Urat Bijih', res: 'ore', hp: 4, regrow: 40, sfx: 'pick', bonus: { stone: 1 } },
  dune: { name: 'Gundukan Pasir', res: 'sand', hp: 4, regrow: 12, sfx: 'harvest' },
  crystal: { name: 'Gugus Kristal', res: 'crystal', hp: 3, regrow: 48, sfx: 'sparkle' },
  mushroom: { name: 'Jamur Raksasa', res: 'food', hp: 3, regrow: 14, sfx: 'harvest', bonus: { wood: 1 } },
};

// ---------------------------------------------------------------- people

export const FIRST_NAMES = [
  'Ayu', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko', 'Kirana', 'Lestari', 'Made', 'Nanda',
  'Oki', 'Putri', 'Rama', 'Sari', 'Tono', 'Umi', 'Wati', 'Yoga', 'Zahra', 'Bagas', 'Dimas', 'Intan', 'Laras', 'Raka',
  'Sekar', 'Tari', 'Wulan', 'Arif', 'Bayu', 'Cahya', 'Dian', 'Galih', 'Hana', 'Irfan', 'Kemal', 'Mega', 'Nisa', 'Pandu',
  'Rizky', 'Salsa', 'Teguh', 'Vina', 'Yudi', 'Anjani', 'Bima', 'Dara',
];
export const TRAITS = [
  { id: 'rajin', name: 'Rajin', desc: 'Bekerja 20% lebih giat.', work: 1.2 },
  { id: 'ceria', name: 'Ceria', desc: 'Suasana hatinya cepat membaik.', mood: 1.3 },
  { id: 'rakus', name: 'Doyan Makan', desc: 'Makan lebih banyak.', hunger: 1.4 },
  { id: 'kutubuku', name: 'Kutu Buku', desc: 'Suka tempat yang tenang.', leisure: 'taman' },
  { id: 'gaul', name: 'Supel', desc: 'Senang mengobrol dengan tetangga.', social: 1.5 },
  { id: 'pemalas', name: 'Santai', desc: 'Bekerja agak lambat tapi jarang stres.', work: 0.85, mood: 1.15 },
  { id: 'petualang', name: 'Petualang', desc: 'Suka berjalan-jalan jauh.', wander: 1.6 },
];

// Lines NPCs say. Picked by context.
export const TALK = {
  happy: ['Hari yang indah, Kepala Desa!', 'Aku suka tinggal di sini.', 'Terima kasih sudah membangun pulau ini.', 'Rasanya hidupku makin baik.'],
  ok: ['Lumayan, tapi masih bisa lebih baik.', 'Semoga besok lebih cerah.', 'Ada yang bisa kubantu?'],
  sad: ['Aku kurang bahagia akhir-akhir ini...', 'Andai ada taman di dekat rumahku.', 'Pulau ini butuh lebih banyak hiburan.'],
  hungry: ['Perutku keroncongan. Persediaan makanan menipis!', 'Kita butuh ladang atau nelayan lagi.'],
  homeless: ['Aku belum punya rumah...', 'Tolong bangun rumah lagi, ya.'],
  jobless: ['Aku belum punya pekerjaan.', 'Bangun tempat kerja baru, aku siap bekerja!'],
  rain: ['Hujan lagi! Untung aku bawa payung.', 'Suara hujan bikin ngantuk.'],
  snow: ['Brrr, dinginnya!', 'Saljunya cantik sekali.'],
  night: ['Sudah malam, aku mau pulang.', 'Lihat bintang-bintang itu!'],
  morning: ['Selamat pagi!', 'Pagi yang segar untuk bekerja.'],
  work: ['Pekerjaan hari ini lancar.', 'Sedikit lagi selesai!'],
  festival: ['Festival! Ayo menari!', 'Musiknya seru sekali!'],
};

// ---------------------------------------------------------------- quests
// goal types: build(type, n) | pop(n) | have(res, n) | craft(n) | gather(n) | level(n) | island(id) | talk(n) | sell(n) | happy(n) | upgrade(n) | buildAny(n)

export const QUESTS = [
  { id: 'q1', title: 'Rumah Pertama', desc: 'Bangun sebuah Rumah agar warga baru bisa datang.', goals: [{ type: 'build', id: 'rumah', n: 1 }], reward: { coins: 60, xp: 30 } },
  { id: 'q2', title: 'Tangan yang Rajin', desc: 'Kumpulkan sumber daya dengan mengetuk pohon, batu, atau semak.', goals: [{ type: 'gather', n: 8 }], reward: { coins: 40, xp: 30, wood: 10 }, after: 'q1' },
  { id: 'q3', title: 'Lumbung Pangan', desc: 'Bangun Ladang untuk memberi makan warga.', goals: [{ type: 'build', id: 'ladang', n: 1 }], reward: { coins: 80, xp: 40 }, after: 'q1' },
  { id: 'q4', title: 'Desa Kecil', desc: 'Capai 6 warga.', goals: [{ type: 'pop', n: 6 }], reward: { coins: 120, xp: 60, food: 20 }, after: 'q3' },
  { id: 'q5', title: 'Penebang Kayu', desc: 'Bangun Pondok Penebang.', goals: [{ type: 'build', id: 'penebang', n: 1 }], reward: { coins: 60, xp: 40 }, after: 'q2' },
  { id: 'q6', title: 'Bengkel Desa', desc: 'Bangun Bengkel lalu buat 3 Papan.', goals: [{ type: 'build', id: 'bengkel', n: 1 }, { type: 'craft', n: 3 }], reward: { coins: 150, xp: 80, plank: 5 }, after: 'q5' },
  { id: 'q7', title: 'Taman Bunga', desc: 'Bangun Taman agar warga bahagia.', goals: [{ type: 'build', id: 'taman', n: 1 }], reward: { coins: 70, xp: 50 }, after: 'q4' },
  { id: 'q8', title: 'Pasar Ramai', desc: 'Bangun Pasar lalu jual 20 barang.', goals: [{ type: 'build', id: 'pasar', n: 1 }, { type: 'sell', n: 20 }], reward: { coins: 200, xp: 100 }, after: 'q6' },
  { id: 'q9', title: 'Kenali Wargamu', desc: 'Ngobrol dengan 5 warga.', goals: [{ type: 'talk', n: 5 }], reward: { coins: 80, xp: 60 }, after: 'q4' },
  { id: 'q10', title: 'Desa Bahagia', desc: 'Capai kebahagiaan 70% dengan 10 warga.', goals: [{ type: 'pop', n: 10 }, { type: 'happy', n: 70 }], reward: { coins: 250, xp: 140 }, after: 'q7' },
  { id: 'q11', title: 'Menuju Hutan', desc: 'Buka pulau Hutan Pinus dari Peta.', goals: [{ type: 'island', id: 'hutan' }], reward: { coins: 200, xp: 120, wood: 40 }, after: 'q8' },
  { id: 'q12', title: 'Renovasi', desc: 'Tingkatkan 3 bangunan.', goals: [{ type: 'upgrade', n: 3 }], reward: { coins: 220, xp: 120, tool: 2 }, after: 'q10' },
  { id: 'q13', title: 'Pengrajin Ulung', desc: 'Buat 25 barang di Bengkel.', goals: [{ type: 'craft', n: 25 }], reward: { coins: 300, xp: 160 }, after: 'q12' },
  { id: 'q14', title: 'Pantai Impian', desc: 'Buka pulau Pantai Tropis.', goals: [{ type: 'island', id: 'pantai' }], reward: { coins: 400, xp: 220, sand: 40 }, after: 'q11' },
  { id: 'q15', title: 'Cahaya Penuntun', desc: 'Bangun Mercusuar di Pantai Tropis.', goals: [{ type: 'build', id: 'mercusuar', n: 1 }], reward: { coins: 600, xp: 300 }, after: 'q14' },
  { id: 'q16', title: 'Kota Kecil', desc: 'Capai total 40 warga di semua pulau.', goals: [{ type: 'pop', n: 40 }], reward: { coins: 700, xp: 350 }, after: 'q13' },
  { id: 'q17', title: 'Puncak Salju', desc: 'Buka Pegunungan Salju.', goals: [{ type: 'island', id: 'gunung' }], reward: { coins: 800, xp: 400, ore: 30 }, after: 'q15' },
  { id: 'q18', title: 'Ahli Perkakas', desc: 'Miliki 15 Perkakas.', goals: [{ type: 'have', id: 'tool', n: 15 }], reward: { coins: 900, xp: 420 }, after: 'q17' },
  { id: 'q19', title: 'Oasis Emas', desc: 'Buka Gurun Oasis.', goals: [{ type: 'island', id: 'gurun' }], reward: { coins: 1200, xp: 520, glass: 20 }, after: 'q18' },
  { id: 'q20', title: 'Lampu Kota', desc: 'Buka Kota Neon.', goals: [{ type: 'island', id: 'kota' }], reward: { coins: 1800, xp: 700 }, after: 'q19' },
  { id: 'q21', title: 'Metropolis', desc: 'Capai total 120 warga.', goals: [{ type: 'pop', n: 120 }], reward: { coins: 2500, xp: 900 }, after: 'q20' },
  { id: 'q22', title: 'Negeri Ajaib', desc: 'Buka Pulau Fantasi.', goals: [{ type: 'island', id: 'fantasi' }], reward: { coins: 3000, xp: 1200, crystal: 10 }, after: 'q21' },
  { id: 'q23', title: 'Pohon Kehidupan', desc: 'Tanam Pohon Kehidupan di Pulau Fantasi.', goals: [{ type: 'build', id: 'pohonkehidupan', n: 1 }], reward: { coins: 6000, xp: 2500 }, after: 'q22' },
];

// ---------------------------------------------------------------- achievements

export const ACHIEVEMENTS = [
  { id: 'ach_build1', name: 'Batu Pertama', desc: 'Bangun 1 bangunan.', stat: 'built', n: 1, reward: { coins: 20 } },
  { id: 'ach_build25', name: 'Arsitek', desc: 'Bangun 25 bangunan.', stat: 'built', n: 25, reward: { coins: 250 } },
  { id: 'ach_build100', name: 'Pembangun Dunia', desc: 'Bangun 100 bangunan.', stat: 'built', n: 100, reward: { coins: 1200 } },
  { id: 'ach_gather50', name: 'Pengumpul', desc: 'Kumpulkan 50 kali.', stat: 'gathered', n: 50, reward: { coins: 80 } },
  { id: 'ach_gather500', name: 'Tak Kenal Lelah', desc: 'Kumpulkan 500 kali.', stat: 'gathered', n: 500, reward: { coins: 600 } },
  { id: 'ach_craft10', name: 'Tangan Terampil', desc: 'Buat 10 barang.', stat: 'crafted', n: 10, reward: { coins: 100 } },
  { id: 'ach_craft100', name: 'Mahakarya', desc: 'Buat 100 barang.', stat: 'crafted', n: 100, reward: { coins: 800 } },
  { id: 'ach_pop10', name: 'Tetangga', desc: 'Capai 10 warga.', stat: 'pop', n: 10, reward: { coins: 100 } },
  { id: 'ach_pop50', name: 'Kota Kecil', desc: 'Capai 50 warga.', stat: 'pop', n: 50, reward: { coins: 500 } },
  { id: 'ach_pop150', name: 'Metropolitan', desc: 'Capai 150 warga.', stat: 'pop', n: 150, reward: { coins: 2000 } },
  { id: 'ach_rich', name: 'Saudagar', desc: 'Miliki 10.000 koin sekaligus.', stat: 'coins', n: 10000, reward: { xp: 500 }, unlocks: 'Cat Emas' },
  { id: 'ach_trade', name: 'Pedagang', desc: 'Jual 200 barang.', stat: 'sold', n: 200, reward: { coins: 400 } },
  { id: 'ach_talk', name: 'Ramah', desc: 'Ngobrol dengan warga 30 kali.', stat: 'talked', n: 30, reward: { coins: 200 } },
  { id: 'ach_gift', name: 'Dermawan', desc: 'Beri hadiah 10 kali.', stat: 'gifts', n: 10, reward: { coins: 200 } },
  { id: 'ach_quest10', name: 'Pahlawan Desa', desc: 'Selesaikan 10 misi.', stat: 'quests', n: 10, reward: { coins: 400 } },
  { id: 'ach_events', name: 'Penuh Kejutan', desc: 'Alami 10 peristiwa acak.', stat: 'events', n: 10, reward: { coins: 300 } },
  { id: 'ach_chest', name: 'Pemburu Harta', desc: 'Temukan 5 peti harta.', stat: 'chests', n: 5, reward: { coins: 400 } },
  { id: 'ach_cat', name: 'Sahabat Kucing', desc: 'Temukan 3 kucing hilang.', stat: 'cats', n: 3, reward: { coins: 300 } },
  { id: 'ach_islands3', name: 'Penjelajah', desc: 'Buka 3 pulau.', stat: 'islands', n: 3, reward: { coins: 500 } },
  { id: 'ach_islands7', name: 'Penguasa Nusantara', desc: 'Buka semua 7 pulau.', stat: 'islands', n: 7, reward: { coins: 5000 } },
  { id: 'ach_city', name: 'Lampu Neon', desc: 'Buka Kota Neon.', stat: 'kota', n: 1, reward: { coins: 300 }, unlocks: 'Cat Neon' },
  { id: 'ach_magic', name: 'Penyihir', desc: 'Buat 5 Esens Ajaib.', stat: 'essence', n: 5, reward: { coins: 800 }, unlocks: 'Cat Kristal' },
  { id: 'ach_landmark', name: 'Ikonik', desc: 'Bangun 3 bangunan ikon.', stat: 'landmarks', n: 3, reward: { coins: 1500 } },
  { id: 'ach_days', name: 'Setia', desc: 'Lalui 30 hari di dunia ini.', stat: 'days', n: 30, reward: { coins: 700 } },
  { id: 'ach_streak', name: 'Rajin Datang', desc: 'Klaim hadiah harian 7 hari berturut-turut.', stat: 'streak', n: 7, reward: { coins: 700 } },
  { id: 'ach_level10', name: 'Kepala Desa Senior', desc: 'Capai level 10.', stat: 'level', n: 10, reward: { coins: 800 } },
  { id: 'ach_level20', name: 'Legenda', desc: 'Capai level 20.', stat: 'level', n: 20, reward: { coins: 4000 } },
];

// ---------------------------------------------------------------- random events

export const EVENTS = [
  { id: 'caravan', name: 'Karavan Pedagang', desc: 'Pedagang keliling datang! Harga jual naik 50% selama 3 jam.', hours: 3, weight: 3, minLevel: 2 },
  { id: 'harvest', name: 'Panen Raya', desc: 'Tanah sangat subur. Produksi makanan dua kali lipat selama 4 jam.', hours: 4, weight: 3 },
  { id: 'festival', name: 'Festival Warga', desc: 'Warga berpesta di alun-alun! Kebahagiaan naik.', hours: 3, weight: 2, minPop: 5, night: false },
  { id: 'storm', name: 'Badai Datang', desc: 'Badai menerjang. Produksi turun 30% sementara.', hours: 2, weight: 2, weather: 'storm', notBiomes: ['gurun'] },
  { id: 'chest', name: 'Peti Harta Karun', desc: 'Sebuah peti misterius muncul di pulau. Temukan dan buka!', hours: 6, weight: 3 },
  { id: 'cat', name: 'Kucing Hilang', desc: 'Kucing kesayangan warga hilang. Cari dan ketuk kucingnya!', hours: 5, weight: 2, minPop: 3 },
  { id: 'meteor', name: 'Hujan Meteor', desc: 'Bintang jatuh menaburkan kristal dan bijih di pulau.', hours: 2, weight: 1, minLevel: 5, night: true },
  { id: 'visitor', name: 'Pengelana Misterius', desc: 'Seorang pengelana singgah. Ajak dia bicara untuk hadiah.', hours: 4, weight: 2 },
  { id: 'pest', name: 'Serangan Hama', desc: 'Hama menyerang ladang. Produksi makanan turun setengah.', hours: 3, weight: 1, minLevel: 3 },
  { id: 'inspire', name: 'Semangat Kerja', desc: 'Warga sedang bersemangat! Semua produksi +25%.', hours: 4, weight: 2 },
];

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
  'Seret satu jari untuk menggeser kamera, cubit untuk zoom, putar dua jari untuk memutar.',
  'Ketuk pohon, batu, atau semak agar Kepala Desa mengumpulkannya.',
  'Warga bekerja dari pagi sampai sore. Malam hari mereka pulang dan tidur.',
  'Taman, sumur, dan air mancur membuat warga sekitar lebih bahagia.',
  'Warga yang bahagia membayar pajak lebih banyak dan mengundang warga baru.',
  'Bangun Jalan agar warga berjalan lebih cepat.',
  'Kincir Angin mempercepat ladang di sekitarnya.',
  'Jual barang di Pasar ketika Karavan Pedagang datang untuk untung besar.',
  'Hasil produksi tetap berjalan saat game ditutup, hingga 8 jam.',
  'Ketuk bangunan untuk meningkatkan, mewarnai ulang, memutar, atau membongkarnya.',
];
