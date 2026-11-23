// 農業・工業・魔導インフラ・冒険者経済建築全 17 種を 100% ネイティブ 2× 建築史仕様（density: 2, oto-64, grain: 0）で生成する。
// upscaleAndSave は一切使用しない。全4面立体ディテール＋9種の4フレーム環境アニメを完全維持する。
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

const OUT = 'assets/stacks/buildings';

function save2x(id, frames, footprint, notes, ao = 0.28) {
  const arr = Array.isArray(frames) ? frames : [frames];
  arr.forEach((v) => v.bakeLighting({ density: 2, aoStrength: ao, grain: 0 }));
  return writeSheet(`${OUT}/${id}.png`, arr, {
    id,
    category: 'buildings',
    density: 2,
    footprint,
    pivot: [arr[0].w / 2, arr[0].h / 2],
    source: 'procedural',
    palette: 'oto-64',
    notes,
  });
}

const made = [];

// === 1) bld_windmill (50x50x112, fp=25x25, 4f): 石造テーパー風車塔＋切妻石ポーチ＋全周螺旋窓＋回転格子翼 ===
{
  const W = 50, H = 50, Z = 112, c = 24.5;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    for (let z = 0; z < 84; z++) {
      const baseR = 17.6 - (z / 84) * 4.8;
      const r = z < 7 ? baseR + 1.1 : (z >= 80 && z <= 82 ? baseR + 1.5 : baseR);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) {
          const band = z % 18 === 0 || z === 80;
          const col = z < 7 ? PAL.stoneDeep : (band ? PAL.stoneMid : ((Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 4)) % 7 === 0 ? PAL.stoneLight : PAL.stoneCream));
          v.set(x, y, z, col);
        }
      }
    }
    // 南正面 張出し切妻玄関ポーチ＋石段
    v.box(19, 40, 0, 30, 46, 2, PAL.stoneMid);
    v.box(20, 41, 3, 29, 45, 22, PAL.stoneCream);
    for (let z = 3; z <= 18; z++) for (let x = 22; x <= 27; x++) {
      v.clear(x, 45, z); v.clear(x, 44, z); v.set(x, 43, z, PAL.oak);
    }
    for (let k = 0; k < 5; k++) v.box(19 + k, 40, 23 + k, 30 - k, 46, 23 + k, PAL.terracotta);
    // 全周螺旋アーチ窓（彫り込み＋張り出し窓台・まぐさ）
    const spiral = [
      { x: 24, y: 40, dx: 0, dy: 1, z: 32 },
      { x: 9, y: 24, dx: -1, dy: 0, z: 42 },
      { x: 24, y: 9, dx: 0, dy: -1, z: 52 },
      { x: 39, y: 24, dx: 1, dy: 0, z: 60 },
      { x: 24, y: 37, dx: 0, dy: 1, z: 66 },
    ];
    for (const sw of spiral) {
      for (let dz = 0; dz < 6; dz++) {
        const px = sw.x, py = sw.y, zz = sw.z + dz;
        v.clear(px, py, zz);
        v.setEmissive(px - sw.dx, py - sw.dy, zz, PAL.lanternGlow);
        v.set(px + sw.dx, py + sw.dy, sw.z - 1, PAL.stoneLight);
        v.set(px + sw.dx, py + sw.dy, sw.z + 6, PAL.oak);
      }
    }
    // 円錐木屋根キャップ（+1.5px 張り出し軒）
    for (let k = 0; k < 28; k++) {
      const z = 84 + k;
      const r = Math.max(0.8, 15.2 * (1 - k / 27));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) v.set(x, y, z, k >= 24 ? PAL.goldBright : (k % 3 === 0 ? PAL.woodDeep : PAL.oak));
      }
    }
    // 回転軸＋4枚木格子帆翼
    v.box(22, 35, 72, 27, 48, 76, PAL.woodDeep);
    v.box(23, 47, 73, 26, 48, 75, PAL.bronze);
    const baseAng = f * (Math.PI / 8) + 0.25;
    for (let b = 0; b < 4; b++) {
      const a = baseAng + b * (Math.PI / 2);
      const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, nz = ca;
      for (let rad = 3; rad <= 22.5; rad += 0.35) {
        const sx = Math.round(c + ca * rad), sz = Math.round(74 + sa * rad);
        v.box(sx, 44, sz, sx, 48, sz, PAL.oak);
        if (rad >= 6 && rad <= 21.5) {
          for (let w = 1; w <= 6; w++) {
            const cx = Math.round(c + ca * rad + nx * w), cz = Math.round(74 + sa * rad + nz * w);
            const isSpar = Math.round(rad) % 4 === 0 || w === 6 || w === 3;
            v.box(cx, 44, cz, cx, 46, cz, isSpar ? PAL.woodLight : PAL.clothCream);
          }
        }
      }
    }
    return v;
  });
  made.push(save2x('bld_windmill', frames, [25, 25], '石造風車（2x・切妻ポーチ＆螺旋窓・4f）'));
}

