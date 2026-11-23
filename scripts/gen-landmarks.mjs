// 王都のランドマーク・王城・大聖堂・ギルド・市場・教会・孤児院・城壁・4城門・橋欄干モジュールを
// 100% ネイティブ 2× 建築史仕様（density: 2, oto-64, grain: 0）で生成する。upscaleAndSave は使用しない。
import fs from 'node:fs';
import { Volume, writeSheet } from './voxel.mjs';
import { PAL } from './palette.mjs';
import {
  fillStoneBox,
  drawStoneQuoins,
  drawStringcourse,
  drawCornice,
  drawTimberFrame2x,
  drawJettyCorbels,
  drawArchWindow,
  drawOrielWindow,
  drawBalcony,
  drawPortal,
  drawChimneyBreast,
  drawButtress,
  drawDormer,
  drawHoistBeam,
  drawPitchedRoof2x,
} from './arch.mjs';

const BLD = 'assets/stacks/buildings';
const TER = 'assets/stacks/terrain';

function save2x(dir, id, v, footprint, notes, category = 'buildings', ao = 0.28) {
  v.bakeLighting({ density: 2, aoStrength: ao, grain: 0 });
  return writeSheet(`${dir}/${id}.png`, [v], {
    id,
    category,
    density: 2,
    footprint,
    pivot: [v.w / 2, v.h / 2],
    source: 'procedural',
    palette: 'oto-64',
    notes,
  });
}

function isViewsCarve(dir, id) {
  const jf = `${dir}/${id}.json`;
  if (!fs.existsSync(jf)) return false;
  try {
    return JSON.parse(fs.readFileSync(jf, 'utf8')).source === 'views-carve';
  } catch {
    return false;
  }
}

/** ネイティブ 2× 円錐屋根＋深持ち送り狭間（マシコレーション）付き円筒塔ビルダー */
function makeRoundTower2x(size, baseH, coneH, wallCol, bandCol, roofCol, roofAlt, roofTipCol, hasFlag = false) {
  const v = new Volume(size, size, baseH + coneH);
  const c = (size - 1) / 2;
  const rBase = c - 2.4;
  for (let z = 0; z < baseH; z++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      if (z < 7 && r <= rBase + Math.max(0, (7 - z) * 0.28)) {
        v.set(x, y, z, PAL.stoneDeep);
      } else if (z < baseH - 8 && r <= rBase) {
        const seam = z % 12 === 0;
        const rOut = seam && r <= rBase;
        const block = (Math.floor(z / 4) + Math.floor((Math.atan2(y - c, x - c) + Math.PI) * 3)) % 5 === 0;
        v.set(x, y, z, rOut ? bandCol : (block ? PAL.stoneMid : wallCol));
      } else if (z >= baseH - 8 && z < baseH - 3 && r <= rBase + 2.1) {
        const ang = Math.atan2(y - c, x - c);
        const corbel = z >= baseH - 5 || Math.floor((ang + Math.PI) / (Math.PI / 8)) % 2 === 0;
        if (r <= rBase || corbel) v.set(x, y, z, z === baseH - 4 ? bandCol : PAL.stoneCream);
      } else if (z >= baseH - 3 && r <= rBase + 2.1 && r > rBase - 1.3) {
        const ang = Math.atan2(y - c, x - c);
        if (Math.floor((ang + Math.PI) / (Math.PI / 8)) % 2 === 0) v.set(x, y, z, PAL.stoneCream);
      }
    }
  }
  for (let k = 0; k < coneH; k++) {
    const z = baseH + k;
    const rr = (rBase + 0.6) * (1 - k / Math.max(1, coneH - 1));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r <= Math.max(0.8, rr)) {
        const slateStep = (Math.floor(k / 3) + Math.floor((Math.atan2(y - c, x - c) + Math.PI) * 2)) % 3 === 0;
        const col = k >= coneH - 5 ? roofTipCol : (k <= 1 && roofTipCol === PAL.goldBright ? PAL.goldBright : (slateStep ? roofAlt : roofCol));
        v.set(x, y, z, col);
      }
    }
  }
  if (hasFlag) {
    const cx = Math.floor(c), cy = Math.floor(c), zTop = baseH + coneH - 1;
    v.box(cx + 1, cy, zTop - 3, cx + 4, cy, zTop - 2, PAL.crimson);
    v.set(cx + 5, cy, zTop - 2, PAL.goldBright);
  }
  return v;
}

const made = [];

