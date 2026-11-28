import { CONFIG } from './config.js';
import { makePhoto } from './photos.js';

// Sample photos from Lorem Picsum (photos from Unsplash, free to use).
const IDS = `0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,88,91,94,98,101,104,108,111,114,117,120,123,126,129,132,135,139,142,145,149,153,156,159,162,165,168,171,174,177,180,183,186,189,192,195,198,201,204,209,212,215,218,221,225,229,232,235,238,241,244,249,252,255,258,261,265,268,271,274,277,280,283,288,291,294,297,301,305,308,311,314,317,320,323,326,329,334,337,340,343,347,350,353,356,360,363,366,369,372,375,378,381,384,387,390,393,397,400,403,406,409,412,416,419,423,426,429,432,435,439,442,445,448,451,454,457,460,465,468,472,475,478,481,484,487,491,494,497,500,503,506,509,512,515,518,521,524,527,530,533,536,539,543,546,549,552,555,558,562,565,568,571,574,577,581,584,588,593,598,602,605,608,611,614,617,620,623,627,630,634,638,641,645,649,652,655,658,661,664,667,670,674,677,680,683,686,689,692,695,699,702,705,717,721,724,728,731,735,738,741,744,757,764,767,770,774,777,780,783,786,789,793,796,799,803,806,809,813,816,819,822,825,828,831,834,837,840,844,847,851,855,858,861,864,867,870,873,876,879,882,885,888,891,894,900,903,906,909,912,915,919,923,926,929,932,936,939,942,945,948,951,954,958,961,965,969,972,975,978,981,984,987,990,993,996,999,1002,1005,1009,1012,1015,1019,1022,1025,1028,1032,1036,1039,1042,1045,1049,1052,1055,1058,1061,1064,1067,1070,1073,1076,1079`
  .split(',').map(Number);

// The preview build ships a smaller set of the same images next to the page.
export const LOCAL_IDS = IDS.filter((_, i) => i % 2 === 0);

// Landscape, portrait or square, fixed per image so local files match.
export function shapeOf(id) {
  const o = (id * 7919) % 20;
  if (o < 12) return { a: 3 / 2, tw: 360, th: 240, fw: 1800, fh: 1200, lw: 640, lh: 427 };
  if (o < 17) return { a: 2 / 3, tw: 240, th: 360, fw: 1200, fh: 1800, lw: 427, lh: 640 };
  return { a: 1, tw: 300, th: 300, fw: 1500, fh: 1500, lw: 560, lh: 560 };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');

export function makeDemoPhotos(count = CONFIG.demoCount) {
  const rand = rng(20261128);
  const local = CONFIG.demoSource === 'local';
  const ids = local ? LOCAL_IDS : IDS;
  const now = new Date();
  const firstYear = now.getFullYear() - 11;
  // Libraries grow over time: more photos in recent years.
  const weights = Array.from({ length: 12 }, (_, i) => 3 + i * 1.2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const pickYear = () => {
    let r = rand() * sum;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return firstYear + i; }
    return firstYear + 11;
  };

  const photos = [];
  for (let i = 0; i < count; i++) {
    const id = ids[(i * 7) % ids.length];
    const sh = shapeOf(id);
    const year = pickYear();
    const end = year === now.getFullYear() ? now.getTime() : new Date(year + 1, 0, 1).getTime();
    const start = new Date(year, 0, 1).getTime();
    const date = new Date(start + rand() * (end - start - 864e5));
    const name = `IMG_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
    const url = (w, h) => (local ? `demo/${id}.jpg` : `https://picsum.photos/id/${id}/${w}/${h}.jpg`);
    photos.push(makePhoto({
      id: `demo-${i}`,
      date,
      name,
      aspect: sh.a,
      aspectKnown: true,
      source: 'demo',
      thumbSrc: async () => url(sh.tw, sh.th),
      fullSrc: async () => url(sh.fw, sh.fh),
    }));
  }
  return photos;
}