// === 2) bld_arcane_academy (62x62x120, fp=31x31): 古典大理石列柱ポルチコ＋全4面ペディメント窓＋緑青天文ドーム＆望遠鏡 ===
{
  const W = 62, H = 62, wallH = 60, v = new Volume(W, H, 120);
  const x0 = 5, x1 = 56, y0 = 6, y1 = 52;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, 9, x1, y1, wallH - 1, PAL.marble);
  drawStoneQuoins(v, x0, y0, x1, y1, 8, wallH - 3, PAL.stoneCream, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 30, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  // 南正面 4 本コリント列柱ポルチコ＋青銅三角ペディメント＋凹大門
  v.box(17, y1 + 1, 0, 44, 59, 3, PAL.stoneCream);
  for (const px of [18, 25, 36, 43]) v.box(px, 56, 4, px + 1, 58, 27, PAL.marble);
  v.box(17, y1 + 1, 28, 44, 59, 30, PAL.stoneCream);
  for (let k = 0; k < 7; k++) v.box(17 + k * 2, y1 + 1, 31 + k, 44 - k * 2, 59, 31 + k, k >= 5 ? PAL.goldBright : PAL.bronze);
  drawPortal(v, '+y', y1, 30, 4, { halfW: 4, doorH: 20, doorCol: PAL.blueDeep, frameCol: PAL.bronze, steps: false });
  // 全4面 凹み魔導アーチ窓＆ペディメント窓
  for (const face of ['+y', '-y', '+x', '-x']) {
    const wc = (face === '+y') ? y1 : (face === '-y' ? y0 : (face === '+x' ? x1 : x0));
    const uList = (face === '+y' || face === '-y') ? [12, 49] : [16, 29, 42];
    for (const u of uList) {
      drawArchWindow(v, face, wc, u, 11, { style: 'arcane', h: 11, hoodCol: PAL.stoneCream });
      drawArchWindow(v, face, wc, u, 36, { style: 'arcane', h: 12, hoodCol: PAL.goldBright });
    }
    if (face === '-y') {
      drawArchWindow(v, face, wc, 30, 11, { style: 'arcane', h: 11 });
      drawArchWindow(v, face, wc, 30, 36, { style: 'arcane', h: 13, hoodCol: PAL.goldBright });
    }
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 20, {
    roofStyle: 'mansard', roofMain: PAL.clothNavy, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.marble, timberColor: PAL.stoneCream, eave: 3,
  });
  for (const [f, wc, uc] of [['+y', y1, 16], ['+y', y1, 45], ['-y', y0, 30], ['-x', x0, 29], ['+x', x1, 29]]) {
    drawDormer(v, f, wc, uc, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, timberCol: PAL.goldBright, glow: true, setback: -2 });
  }
  // 緑青銅天文ドーム＋観測スリット＋真鍮天体望遠鏡＋マナ尖塔
  for (let k = 0; k < 23; k++) {
    const z = 80 + k, r = Math.sqrt(Math.max(0, 1 - (k / 23) ** 2)) * 15.2;
    for (let y = 14; y <= 46; y++) for (let x = 14; x <= 46; x++) {
      const dx = x - 30.5, dy = y - 29.5;
      if (Math.hypot(dx, dy) <= r) {
        if (k >= 6 && k <= 17 && dy > 2 && Math.abs(dx - dy * 0.35) < 2.2) continue;
        const isRib = Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2;
        v.set(x, y, z, isRib ? PAL.copper : (k % 3 === 0 ? PAL.verdigris : PAL.waterDeep));
      }
    }
  }
  for (let t = 0; t <= 12; t++) {
    v.box(31 + Math.floor(t * 0.3), 34 + t, 88 + Math.floor(t * 0.55), 32 + Math.floor(t * 0.3), 35 + t, 89 + Math.floor(t * 0.55), t === 12 ? PAL.goldBright : PAL.bronze);
  }
  v.box(28, 27, 103, 33, 32, 112, PAL.goldBright);
  v.boxEmissive(28, 27, 113, 33, 32, 119, PAL.cyan);
  made.push(save2x('bld_arcane_academy', v, [31, 31], '王立魔導学院本館（2x・全4面魔導アーチ窓＆天文ドーム）'));
}

// === 3) bld_potion_shop (54x54x88, fp=27x27, 4f): 発光薬瓶出窓(-x南向き)＆ガラスフラスコ看板＆蒸留排気塔 ===
{
  const W = 54, H = 54, wallH = 50, splitZ = 24, vBase = new Volume(W, H, 88);
  const x0 = 5, x1 = 48, y0 = 5, y1 = 46;
  fillStoneBox(vBase, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  vBase.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterLight);
  drawJettyCorbels(vBase, x0, y0, x1, y1, splitZ, 1, PAL.plum);
  drawTimberFrame2x(vBase, x0, y0, x1, y1, splitZ, wallH - 3, PAL.plum, { braces: true });
  drawCornice(vBase, x0, y0, x1, y1, wallH - 3, PAL.plum, PAL.goldBright, false);
  drawPortal(vBase, '+y', y1 - 1, 26, 2, { halfW: 3, doorH: 17, porch: true, porchRoofCol: PAL.purple });
  // +y 大型ポーション吊りフラスコブラケット（先端はフレームごとに発光色変化）
  vBase.box(26, y1, 35, 27, y1 + 6, 38, PAL.bronze);
  vBase.box(25, y1 + 2, 34, 28, y1 + 6, 35, PAL.goldBright);
  // 全4面窓＋ -x (YAW_EAST 時南向き側面) に 2F 張り出し出窓！
  drawOrielWindow(vBase, '-x', x0, 26, splitZ + 3, { wallCol: PAL.plasterLight, timberCol: PAL.plum, roofCol: PAL.purple, roofAlt: PAL.plum, glow: true });
  drawArchWindow(vBase, '+x', x1, 26, splitZ + 3, { style: 'double', glow: true, shutterCol: PAL.purple, flowerBox: PAL.lime });
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 + 1 : x1 - 1;
    drawArchWindow(vBase, face, wc, 14, 9, { style: 'casement', glow: true, shutterCol: PAL.purple });
    drawArchWindow(vBase, face, wc, 37, 9, { style: 'casement', glow: true, shutterCol: PAL.purple });
  }
  drawArchWindow(vBase, '-y', y0, 15, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawArchWindow(vBase, '-y', y0, 38, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawArchWindow(vBase, '+y', y1, 13, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawArchWindow(vBase, '+y', y1, 40, splitZ + 3, { style: 'casement', glow: true, shutterCol: PAL.purple });
  drawPitchedRoof2x(vBase, { x0, y0, x1, y1 }, wallH, 36, {
    roofStyle: 'gable-y', roofMain: PAL.purple, roofAlt: PAL.plum, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterLight, timberColor: PAL.plum, bargeCol: PAL.goldBright, eave: 3,
  });
  drawDormer(vBase, '+x', x1, 26, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.plum, timberCol: PAL.plum, glow: true, setback: -2 });
  // 銅製蒸留排気塔＋螺旋冷却管
  vBase.box(8, 8, 44, 15, 15, 81, PAL.copper);
  vBase.box(7, 15, 58, 16, 16, 60, PAL.bronze);

  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, 88);
    v.data.set(vBase.data);
    v.emissive.set(vBase.emissive);
    const flaskGlow = (f % 2 === 0) ? PAL.lime : PAL.cyan;
    v.boxEmissive(23, y1 + 2, 25, 30, y1 + 6, 33, flaskGlow);
    for (const bx of [11, 36]) {
      const wg = (f === 0 || (f === 1 && bx === 11) || (f === 3 && bx === 36)) ? PAL.lime : PAL.cyan;
      drawArchWindow(v, '+y', y1 - 1, bx + 2, 8, { style: 'casement', glow: true, frameCol: PAL.plum });
      v.boxEmissive(bx + 1, y1 - 3, 10, bx + 3, y1 - 2, 13, (f === 2) ? PAL.white : wg);
    }
    v.boxEmissive(10, 10, 82, 13, 13, 87, flaskGlow);
    return v;
  });
  made.push(save2x('bld_potion_shop', frames, [27, 27], '錬金・ポーション工房（2x・側面出窓＆フラスコ・4f）'));
}

