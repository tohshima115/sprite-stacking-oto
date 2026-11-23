// 四面図（上・横・正面・背面）→ ボクセル体積 → 水平スライスシート
// 「AI にスライスを描かせない。AI には四面図だけ描かせ、切るのはコード」という方針の実装。
// 参考: SpriteCook "Slices from four flat views" / danielwh2/sprite-stacking（4面カービング）
//
// 使い方（どちらか）:
//   npm run carve -- --top t.png --side s.png --front f.png --back b.png --id bld_house_a --category buildings [--round]
//   npm run carve -- --sheet views.png --px 8 --id prop_well_a --category props [--round]
//   npm run carve -- --sheet views.png --target-w 19 --max-h 24 --palette assets/palette/oto-32.hex --id prop_fountain_a --category props [--round] [--top-light]
//     --sheet は 2x2（左上=TOP 正面が下 / 右上=SIDE 正面が左 / 左下=FRONT / 右下=BACK）
//     --px はシート上の「ドット1個」の実ピクセル数（AI 画像は拡大されて出てくるので必須。--target-w 指定時は自動計算）
// 出力: assets/stacks/<category>/<id>.png + .json  （--out で変更可）
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { Volume, writeSheet, readPng } from './voxel.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const need = (k) => { if (!args[k]) { console.error(`--${k} が必要です`); process.exit(2); } return args[k]; };

