// assets/stacks 以下の全スタック素材を検査する。誤ったスライス（正面図の羅列など）を機械的に弾くための最低限のチェック。
// 使い方: npm run check:assets [-- --strict]
import fs from 'node:fs';
import path from 'node:path';
import { readPng } from './voxel.mjs';

const ROOT = 'assets/stacks';
const NAME = /^(bld|prop|chr|ter)_[a-z0-9]+(_[a-z0-9]+)*$/;
const strict = process.argv.includes('--strict');
let errors = 0, warns = 0;
const err = (id, m) => { errors++; console.log(`  ERROR ${id}: ${m}`); };
const warn = (id, m) => { warns++; console.log(`  warn  ${id}: ${m}`); };

const pal32 = new Set(fs.readFileSync('assets/palette/oto-32.hex', 'utf8').split(/\s+/).filter(Boolean).map((h) => h.toLowerCase()));
const pal64 = fs.existsSync('assets/palette/oto-64.hex')
  ? new Set(fs.readFileSync('assets/palette/oto-64.hex', 'utf8').split(/\s+/).filter(Boolean).map((h) => h.toLowerCase()))
  : pal32;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

for (const jf of walk(ROOT).filter((f) => f.endsWith('.json'))) {
  const m = JSON.parse(fs.readFileSync(jf, 'utf8'));
  const id = m.id ?? jf;
  const pf = jf.replace(/\.json$/, '.png');
  if (path.basename(jf, '.json') !== m.id) err(id, 'ファイル名と id が一致しない');
  if (!NAME.test(m.id)) err(id, '命名規則違反（bld_/prop_/chr_/ter_ + 英小文字・数字・_）');
  if (!fs.existsSync(pf)) { err(id, 'PNG がない'); continue; }
  const png = readPng(pf);
  const horiz = (m.layout ?? 'horizontal') === 'horizontal';
  const expW = horiz ? m.sliceWidth * m.sliceCount : m.sliceWidth * m.frames;
  const expH = horiz ? m.sliceHeight * m.frames : m.sliceHeight * m.sliceCount;
  if (png.width !== expW || png.height !== expH) { err(id, `PNG ${png.width}x${png.height} がメタ情報 ${expW}x${expH} と違う`); continue; }
  const maxSlices = (m.density ?? 1) >= 2 ? 128 : 64;
  if (m.sliceCount < 2 || m.sliceCount > maxSlices) err(id, `枚数 ${m.sliceCount} は範囲外（2〜${maxSlices}）`);
  if (m.front !== '+y') err(id, 'front は +y に統一');

  const palette = m.palette === 'oto-64' ? pal64 : pal32;

  const at = (f, z, x, y) => {
    const px = horiz ? z * m.sliceWidth + x : f * m.sliceWidth + x;
    const py = horiz ? f * m.sliceHeight + y : z * m.sliceHeight + y;
    return (py * png.width + px) * 4;
  };
  let semi = 0, offPal = 0, empties = 0;
  const areas = [];
  for (let z = 0; z < m.sliceCount; z++) {
    let area = 0;
    for (let y = 0; y < m.sliceHeight; y++) for (let x = 0; x < m.sliceWidth; x++) {
      const i = at(0, z, x, y); const a = png.data[i + 3];
      if (a > 0 && a < 255) semi++;
      if (a === 255) { area++; }
    }
    if (area === 0) empties++;
    areas.push(area);
  }
  // パレット（ベイク前の色と完全一致はしないので strict のときだけ）
  if (strict) {
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] === 255) {
      const h = [0, 1, 2].map((c) => png.data[i + c].toString(16).padStart(2, '0')).join('');
      if (!palette.has(h)) offPal++;
    }
  }
  if (semi > 0) err(id, `半透明ピクセル ${semi} 個（アルファは 0 か 255 のみ）`);
  if (areas[0] === 0) warn(id, '最下段（z0）が空。接地点がずれて見える');
  if (empties > m.sliceCount / 2) err(id, `空のスライスが半分以上（${empties}/${m.sliceCount}）`);
  // 「正面図を並べただけ」の検出: 隣接スライスの形がほぼ無関係なら疑う（体積の連続性）
  let jumps = 0;
  for (let z = 1; z < m.sliceCount; z++) {
    let inter = 0, uni = 0;
    for (let y = 0; y < m.sliceHeight; y++) for (let x = 0; x < m.sliceWidth; x++) {
      const a = png.data[at(0, z - 1, x, y) + 3] === 255, b = png.data[at(0, z, x, y) + 3] === 255;
      if (a && b) inter++; if (a || b) uni++;
    }
    if (uni > 0 && inter / uni < 0.2 && areas[z] > 0 && areas[z - 1] > 0) jumps++;
  }
  if (jumps > Math.max(2, m.sliceCount * 0.2)) err(id, `隣接スライスの重なりが極端に小さい段が ${jumps} 箇所。水平断面になっていない疑い（正面図の羅列・段ごとの描き直し）`);
  if (strict && offPal > 0) warn(id, `パレット外の色 ${offPal} px`);
  console.log(`ok    ${id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount} frames=${m.frames}`);
}
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