// === 4) bld_magic_forge (54x50x80, fp=27x25, 4f): 木鉄張出し炉庇＋側面外大煙突(-x)＋鉄格子窓 ===
{
  const W = 54, H = 50, Z = 80, wallH = 44;
  const x0 = 5, x1 = 48, y0 = 5, y1 = 36;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 6, PAL.iron, PAL.stoneDeep, PAL.charcoal);
    fillStoneBox(v, x0, y0, 7, x1, y1, wallH - 1, PAL.stoneMid, PAL.stoneDark, PAL.iron);
    drawStoneQuoins(v, x0, y0, x1, y1, 6, wallH - 3, PAL.stoneDark, PAL.iron);
    drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneDark, PAL.goldBright, false);
    // 前面開放炉床ポディウム(y=37..47) + 張出し木鉄差しかけ庇(y=36..47, z=22..32)
    v.box(x0, 37, 0, x1, 47, 2, PAL.stoneDeep);
    for (const px of [x0 + 1, x1 - 2]) v.box(px, 44, 3, px + 1, 46, 22, PAL.iron);
    for (let y = 37; y <= 46; y++) {
      const rz = 32 - Math.floor((y - 37) * 0.9);
      v.box(x0, y, rz, x1, y, rz + 1, (y === 46) ? PAL.goldBright : ((y % 2 === 0) ? PAL.slateDeep : PAL.iron));
    }
    drawPortal(v, '+y', y1, 26, 2, { halfW: 4, doorH: 18, frameCol: PAL.iron, doorCol: PAL.woodDeep, steps: false });
    v.box(22, 41, 3, 31, 45, 9, PAL.iron); // 魔導炉釜
    v.boxEmissive(23, 42, 10, 30, 44, 12, (f === 1 || f === 2) ? PAL.cyan : PAL.sky);
    v.boxEmissive(25, 43, 13, 28, 43, 14, (f === 2) ? PAL.white : PAL.lanternGlow);
    v.box(9, 40, 3, 16, 44, 10, PAL.steel); // 金床
    v.boxEmissive(11, 40, 11, 14, 42, 13, (f % 2 === 0) ? PAL.orange : PAL.cyan);
    // 鉄格子入り凹み窓（-x / +x / -y）
    for (const face of ['-x', '+x', '-y']) {
      const wc = face === '-x' ? x0 : (face === '+x' ? x1 : y0);
      const uList = face === '-y' ? [15, 38] : [26];
      for (const u of uList) {
        drawArchWindow(v, face, wc, u, 11, { style: 'casement', glow: true, frameCol: PAL.iron, mullionCol: PAL.iron });
      }
    }
    // 頭上エンチャント聖剣レリーフ
    v.boxEmissive(26, 38, 28, 27, 39, 41, (f % 2 === 0) ? PAL.cyan : PAL.white);
    v.box(22, 38, 31, 31, 39, 32, PAL.goldBright);
    drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, {
      roofStyle: 'gable-x', roofMain: PAL.slateDeep, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright,
      wallColor: PAL.stoneMid, timberColor: PAL.iron, bargeCol: PAL.goldBright, eave: 3,
    });
    // -x 外壁張り出し大煙突（YAW_EAST 時南から際立つシルエット）
    drawChimneyBreast(v, '-x', x0, 13, 0, 74, { colMain: PAL.iron, colTrim: PAL.steel, colDeep: PAL.stoneDeep, halfW: 3, shoulderZ: 40 });
    v.boxEmissive(2, 11, 75, 5, 15, 79, (f % 2 === 1) ? PAL.orange : PAL.cyan);
    return v;
  });
  made.push(save2x('bld_magic_forge', frames, [27, 25], '魔導鍛冶場（2x・張出し炉庇＆外大煙突・4f）'));
}

// === 5) bld_guild_tavern (58x58x92, fp=29x29): 冒険者酒場バルコニー＋側面出窓(+x南向き)＋両面ドーマー＋大煙突 ===
{
  const W = 58, H = 58, wallH = 52, splitZ = 27, v = new Volume(W, H, 92);
  const x0 = 5, x1 = 52, y0 = 5, y1 = 48;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneMid, PAL.stoneDark, PAL.stoneDeep);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterLight);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  // 1F 木デッキ＋酒樽＋切妻玄関ポーチ＋銀翼ジョッキ看板
  v.box(15, y1 + 1, 0, 42, 55, 2, PAL.oak);
  v.box(8, y1 + 1, 0, 13, 54, 7, PAL.wood); v.box(9, y1 + 1, 2, 12, 54, 2, PAL.iron);
  drawPortal(v, '+y', y1 - 1, 28, 3, { halfW: 4, doorH: 18, porch: true, porchRoofCol: PAL.crimson, signCol: PAL.goldBright });
  drawBalcony(v, '+y', y1, 28, splitZ, 7, 'timber', true);
  // YAW_WEST (+x が南向き)：+x に立派な 2F 出窓＋1F 暖色窓、-x / -y にも鎧戸付き暖色組窓
  drawOrielWindow(v, '+x', x1, 27, splitZ + 4, { wallCol: PAL.plasterLight, timberCol: PAL.woodDeep, roofCol: PAL.crimson, roofAlt: PAL.burgundy, glow: true });
  drawArchWindow(v, '-x', x0, 27, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.burgundy, flowerBox: PAL.crimson });
  for (const face of ['+x', '-x']) {
    const wc = face === '+x' ? x1 - 1 : x0 + 1;
    drawArchWindow(v, face, wc, 14, 9, { style: 'casement', glow: true, shutterCol: PAL.burgundy });
    drawArchWindow(v, face, wc, 39, 9, { style: 'casement', glow: true, shutterCol: PAL.burgundy });
  }
  drawArchWindow(v, '+y', y1, 13, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.burgundy });
  drawArchWindow(v, '+y', y1, 44, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.burgundy });
  drawArchWindow(v, '-y', y0, 15, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.burgundy });
  drawArchWindow(v, '-y', y0, 40, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.burgundy });
  drawArchWindow(v, '-y', y0 + 1, 28, 9, { style: 'casement', glow: true });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 38, {
    roofStyle: 'gable-y', roofMain: PAL.crimson, roofAlt: PAL.burgundy, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, bargeCol: PAL.goldBright, eave: 3,
  });
  drawDormer(v, '+x', x1, 17, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.burgundy, glow: true, setback: -2 });
  drawDormer(v, '+x', x1, 37, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.burgundy, glow: true, setback: -2 });
  drawDormer(v, '-x', x0, 27, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.burgundy, glow: true, setback: -2 });
  drawChimneyBreast(v, '-x', x0, 13, 0, 90, { colMain: PAL.brickDark, colTrim: PAL.stoneCream, halfW: 3, shoulderZ: 48 });
  made.push(save2x('bld_guild_tavern', v, [29, 29], '冒険者酒場（2x・全4面灯り窓＆側面出窓＆大煙突）'));
}