/** パレットファイル (.hex) を [r,g,b][] に読む */
function loadPalette(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\s+/)
    .filter(Boolean)
    .map((h) => {
      const s = h.replace(/^#/, '');
      return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    });
}
function nearestColor(rgb, pal) {
  let best = pal[0], bestD = Infinity;
  for (const p of pal) {
    const dr = rgb[0] - p[0], dg = rgb[1] - p[1], db = rgb[2] - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** 画像 → {w,h,get(x,y)->[r,g,b,a]}。背景（透明 or 四隅の色）は a=0 にする */
function view(png, x0 = 0, y0 = 0, w = png.width, h = png.height) {
  const px = (x, y) => { const i = ((y0 + y) * png.width + (x0 + x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]; };
  const bg = px(0, 0);
  const isBg = (c) => c[3] < 128 || (bg[3] > 0 && Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < 24);
  // 不透明部分の外接矩形に切り詰める
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!isBg(px(x, y))) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  if (bx1 < 0) throw new Error('空のビューがあります');
  return { w: bx1 - bx0 + 1, h: by1 - by0 + 1, get: (x, y) => { const c = px(bx0 + x, by0 + y); return isBg(c) ? null : c; } };
}
/** ドット1個 = s 実ピクセルの画像を、各ドットの中心をサンプルして等倍に戻す */
function downsample(v, s) {
  if (s <= 1) return v;
  const w = Math.round(v.w / s), h = Math.round(v.h / s);
  return { w, h, get: (x, y) => v.get(Math.min(v.w - 1, Math.floor((x + 0.5) * s)), Math.min(v.h - 1, Math.floor((y + 0.5) * s))) };
}
/** 最近傍でリサイズ */
const resize = (v, w, h) => ({ w, h, get: (x, y) => v.get(Math.min(v.w - 1, Math.floor(((x + 0.5) * v.w) / w)), Math.min(v.h - 1, Math.floor(((y + 0.5) * v.h) / h))) });

let top, side, front, back;
const targetW = args['target-w'] ? Number(args['target-w']) : 0;
const targetH = args['target-h'] ? Number(args['target-h']) : 0;
const density = args.density ? Math.max(1, Number(args.density)) : 1;
const maxDim = args['max-w'] ? Number(args['max-w']) : 32 * density;
const maxH = args['max-h'] ? Number(args['max-h']) : (density >= 2 ? 128 : 64);
const S = targetW > 0 ? 1 : Number(args.px ?? 1);
if (args.sheet) {
  const png = readPng(args.sheet);
  const hw = Math.floor(png.width / 2), hh = Math.floor(png.height / 2);
  top = downsample(view(png, 0, 0, hw, hh), S);
  side = downsample(view(png, hw, 0, png.width - hw, hh), S);
  front = downsample(view(png, 0, hh, hw, png.height - hh), S);
  back = downsample(view(png, hw, hh, png.width - hw, png.height - hh), S);
} else {
  [top, side, front, back] = ['top', 'side', 'front', 'back'].map((k) => downsample(view(readPng(need(k))), S));
}
if (args['side-nose'] === 'right') { const s0 = side; side = { ...s0, get: (x, y) => s0.get(s0.w - 1 - x, y) }; }

// 寸法は TOP を基準に揃える。W=幅(x) L=奥行き(y) H=高さ(z)
if (targetW > 0) {
  const newL = Math.min(maxDim, Math.max(2, Math.round((top.h * targetW) / top.w)));
  top = resize(top, targetW, newL);
}
const W = top.w, L = top.h;
const H = Math.min(maxH, Math.max(2, targetH > 0 ? targetH : Math.round((side.h * L) / side.w)));
side = resize(side, L, H); front = resize(front, W, H); back = resize(back, W, H);
// 体格チェック（SpriteCook: TOP がいちばん縦長、SIDE がいちばん横長、SIDE は左向き）
if (Math.abs(front.w - W) > 0) console.warn('warn: FRONT の幅を TOP に合わせて伸縮しました');

const vol = new Volume(W, L, H);
// SIDE: 列 c は正面(左)→背面(右)。y は正面が +y（L-1）なので y = L-1-c
const sideAt = (y, z) => side.get(L - 1 - y, H - 1 - z);
const frontAt = (x, z) => front.get(x, H - 1 - z);
const backAt = (x, z) => back.get(W - 1 - x, H - 1 - z); // 背面図は左右反転
for (let z = 0; z < H; z++) for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
  if (top.get(x, y) && sideAt(y, z) && frontAt(x, z) && backAt(x, z)) vol.set(x, y, z, [255, 0, 255]);
}
if (args.round) { // 段ごとの外接矩形に内接する楕円で丸く削る（塔・樽・壺など）
  for (let z = 0; z < H; z++) {
    let x0 = W, x1 = -1, y0 = L, y1 = -1;
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) if (vol.filled(x, y, z)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) continue;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1.0) vol.clear(x, y, z);
  }
}
const pal = args.palette ? loadPalette(args.palette) : null;
// 色: 上が空いていれば TOP の色、そうでなければ一番近い露出面（2px 以内）のビューの色
const EDGE = 2;
for (let z = 0; z < H; z++) for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
  if (!vol.filled(x, y, z)) continue;
  let c = null;
  if (!vol.filled(x, y, z + 1)) c = top.get(x, y);
  else {
    const open = (dx, dy) => { for (let k = 1; k <= EDGE; k++) if (!vol.filled(x + dx * k, y + dy * k, z)) return k; return 99; };
    const cand = [[open(0, 1), () => frontAt(x, z)], [open(0, -1), () => backAt(x, z)], [open(1, 0), () => sideAt(y, z)], [open(-1, 0), () => sideAt(y, z)]].sort((a, b) => a[0] - b[0]);
    c = cand[0][0] < 99 ? cand[0][1]() : top.get(x, y);
  }
  let rgb = c ? [c[0], c[1], c[2]] : [255, 0, 255];
  if (pal) rgb = nearestColor(rgb, pal);
  vol.set(x, y, z, rgb);
}
if (args['top-light']) vol.bakeLighting({ density, aoStrength: density >= 2 ? 0.24 : 0.16, grain: density >= 2 ? 0.025 : 0.01 });
const id = need('id'), category = args.category ?? 'props';
const out = args.out ?? `assets/stacks/${category}/${id}.png`;
const meta = writeSheet(out, [vol], {
  id,
  category,
  density,
  footprint: [Math.round(W / density), Math.round(L / density)],
  palette: args.palette?.includes('64') ? 'oto-64' : 'oto-32',
  source: 'views-carve',
  notes: `carved from 4 views${args.round ? ' (round)' : ''} d=${density}`,
});
console.log(`carved ${id}: ${meta.sliceWidth}x${meta.sliceHeight}x${meta.sliceCount} (footprint=${meta.footprint.join('x')}, d=${density}) -> ${out}`);