// === 1) 王城シタデル（ネイティブ 2×・合計高さ 192px・上段接続 deck 保持） ===
{
  // bld_castle_keep (62x62x108, fp=31x31, baseZ=0)
  const W = 62, H = 62, v = new Volume(W, H, 108);
  const x0 = 5, x1 = 56, y0 = 5, y1 = 56;
  fillStoneBox(v, 3, 3, 0, 58, 58, 10, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 11, x1, y1, 91, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  drawStringcourse(v, x0, y0, x1, y1, 24, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 52, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 80, PAL.stoneLight);
  // 全4面 段付き石造控え壁
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? 56 : 5;
    for (const u of [10, 23, 38, 51]) drawButtress(v, face, wc, u, 6, 86, { colMain: PAL.marble, colDark: PAL.stoneMid });
    for (const u of [16, 30, 45]) {
      drawArchWindow(v, face, wc, u, 28, { style: 'lancet', h: 14, hoodCol: PAL.marble });
      drawArchWindow(v, face, wc, u, 57, { style: 'lancet', h: 14, glow: true, hoodCol: PAL.marble });
    }
  }
  // 持ち送りマシコレーション＆胸壁＋中央上段台座(z=98..107)
  drawCornice(v, x0, y0, x1, y1, 91, PAL.stoneCream, PAL.marble, true);
  v.box(2, 2, 93, 59, 59, 98, PAL.stoneMid);
  for (let i = 2; i <= 58; i += 6) {
    v.box(i, 2, 99, Math.min(59, i + 3), 4, 106, PAL.stoneCream);
    v.box(i, 57, 99, Math.min(59, i + 3), 59, 106, PAL.stoneCream);
    v.box(2, i, 99, 4, Math.min(59, i + 3), 106, PAL.stoneCream);
    v.box(57, i, 99, 59, Math.min(59, i + 3), 106, PAL.stoneCream);
  }
  v.box(10, 10, 98, 51, 51, 107, PAL.stoneMid);
  made.push(save2x(BLD, 'bld_castle_keep', v, [31, 31], '王城・中央天守（2x・段付き控え壁＆ランセット窓）'));
}
{
  // bld_castle_keep_top (50x50x88, fp=25x25, baseZ=52)
  const W = 50, H = 50, v = new Volume(W, H, 88);
  v.box(4, 4, 0, 45, 45, 5, PAL.stoneCream);
  v.box(6, 6, 6, 43, 43, 33, PAL.marble);
  drawStoneQuoins(v, 6, 6, 43, 43, 6, 31, PAL.stoneCream, PAL.stoneLight);
  drawCornice(v, 6, 6, 43, 43, 31, PAL.stoneCream, PAL.marble, true);
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? 43 : 6;
    for (const u of [14, 24, 35]) drawArchWindow(v, face, wc, u, 10, { style: 'lancet', h: 14, glow: true, glassCol: PAL.cyan, hoodCol: PAL.goldBright });
  }
  for (let k = 0; k < 54; k++) {
    const z = 34 + k;
    const r = Math.max(0.8, 22.0 * (1 - k / 53));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - 24.5, y - 24.5) <= r) {
        const rib = k < 42 && (Math.abs(x - 24.5) < 1.0 || Math.abs(y - 24.5) < 1.0) && Math.hypot(x - 24.5, y - 24.5) >= r - 1.5;
        const col = k >= 45 || k <= 1 || rib ? PAL.goldBright : (k % 3 === 0 ? PAL.blueDeep : PAL.blue);
        v.set(x, y, z, col);
      }
    }
  }
  for (const [f, wc] of [['+y', 42], ['-y', 7], ['+x', 42], ['-x', 7]]) {
    drawDormer(v, f, wc, 24, 34, { wallCol: PAL.marble, roofCol: PAL.goldBright, timberCol: PAL.goldBright, glow: true, setback: -4 });
  }
  v.box(25, 24, 83, 29, 25, 86, PAL.crimson);
  v.box(28, 24, 84, 30, 25, 85, PAL.goldBright);
  made.push(save2x(BLD, 'bld_castle_keep_top', v, [25, 25], '王城・中央天守上段尖塔（2x・ルカルヌ付）'));
}
{
  // bld_castle_tower (50x50x104, fp=25x25)
  const v = makeRoundTower2x(50, 96, 8, PAL.stoneCream, PAL.stoneMid, PAL.stoneMid, PAL.stoneDark, PAL.goldBright, false);
  for (const wz of [24, 52, 74]) {
    for (const [x, y, dx, dy] of [[25, 45, 0, -1], [25, 4, 0, 1], [4, 25, 1, 0], [45, 25, -1, 0]]) {
      for (let z = wz; z <= wz + 8; z++) {
        v.clear(x, y, z); v.clear(x + dx, y + dy, z);
        v.setEmissive(x + dx * 2, y + dy * 2, z, PAL.cyan);
      }
      v.box(x - Math.abs(dy), y - Math.abs(dx), wz - 1, x + Math.abs(dy), y + Math.abs(dx), wz - 1, PAL.marble);
    }
  }
  made.push(save2x(BLD, 'bld_castle_tower', v, [25, 25], '王城・隅塔（2x・下段104）'));
}
{
  const v = makeRoundTower2x(38, 24, 40, PAL.marble, PAL.stoneCream, PAL.blue, PAL.blueDeep, PAL.goldBright, true);
  v.box(18, 34, 9, 19, 34, 15, PAL.cyan);
  v.box(18, 3, 9, 19, 3, 15, PAL.cyan);
  made.push(save2x(BLD, 'bld_castle_tower_top', v, [19, 19], '王城・隅塔上段青尖塔（2x・baseZ=50）'));
}
{
  // bld_castle_wing (62x46x96, fp=31x23): 左右X端を保って接続しつつ、宮殿ペディメント窓・控え壁・シャトードーマー
  const W = 62, H = 46, wallH = 60, v = new Volume(W, H, 96);
  const x0 = 2, x1 = 59, y0 = 7, y1 = 38;
  fillStoneBox(v, x0, y0 - 1, 0, x1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 9, x1, y1, wallH - 1, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  drawStringcourse(v, x0, y0, x1, y1, 30, PAL.marble);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  for (const face of ['+y', '-y']) {
    const wc = face === '+y' ? y1 : y0;
    for (const u of [9, 23, 38, 52]) drawButtress(v, face, wc, u, 8, 56, { colMain: PAL.marble, colDark: PAL.stoneMid });
    for (const u of [16, 30, 45]) {
      drawArchWindow(v, face, wc, u, 12, { style: 'casement', glow: true, frameCol: PAL.marble });
      drawArchWindow(v, face, wc, u, 35, { style: 'pediment', glow: true, juliet: true });
    }
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 35, {
    roofStyle: 'gable-x', roofMain: PAL.blue, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright, wallColor: PAL.stoneCream, timberColor: PAL.stoneMid, eave: 3,
  });
  drawDormer(v, '+y', y1, 20, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, timberCol: PAL.goldBright, glow: true, setback: -2 });
  drawDormer(v, '+y', y1, 41, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, timberCol: PAL.goldBright, glow: true, setback: -2 });
  drawDormer(v, '-y', y0, 30, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, timberCol: PAL.goldBright, glow: false, setback: -2 });
  made.push(save2x(BLD, 'bld_castle_wing', v, [31, 23], '王城・翼棟（2x・宮殿窓＆シャトードーマー）'));
}
{
  // bld_castle_gate (62x46x116, fp=31x23): 張出し石落とし(ブレテッシュ)＋迫石ゴシック門アーチ＋塔
  const W = 62, H = 46, v = new Volume(W, H, 116);
  const y0 = 7, y1 = 38;
  fillStoneBox(v, 2, y0, 0, 59, y1, 64, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  fillStoneBox(v, 2, y0 - 1, 0, 59, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(19, 39, 0, 42, 44, 1, PAL.stoneMid);
  // 深く凹んだ多段迫石ゴシック門アーチ＋落とし格子
  for (let z = 0; z <= 32; z++) {
    const archInset = z > 20 ? Math.floor((z - 20) * 0.85) : 0;
    for (let x = 22 + archInset; x <= 39 - archInset; x++) {
      for (let y = 34; y <= y1; y++) v.clear(x, y, z);
      v.set(x, 33, z, PAL.woodDeep);
      if (z >= 21 && (x % 3 === 0 || z === 24)) v.set(x, 37, z, PAL.iron);
    }
  }
  v.box(19, 38, 0, 21, 39, 33, PAL.goldBright);
  v.box(40, 38, 0, 42, 39, 33, PAL.goldBright);
  v.box(20, 38, 32, 41, 40, 34, PAL.goldBright);
  // 張出し石落とし防衛廊（ブレテッシュ +y=39..41, z=48..63）
  v.box(20, 39, 48, 41, 41, 63, PAL.marble);
  for (let x = 21; x <= 40; x += 4) v.box(x, 39, 45, x + 1, 40, 47, PAL.stoneMid);
  for (let x = 20; x <= 41; x += 4) v.box(x, 40, 62, x + 2, 41, 66, PAL.stoneCream);
  drawArchWindow(v, '+y', 41, 25, 51, { style: 'lancet', h: 8, glow: true, glassCol: PAL.cyan, hoodCol: PAL.goldBright });
  drawArchWindow(v, '+y', 41, 35, 51, { style: 'lancet', h: 8, glow: true, glassCol: PAL.cyan, hoodCol: PAL.goldBright });
  drawArchWindow(v, '-y', y0, 30, 40, { style: 'lancet', h: 12, glow: true, glassCol: PAL.cyan });
  for (const bx of [13, 47]) {
    v.box(bx, 39, 16, bx + 2, 40, 44, PAL.blue);
    v.box(bx + 1, 40, 26, bx + 1, 40, 32, PAL.goldBright);
  }
  for (const tx of [8, 53]) {
    for (let z = 0; z < 116; z++) for (let y = 4; y <= 41; y++) for (let x = tx - 8; x <= tx + 8; x++) {
      const r = Math.hypot(x - tx, y - 22);
      if (z < 84 && r <= (z >= 79 ? 9.6 : 8.6)) v.set(x, y, z, (z % 16 === 0 || z === 79) ? PAL.stoneMid : PAL.stoneCream);
      if (z >= 84 && r <= 9.0 * (1 - (z - 84) / 32)) v.set(x, y, z, z >= 109 ? PAL.goldBright : (z % 4 === 0 ? PAL.blueDeep : PAL.blue));
    }
  }
  drawPitchedRoof2x(v, { x0: 16, y0: y0, x1: 45, y1: y1 }, 65, 29, {
    roofStyle: 'gable-x', roofMain: PAL.blue, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright, eave: 3,
  });
  drawDormer(v, '+y', y1, 30, 65, { wallCol: PAL.marble, roofCol: PAL.blueDeep, timberCol: PAL.goldBright, glow: true, setback: -2 });
  made.push(save2x(BLD, 'bld_castle_gate', v, [31, 23], '王城・南正門（2x・張出し石落とし＆ゴシック大門）'));
}

// === 2) 大聖堂（身廊・鐘楼尖塔・後陣チェベットすべてネイティブ 2×） ===
{
  // bld_cathedral_nave (62x62x116, fp=31x31)
  const W = 62, H = 62, v = new Volume(W, H, 116);
  const x0 = 8, x1 = 53, y0 = 2, y1 = 57;
  fillStoneBox(v, x0 - 1, y0, 0, x1 + 1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 9, x1, y1, 67, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  v.box(20, 58, 0, 41, 61, 2, PAL.stoneCream);
  // 4対のゴシック・フライングバットレス（飛び梁の下が大きく貫通）
  for (const y of [8, 22, 36, 49]) {
    drawButtress(v, '-x', x0, y, 0, 58, { colMain: PAL.stoneCream, colDark: PAL.stoneMid, pinnacle: true });
    drawButtress(v, '+x', x1, y, 0, 58, { colMain: PAL.stoneCream, colDark: PAL.stoneMid, pinnacle: true });
    v.box(x0 - 4, y - 1, 0, x0 - 1, y + 1, 56, PAL.stoneCream);
    v.box(x1 + 1, y - 1, 0, x1 + 4, y + 1, 56, PAL.stoneCream);
    v.box(x0 - 1, y - 1, 45, x0, y + 1, 51, PAL.marble);
    v.box(x1, y - 1, 45, x1 + 1, y + 1, 51, PAL.marble);
    for (let z = 9; z <= 44; z++) {
      v.clear(x0 - 1, y, z); v.clear(x1 + 1, y, z);
    }
  }
  drawPortal(v, '+y', y1, 30, 2, { halfW: 5, doorH: 23, arch: true, porch: true, porchRoofCol: PAL.slateDeep, frameCol: PAL.marble });
  // 正面大バラ窓＋放射石組トレーサリー
  for (let z = 37; z <= 55; z++) for (let x = 22; x <= 39; x++) {
    const dx = x - 30.5, dz = z - 46, d = Math.hypot(dx, dz);
    if (d <= 8.2) {
      v.clear(x, y1, z); v.clear(x, y1 - 1, z);
      if (d > 6.8) v.set(x, y1, z, PAL.marble);
      else {
        const spoke = Math.abs(Math.sin(Math.atan2(dz, dx) * 4)) < 0.22;
        if (spoke) v.set(x, y1 - 1, z, PAL.stoneCream);
        else v.setEmissive(x, y1 - 2, z, d < 2.2 ? PAL.goldBright : ((Math.round(d) + x) % 2 === 0 ? PAL.cyan : PAL.crimson));
      }
    }
  }
  for (const y of [15, 29, 43]) {
    drawArchWindow(v, '-x', x0, y, 22, { style: 'lancet', h: 20, glow: true, hoodCol: PAL.marble });
    drawArchWindow(v, '+x', x1, y, 22, { style: 'lancet', h: 20, glow: true, hoodCol: PAL.marble });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, 68, 48, {
    roofStyle: 'gable-y', roofMain: PAL.slateLight, roofAlt: PAL.slateDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.stoneMid, timberColor: PAL.stoneCream, bargeCol: PAL.marble, eave: 3,
  });
  made.push(save2x(BLD, 'bld_cathedral_nave', v, [31, 31], '大聖堂・身廊（2x・飛び梁控え壁＆バラ窓）'));
}
{
  // bld_cathedral_spire (50x50x104, fp=25x25, deck z=98..103)
  const W = 50, H = 50, v = new Volume(W, H, 104);
  const x0 = 6, x1 = 43, y0 = 6, y1 = 43;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 9, x1, y1, 97, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  for (const z of [28, 56, 78, 96]) drawStringcourse(v, x0, y0, x1, y1, z, PAL.stoneCream);
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? 43 : 6;
    drawButtress(v, face, wc, 9, 0, 88, { colMain: PAL.marble, colDark: PAL.stoneMid });
    drawButtress(v, face, wc, 40, 0, 88, { colMain: PAL.marble, colDark: PAL.stoneMid });
    if (face !== '+y') drawArchWindow(v, face, wc, 24, 34, { style: 'lancet', h: 14, glow: true });
    drawArchWindow(v, face, wc, 19, 62, { style: 'lancet', h: 11, glow: true });
    drawArchWindow(v, face, wc, 30, 62, { style: 'lancet', h: 11, glow: true });
    drawArchWindow(v, face, wc, 19, 82, { style: 'lancet', h: 10, glow: true });
    drawArchWindow(v, face, wc, 30, 82, { style: 'lancet', h: 10, glow: true });
  }
  drawPortal(v, '+y', y1, 24, 2, { halfW: 4, doorH: 22, arch: true, porch: true, porchRoofCol: PAL.slateDeep, frameCol: PAL.marble });
  drawArchWindow(v, '+y', y1, 24, 34, { style: 'lancet', h: 16, glow: true });
  v.box(8, 8, 98, 41, 41, 103, PAL.stoneCream);
  made.push(save2x(BLD, 'bld_cathedral_spire', v, [25, 25], '大聖堂・鐘楼尖塔下段（2x・控え壁＆3連ランセット）'));
}
{
  // bld_cathedral_spire_top (38x38x84, fp=19x19)
  const W = 38, H = 38, v = new Volume(W, H, 84);
  v.box(8, 8, 0, 29, 29, 4, PAL.stoneCream);
  for (let z = 5; z <= 25; z++) {
    v.box(8, 8, z, 11, 11, z, PAL.stoneMid);
    v.box(26, 8, z, 29, 11, z, PAL.stoneMid);
    v.box(8, 26, z, 11, 29, z, PAL.stoneMid);
    v.box(26, 26, z, 29, 29, z, PAL.stoneMid);
  }
  for (const [px, py] of [[9, 9], [28, 9], [9, 28], [28, 28]]) {
    v.box(px - 1, py - 1, 26, px + 1, py + 1, 34, PAL.marble);
    v.set(px, py, 35, PAL.goldBright);
  }
  v.box(16, 16, 9, 21, 21, 19, PAL.goldBright); // 大鐘
  v.box(8, 8, 24, 29, 29, 27, PAL.stoneCream);
  drawCornice(v, 9, 9, 28, 28, 25, PAL.stoneCream, PAL.marble, true);
  for (let k = 0; k < 52; k++) {
    const z = 28 + k, r = Math.max(0.8, 13.6 * (1 - k / 51));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - 18.5, y - 18.5) <= r) v.set(x, y, z, k >= 45 ? PAL.goldBright : (k % 4 === 0 ? PAL.slateDeep : PAL.slate));
    }
  }
  v.box(18, 18, 79, 19, 19, 83, PAL.goldBright);
  v.box(16, 18, 81, 21, 19, 81, PAL.goldBright);
  made.push(save2x(BLD, 'bld_cathedral_spire_top', v, [19, 19], '大聖堂・鐘楼上段尖塔（2x・小尖塔＆鐘楼）'));
}
{
  // bld_cathedral_apse (58x50x96, fp=29x25): 原生2× 多角形ゴシック後陣(チェベット)＋放射控え壁＋ステンドグラス
  const W = 58, H = 50, wallH = 60, v = new Volume(W, H, 96);
  const cx = 28.5, cy = 20;
  for (let z = 0; z < wallH; z++) {
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      const inBack = y <= 24 && x >= 7 && x <= 50;
      const dx = (x - cx) / 22.0, dy = Math.max(0, (y - cy) / 23.0);
      const inOctagon = dy >= 0 && (Math.abs(dx) + dy <= 1.25 && dx * dx + dy * dy <= 1.05);
      if (inBack || inOctagon) {
        const col = z < 8 ? PAL.stoneDeep : (z % 18 === 0 ? PAL.stoneCream : ((Math.floor(z / 4) + x) % 7 === 0 ? PAL.stoneLight : PAL.stoneMid));
        v.set(x, y, z, col);
      }
    }
  }
  drawCornice(v, 7, 3, 50, 26, wallH - 3, PAL.stoneCream, PAL.marble, true);
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? 7 : 50;
    drawButtress(v, face, wc, 9, 0, 56, { colMain: PAL.marble, colDark: PAL.stoneMid, pinnacle: true });
    drawButtress(v, face, wc, 21, 0, 56, { colMain: PAL.marble, colDark: PAL.stoneMid, pinnacle: true });
    drawArchWindow(v, face, wc, 15, 18, { style: 'lancet', h: 22, glow: true, hoodCol: PAL.marble });
  }
  for (const ux of [16, 28, 41]) {
    drawArchWindow(v, '-y', 3, ux, 18, { style: 'lancet', h: 22, glow: true, hoodCol: PAL.marble });
  }
  // 半円後陣側面・正面チェベットの高窓と控え壁
  for (const angDeg of [35, 65, 90, 115, 145]) {
    const rad = (angDeg * Math.PI) / 180;
    const wx = Math.round(cx + Math.cos(rad) * 21.5);
    const wy = Math.round(cy + Math.sin(rad) * 22.5);
    const bx = Math.round(cx + Math.cos(rad + 0.14) * 24.0);
    const by = Math.round(cy + Math.sin(rad + 0.14) * 25.0);
    for (let z = 0; z <= 54; z++) v.box(bx - 1, by - 1, z, bx + 1, by + 1, z, z > 46 ? PAL.marble : PAL.stoneCream);
    for (let z = 18; z <= 42; z++) {
      v.clear(wx, wy, z);
      v.setEmissive(Math.round(cx + Math.cos(rad) * 19.5), Math.round(cy + Math.sin(rad) * 20.5), z, z % 2 === 0 ? PAL.cyan : PAL.goldBright);
    }
  }
  // 多角錐後陣屋根
  for (let k = 0; k < 36; k++) {
    const z = wallH + k, t = k / 35;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const dx = (x - cx) / Math.max(1, 24.5 * (1 - t));
      const dy = Math.max(0, (y - cy) / Math.max(1, 25.5 * (1 - t)));
      const inBack = y >= 2 + Math.floor(t * 16) && y <= 25 && Math.abs(x - cx) <= 24.5 * (1 - t);
      const inCone = (y > cy) && (Math.abs(dx) + dy <= 1.28 && dx * dx + dy * dy <= 1.08);
      if (inBack || inCone) v.set(x, y, z, k >= 33 ? PAL.goldBright : ((x + y + k) % 4 === 0 ? PAL.slateDeep : PAL.slateLight));
    }
  }
  made.push(save2x(BLD, 'bld_cathedral_apse', v, [29, 25], '大聖堂・多角形後陣チェベット（2x・58x50x96）'));
}