// === 6) bld_mana_station (58x38x72, fp=29x19, 4f): 鉄柱アーチ駅舎パビリオン ===
{
  const W = 58, H = 38, Z = 72;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    v.box(0, 1, 0, 57, 36, 3, PAL.stoneCream);
    v.box(0, 33, 2, 57, 36, 3, PAL.goldBright);
    fillStoneBox(v, 4, 4, 4, 53, 8, 33, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
    drawArchWindow(v, '-y', 4, 15, 11, { style: 'arcane', h: 12, hoodCol: PAL.stoneCream });
    drawArchWindow(v, '-y', 4, 29, 11, { style: 'arcane', h: 12, hoodCol: PAL.stoneCream });
    drawArchWindow(v, '-y', 4, 43, 11, { style: 'arcane', h: 12, hoodCol: PAL.stoneCream });
    v.box(18, 8, 11, 39, 10, 26, PAL.blueDeep);
    v.boxEmissive(20, 10, 14, 37, 10, 23, (f % 2 === 0) ? PAL.cyan : PAL.sky);
    v.box(12, 12, 4, 45, 16, 10, PAL.oak);
    for (const px of [5, 28, 51]) for (const py of [5, 29]) {
      v.box(px, py, 4, px + 1, py + 1, 41, PAL.iron);
      v.box(px - 1, py - 1, 35, px + 2, py + 2, 39, PAL.goldBright);
    }
    v.box(2, 2, 41, 55, 33, 43, PAL.goldBright);
    for (let k = 0; k < 26; k++) {
      const z = 44 + k, iy = Math.floor((k / 25) * 14);
      for (let y = 2 + iy; y <= 33 - iy; y++) for (let x = 2; x <= 55; x++) {
        v.set(x, y, z, (x <= 3 || x >= 54 || k >= 24) ? PAL.goldBright : ((x + y) % 5 === 0 ? PAL.blueDeep : PAL.clothNavy));
      }
    }
    const bc = (f === 1 || f === 2) ? PAL.white : PAL.cyan;
    v.boxEmissive(5, 29, 44, 6, 30, 54, bc);
    v.boxEmissive(51, 29, 44, 52, 30, 54, bc);
    return v;
  });
  made.push(save2x('bld_mana_station', frames, [29, 19], '環状マナ軌道トラム駅舎（2x・58x38x72・4f）'));
}

// === B. 農業・工業・インフラ全 11 種（完全ネイティブ 2× 刷新） ===

// 7) bld_farmhouse_a (50x42x60, fp=25x21): 藁葺き屋根＆木骨農家（深い藁軒・ポーチ・全4面鎧戸窓・石煙突）
{
  const W = 50, H = 42, wallH = 29, v = new Volume(W, H, 60);
  const x0 = 5, x1 = 44, y0 = 5, y1 = 35;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 5, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, 6, x1, y1, wallH - 1, PAL.plasterWarm);
  drawTimberFrame2x(v, x0, y0, x1, y1, 6, wallH - 3, PAL.woodDeep, { braces: true });
  drawPortal(v, '+y', y1, 24, 2, { halfW: 3, doorH: 15, porch: true, porchRoofCol: PAL.thatchDark });
  for (const ux of [12, 37]) {
    drawArchWindow(v, '+y', y1, ux, 10, { style: 'casement', glow: true, shutterCol: PAL.oak, flowerBox: PAL.crimson });
    drawArchWindow(v, '-y', y0, ux, 10, { style: 'casement', glow: false, shutterCol: PAL.oak });
  }
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 : x1;
    drawArchWindow(v, face, wc, 20, 10, { style: 'double', glow: true, shutterCol: PAL.oak, flowerBox: PAL.goldBright });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 30, {
    roofStyle: 'jerkinhead', roofMain: PAL.thatchLight, roofAlt: PAL.thatchDark, ridgeCol: PAL.oak,
    wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, eave: 4, mossSpots: true,
  });
  drawDormer(v, '+y', y1, 24, wallH, { wallCol: PAL.plasterWarm, roofCol: PAL.thatchDark, glow: true, setback: -2 });
  drawChimneyBreast(v, '-x', x0, 11, 0, 58, { shoulderZ: 27 });
  made.push(save2x('bld_farmhouse_a', v, [25, 21], '藁葺き屋根の農家（2x・厚軒＆切妻ポーチ＆石煙突）'));
}

