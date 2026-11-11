// Pixel-art UI icons, drawn as tiny bitmaps and turned into crisp SVG data URIs (no image files).
// Each icon: palette (char -> colour) and rows of characters; '.' is transparent.

const K = '#1b1d2b';
const ICONS = {
  coin: { p: { k: '#3a2a10', y: '#ffd23d', w: '#fff6c0', o: '#c8862a' }, r: ['...kkkk...', '..kyyyyk..', '.kywwyyyk.', 'kyywyyyyok', 'kyyyyyyyok', 'kyyyyyyyok', 'kyyyyyyook', '.kyyyyook.', '..kooook..', '...kkkk...'] },
  wood: { p: { k: '#3a2414', t: '#e3b47a', r: '#a8794c', b: '#8a5a38', d: '#6a4630' }, r: ['..........', '..........', '..kkkkkkk.', '.kttkbbbbk', 'ktrrtkbdbk', 'ktrrtkbbbk', '.kttkbdbbk', '..kkkkkkk.', '..........', '..........'] },
  stone: { p: { k: K, g: '#9a9da8', w: '#c9ccd4', d: '#6a6e78' }, r: ['..........', '...kkkk...', '..kwwggk..', '.kwgggggk.', '.kgggggdk.', 'kgggggdddk', 'kggggdddk.', '.kddddddk.', '..kkkkkk..', '..........'] },
  food: { p: { k: '#3a1414', r: '#e94f4f', w: '#ffb0a8', g: '#4d8f45', d: '#a8302f', s: '#6a4630' }, r: ['.....s....', '....sgg...', '...ksgk...', '..krrrrk..', '.krwrrrrk.', '.krwrrrdk.', '.krrrrrdk.', '.krrrrddk.', '..kddddk..', '...kkkk...'] },
  ore: { p: { k: K, g: '#6a6e78', o: '#e2a05a', r: '#c97a4a', d: '#4a4d57' }, r: ['..........', '...kkkk...', '..kggogk..', '.kgoogggk.', '.kggggrgk.', 'kggrggggdk', 'kgoogggddk', '.kgggdddk.', '..kkkkkk..', '..........'] },
  sand: { p: { k: '#5a4020', s: '#e8d3a0', d: '#c9b07a', w: '#fff0c8' }, r: ['..........', '..........', '....kk....', '...kwsk...', '..kwsssk..', '.kssssdsk.', 'kssdsssdsk', 'kddddddddk', '.kkkkkkkk.', '..........'] },
  crystal: { p: { k: '#1a1446', c: '#7df9ff', b: '#4a9ad0', w: '#e8ffff', v: '#b58cff' }, r: ['....kk....', '...kwck...', '..kwccbk..', '..kwccbk..', '.kvwcbbvk.', '.kvccbbvk.', '.kvcbbbvk.', '..kcbbbk..', '...kbbk...', '....kk....'] },
  plank: { p: { k: '#3a2414', a: '#d8a86a', b: '#b8864f', d: '#8a5a38' }, r: ['..........', '.kkkkkkkk.', '.kaaaaaadk', '.kbbbbbbdk', '.kkkkkkkk.', '.kaaaaaadk', '.kbbbbbbdk', '.kkkkkkkk.', '..........', '..........'] },
  brick: { p: { k: '#3a1a14', r: '#c9533f', d: '#8a3a30', m: '#e3c690' }, r: ['..........', '.kkkkkkkk.', '.krrmrrrk.', '.kmmmmmmk.', '.krrrmrrk.', '.kmmmmmmk.', '.krmrrrdk.', '.kkkkkkkk.', '..........', '..........'] },
  glass: { p: { k: '#1a2a46', b: '#86b8e8', w: '#e8f4ff', d: '#5a8ac0' }, r: ['..........', '..kkkkkk..', '..kwbbbk..', '..kwbbbk..', '..kbwbbk..', '..kbbwbk..', '..kbbbdk..', '..kbbbdk..', '..kkkkkk..', '..........'] },
  tool: { p: { k: K, m: '#c9ccd4', d: '#6a6e78', w: '#8a5a38', b: '#6a4630' }, r: ['..........', '.kkkkk....', 'kmmmmmk...', 'kddkmmk...', '.kk.kwk...', '.....kwk..', '......kwk.', '.......kbk', '........k.', '..........'] },
  essence: { p: { k: '#2a1446', p: '#ff8af0', v: '#b58cff', w: '#ffe8ff', g: '#c9ccd4' }, r: ['....kk....', '...kggk...', '....kk....', '...kppk...', '..kpwvpk..', '.kpwvvvpk.', '.kpvvvvpk.', '.kpvvvvpk.', '..kpppvk..', '...kkkk...'] },
  pop: { p: { k: K, s: '#f1c7a3', h: '#5a3a22', c: '#3f6fb0', d: '#2a4a7a' }, r: ['...kkkk...', '..khhhhk..', '..kssssk..', '..kssssk..', '...kkkk...', '..kcccck..', '.kccccdck.', '.kccccdck.', '..kckkck..', '..kk..kk..'] },
  happy: { p: { k: '#3a2a10', y: '#ffd23d', o: '#e2a02a' }, r: ['...kkkk...', '..kyyyyk..', '.kyyyyyyk.', 'kyykyykyyk', 'kyyyyyyyok', 'kykyyyykok', 'kyykkkkyok', '.kyyyyyok.', '..kooook..', '...kkkk...'] },
  sad: { p: { k: '#141a3a', y: '#9fb7d4', o: '#6a8ab0' }, r: ['...kkkk...', '..kyyyyk..', '.kyyyyyyk.', 'kyykyykyyk', 'kyyyyyyyok', 'kyykkkkyok', 'kykyyyykok', '.kyyyyyok.', '..kooook..', '...kkkk...'] },
  star: { p: { k: '#3a2a10', y: '#ffd23d', w: '#fff6c0', o: '#e2a02a' }, r: ['....kk....', '....kyk...', '...kywyk..', 'kkkywyyykk', 'kyyyyyyyok', '.kyyyyyok.', '..kyyyyk..', '.kyyokyyk.', '.kyk..kok.', '.kk....kk.'] },
  build: { p: { k: K, m: '#c9ccd4', d: '#6a6e78', w: '#d8a86a', b: '#8a5a38' }, r: ['..kkkkk...', '.kmmmmmk..', '.kdddmmk..', '..kk.kwk..', '.....kwk..', '.....kwk..', '.....kbk..', '.....kbk..', '.....kbk..', '......k...'] },
  road: { p: { k: '#2a2414', p: '#d4b383', d: '#a88a5a', w: '#efe0bc' }, r: ['..kppppk..', '..kpdppk..', '.kppppppk.', '.kppwpppk.', '.kpppdppk.', 'kpppppwppk', 'kppdppppdk', 'kpppppdppk', 'kppwppppdk', 'kkkkkkkkkk'] },
  craft: { p: { k: K, a: '#8d919c', d: '#5a5e68', f: '#ff8a3d', y: '#ffd23d' }, r: ['...y..f...', '..f.y.....', '..........', '.kkkkkkkk.', 'kaaaaaaaak', '.kdddddak.', '...kddk...', '...kddk...', '..kddddk..', '.kkkkkkkk.'] },
  market: { p: { k: '#3a1414', r: '#c94a3d', w: '#efe7d6', b: '#8a5a38', y: '#ffd23d' }, r: ['.kkkkkkkk.', 'krwrwrwrwk', 'krwrwrwrwk', '.kkkkkkkk.', '.kb....bk.', '.kb.yy.bk.', '.kb.yy.bk.', '.kbbbbbbk.', '.kbbbbbbk.', '.kkkkkkkk.'] },
  people: { p: { k: K, s: '#f1c7a3', a: '#c94a3d', b: '#3f6fb0', h: '#5a3a22' }, r: ['.kkk..kkk.', 'khhhkkhhhk', 'ksssk.sssk', 'ksssk.sssk', '.kkk..kkk.', 'kaaak.bbbk', 'kaaak.bbbk', 'kaaak.bbbk', '.k.k..k.k.', '..........'] },
  quest: { p: { k: '#3a2414', p: '#f2e2bf', d: '#d8c090', r: '#c94a3d' }, r: ['.kkkkkkk..', 'kpppppppk.', '.kpdddpk..', '.kpppppk..', '.kpdddpk..', '.kpppppk..', '.kpddpprk.', '.kpppprrk.', 'kpppppppk.', '.kkkkkkk..'] },
  trophy: { p: { k: '#3a2a10', y: '#ffd23d', w: '#fff6c0', o: '#c8862a', b: '#6a4630' }, r: ['.kkkkkkkk.', 'kkywyyyokk', 'k.kwyyyk.k', '.kkwyyykk.', '..kyyyok..', '...kyok...', '....ko....', '...kook...', '..kbbbbk..', '..kkkkkk..'] },
  map: { p: { k: '#2a2414', p: '#efe0bc', g: '#7fc264', b: '#86b8e8', r: '#c94a3d' }, r: ['kkkkkkkkkk', 'kppgppbbbk', 'kpgggpbbbk', 'kppgppbbpk', 'kpppprppgk', 'kbbpppppgk', 'kbbbppgggk', 'kbbppppggk', 'kppppppppk', 'kkkkkkkkkk'] },
  gear: { p: { k: K, g: '#c9ccd4', d: '#8d919c' }, r: ['...kkkk...', '.kkggggkk.', '.kgggdggk.', 'kggkkkdggk', 'kggk..kggk', 'kggk..kdgk', 'kggdkkkdgk', '.kgggddgk.', '.kkgdddkk.', '...kkkk...'] },
  sun: { p: { k: '#3a2a10', y: '#ffd23d', o: '#ffa83d' }, r: ['....o.....', '.o..o..o..', '..o.kk.o..', '...kyyk...', 'ookyyyyoko', '...kyyyk..', '..o.kk.o..', '.o..o...o.', '....o.....', '..........'] },
  moon: { p: { k: '#141a3a', y: '#fff2c8', d: '#d8c890' }, r: ['..........', '...kkkk...', '..kyyyk...', '.kyyk.....', '.kyyk.....', '.kyyk.....', '.kyyyk..k.', '..kyyykkk.', '...kddkk..', '....kk....'] },
  cloud: { p: { k: '#2a3247', w: '#f4f6fb', g: '#c3d0e2' }, r: ['..........', '..........', '...kkk....', '..kwwwkkk.', '.kwwwwwwwk', 'kwwwwwwwwk', 'kwwwwwwggk', '.kgggggggk', '..kkkkkkk.', '..........'] },
  rain: { p: { k: '#2a3247', w: '#c3d0e2', g: '#8d9ab0', b: '#86b8e8' }, r: ['...kkk....', '..kwwwkkk.', '.kwwwwwwwk', 'kwwwwwwggk', '.kgggggggk', '..kkkkkkk.', '..b..b..b.', '.b..b..b..', '..b..b..b.', '.b..b..b..'] },
  storm: { p: { k: '#1a1e2a', w: '#8d919c', g: '#5f6676', y: '#ffd23d' }, r: ['...kkk....', '..kwwwkkk.', '.kwwwwwwwk', 'kwwwwwwggk', '.kgggggggk', '..kkkykkk.', '....yy....', '...yy.....', '....yy....', '.....y....'] },
  snow: { p: { k: '#2a3247', w: '#ffffff', b: '#c3d0e2' }, r: ['....w.....', '..w.w.w...', '...www....', 'wwwwbwwww.', '...www....', '..w.w.w...', '....w.....', '......w...', '..w.....w.', '....w.....'] },
  fog: { p: { g: '#c3d0e2', d: '#8d9ab0' }, r: ['..........', '.gggggggg.', '..........', 'dddddd....', '..........', '...ggggggg', '..........', '.dddddddd.', '..........', '..........'] },
  rotl: { p: { k: '#e8ecf6' }, r: ['..........', '...k......', '..kk......', '.kkkkkkk..', '..kk....k.', '...k....k.', '........k.', '.......k..', '...kkkk...', '..........'] },
  rotr: { p: { k: '#e8ecf6' }, r: ['..........', '......k...', '......kk..', '..kkkkkkk.', '.k....kk..', '.k....k...', '.k........', '..k.......', '...kkkk...', '..........'] },
  check: { p: { k: '#e8ffe8' }, r: ['..........', '.........k', '........kk', '.......kk.', 'k.....kk..', 'kk...kk...', '.kk.kk....', '..kkk.....', '...k......', '..........'] },
  cross: { p: { k: '#ffe8e8' }, r: ['..........', '.k......k.', '.kk....kk.', '..kk..kk..', '...kkkk...', '...kkkk...', '..kk..kk..', '.kk....kk.', '.k......k.', '..........'] },
  up: { p: { k: '#e8ffe8', g: '#7fe08a' }, r: ['....kk....', '...kggk...', '..kggggk..', '.kggggggk.', 'kkkggggkkk', '...kggk...', '...kggk...', '...kggk...', '...kggk...', '...kkkk...'] },
  paint: { p: { k: K, r: '#ff5d9e', b: '#86b8e8', y: '#ffd23d', w: '#8a5a38' }, r: ['......kkk.', '.....krrk.', '....kryk..', '...kbyk...', '..kbbk....', '..kwk.....', '.kwk......', '.kwk......', 'kwk.......', 'kk........'] },
  trash: { p: { k: '#3a1414', r: '#e94f4f', d: '#a8302f' }, r: ['...kkkk...', '.kkkkkkkk.', '..........', '.kkkkkkkk.', '.krdrrdrk.', '.krdrrdrk.', '.krdrrdrk.', '.krdrrdrk.', '..krrrrk..', '..kkkkkk..'] },
  heart: { p: { k: '#3a1414', r: '#ff5d7a', w: '#ffc0cc', d: '#c8304a' }, r: ['..........', '.kkk..kkk.', 'krwrkkrrrk', 'krwrrrrrdk', 'krrrrrrrdk', '.krrrrrdk.', '..krrrdk..', '...krdk...', '....kk....', '..........'] },
  chat: { p: { k: K, w: '#f4f6fb', g: '#c3d0e2' }, r: ['..........', '.kkkkkkkk.', 'kwwwwwwwwk', 'kwkwkwkwwk', 'kwwwwwwwwk', 'kgggggggwk', '.kkkkkkkk.', '..kgk.....', '..kk......', '..........'] },
  gift: { p: { k: '#2a1414', r: '#e94f4f', y: '#ffd23d', d: '#a8302f' }, r: ['..ky..yk..', '...kyyk...', '.kkkyykkk.', '.krryyrrk.', '.kkkyykkk.', '.krryyrdk.', '.krryyrdk.', '.krryyrdk.', '.kddyyddk.', '.kkkkkkkk.'] },
  calendar: { p: { k: K, w: '#f4f6fb', r: '#e94f4f', g: '#c3d0e2' }, r: ['.k.k..k.k.', 'kkkkkkkkkk', 'krrrrrrrrk', 'kwwwwwwwwk', 'kwgwgwgwwk', 'kwwwwwwwwk', 'kwgwgwrwwk', 'kwwwwwwwwk', 'kkkkkkkkkk', '..........'] },
  speed: { p: { k: '#e8ecf6' }, r: ['..........', 'k...k.....', 'kk..kk....', 'kkk.kkk...', 'kkkkkkkk..', 'kkk.kkk...', 'kk..kk....', 'k...k.....', '..........', '..........'] },
  sound: { p: { k: '#e8ecf6' }, r: ['..........', '....k...k.', '...kk.k..k', 'kkkkk..k.k', 'kkkkk..k.k', 'kkkkk..k.k', '...kk.k..k', '....k...k.', '..........', '..........'] },
  mute: { p: { k: '#e8ecf6', r: '#ff7a7a' }, r: ['..........', '....k.....', '...kk.....', 'kkkkk.r..r', 'kkkkk..rr.', 'kkkkk..rr.', '...kk.r..r', '....k.....', '..........', '..........'] },
  music: { p: { k: '#e8ecf6' }, r: ['....kkkkk.', '....kkkkk.', '....k...k.', '....k...k.', '....k...k.', '..kkk.kkk.', '.kkkkkkkk.', '.kkk.kkk..', '..........', '..........'] },
  eye: { p: { k: '#e8ecf6', b: '#86b8e8', d: '#1b1d2b' }, r: ['..........', '..........', '...kkkk...', '.kkbbbbkk.', 'kkbbddbbkk', 'kkbbddbbkk', '.kkbbbbkk.', '...kkkk...', '..........', '..........'] },
  home: { p: { k: '#2a1414', r: '#c94a3d', w: '#efe5d2', d: '#5e3f2b' }, r: ['....kk....', '...krrk...', '..krrrrk..', '.krrrrrrk.', 'kkkkkkkkkk', '.kwwwwwwk.', '.kwwkdkwk.', '.kwwkdkwk.', '.kwwkdkwk.', '.kkkkkkkk.'] },
  work: { p: { k: '#2a1a10', b: '#8a5a38', d: '#6a4630', y: '#ffd23d' }, r: ['..........', '...kkkk...', '...k..k...', '.kkkkkkkk.', 'kbbbbbbbbk', 'kbbbyybbbk', 'kddddddddk', 'kbbbbbbbbk', '.kkkkkkkk.', '..........'] },
  lock: { p: { k: K, g: '#c9ccd4', y: '#ffd23d', o: '#c8862a' }, r: ['...kkkk...', '..kgkkgk..', '..kk..kk..', '..kk..kk..', '.kkkkkkkk.', '.kyyyyyok.', '.kyykkyok.', '.kyyyyyok.', '.kooooook.', '.kkkkkkkk.'] },
  chest: { p: { k: '#2a1a10', b: '#a8794c', d: '#6a4630', y: '#ffd23d' }, r: ['..........', '..kkkkkk..', '.kbbbbbbk.', 'kbbbbbbbbk', 'kyyyyyyyyk', 'kddyykdddk', 'kbbykkbbbk', 'kbbbbbbbbk', 'kddddddddk', '.kkkkkkkk.'] },
  info: { p: { k: '#e8ecf6' }, r: ['....kk....', '....kk....', '..........', '...kkk....', '....kk....', '....kk....', '....kk....', '....kk....', '...kkkk...', '..........'] },
  close: { p: { k: '#e8ecf6' }, r: ['..........', '.kk....kk.', '..kk..kk..', '...kkkk...', '....kk....', '...kkkk...', '..kk..kk..', '.kk....kk.', '..........', '..........'] },
  energy: { p: { k: '#3a2a10', y: '#ffd23d' }, r: ['.....kk...', '....kyk...', '...kyk....', '..kyykkk..', '.kyyyyyk..', '..kkkyk...', '....kyk...', '...kyk....', '...kk.....', '..........'] },
  fun: { p: { k: '#2a1446', p: '#ff8af0', y: '#ffd23d' }, r: ['..........', '..kkk.....', '.kpppk....', '.kpppk....', '.kpppk..k.', '..kkk..kyk', '...k....k.', '...k......', '...k......', '..........'] },
  xp: { p: { k: '#2a1446', v: '#b58cff', w: '#e8d8ff' }, r: ['....kk....', '...kvvk...', '..kvwvvk..', '.kvwvvvvk.', 'kvvvvvvvvk', '.kvvvvvvk.', '..kvvvvk..', '...kvvk...', '....kk....', '..........'] },
  storage: { p: { k: '#2a1a10', b: '#a8794c', d: '#6a4630', l: '#d8a86a' }, r: ['..........', '.kkkkkkkk.', '.klllllbk.', '.kbkbbkbk.', '.kbbkkbbk.', '.kbbkkbbk.', '.kbkbbkbk.', '.kdddddbk.', '.kkkkkkkk.', '..........'] },
  center: { p: { k: '#e8ecf6' }, r: ['....k.....', '....k.....', '..kkkkk...', '..k...k...', 'kkk.k.kkk.', '..k...k...', '..kkkkk...', '....k.....', '....k.....', '..........'] },
  event: { p: { k: '#3a2a10', y: '#ffd23d', r: '#e94f4f' }, r: ['....kk....', '...kyyk...', '...kyyk...', '..kyrryk..', '..kyrryk..', '.kyyrryyk.', '.kyyyyyyk.', 'kyyyrryyyk', 'kyyyyyyyyk', 'kkkkkkkkkk'] },
};

const cache = new Map();
export function iconURL(name) {
  if (cache.has(name)) return cache.get(name);
  const d = ICONS[name] || ICONS.info;
  let rects = '';
  d.r.forEach((row, y) => {
    const r = (row + '..........').slice(0, 10);
    for (let x = 0; x < 10; x++) {
      const ch = r[x];
      if (ch === '.' || !d.p[ch]) continue;
      rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${d.p[ch]}"/>`;
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" shape-rendering="crispEdges">${rects}</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(name, url);
  return url;
}

export function icon(name, cls = '') {
  return `<img class="ic ${cls}" src="${iconURL(name)}" alt="" draggable="false">`;
}

export const WEATHER_ICON = { clear: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm', snow: 'snow', fog: 'fog' };
export const WEATHER_NAME = { clear: 'Cerah', cloudy: 'Berawan', rain: 'Hujan', storm: 'Badai', snow: 'Salju', fog: 'Kabut' };