// === 3) 公認ギルド本部・中央市場ホール・個人ギルド・教会・孤児院（100% ネイティブ 2×） ===
{
  // bld_guild_hq_main (62x62x112, fp=31x31): 1F柱廊＆ポルチコ＋全4面ペディメント窓＋石バルコニー＋マンサード＋八角小塔
  const W = 62, H = 62, wallH = 62, v = new Volume(W, H, 112);
  const x0 = 5, x1 = 56, y0 = 5, y1 = 54;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 22, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(x0, y0, 23, x1, y1, wallH - 1, PAL.plasterLight);
  drawStoneQuoins(v, x0, y0, x1, y1, 4, wallH - 3, PAL.stoneCream, PAL.marble);
  drawStringcourse(v, x0, y0, x1, y1, 23, PAL.stoneCream);
  drawStringcourse(v, x0, y0, x1, y1, 44, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  // +y 玄関ポルチコ＆全4面窓・南向き側面(+x, YAW_EAST時南向き/-x)・バルコニー
  drawPortal(v, '+y', y1, 30, 2, { halfW: 4, doorH: 19, porch: true, porchRoofCol: PAL.blueDark, frameCol: PAL.marble, signCol: PAL.goldBright });
  drawPortal(v, '+x', x1, 30, 2, { halfW: 3, doorH: 17, arch: true, porch: true, porchRoofCol: PAL.blueDark });
  drawBalcony(v, '+y', y1, 30, 27, 8, 'stone', true);
  drawBalcony(v, '-x', x0, 30, 27, 7, 'stone', true);
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? (face === '+y' ? y1 : x1) : (face === '+y' || face === '-y' ? y0 : x0);
    for (const u of [14, 46]) {
      drawArchWindow(v, face, wc, u, 8, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
      drawArchWindow(v, face, wc, u, 28, { style: 'pediment', glow: true, juliet: true });
      drawArchWindow(v, face, wc, u, 47, { style: 'casement', glow: true, frameCol: PAL.marble });
    }
    if (face === '-y' || face === '+x') drawArchWindow(v, face, wc, 30, 28, { style: 'pediment', glow: true, juliet: true });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, {
    roofStyle: 'mansard', roofMain: PAL.blueDark, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterLight, timberColor: PAL.stoneCream, eave: 3,
  });
  for (const [f, wc] of [['+y', y1], ['-y', y0], ['-x', x0], ['+x', x1]]) {
    drawDormer(v, f, wc, 20, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
    drawDormer(v, f, wc, 41, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
  }
  // 頂上八角ランタン小塔＋青銅ドーム＋ギルド旗
  for (let z = 88; z <= 97; z++) for (let y = 23; y <= 38; y++) for (let x = 23; x <= 38; x++) {
    if (Math.hypot(x - 30.5, y - 30.5) <= 6.8) v.set(x, y, z, (x === 25 || x === 36 || y === 25 || y === 36) ? PAL.goldBright : PAL.marble);
  }
  for (let k = 0; k < 10; k++) {
    const z = 98 + k, r = Math.sqrt(Math.max(0, 1 - (k / 10) ** 2)) * 7.2;
    for (let y = 22; y <= 39; y++) for (let x = 22; x <= 39; x++) {
      if (Math.hypot(x - 30.5, y - 30.5) <= r) v.set(x, y, z, (x === 30 || y === 30) ? PAL.goldBright : PAL.blue);
    }
  }
  v.box(30, 30, 107, 31, 31, 111, PAL.goldBright);
  v.box(32, 30, 109, 36, 30, 111, PAL.crimson);
  made.push(save2x(BLD, 'bld_guild_hq_main', v, [31, 31], '王都公認ギルド本部・本館（2x・全4面ペディメント窓＆バルコニー）'));
}
{
  // bld_guild_hq_wing (46x62x88, fp=23x31)
  const W = 46, H = 62, wallH = 52, v = new Volume(W, H, 88);
  const x0 = 5, x1 = 40, y0 = 5, y1 = 56, splitZ = 24;
  fillStoneBox(v, x0, y0, 0, x1, y1, splitZ - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plaster);
  drawStoneQuoins(v, x0, y0, x1, y1, 4, wallH - 3, PAL.stoneCream, PAL.marble);
  drawStringcourse(v, x0, y0, x1, y1, splitZ, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 : x1;
    for (const uy of [14, 30, 46]) {
      drawArchWindow(v, face, wc, uy, 8, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
      drawArchWindow(v, face, wc, uy, 29, { style: 'double', glow: true, shutterCol: PAL.blueDeep, frameCol: PAL.marble });
    }
  }
  for (const face of ['+y', '-y']) {
    const wc = face === '+y' ? y1 : y0;
    drawArchWindow(v, face, wc, 23, 8, { style: 'casement', glow: true });
    drawArchWindow(v, face, wc, 23, 29, { style: 'pediment', glow: true, juliet: true });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 35, {
    roofStyle: 'gable-y', roofMain: PAL.blueDark, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.plaster, timberColor: PAL.stoneCream, eave: 3,
  });
  for (const dy of [18, 42]) {
    drawDormer(v, '-x', x0, dy, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
    drawDormer(v, '+x', x1, dy, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
  }
  drawChimneyBreast(v, '-x', x0, 30, 0, 86, { shoulderZ: 48 });
  made.push(save2x(BLD, 'bld_guild_hq_wing', v, [23, 31], '王都公認ギルド本部・翼棟（2x・46x62x88）'));
}
{
  // bld_market_hall (58x62x84, fp=29x31): 中世伝統的 1F 四方吹き抜けアーケード柱廊＋2F 木骨集会場＋屋根小塔
  const W = 58, H = 62, wallH = 54, splitZ = 28, v = new Volume(W, H, 84);
  const x0 = 5, x1 = 52, y0 = 5, y1 = 56;
  // 1F 石畳舗装ポディウム＋吹き抜け柱廊 (周囲のアーチ柱のみ立ち上げ、内側に屋台・荷箱を配置)
  v.box(x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 2, PAL.stoneMid);
  // 1F 内部の市場商品箱・樽＋暖色吊りランタン
  v.box(14, 14, 3, 21, 22, 10, PAL.oak); v.box(36, 38, 3, 43, 46, 11, PAL.woodLight);
  v.box(25, 28, 3, 32, 34, 9, PAL.crimson);
  v.setEmissive(28, 30, 21, PAL.lanternGlow);
  // 1F 4隅＋中間 石柱ピラスター
  const xPiers = [x0 + 1, x0 + 16, x1 - 16, x1 - 1];
  const yPiers = [y0 + 1, y0 + 16, y0 + 32, y1 - 1];
  for (const px of xPiers) for (const py of [y0 + 1, y1 - 1]) {
    fillStoneBox(v, px - 1, py - 1, 2, px + 1, py + 1, splitZ - 1, PAL.stoneCream, PAL.stoneLight, PAL.stoneDark);
  }
  for (const py of yPiers) for (const px of [x0 + 1, x1 - 1]) {
    fillStoneBox(v, px - 1, py - 1, 2, px + 1, py + 1, splitZ - 1, PAL.stoneCream, PAL.stoneLight, PAL.stoneDark);
  }
  // 1F アーケード上部のアーチスパンドレル石桁
  drawStringcourse(v, x0 + 1, y0 + 1, x1 - 1, y1 - 1, splitZ - 3, PAL.stoneMid);
  drawStringcourse(v, x0 + 1, y0 + 1, x1 - 1, y1 - 1, splitZ - 2, PAL.stoneCream);
  drawStringcourse(v, x0 + 1, y0 + 1, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneCream);
  // 2F 張り出し木骨集会場 (splitZ..wallH-1) + 木製コーベル
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plaster);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 2, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  for (const uy of [16, 30, 45]) {
    drawArchWindow(v, '-x', x0, uy, splitZ + 5, { style: 'double', glow: true, shutterCol: PAL.oak, flowerBox: PAL.crimson });
    drawArchWindow(v, '+x', x1, uy, splitZ + 5, { style: 'double', glow: true, shutterCol: PAL.oak, flowerBox: PAL.goldBright });
  }
  for (const ux of [17, 39]) {
    drawArchWindow(v, '+y', y1, ux, splitZ + 5, { style: 'double', glow: true, shutterCol: PAL.oak });
    drawArchWindow(v, '-y', y0, ux, splitZ + 5, { style: 'double', glow: false, shutterCol: PAL.oak });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 24, {
    roofStyle: 'hip', roofMain: PAL.slate, roofAlt: PAL.slateDeep, wallColor: PAL.plaster, timberColor: PAL.woodDeep, eave: 3,
  });
  for (const uy of [19, 41]) {
    drawDormer(v, '-x', x0, uy, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.slateDeep, glow: true, setback: -2 });
    drawDormer(v, '+x', x1, uy, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  }
  // 市場の屋根鐘楼キューポラ
  v.box(24, 26, 70, 33, 35, 76, PAL.woodDeep);
  v.boxEmissive(26, 28, 72, 31, 33, 75, PAL.lanternGlow);
  for (let k = 0; k < 7; k++) v.box(24 + Math.floor(k * 0.6), 26 + Math.floor(k * 0.6), 77 + k, 33 - Math.floor(k * 0.6), 35 - Math.floor(k * 0.6), 77 + k, k >= 5 ? PAL.goldBright : PAL.slateDeep);
  made.push(save2x(BLD, 'bld_market_hall', v, [29, 31], '中央市場ホール（2x・1F全4面吹き抜け石柱アーケード＆木骨2F）'));
}

if (!isViewsCarve(BLD, 'bld_shop_corner')) {
  const W = 48, H = 62, wallH = 44, v = new Volume(W, H, 76);
  const x0 = 5, x1 = 42, y0 = 5, y1 = 56;
  fillStoneBox(v, x0, y0, 0, x1, y1, 6, PAL.stoneMid, PAL.stoneCream, PAL.stoneDark);
  v.box(x0, y0, 7, x1, y1, wallH - 1, PAL.plaster);
  drawTimberFrame2x(v, x0, y0, x1, y1, 7, wallH - 3, PAL.woodDeep, { midZ: 24, braces: true });
  drawPortal(v, '+y', y1, 24, 2, { porch: true, porchRoofCol: PAL.crimson, awningCol: PAL.crimson });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, { roofStyle: 'gable-y', roofMain: PAL.crimson, roofAlt: PAL.tileWarm, eave: 3 });
  made.push(save2x(BLD, 'bld_shop_corner', v, [24, 31], '大通りの角店（2x）'));
}

{
  // bld_guild_branch (54x58x84, fp=27x29): 紫・金切妻＋1Fポーチ＋2Fバルコニー＋南向き側面出窓(-x)
  const W = 54, H = 58, wallH = 48, splitZ = 24, v = new Volume(W, H, 84);
  const x0 = 5, x1 = 48, y0 = 5, y1 = 51;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterLight);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.goldBright, false);
  drawPortal(v, '+y', y1 - 1, 27, 2, { halfW: 3, doorH: 17, porch: true, porchRoofCol: PAL.purple, signCol: PAL.purple, awningCol: PAL.crimson });
  drawBalcony(v, '+y', y1, 27, splitZ, 6, 'iron', true);
  // 注意：oto.ts で YAW_WEST (+x が南向き、-x が北向き)。両側面とも見栄えを良くするため +x に豪華出窓、-x にダブル窓＋鎧戸を配置
  drawOrielWindow(v, '+x', x1, 28, splitZ + 3, { wallCol: PAL.plasterLight, timberCol: PAL.woodDeep, roofCol: PAL.purple, roofAlt: PAL.plum, glow: true });
  drawArchWindow(v, '-x', x0, 28, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.purple, flowerBox: PAL.crimson });
  for (const face of ['+x', '-x']) {
    const wc = face === '+x' ? x1 - 1 : x0 + 1;
    drawArchWindow(v, face, wc, 15, 9, { style: 'casement', glow: true, shutterCol: PAL.purple });
    drawArchWindow(v, face, wc, 40, 9, { style: 'casement', glow: true, shutterCol: PAL.purple });
  }
  drawArchWindow(v, '-y', y0, 15, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawArchWindow(v, '-y', y0, 38, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 34, {
    roofStyle: 'gable-y', roofMain: PAL.purple, roofAlt: PAL.plum, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, bargeCol: PAL.goldBright, eave: 3,
  });
  drawDormer(v, '+x', x1, 18, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.plum, glow: true, setback: -2 });
  drawDormer(v, '-x', x0, 38, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.plum, glow: true, setback: -2 });
  drawChimneyBreast(v, '-x', x0, 16, 0, 82, { colMain: PAL.brickDark, colTrim: PAL.stoneCream, shoulderZ: 44 });
  made.push(save2x(BLD, 'bld_guild_branch', v, [27, 29], '大通りのギルド支部（2x・バルコニー＆側面出窓）'));
}
{
  // bld_guild_small_a (50x54x76, fp=25x27)
  const W = 50, H = 54, wallH = 44, splitZ = 22, v = new Volume(W, H, 76);
  const x0 = 5, x1 = 44, y0 = 5, y1 = 48;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plaster);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  drawPortal(v, '+y', y1 - 1, 25, 2, { halfW: 3, doorH: 15, porch: true, porchRoofCol: PAL.bronze, signCol: PAL.gold });
  for (const face of ['+x', '-x']) {
    const wc = face === '+x' ? x1 : x0;
    drawArchWindow(v, face, face === '+x' ? wc - 1 : wc + 1, 16, 8, { style: 'casement', glow: true, shutterCol: PAL.oak });
    drawArchWindow(v, face, face === '+x' ? wc - 1 : wc + 1, 36, 8, { style: 'casement', glow: false, shutterCol: PAL.oak });
    drawArchWindow(v, face, wc, 26, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.bronze, flowerBox: PAL.goldBright });
  }
  drawArchWindow(v, '+y', y1, 14, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '+y', y1, 35, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-y', y0, 15, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-y', y0, 34, splitZ + 4, { style: 'casement', glow: false, shutterCol: PAL.oak });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 30, {
    roofStyle: 'gable-y', roofMain: PAL.gold, roofAlt: PAL.bronze, ridgeCol: PAL.goldBright,
    wallColor: PAL.plaster, timberColor: PAL.woodDeep, bargeCol: PAL.goldBright, eave: 3,
  });
  drawDormer(v, '+x', x1, 26, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.brickDark, glow: true, setback: -2 });
  drawDormer(v, '-x', x0, 26, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.brickDark, glow: true, setback: -2 });
  drawChimneyBreast(v, '-y', y0, 25, 0, 74, { shoulderZ: 40 });
  made.push(save2x(BLD, 'bld_guild_small_a', v, [25, 27], '街のギルド支部A（2x・全4面組窓＆ドーマー）'));
}
{
  // bld_guild_small_b (46x50x68, fp=23x25)
  const W = 46, H = 50, wallH = 40, splitZ = 20, v = new Volume(W, H, 68);
  const x0 = 4, x1 = 41, y0 = 4, y1 = 45;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterWarm);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawPortal(v, '+y', y1 - 1, 22, 2, { halfW: 3, doorH: 14, porch: true, porchRoofCol: PAL.gold, signCol: PAL.goldBright });
  drawOrielWindow(v, '-x', x0, 25, splitZ + 3, { wallCol: PAL.plasterWarm, timberCol: PAL.oak, roofCol: PAL.bronze, roofAlt: PAL.gold, glow: true });
  drawArchWindow(v, '+x', x1, 25, splitZ + 3, { style: 'double', glow: true, shutterCol: PAL.bronze, flowerBox: PAL.goldBright });
  drawArchWindow(v, '+y', y1, 13, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '+y', y1, 32, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-y', y0, 22, splitZ + 3, { style: 'double', glow: true, shutterCol: PAL.oak });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 26, {
    roofStyle: 'jerkinhead', roofMain: PAL.bronze, roofAlt: PAL.gold, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, eave: 3,
  });
  drawChimneyBreast(v, '+x', x1, 12, 0, 66, { shoulderZ: 36 });
  made.push(save2x(BLD, 'bld_guild_small_b', v, [23, 25], '街のギルド支部B（2x・側面出窓＆半切妻）'));
}
{
  // bld_church_hall (58x62x92, fp=29x31): 段付き控え壁×4対・ランセット窓・切妻玄関ポーチ・屋根小尖塔フレーシュ
  const W = 58, H = 62, wallH = 52, v = new Volume(W, H, 92);
  const x0 = 7, x1 = 50, y0 = 6, y1 = 55;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 9, x1, y1, wallH - 1, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  drawStoneQuoins(v, x0, y0, x1, y1, 8, wallH - 3, PAL.marble, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  // 正面切妻ポーチ＋円形オクルス窓
  drawPortal(v, '+y', y1, 28, 2, { halfW: 4, doorH: 18, arch: true, porch: true, porchRoofCol: PAL.slateDeep, frameCol: PAL.marble });
  for (let z = 34; z <= 46; z++) for (let x = 23; x <= 33; x++) {
    const d = Math.hypot(x - 28.5, z - 40);
    if (d <= 5.0) {
      v.clear(x, y1, z); v.clear(x, y1 - 1, z);
      if (d > 3.8) v.set(x, y1, z, PAL.marble);
      else v.setEmissive(x, y1 - 2, z, d < 1.6 ? PAL.goldBright : PAL.cyan);
    }
  }
  drawArchWindow(v, '+y', y1, 14, 16, { style: 'lancet', h: 16, glow: true });
  drawArchWindow(v, '+y', y1, 43, 16, { style: 'lancet', h: 16, glow: true });
  drawArchWindow(v, '-y', y0, 17, 16, { style: 'lancet', h: 18, glow: true });
  drawArchWindow(v, '-y', y0, 28, 18, { style: 'lancet', h: 20, glow: true });
  drawArchWindow(v, '-y', y0, 40, 16, { style: 'lancet', h: 18, glow: true });
  // 左右側面の段付き控え壁＋高いゴシック・ランセットステンドグラス
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 : x1;
    for (const uy of [10, 23, 37, 50]) drawButtress(v, face, wc, uy, 0, 48, { colMain: PAL.marble, colDark: PAL.stoneMid, pinnacle: true });
    for (const uy of [16, 30, 43]) drawArchWindow(v, face, wc, uy, 16, { style: 'lancet', h: 20, glow: true, hoodCol: PAL.marble });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 30, {
    roofStyle: 'gable-y', roofMain: PAL.slate, roofAlt: PAL.slateDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.stoneCream, timberColor: PAL.stoneMid, bargeCol: PAL.marble, eave: 3,
  });
  // 屋根小尖塔（フレーシュ）＋金十字架
  for (let k = 0; k < 20; k++) {
    const z = 72 + k, r = Math.max(0.6, 3.6 * (1 - k / 19));
    for (let y = 24; y <= 34; y++) for (let x = 24; x <= 33; x++) {
      if (Math.hypot(x - 28.5, y - 29) <= r) v.set(x, y, z, k >= 15 ? PAL.goldBright : PAL.slateDeep);
    }
  }
  v.box(26, 29, 89, 31, 29, 89, PAL.goldBright);
  made.push(save2x(BLD, 'bld_church_hall', v, [29, 31], '教会・礼拝堂（2x・段付き控え壁×4対＆ゴシックランセット窓）'));
}
{
  // bld_church_belfry (34x34x124, fp=17x17): ネイティブ2× 隅控え壁・開放鐘楼・大鐘・八角尖塔
  const W = 34, H = 34, v = new Volume(W, H, 124);
  const x0 = 6, x1 = 27, y0 = 6, y1 = 27;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 9, x1, y1, 69, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? 27 : 6;
    drawButtress(v, face, wc, 8, 0, 66, { colMain: PAL.marble, colDark: PAL.stoneMid, pinnacle: true });
    drawButtress(v, face, wc, 25, 0, 66, { colMain: PAL.marble, colDark: PAL.stoneMid, pinnacle: true });
    drawArchWindow(v, face, wc, 17, 20, { style: 'lancet', h: 12, glow: true });
    drawArchWindow(v, face, wc, 17, 44, { style: 'lancet', h: 12, glow: true });
  }
  drawStringcourse(v, x0, y0, x1, y1, 36, PAL.marble);
  drawStringcourse(v, x0, y0, x1, y1, 68, PAL.marble);
  // 開放四面鐘室（z=70..91）＋金の大鐘
  for (let z = 70; z <= 91; z++) {
    v.box(x0, y0, z, x0 + 3, y0 + 3, z, PAL.stoneMid);
    v.box(x1 - 3, y0, z, x1, y0 + 3, z, PAL.stoneMid);
    v.box(x0, y1 - 3, z, x0 + 3, y1, z, PAL.stoneMid);
    v.box(x1 - 3, y1 - 3, z, x1, y1, z, PAL.stoneMid);
  }
  v.box(14, 14, 75, 19, 19, 86, PAL.goldBright);
  drawCornice(v, x0, y0, x1, y1, 90, PAL.stoneCream, PAL.marble, true);
  for (let k = 0; k < 31; k++) {
    const z = 93 + k, r = Math.max(0.6, 11.2 * (1 - k / 30));
    for (let y = 2; y <= 31; y++) for (let x = 2; x <= 31; x++) {
      if (Math.hypot(x - 16.5, y - 16.5) <= r) v.set(x, y, z, k >= 26 ? PAL.goldBright : (k % 3 === 0 ? PAL.slateDeep : PAL.slate));
    }
  }
  v.box(14, 16, 121, 19, 17, 121, PAL.goldBright);
  made.push(save2x(BLD, 'bld_church_belfry', v, [17, 17], '教会・鐘楼尖塔（2x・開放鐘室＆隅控え壁）'));
}
{
  // bld_orphanage (58x58x72, fp=29x29): 石基壇・木骨張り出し2F・切妻玄関ポーチ・全4面花壇窓＋3ドーマー
  const W = 58, H = 58, wallH = 42, splitZ = 20, v = new Volume(W, H, 72);
  const x0 = 5, x1 = 52, y0 = 5, y1 = 52;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterLight);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  drawPortal(v, '+y', y1 - 1, 28, 2, { halfW: 3, doorH: 15, porch: true, porchRoofCol: PAL.slate, frameCol: PAL.stoneCream });
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y' || face === '+x') ? 52 : 5;
    for (const u of [15, 41]) {
      if (!(face === '+y' && Math.abs(u - 28) <= 6)) {
        drawArchWindow(v, face, (face === '+y' || face === '+x') ? wc - 1 : wc + 1, u, 8, { style: 'casement', glow: true, shutterCol: PAL.pineDark, flowerBox: PAL.crimson });
      }
      drawArchWindow(v, face, wc, u, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.pineDark, flowerBox: PAL.goldBright });
    }
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, {
    roofStyle: 'hip', roofMain: PAL.slate, roofAlt: PAL.slateDark, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, eave: 3,
  });
  for (const [f, wc, uc] of [['+y', y1, 28], ['-x', x0, 28], ['+x', x1, 28]]) {
    drawDormer(v, f, wc, uc, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  }
  drawChimneyBreast(v, '-y', y0, 20, 0, 70, { shoulderZ: 38 });
  made.push(save2x(BLD, 'bld_orphanage', v, [29, 29], '孤児院（2x・木骨張り出し＆全4面花壇窓）'));
}