// 8) bld_barn_a (58x46x68, fp=29x23): ギャンブレル屋根＆張り出し干し草荷揚げ庇付き大納屋
{
  const W = 58, H = 46, wallH = 34, v = new Volume(W, H, 68);
  const x0 = 5, x1 = 52, y0 = 5, y1 = 40;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 5, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, 6, x1, y1, wallH - 1, PAL.oak);
  drawTimberFrame2x(v, x0, y0, x1, y1, 6, wallH - 3, PAL.woodDeep, { braces: true });
  drawPortal(v, '+y', y1, 28, 1, { halfW: 6, doorH: 22, arch: false, doorCol: PAL.woodDeep, frameCol: PAL.woodLight, steps: false });
  drawPortal(v, '-y', y0, 28, 1, { halfW: 5, doorH: 20, arch: false, doorCol: PAL.woodDeep, frameCol: PAL.woodLight, steps: false, lantern: false });
  for (const face of ['+y', '-y']) {
    const wc = face === '+y' ? y1 : y0;
    for (const ux of [12, 45]) drawArchWindow(v, face, wc, ux, 14, { style: 'casement', glow: false, shutterCol: PAL.woodDeep });
  }
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 : x1;
    for (const uy of [14, 30]) drawArchWindow(v, face, wc, uy, 14, { style: 'casement', glow: true, shutterCol: PAL.woodDeep });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 32, {
    roofStyle: 'gambrel', roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.oak, timberColor: PAL.woodDeep, eave: 3,
  });
  drawDormer(v, '+y', y1, 28, wallH, { wallCol: PAL.oak, roofCol: PAL.brickDark, glow: true, setback: -1 });
  drawHoistBeam(v, '+y', y1, 28, wallH + 14, PAL.woodDeep);
  made.push(save2x('bld_barn_a', v, [29, 23], 'ギャンブレル屋根の大納屋（2x・干し草荷揚げ庇＆全4面木枠）'));
}

// 9) bld_arcane_greenhouse (54x42x56, fp=27x21): 石腰壁＋鍛鉄アーチ温室＋張り出し硝子前室
{
  const W = 54, H = 42, v = new Volume(W, H, 56);
  const x0 = 4, x1 = 49, y0 = 4, y1 = 36;
  fillStoneBox(v, x0, y0, 0, x1, y1, 9, PAL.stoneMid, PAL.stoneCream, PAL.stoneDark);
  v.box(x0, y0, 10, x1, y1, 10, PAL.stoneCream);
  v.box(x0 + 2, y0 + 2, 5, x1 - 2, y1 - 2, 10, PAL.forest);
  for (let x = x0 + 5; x <= x1 - 5; x += 6) {
    v.box(x, y0 + 5, 11, x + 2, y1 - 5, 14, x % 2 === 0 ? PAL.leafSun : PAL.leafMid);
  }
  v.boxEmissive(25, 18, 10, 28, 22, 30, PAL.cyan);
  v.box(26, 19, 31, 27, 21, 35, PAL.goldBright);
  // 張出し硝子前室 (+y)
  v.box(21, y1 + 1, 0, 32, 40, 20, PAL.iron);
  for (let z = 2; z <= 17; z++) for (let x = 23; x <= 30; x++) {
    v.clear(x, 40, z); v.set(x, 39, z, (x === 26 || x === 27) ? PAL.iron : PAL.sky);
  }
  for (let z = 11; z < 55; z++) {
    const k = z - 11, iy = k < 18 ? 0 : Math.floor(((k - 17) / 26) * 15);
    if (y0 + iy > y1 - iy) break;
    for (let x = x0; x <= x1; x++) {
      const rib = (x - x0) % 9 === 0 || x === x0 || x === x1 || z === 28 || k >= 41;
      const col = rib ? PAL.iron : PAL.sky;
      v.set(x, y0 + iy, z, col);
      v.set(x, y1 - iy, z, col);
      if (x === x0 || x === x1 || k >= 39) for (let y = y0 + iy; y <= y1 - iy; y++) v.set(x, y, z, col);
    }
  }
  v.box(x0, 20, 54, x1, 21, 55, PAL.goldBright);
  made.push(save2x('bld_arcane_greenhouse', v, [27, 21], '魔導ガラス温室（2x・張出し硝子前室＆鉄肋骨アーチ）'));
}

// 10) bld_watermill (54x50x76, fp=27x25, 4f): 石1F＋張り出し木骨2F＋全4面鎧戸窓＋原2×大水車
{
  const W = 54, H = 50, wallH = 46, splitZ = 24;
  const x0 = 4, x1 = 40, y0 = 5, y1 = 44; // 右 x=41..53 は水車・水路専用空間
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, 76);
    fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark);
    v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plaster);
    drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
    drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
    drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
    drawPortal(v, '+y', y1 - 1, 22, 2, { halfW: 3, doorH: 16, porch: true, porchRoofCol: PAL.slate });
    for (const ux of [12, 32]) {
      drawArchWindow(v, '+y', y1, ux, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.oak });
      drawArchWindow(v, '-y', y0, ux, splitZ + 4, { style: 'casement', glow: true, shutterCol: PAL.oak });
    }
    drawArchWindow(v, '-x', x0, 16, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.oak });
    drawArchWindow(v, '-x', x0, 34, splitZ + 4, { style: 'double', glow: true, shutterCol: PAL.oak });
    drawArchWindow(v, '-x', x0 + 1, 24, 9, { style: 'casement', glow: true });
    drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, {
      roofStyle: 'gable-y', roofMain: PAL.slate, roofAlt: PAL.slateDeep, wallColor: PAL.plaster, timberColor: PAL.woodDeep, eave: 3,
    });
    drawDormer(v, '-x', x0, 24, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.slateDeep, glow: true, setback: -2 });
    drawHoistBeam(v, '+y', y1, 22, wallH + 4, PAL.oak);
    // 回転水車心棒 (x=40..51)＋ネイティブ2×水車(半径15px)＋水流飛沫
    v.box(40, 22, 14, 51, 26, 18, PAL.woodDeep);
    const wheelAng = f * (Math.PI / 8);
    for (let z = 3; z <= 33; z++) for (let y = 7; y <= 41; y++) {
      const d = Math.hypot(y - 24, z - 16);
      const th = Math.atan2(z - 16, y - 24) - wheelAng;
      const sector = Math.abs((((th / (Math.PI / 4)) % 1) + 1.5) % 1 - 0.5);
      if (d <= 15.2 && d >= 10.2) v.box(45, y, z, 50, y, z, sector < 0.16 ? PAL.woodLight : PAL.woodDark);
      else if (d < 10.2 && d >= 2.5 && sector < 0.14) v.box(46, y, z, 49, y, z, PAL.oak);
    }
    for (let y = 6; y <= 42; y++) for (let x = 43; x <= 53; x++) {
      const flow = ((y - f * 3) % 6 + 6) % 6;
      v.setEmissive(x, y, 0, flow <= 1 ? PAL.white : (flow <= 3 ? PAL.cyan : PAL.sky));
      if (y >= 16 && y <= 34 && (y + x + f) % 3 === 0) v.setEmissive(x, y, 1, flow <= 1 ? PAL.white : PAL.cyan);
    }
    return v;
  });
  made.push(save2x('bld_watermill', frames, [27, 25], '水車製粉所（2x・2F木骨＆ネイティブ2×回転水車4f）'));
}

// === 11) bld_smithy (50x46x72, fp=25x23, 4f): 石鍛冶場＋開放片流れ炉庇＋外大煙突 ===
{
  const W = 50, H = 46, wallH = 34;
  const x0 = 5, x1 = 44, y0 = 4, y1 = 31;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, 72);
    fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 6, PAL.stoneDeep, PAL.iron, PAL.charcoal);
    fillStoneBox(v, x0, y0, 7, x1, y1, wallH - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
    drawStoneQuoins(v, x0, y0, x1, y1, 6, wallH - 2, PAL.stoneMid, PAL.stoneDeep);
    // 前面開放炉床＆木柱片流れ屋根庇 (y=32..42)
    v.box(x0, 32, 0, x1, 42, 2, PAL.stoneMid);
    for (const px of [x0 + 1, x1 - 2]) v.box(px, 39, 3, px + 1, 41, 18, PAL.oak);
    for (let y = 32; y <= 42; y++) {
      const rz = 26 - Math.floor((y - 32) * 0.7);
      v.box(x0 - 1, y, rz, x1 + 1, y, rz + 1, y % 2 === 0 ? PAL.tileDeep : PAL.brickDark);
    }
    drawPortal(v, '+y', y1, 25, 2, { halfW: 3, doorH: 16, frameCol: PAL.stoneMid, steps: false });
    v.box(9, 35, 3, 19, 40, 10, PAL.stoneDeep); // 炉
    const fz = 13 + (f % 2);
    v.box(11, 36, 9, 17, 39, 12, PAL.orange);
    v.boxEmissive(12 + (f % 2), 36, 11, 15 + (f % 2), 38, fz, PAL.lanternGlow);
    if (f === 1 || f === 3) v.setEmissive(13, 38, fz, PAL.white);
    v.box(30, 36, 3, 36, 40, 9, PAL.steel); // 金床
    // 全面鉄格子付き炉灯り窓
    for (const face of ['-x', '+x', '-y']) {
      const wc = face === '-x' ? x0 : (face === '+x' ? x1 : y0);
      drawArchWindow(v, face, wc, face === '-y' ? 24 : 18, 12, { style: 'casement', glow: true, frameCol: PAL.iron, mullionCol: PAL.iron });
    }
    drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 24, {
      roofStyle: 'gable-x', roofMain: PAL.tileDeep, roofAlt: PAL.iron, wallColor: PAL.stoneDark, timberColor: PAL.woodDeep, eave: 3,
    });
    drawChimneyBreast(v, '-x', x0, 14, 0, 68, { colMain: PAL.stoneDeep, colTrim: PAL.iron, colDeep: PAL.charcoal, halfW: 3, shoulderZ: 34 });
    v.boxEmissive(2, 13, 69, 4, 15, 71, (f % 2 === 0) ? PAL.orange : PAL.lanternGlow);
    return v;
  });
  made.push(save2x('bld_smithy', frames, [25, 23], '石造鍛冶場（2x・開放炉庇＆外大煙突・4f）'));
}