// === 4) 城壁・円筒塔・南門・副城門・橋欄干（ネイティブ 2×・X軸接続面保護） ===
{
  // bld_wall_segment_a (50x26x60, fp=25x13)
  const W = 50, H = 26, v = new Volume(W, H, 60);
  fillStoneBox(v, 0, 3, 0, 49, 22, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, 0, 5, 9, 49, 20, 44, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  // 表裏に石控え壁＋張り出し持ち送り胸壁(マシコレーション)
  for (const bx of [12, 37]) {
    v.box(bx - 1, 2, 0, bx + 1, 4, 42, PAL.stoneCream);
    v.box(bx - 1, 21, 0, bx + 1, 23, 42, PAL.stoneCream);
  }
  for (let x = 0; x < W; x += 4) {
    v.box(x, 3, 45, x + 1, 4, 46, PAL.stoneDark);
    v.box(x, 21, 45, x + 1, 22, 46, PAL.stoneDark);
  }
  v.box(0, 3, 47, 49, 22, 49, PAL.stoneDark);
  for (let x = 0; x < W; x++) {
    if (Math.floor(x / 8) % 2 === 0) {
      v.box(x, 3, 50, x, 6, 59, PAL.stoneCream);
      v.box(x, 19, 50, x, 22, 59, PAL.stoneCream);
    }
  }
  made.push(save2x(BLD, 'bld_wall_segment_a', v, [25, 13], '城壁モジュール（2x・控え壁＆持ち送り胸壁）'));
}
made.push(save2x(BLD, 'bld_wall_tower_a', makeRoundTower2x(54, 72, 32, PAL.stoneMid, PAL.stoneDeep, PAL.slate, PAL.slateDeep, PAL.stoneDark, false), [27, 27], '城壁の円筒塔（2x・マシコレーション）'));

{
  const v = makeRoundTower2x(50, 100, 8, PAL.stoneCream, PAL.stoneMid, PAL.stoneMid, PAL.stoneDark, PAL.goldBright, false);
  for (const z of [36, 37, 38, 39, 68, 69, 70, 71]) {
    v.clear(25, 45, z); v.setEmissive(25, 44, z, PAL.cyan);
    v.clear(25, 4, z); v.setEmissive(25, 5, z, PAL.cyan);
  }
  made.push(save2x(BLD, 'bld_south_gate_tower', v, [25, 25], '南の城門・門楼の塔（2x・下段108）'));
}
made.push(save2x(BLD, 'bld_south_gate_tower_top', makeRoundTower2x(38, 24, 40, PAL.marble, PAL.stoneCream, PAL.blue, PAL.blueDeep, PAL.goldBright, true), [19, 19], '南の城門・門楼の塔（2x・上段青尖塔）'));

function makeSouthGateHalf2x(isEast) {
  const W = 58, H = 42, v = new Volume(W, H, 120);
  const mx = (x) => (isEast ? W - 1 - x : x);
  const boxMx = (x0, y0, z0, x1, y1, z1, col) => v.box(Math.min(mx(x0), mx(x1)), y0, z0, Math.max(mx(x0), mx(x1)), y1, z1, col);
  for (let z = 0; z < 52; z++) {
    let reach = 10;
    if (z >= 40) {
      const t = (z - 40) / 11;
      reach = Math.round(11 + 42 * (t * t * 0.4 + t * 0.6));
    }
    for (let x = 0; x <= Math.min(54, reach); x++) for (let y = 5; y <= 36; y++) {
      v.set(mx(x), y, z, z <= 8 ? PAL.stoneDeep : ((x + z) % 8 === 0 ? PAL.stoneDark : PAL.stoneMid));
    }
    if (z >= 44 && z <= 51) {
      for (let x = reach + 3; x <= 55; x += 5) {
        v.box(mx(x), 35, z, mx(x), 36, z, PAL.iron);
        v.box(mx(x), 5, z, mx(x), 6, z, PAL.iron);
      }
    }
  }
  fillStoneBox(v, 0, 5, 52, 57, 36, 89, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  // 張出し石落とし(マシコレーション)
  for (let x = 0; x < W; x += 4) {
    v.box(x, 3, 52, x + 1, 4, 54, PAL.stoneDark);
    v.box(x, 37, 52, x + 1, 38, 54, PAL.stoneDark);
  }
  v.box(0, 2, 55, 57, 39, 57, PAL.stoneDark);
  for (const x of [14, 30, 46]) for (const z of [64, 65, 66, 67, 68, 69, 70, 71]) {
    v.clear(mx(x), 36, z); v.setEmissive(mx(x), 35, z, PAL.cyan);
    v.clear(mx(x), 5, z); v.setEmissive(mx(x), 6, z, PAL.cyan);
    v.set(mx(x), 37, z, PAL.stoneMid);
  }
  boxMx(52, 37, 58, 57, 38, 74, PAL.goldBright);
  boxMx(54, 38, 62, 57, 38, 70, PAL.crimson);
  boxMx(8, 37, 58, 11, 38, 82, PAL.blue);
  boxMx(9, 38, 69, 10, 38, 72, PAL.goldBright);
  for (let x = 0; x < W; x += 8) {
    boxMx(x, 4, 90, Math.min(57, x + 5), 6, 97, PAL.stoneCream);
    boxMx(x, 35, 90, Math.min(57, x + 5), 37, 97, PAL.stoneCream);
  }
  for (let k = 0; k < 23; k++) {
    const z = 97 + k, iy = Math.floor((k / 22) * 14);
    for (let y = 5 + iy; y <= 36 - iy; y++) for (let x = 0; x <= 57; x++) {
      v.set(mx(x), y, z, k >= 21 ? PAL.goldBright : ((x + k) % 4 === 0 ? PAL.blueDeep : PAL.blue));
    }
  }
  return v;
}
made.push(save2x(BLD, 'bld_south_gate_arch_w', makeSouthGateHalf2x(false), [29, 21], '南の城門・西アーチ（2x・58x42x120）'));
made.push(save2x(BLD, 'bld_south_gate_arch_e', makeSouthGateHalf2x(true), [29, 21], '南の城門・東アーチ（2x・58x42x120）'));

function makeSideGateHalf2x(isEast) {
  const W = 46, H = 34, v = new Volume(W, H, 88);
  const mx = (x) => (isEast ? W - 1 - x : x);
  const boxMx = (x0, y0, z0, x1, y1, z1, col) => v.box(Math.min(mx(x0), mx(x1)), y0, z0, Math.max(mx(x0), mx(x1)), y1, z1, col);
  for (let z = 0; z < 40; z++) {
    const reach = z >= 30 ? Math.min(43, 8 + Math.round(((z - 30) / 9) * 35)) : 8;
    for (let x = 0; x <= reach; x++) for (let y = 5; y <= 28; y++) {
      v.set(mx(x), y, z, z <= 6 ? PAL.stoneDeep : PAL.stoneMid);
    }
  }
  fillStoneBox(v, 0, 5, 40, 45, 28, 65, PAL.stoneCream, PAL.stoneLight, PAL.stoneMid);
  v.box(0, 3, 41, 45, 30, 43, PAL.stoneDark);
  for (const x of [14, 30]) for (const z of [50, 51, 52, 53, 54]) {
    v.clear(mx(x), 28, z); v.setEmissive(mx(x), 27, z, PAL.cyan);
    v.clear(mx(x), 5, z); v.setEmissive(mx(x), 6, z, PAL.cyan);
  }
  boxMx(42, 29, 46, 45, 29, 58, PAL.goldBright);
  for (let x = 0; x < W; x += 8) {
    boxMx(x, 4, 66, Math.min(45, x + 5), 6, 71, PAL.stoneCream);
    boxMx(x, 27, 66, Math.min(45, x + 5), 29, 71, PAL.stoneCream);
  }
  for (let k = 0; k < 17; k++) {
    const z = 71 + k, iy = Math.floor((k / 16) * 10);
    for (let y = 5 + iy; y <= 28 - iy; y++) for (let x = 0; x <= 45; x++) {
      v.set(mx(x), y, z, k >= 15 ? PAL.goldBright : ((x + k) % 4 === 0 ? PAL.slateDeep : PAL.slate));
    }
  }
  return v;
}
made.push(save2x(BLD, 'bld_side_gate_w', makeSideGateHalf2x(false), [23, 17], '副城門・西アーチ（2x・46x34x88）'));
made.push(save2x(BLD, 'bld_side_gate_e', makeSideGateHalf2x(true), [23, 17], '副城門・東アーチ（2x・46x34x88）'));

// 河川橋＆城橋石欄干（ネイティブ 2×：凹凸小柱＋彫り込み欄干＋笠石＋鉄製ランタン）
{
  // ter_river_bridge (62x14x28, fp=31x7)
  const W = 62, H = 14, v = new Volume(W, H, 28);
  v.box(0, 3, 0, 61, 10, 4, PAL.stoneDeep);
  fillStoneBox(v, 0, 4, 5, 61, 9, 13, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  v.box(0, 3, 14, 61, 10, 15, PAL.stoneCream);
  for (const x of [0, 29, 58]) {
    v.box(x, 2, 0, x + 3, 11, 19, PAL.stoneCream);
    v.box(x, 2, 20, x + 3, 11, 21, PAL.marble);
    v.box(x + 1, 5, 22, x + 2, 8, 22, PAL.iron);
    v.boxEmissive(x + 1, 5, 23, x + 2, 8, 25, PAL.lanternGlow);
    v.box(x, 4, 26, x + 3, 9, 27, PAL.iron);
  }
  made.push(save2x(TER, 'ter_river_bridge', v, [31, 7], '河川・運河橋石欄干（2x・62x14x28）', 'terrain', 0.25));
}
{
  // ter_bridge_rail (14x62x30, fp=7x31)
  const W = 14, H = 62, v = new Volume(W, H, 30);
  v.box(3, 0, 0, 10, 61, 4, PAL.stoneDeep);
  fillStoneBox(v, 4, 0, 5, 9, 61, 14, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
  v.box(3, 0, 15, 10, 61, 16, PAL.stoneCream);
  for (const y of [0, 29, 58]) {
    v.box(2, y, 0, 11, y + 3, 23, PAL.stoneCream);
    v.box(1, y - 1, 24, 12, y + 4, 25, PAL.marble);
    v.box(3, y + 1, 26, 10, y + 2, 29, PAL.goldBright);
  }
  made.push(save2x(TER, 'ter_bridge_rail', v, [7, 31], '城の橋・石欄干（2x・14x62x30）', 'terrain', 0.25));
}

console.log(`generated ${made.length} landmarks/terrain stacks (all native 2x, 0 upscaled):`);
for (const m of made) console.log(`  ${m.id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount} (fp=${m.footprint.join('x')}, d=${m.density})`);