// === 12) bld_dyeworks (50x46x64, fp=25x23): 半木骨工房＋染色槽＆色布干し場 ===
{
  const W = 50, H = 46, wallH = 34, v = new Volume(W, H, 64);
  const x0 = 4, x1 = 29, y0 = 5, y1 = 40;
  fillStoneBox(v, x0, y0, 0, x1, y1, 5, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, 6, x1, y1, wallH - 1, PAL.plasterLight);
  drawTimberFrame2x(v, x0, y0, x1, y1, 6, wallH - 3, PAL.woodDeep, { braces: true });
  drawPortal(v, '+y', y1, 16, 2, { halfW: 3, doorH: 16, porch: true, porchRoofCol: PAL.terracotta });
  drawArchWindow(v, '+y', y1, 16, 22, { style: 'double', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-y', y0, 16, 22, { style: 'double', glow: false, shutterCol: PAL.oak });
  drawArchWindow(v, '-x', x0, 15, 16, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-x', x0, 30, 16, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 28, {
    roofStyle: 'gable-y', roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, eave: 3,
  });
  drawDormer(v, '-x', x0, 22, wallH, { wallCol: PAL.plasterLight, roofCol: PAL.brickDark, glow: true, setback: -2 });
  // 右染色中庭(x=31..46)＋木骨吹き抜け屋根ラック＋色彩反物
  v.box(31, 6, 0, 46, 39, 2, PAL.stoneMid);
  v.box(33, 9, 3, 44, 19, 8, PAL.woodDeep); v.box(35, 11, 8, 42, 17, 8, PAL.blue);
  v.box(33, 25, 3, 44, 35, 8, PAL.woodDeep); v.box(35, 27, 8, 42, 33, 8, PAL.crimson);
  for (const [rx, ry] of [[33, 7], [44, 7], [33, 37], [44, 37]]) v.box(rx, ry, 2, rx + 1, ry + 1, 34, PAL.oak);
  v.box(33, 7, 33, 45, 38, 35, PAL.oak);
  v.box(35, 11, 18, 37, 16, 33, PAL.burgundy);
  v.box(39, 20, 18, 41, 25, 33, PAL.clothNavy);
  v.box(37, 29, 20, 39, 34, 33, PAL.goldBright);
  made.push(save2x('bld_dyeworks', v, [25, 23], '染色工房（2x・半木骨母屋＆反物物干し枠）'));
}

// === 13) bld_tannery (46x42x56, fp=23x21): 2F 通気ルーバー乾燥ロフト付き鞣革工房 ===
{
  const W = 46, H = 42, wallH = 32, v = new Volume(W, H, 56);
  const x0 = 4, x1 = 28, y0 = 5, y1 = 36;
  fillStoneBox(v, x0, y0, 0, x1, y1, 8, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  v.box(x0, y0, 9, x1, y1, wallH - 1, PAL.oak);
  drawTimberFrame2x(v, x0, y0, x1, y1, 9, wallH - 3, PAL.woodDeep, { braces: true });
  drawPortal(v, '+y', y1, 16, 2, { halfW: 3, doorH: 15, arch: false, frameCol: PAL.woodDeep });
  // 2F 通気ガラリ板窓 (4面)
  for (const face of ['+y', '-y', '-x']) {
    const wc = face === '+y' ? y1 : (face === '-y' ? y0 : x0);
    drawArchWindow(v, face, wc, face === '-x' ? 20 : 16, 20, { style: 'double', glow: true, shutterCol: PAL.woodDeep });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 23, {
    roofStyle: 'gable-y', roofMain: PAL.woodDeep, roofAlt: PAL.bark, wallColor: PAL.oak, timberColor: PAL.woodDeep, eave: 3,
  });
  // 右皮なめし槽＋革張り出しフレーム
  v.box(30, 6, 0, 42, 35, 2, PAL.stoneDeep);
  v.box(32, 8, 3, 40, 18, 8, PAL.stoneMid); v.box(34, 10, 8, 38, 16, 8, PAL.plasterWarm);
  v.box(32, 23, 2, 40, 24, 26, PAL.woodDeep);
  v.box(34, 22, 8, 38, 25, 22, PAL.leather);
  made.push(save2x('bld_tannery', v, [23, 21], '鞣革工房（2x・乾燥ロフト＆革張り木枠）'));
}

// === 14) bld_warehouse_dock (62x50x80, fp=31x25): ハンザ同盟式川港大倉庫（控え壁×3＋張出し荷揚げクレーン庇） ===
{
  const W = 62, H = 50, wallH = 48, v = new Volume(W, H, 80);
  const x0 = 5, x1 = 56, y0 = 5, y1 = 42;
  fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 6, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, x0, y0, 7, x1, y1, wallH - 1, PAL.stoneMid, PAL.brickDark, PAL.stoneDark);
  drawStoneQuoins(v, x0, y0, x1, y1, 6, wallH - 3, PAL.stoneCream, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 26, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  drawPortal(v, '+y', y1, 30, 2, { halfW: 5, doorH: 20, arch: true, doorCol: PAL.oak, frameCol: PAL.stoneCream });
  drawPortal(v, '-y', y0, 30, 2, { halfW: 4, doorH: 18, arch: true, doorCol: PAL.oak, frameCol: PAL.stoneCream, lantern: false });
  for (const face of ['+y', '-y']) {
    const wc = face === '+y' ? y1 : y0;
    for (const u of [14, 46]) {
      drawArchWindow(v, face, wc, u, 9, { style: 'casement', glow: false, shutterCol: PAL.woodDeep });
      drawArchWindow(v, face, wc, u, 30, { style: 'double', glow: true, shutterCol: PAL.woodDeep });
    }
    drawButtress(v, face, wc, 21, 0, 44, { colMain: PAL.stoneCream, colDark: PAL.stoneDark });
    drawButtress(v, face, wc, 40, 0, 44, { colMain: PAL.stoneCream, colDark: PAL.stoneDark });
  }
  for (const face of ['-x', '+x']) {
    const wc = face === '-x' ? x0 : x1;
    drawButtress(v, face, wc, 23, 0, 44, { colMain: PAL.stoneCream, colDark: PAL.stoneDark });
    for (const uy of [14, 33]) {
      drawArchWindow(v, face, wc, uy, 9, { style: 'casement', glow: true, shutterCol: PAL.woodDeep });
      drawArchWindow(v, face, wc, uy, 30, { style: 'casement', glow: true, shutterCol: PAL.woodDeep });
    }
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 30, {
    roofStyle: 'gable-x', roofMain: PAL.slate, roofAlt: PAL.slateDeep, wallColor: PAL.stoneMid, timberColor: PAL.woodDeep, eave: 3,
  });
  // +y 荷揚げ切妻クレーン庇＋滑車＋吊り荷木箱
  drawDormer(v, '+y', y1, 30, wallH - 12, { wallCol: PAL.oak, roofCol: PAL.slateDeep, glow: false, setback: -1 });
  drawHoistBeam(v, '+y', y1, 30, wallH + 6, PAL.woodDeep);
  v.box(28, y1 + 3, 28, 32, y1 + 7, 33, PAL.oak); // 吊り荷木箱
  made.push(save2x('bld_warehouse_dock', v, [31, 25], '河港大型倉庫（2x・張出しクレーン庇＆吊り荷箱＆控え壁）'));
}

// === 15) bld_mana_refinery (54x54x96, fp=27x27, 4f): 鉄帯補強控え壁＋銅導管＋パルス凝縮塔 ===
{
  const W = 54, H = 54, wallH = 44;
  const x0 = 5, x1 = 48, y0 = 5, y1 = 48;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, 96);
    fillStoneBox(v, x0 - 1, y0 - 1, 0, x1 + 1, y1 + 1, 6, PAL.stoneDeep, PAL.iron, PAL.charcoal);
    fillStoneBox(v, x0, y0, 7, x1, y1, wallH - 1, PAL.tileDeep, PAL.brickDark, PAL.iron);
    drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.iron, PAL.bronze, false);
    drawPortal(v, '+y', y1, 26, 2, { halfW: 4, doorH: 18, arch: true, doorCol: PAL.iron, frameCol: PAL.stoneCream });
    for (const face of ['+y', '-y', '+x', '-x']) {
      const wc = (face === '+y' || face === '+x') ? 48 : 5;
      drawButtress(v, face, wc, 10, 0, 40, { colMain: PAL.iron, colDark: PAL.stoneDeep });
      drawButtress(v, face, wc, 43, 0, 40, { colMain: PAL.iron, colDark: PAL.stoneDeep });
      if (face !== '+y') drawArchWindow(v, face, wc, 26, 16, { style: 'arcane', h: 14 });
      drawArchWindow(v, face, wc, 16, 24, { style: 'arcane', h: 12 });
      drawArchWindow(v, face, wc, 37, 24, { style: 'arcane', h: 12 });
    }
    // 銅製外配管
    v.box(x0 - 2, 24, 6, x0 - 1, 28, 44, PAL.copper);
    v.box(x1 + 1, 24, 6, x1 + 2, 28, 44, PAL.copper);
    drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 16, {
      roofStyle: 'hip', roofMain: PAL.iron, roofAlt: PAL.slateDeep, wallColor: PAL.tileDeep, timberColor: PAL.bronze, eave: 3,
    });
    v.box(17, 17, 56, 36, 36, 63, PAL.stoneCream);
    v.boxEmissive(19, 19, 64, 34, 34, 84, PAL.cyan);
    const pulseZ = 64 + f * 5;
    v.boxEmissive(19, 19, pulseZ, 34, 34, Math.min(84, pulseZ + 3), PAL.white);
    for (const [cx, cy] of [[18, 18], [35, 18], [18, 35], [35, 35]]) v.box(cx, cy, 62, cx + 1, cy + 1, 86, PAL.goldBright);
    v.box(18, 18, 86, 35, 35, 89, PAL.iron);
    v.boxEmissive(24, 24, 90, 29, 29, 95, f % 2 === 0 ? PAL.gold : PAL.lanternGlow);
    return v;
  });
  made.push(save2x('bld_mana_refinery', frames, [27, 27], '魔石精錬工房（2x・銅導管＆控え壁＆4f凝縮塔）'));
}

// === 16) bld_arcane_siphon (46x46x112, fp=23x23, 4f): 八角大理石魔導揚水塔＋張出し石ギャラリー ===
{
  const W = 46, H = 46, c = 22.5;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, 112);
    for (let z = 0; z < 69; z++) {
      const r = z < 8 ? 17.5 : (z >= 64 ? 16.5 : 14.5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) v.set(x, y, z, z < 8 ? PAL.stoneDeep : (z % 20 === 0 ? PAL.stoneCream : PAL.marble));
      }
    }
    // 4斜め控え壁フィン＋アーチ大扉＋4面ランセット魔導窓
    for (const [bx, by] of [[10, 10], [35, 10], [10, 35], [35, 35]]) {
      v.box(bx - 1, by - 1, 0, bx + 1, by + 1, 56, PAL.stoneCream);
    }
    drawPortal(v, '+y', 36, 22, 2, { halfW: 3, doorH: 17, frameCol: PAL.goldBright, doorCol: PAL.blueDeep });
    for (const face of ['+y', '-y', '+x', '-x']) {
      const wc = (face === '+y' || face === '+x') ? 36 : 9;
      drawArchWindow(v, face, wc, 22, 34, { style: 'arcane', h: 14, hoodCol: PAL.goldBright });
    }
    // 張出し石ギャラリー手すり (z=69..72)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 16.5 && d >= 14.2 && (Math.round(x + y) % 2 === 0)) v.box(x, y, 69, x, y, 72, PAL.marble);
    }
    const pulseZ = 70 + f * 6;
    for (let z = 70; z <= 93; z++) {
      const isPulse = z >= pulseZ && z <= pulseZ + 3;
      for (let y = 8; y <= 37; y++) for (let x = 8; x <= 37; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d <= 12.2) v.setEmissive(x, y, z, isPulse ? PAL.white : (d <= 6.5 ? PAL.cyan : PAL.sky));
      }
      for (const [px, py] of [[12, 12], [33, 12], [12, 33], [33, 33]]) v.box(px, py, z, px + 1, py + 1, z, PAL.goldBright);
    }
    for (let k = 0; k < 18; k++) {
      const z = 94 + k, r = Math.max(1.0, 14.8 * (1 - k / 17));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) v.set(x, y, z, k >= 15 ? ((f % 2 === 1 && k === 17) ? PAL.cyan : PAL.goldBright) : PAL.blue);
      }
    }
    return v;
  });
  made.push(save2x('bld_arcane_siphon', frames, [23, 23], '魔導揚水塔（2x・控え壁＆ギャラリー＆4f）'));
}

// === 17) bld_aqueduct_arch (58x22x52, fp=29x11, 4f): ネイティブ 2× 迫石半円アーチ＋張り出しコーニス水路 ===
{
  const W = 58, H = 22, Z = 52;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    // 左/右橋脚＋半円アーチ (X=0..57 フラッシュ接続、橋脚/迫石/コーニスが +-y に張り出し)
    for (let z = 0; z < 34; z++) {
      const archStart = 12;
      const t = Math.max(0, (z - archStart) / (33 - archStart));
      const halfSpan = 20 * (1 - Math.sqrt(Math.max(0, 1 - t * t))); // 真円半円アーチ開孔曲線
      const pierReach = z < archStart ? 9 : Math.round(28 - halfSpan);
      const yBase = z <= 5 ? 2 : 3;
      const yTop = z <= 5 ? 19 : 18;
      for (let x = 0; x <= Math.min(28, pierReach); x++) {
        const isExtrudedBand = z === 21 || z === 22;
        const ya = isExtrudedBand ? 2 : yBase;
        const yb = isExtrudedBand ? 19 : yTop;
        for (let y = ya; y <= yb; y++) {
          const isRim = z >= archStart && x >= pierReach - 2 && (y <= yBase + 1 || y >= yTop - 1);
          const col = z <= 5 ? PAL.stoneDeep : (isExtrudedBand ? PAL.marble : (isRim ? PAL.stoneCream : PAL.stoneMid));
          v.set(x, y, z, col);
          v.set(W - 1 - x, y, z, col);
        }
      }
    }
    v.box(27, 2, 32, 30, 19, 36, PAL.marble); // 要石キーストーン
    v.box(0, 2, 34, 57, 19, 41, PAL.stoneMid);
    v.box(0, 1, 40, 57, 20, 41, PAL.stoneCream); // コーニス張り出し帯
    v.box(0, 2, 42, 57, 4, 51, PAL.stoneCream);
    v.box(0, 17, 42, 57, 19, 51, PAL.stoneCream);
    v.box(0, 5, 42, 57, 16, 48, PAL.sky);
    for (let x = 0; x < W; x++) {
      const wave = ((x - f * 4) % 12 + 12) % 12;
      if (wave <= 2) v.boxEmissive(x, 7, 49, x, 14, 50, wave === 0 ? PAL.white : PAL.cyan);
      else if (wave <= 4) v.boxEmissive(x, 6, 49, x, 15, 49, PAL.cyan);
    }
    return v;
  });
  made.push(save2x('bld_aqueduct_arch', frames, [29, 11], '魔導水道橋（2x・迫石アーチ＆水流4f）'));
}

console.log(`generated ${made.length} industry/agriculture/arcane buildings (all native 2x, 0 upscaled):`);
for (const m of made) console.log(`  ${m.id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount} (fp=${m.footprint.join('x')}, d=${m.density})`);
