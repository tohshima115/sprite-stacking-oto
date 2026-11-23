// ネイティブ 2× 建築ディテール・パーツ集（中世後期〜初期ルネサンス欧州建築＋魔導文明）
// すべての窓・開口は 2 ボクセル奥へ彫り込み（背面にソリッド壁を残し貫通穴ゼロ）、
// 窓台・ペディメント・庇・出窓・バルコニー・控え壁・煙突・軒は外側へ +2〜+4 ボクセル張り出させる。
import { PAL } from './palette.mjs';

export function faceVec(face) {
  switch (face) {
    case '+y': return { nx: 0, ny: 1, tx: 1, ty: 0 };
    case '-y': return { nx: 0, ny: -1, tx: 1, ty: 0 };
    case '+x': return { nx: 1, ny: 0, tx: 0, ty: 1 };
    case '-x': return { nx: -1, ny: 0, tx: 0, ty: 1 };
    default: throw new Error(`unknown face: ${face}`);
  }
}

export function pt(face, wc, u, out, z) {
  const { nx, ny } = faceVec(face);
  if (nx !== 0) return [Math.round(wc + nx * out), Math.round(u), Math.round(z)];
  return [Math.round(u), Math.round(wc + ny * out), Math.round(z)];
}

export function setF(v, face, wc, u, out, z, col) {
  const [x, y, zz] = pt(face, wc, u, out, z);
  v.set(x, y, zz, col);
}

export function setEmF(v, face, wc, u, out, z, col) {
  const [x, y, zz] = pt(face, wc, u, out, z);
  v.setEmissive(x, y, zz, col);
}

export function clearF(v, face, wc, u, out, z) {
  const [x, y, zz] = pt(face, wc, u, out, z);
  v.clear(x, y, zz);
}

function toAabb(v, face, wc, u0, u1, out0, out1, z0, z1) {
  const { nx, ny } = faceVec(face);
  const ua = Math.round(Math.min(u0, u1)), ub = Math.round(Math.max(u0, u1));
  const oa = Math.round(Math.min(out0, out1)), ob = Math.round(Math.max(out0, out1));
  const za = Math.max(0, Math.round(Math.min(z0, z1)));
  const zb = Math.min(v.d - 1, Math.round(Math.max(z0, z1)));
  if (nx !== 0) {
    const xa = wc + nx * oa, xb = wc + nx * ob;
    return [
      Math.max(0, Math.min(xa, xb)),
      Math.max(0, ua),
      za,
      Math.min(v.w - 1, Math.max(xa, xb)),
      Math.min(v.h - 1, ub),
      zb,
    ];
  }
  const ya = wc + ny * oa, yb = wc + ny * ob;
  return [
    Math.max(0, ua),
    Math.max(0, Math.min(ya, yb)),
    za,
    Math.min(v.w - 1, ub),
    Math.min(v.h - 1, Math.max(ya, yb)),
    zb,
  ];
}

export function boxF(v, face, wc, u0, u1, out0, out1, z0, z1, col, emissive = false) {
  const [x0, y0, za, x1, y1, zb] = toAabb(v, face, wc, u0, u1, out0, out1, z0, z1);
  if (x0 > x1 || y0 > y1 || za > zb) return;
  if (emissive) v.boxEmissive(x0, y0, za, x1, y1, zb, col);
  else v.box(x0, y0, za, x1, y1, zb, col);
}

export function clearFBox(v, face, wc, u0, u1, out0, out1, z0, z1) {
  const [x0, y0, za, x1, y1, zb] = toAabb(v, face, wc, u0, u1, out0, out1, z0, z1);
  if (x0 > x1 || y0 > y1 || za > zb) return;
  for (let z = za; z <= zb; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v.clear(x, y, z);
}

/** 切石積（Ashlar）ソリッドボックス。水平目地と千鳥石ブロック表現を含む */
export function fillStoneBox(v, x0, y0, z0, x1, y1, z1, mainCol, altCol, deepCol) {
  const za = Math.max(0, z0), zb = Math.min(v.d - 1, z1);
  const xa = Math.max(0, x0), xb = Math.min(v.w - 1, x1);
  const ya = Math.max(0, y0), yb = Math.min(v.h - 1, y1);
  for (let z = za; z <= zb; z++) {
    const course = Math.floor(z / 4);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const shell = x === xa || x === xb || y === ya || y === yb;
      const seamZ = shell && (z % 4 === 0);
      const blockIdx = Math.floor((x + y + (course % 2) * 3) / 5);
      const col = seamZ ? deepCol : ((blockIdx * 7 + course) % 4 === 0 ? altCol : mainCol);
      v.set(x, y, z, col);
    }
  }
}

/** 四隅へ +1px 張り出す交互長短の石隅石（クオイン / Quoins） */
export function drawStoneQuoins(v, x0, y0, x1, y1, z0, z1, colA = PAL.stoneCream, colB = PAL.stoneLight) {
  const za = Math.max(0, z0), zb = Math.min(v.d - 1, z1);
  for (let z = za; z <= zb; z++) {
    const band = Math.floor((z - za) / 4);
    const isLong = (band % 2) === 0;
    const col = isLong ? colA : colB;
    const leg = isLong ? 3 : 2;
    for (const [cx, sx] of [[x0, -1], [x1, 1]]) {
      for (const [cy, sy] of [[y0, -1], [y1, 1]]) {
        // 角の面取りL字ラップ（X方向 leg、Y方向 leg、外側 +1px 突出）
        const ox = cx + sx;
        const oy = cy + sy;
        const xSpanA = Math.max(0, Math.min(cx, cx - sx * leg));
        const xSpanB = Math.min(v.w - 1, Math.max(cx, cx - sx * leg));
        const ySpanA = Math.max(0, Math.min(cy, cy - sy * leg));
        const ySpanB = Math.min(v.h - 1, Math.max(cy, cy - sy * leg));
        if (oy >= 0 && oy < v.h) v.box(xSpanA, oy, z, xSpanB, oy, z, col);
        if (ox >= 0 && ox < v.w) v.box(ox, ySpanA, z, ox, ySpanB, z, col);
        v.box(Math.max(0, Math.min(cx, cx - sx)), cy, z, Math.min(v.w - 1, Math.max(cx, cx - sx)), cy, z, col);
        v.box(cx, Math.max(0, Math.min(cy, cy - sy)), z, cx, Math.min(v.h - 1, Math.max(cy, cy - sy)), z, col);
      }
    }
  }
}

/** +1px 張り出しの水平胴蛇腹（Stringcourse / Belt course） */
export function drawStringcourse(v, x0, y0, x1, y1, z, col = PAL.stoneCream) {
  if (z < 0 || z >= v.d) return;
  const xa = Math.max(0, x0 - 1), xb = Math.min(v.w - 1, x1 + 1);
  const ya = Math.max(0, y0 - 1), yb = Math.min(v.h - 1, y1 + 1);
  v.box(xa, ya, z, xb, Math.min(v.h - 1, y0), z, col);
  v.box(xa, Math.max(0, y1), z, xb, yb, z, col);
  v.box(xa, ya, z, Math.min(v.w - 1, x0), yb, z, col);
  v.box(Math.max(0, x1), ya, z, xb, yb, z, col);
}

/** 軒下・屋上へ段付きで大きく張り出すクラシック石コーニス（歯飾り Dentils 付き） */
export function drawCornice(v, x0, y0, x1, y1, z, colMain = PAL.stoneCream, colLight = PAL.marble, dentils = true) {
  // 段 0 (z): 1px 張り出し歯飾り
  if (z >= 0 && z < v.d) {
    const xa = Math.max(0, x0 - 1), xb = Math.min(v.w - 1, x1 + 1);
    const ya = Math.max(0, y0 - 1), yb = Math.min(v.h - 1, y1 + 1);
    for (let x = xa; x <= xb; x++) {
      if (!dentils || x % 3 !== 0) {
        v.set(x, ya, z, colMain);
        v.set(x, yb, z, colMain);
      }
    }
    for (let y = ya; y <= yb; y++) {
      if (!dentils || y % 3 !== 0) {
        v.set(xa, y, z, colMain);
        v.set(xb, y, z, colMain);
      }
    }
  }
  // 段 1 (z+1): +2px 連続繰り形
  if (z + 1 >= 0 && z + 1 < v.d) {
    const xa = Math.max(0, x0 - 2), xb = Math.min(v.w - 1, x1 + 2);
    const ya = Math.max(0, y0 - 2), yb = Math.min(v.h - 1, y1 + 2);
    v.box(xa, ya, z + 1, xb, Math.min(v.h - 1, y0), z + 1, colMain);
    v.box(xa, Math.max(0, y1), z + 1, xb, yb, z + 1, colMain);
    v.box(xa, ya, z + 1, Math.min(v.w - 1, x0), yb, z + 1, colMain);
    v.box(Math.max(0, x1), ya, z + 1, xb, yb, z + 1, colMain);
  }
  // 段 2 (z+2): +3px 最上冠帯
  if (z + 2 >= 0 && z + 2 < v.d) {
    const xa = Math.max(0, x0 - 3), xb = Math.min(v.w - 1, x1 + 3);
    const ya = Math.max(0, y0 - 3), yb = Math.min(v.h - 1, y1 + 3);
    v.box(xa, ya, z + 2, xb, Math.min(v.h - 1, y0), z + 2, colLight);
    v.box(xa, Math.max(0, y1), z + 2, xb, yb, z + 2, colLight);
    v.box(xa, ya, z + 2, Math.min(v.w - 1, x0), yb, z + 2, colLight);
    v.box(Math.max(0, x1), ya, z + 2, xb, yb, z + 2, colLight);
  }
}

/** 4面対応・立体木骨ハーフティンバー（縦柱＋張り出し水平桁＋コーナー斜め筋交い） */
export function drawTimberFrame2x(v, x0, y0, x1, y1, z0, z1, timberCol = PAL.woodDeep, opts = {}) {
  const { braces = true, midStuds = true, topPlateOut = true, midZ = null } = opts;
  const mx = Math.floor((x0 + x1) / 2);
  const my = Math.floor((y0 + y1) / 2);
  const spanX = x1 - x0;
  const spanY = y1 - y0;

  for (let z = z0; z <= z1; z++) {
    // 四隅柱
    for (const cx of [x0, x1]) for (const cy of [y0, y1]) v.set(cx, cy, z, timberCol);
    v.set(x0 + 1, y0, z, timberCol); v.set(x0, y0 + 1, z, timberCol);
    v.set(x1 - 1, y0, z, timberCol); v.set(x1, y0 + 1, z, timberCol);
    v.set(x0 + 1, y1, z, timberCol); v.set(x0, y1 - 1, z, timberCol);
    v.set(x1 - 1, y1, z, timberCol); v.set(x1, y1 - 1, z, timberCol);

    // 4面の中間柱（壁幅に応じて等間隔配置）
    if (midStuds) {
      const xStuds = spanX >= 36 ? [x0 + Math.floor(spanX * 0.33), x1 - Math.floor(spanX * 0.33)] : [mx];
      for (const sx of xStuds) { v.set(sx, y0, z, timberCol); v.set(sx, y1, z, timberCol); }
      const yStuds = spanY >= 36 ? [y0 + Math.floor(spanY * 0.33), y1 - Math.floor(spanY * 0.33)] : [my];
      for (const sy of yStuds) { v.set(x0, sy, z, timberCol); v.set(x1, sy, z, timberCol); }
    }
  }

  // 上下の胴差水平梁（+1px 張り出しで階境を立体化）
  drawStringcourse(v, x0, y0, x1, y1, z0, timberCol);
  if (z0 + 1 <= z1) drawStringcourse(v, x0, y0, x1, y1, z0 + 1, timberCol);
  if (topPlateOut) drawStringcourse(v, x0, y0, x1, y1, z1, timberCol);
  if (midZ !== null && midZ > z0 + 3 && midZ < z1 - 3) {
    drawStringcourse(v, x0, y0, x1, y1, midZ, timberCol);
  }

  // 全4面のコーナー斜め方杖・筋交い
  if (braces && z1 - z0 >= 10) {
    const bLen = Math.min(5, Math.floor((z1 - z0) * 0.35));
    for (let d = 1; d <= bLen; d++) {
      const bz = z0 + 2 + d;
      if (bz >= z1 - 1) break;
      v.set(x0 + d, y1, bz, timberCol); v.set(x1 - d, y1, bz, timberCol);
      v.set(x0 + d, y0, bz, timberCol); v.set(x1 - d, y0, bz, timberCol);
      v.set(x0, y0 + d, bz, timberCol); v.set(x0, y1 - d, bz, timberCol);
      v.set(x1, y0 + d, bz, timberCol); v.set(x1, y1 - d, bz, timberCol);
    }
  }
}

/** 2F 張り出し（ジェット構造 Jettying）を支える梁端・持ち送りコーベルを4面に生成 */
export function drawJettyCorbels(v, x0, y0, x1, y1, zJetty, pad = 2, timberCol = PAL.woodDeep) {
  if (pad <= 0 || zJetty < 3) return;
  for (let x = x0 + 2; x <= x1 - 2; x += 4) {
    v.box(x, Math.max(0, y0), zJetty - 1, x + 1, y0 + pad, zJetty - 1, timberCol);
    v.box(x, Math.max(0, y0 + 1), zJetty - 2, x + 1, y0 + pad, zJetty - 2, timberCol);
    v.box(x, y1 - pad, zJetty - 1, x + 1, Math.min(v.h - 1, y1), zJetty - 1, timberCol);
    v.box(x, y1 - pad, zJetty - 2, x + 1, Math.min(v.h - 1, y1 - 1), zJetty - 2, timberCol);
  }
  for (let y = y0 + 2; y <= y1 - 2; y += 4) {
    v.box(Math.max(0, x0), y, zJetty - 1, x0 + pad, y + 1, zJetty - 1, timberCol);
    v.box(Math.max(0, x0 + 1), y, zJetty - 2, x0 + pad, y + 1, zJetty - 2, timberCol);
    v.box(x1 - pad, y, zJetty - 1, Math.min(v.w - 1, x1), y + 1, zJetty - 1, timberCol);
    v.box(x1 - pad, y, zJetty - 2, Math.min(v.w - 1, x1 - 1), y + 1, zJetty - 2, timberCol);
  }
}

/**
 * 立体窓ジェネレータ（すべて 2 ボクセル凹み + 外側へ +1〜+2px 張り出し）
 * style: 'casement' | 'double' | 'pediment' | 'lancet' | 'arcane' | 'slum'
 */
export function drawArchWindow(v, face, wc, uc, zb, opts = {}) {
  const {
    style = 'casement',
    glow = false,
    shutterCol = null,
    flowerBox = false,
    frameCol = PAL.oak,
    sillCol = PAL.stoneCream,
    hoodCol = null,
    glassCol = null,
    mullionCol = PAL.woodPale,
    juliet = false,
    h: customH = null,
  } = opts;

  if (zb < 2 || zb >= v.d - 5) return;

  if (style === 'slum') {
    // 貧民街の粗末な張り出し木枠・板張り小窓
    clearFBox(v, face, wc, uc - 1, uc + 1, -1, 0, zb + 1, zb + 3);
    boxF(v, face, wc, uc - 1, uc + 1, -2, -2, zb + 1, zb + 3, glow ? PAL.lanternGlow : PAL.slateDeep, glow);
    setF(v, face, wc, uc, -1, zb + 2, PAL.woodDark);
    boxF(v, face, wc, uc - 2, uc + 2, 0, 1, zb, zb, PAL.woodDeep);
    boxF(v, face, wc, uc - 2, uc + 2, 0, 1, zb + 4, zb + 4, PAL.oak);
    if (shutterCol) boxF(v, face, wc, uc + 2, uc + 2, 1, 1, zb + 1, zb + 3, shutterCol);
    return;
  }

  if (style === 'lancet' || style === 'arcane') {
    const winH = customH ?? (style === 'lancet' ? 12 : 10);
    if (zb + winH + 2 >= v.d) return;
    const isArcane = style === 'arcane';
    const hood = hoodCol ?? (isArcane ? PAL.bronze : PAL.stoneCream);
    const sill = sillCol ?? PAL.stoneCream;

    // 2px 彫り込み + 尖頭アーチステンドグラス / 魔導発光ガラス (out = -2)
    for (let dz = 1; dz <= winH - 2; dz++) {
      const taper = dz > winH - 5 ? Math.floor((dz - (winH - 5) + 1) / 2) : 0;
      const hw = Math.max(0, 1 - taper);
      clearFBox(v, face, wc, uc - hw, uc + hw, -1, 0, zb + dz, zb + dz);
      for (let du = -hw; du <= hw; du++) {
        const col = isArcane
          ? (du === 0 && dz % 3 === 0 ? PAL.white : (dz % 2 === 0 ? PAL.cyan : PAL.sky))
          : (glassCol ?? (glow ? ((du === 0 && dz > winH - 6) ? PAL.goldBright : (dz % 2 === 0 ? PAL.lanternGlow : PAL.cyan)) : (du === 0 ? PAL.cyan : PAL.sky)));
        setEmF(v, face, wc, uc + du, -2, zb + dz, col);
      }
      if (dz <= winH - 5 && dz % 4 === 0) {
        setF(v, face, wc, uc, -1, zb + dz, isArcane ? PAL.goldBright : PAL.stoneCream);
      }
    }
    // 縦石/金トレーサリー (out = -1)
    boxF(v, face, wc, uc, uc, -1, -1, zb + 1, zb + winH - 5, isArcane ? PAL.goldBright : PAL.stoneCream);

    // 外へ +1..+2px 張り出す窓枠柱・尖頭ドリップモールド庇・水切り窓台
    boxF(v, face, wc, uc - 2, uc - 2, 0, 1, zb + 1, zb + winH - 4, PAL.stoneMid);
    boxF(v, face, wc, uc + 2, uc + 2, 0, 1, zb + 1, zb + winH - 4, PAL.stoneMid);
    boxF(v, face, wc, uc - 2, uc + 2, 0, 2, zb, zb, sill);
    setF(v, face, wc, uc - 1, 1, zb - 1, PAL.stoneDark);
    setF(v, face, wc, uc + 1, 1, zb - 1, PAL.stoneDark);
    // 尖頭アーチ庇 (out = +1..+2)
    boxF(v, face, wc, uc - 2, uc + 2, 1, 2, zb + winH - 3, zb + winH - 2, hood);
    boxF(v, face, wc, uc - 1, uc + 1, 1, 2, zb + winH - 1, zb + winH - 1, hood);
    boxF(v, face, wc, uc, uc, 1, 2, zb + winH, zb + winH + 1, isArcane ? PAL.goldBright : hood);
    if (isArcane) setEmF(v, face, wc, uc, 2, zb + 1, PAL.cyan);
    return;
  }

  if (style === 'pediment') {
    const winH = customH ?? 10;
    if (zb + winH + 3 >= v.d) return;
    const hCol = hoodCol ?? sillCol;
    // 2px 彫り込み (u = -2..+2, 5px 幅) + ガラス + 石/木格子
    clearFBox(v, face, wc, uc - 2, uc + 2, -1, 0, zb + 1, zb + winH - 2);
    for (let dz = 1; dz <= winH - 2; dz++) {
      for (let du = -2; du <= 2; du++) {
        if (du === 0 || dz === Math.floor(winH / 2)) {
          setF(v, face, wc, uc + du, -1, zb + dz, mullionCol);
          setF(v, face, wc, uc + du, -2, zb + dz, PAL.woodDeep);
        } else {
          const gc = glow ? ((dz + du) % 2 === 0 ? PAL.lanternGlow : PAL.yellowBright) : ((dz % 2 === 0) ? PAL.sky : PAL.slateLight);
          if (glow) setEmF(v, face, wc, uc + du, -2, zb + dz, gc);
          else setF(v, face, wc, uc + du, -2, zb + dz, gc);
        }
      }
    }
    // 左右付柱ピラスター (out = +1)
    boxF(v, face, wc, uc - 3, uc - 3, 0, 1, zb + 1, zb + winH - 2, PAL.marble);
    boxF(v, face, wc, uc + 3, uc + 3, 0, 1, zb + 1, zb + winH - 2, PAL.marble);
    // 重厚な +2px 張り出し窓台 + 持ち送りコンソール 2 基
    boxF(v, face, wc, uc - 4, uc + 4, 0, 2, zb, zb, sillCol);
    boxF(v, face, wc, uc - 3, uc - 2, 1, 2, zb - 2, zb - 1, PAL.stoneMid);
    boxF(v, face, wc, uc + 2, uc + 3, 1, 2, zb - 2, zb - 1, PAL.stoneMid);
    // 段付き三角ペディメント (+2px 張り出し)
    boxF(v, face, wc, uc - 4, uc + 4, 0, 2, zb + winH - 1, zb + winH - 1, hCol);
    boxF(v, face, wc, uc - 3, uc + 3, 1, 2, zb + winH, zb + winH, PAL.marble);
    boxF(v, face, wc, uc - 1, uc + 1, 1, 2, zb + winH + 1, zb + winH + 1, hCol);
    setF(v, face, wc, uc, 2, zb + winH + 2, PAL.goldBright);
    // ジュリエット鍛鉄手すり（任意）
    if (juliet) {
      for (let du = -2; du <= 2; du++) {
        if (du % 2 === 0) boxF(v, face, wc, uc + du, uc + du, 2, 2, zb + 1, zb + 3, PAL.iron);
      }
      boxF(v, face, wc, uc - 3, uc + 3, 2, 2, zb + 3, zb + 3, PAL.iron);
      setF(v, face, wc, uc - 3, 2, zb + 4, PAL.goldBright);
      setF(v, face, wc, uc + 3, 2, zb + 4, PAL.goldBright);
    }
    return;
  }

  if (style === 'double') {
    const winH = customH ?? 7;
    if (zb + winH + 2 >= v.d) return;
    const hCol = hoodCol ?? frameCol;
    for (const side of [-2, 2]) {
      clearFBox(v, face, wc, uc + side - 1, uc + side + 1, -1, 0, zb + 1, zb + winH - 2);
      for (let dz = 1; dz <= winH - 2; dz++) {
        for (let du = -1; du <= 1; du++) {
          const isBar = (du === 0 && dz !== Math.floor(winH / 2)) || dz === Math.floor(winH / 2);
          if (isBar) {
            setF(v, face, wc, uc + side + du, -1, zb + dz, mullionCol);
            setF(v, face, wc, uc + side + du, -2, zb + dz, PAL.woodDeep);
          } else {
            const gc = glow ? ((dz % 2 === 0) ? PAL.lanternGlow : PAL.yellowBright) : ((dz % 2 === 0) ? PAL.sky : PAL.slate);
            if (glow) setEmF(v, face, wc, uc + side + du, -2, zb + dz, gc);
            else setF(v, face, wc, uc + side + du, -2, zb + dz, gc);
          }
        }
      }
    }
    // 中央束柱・左右張り出し枠・連続 +2px 窓台＋コーベル・+2px まぐさ庇
    boxF(v, face, wc, uc, uc, -1, 1, zb + 1, zb + winH - 2, frameCol);
    boxF(v, face, wc, uc - 4, uc - 4, 0, 1, zb + 1, zb + winH - 2, frameCol);
    boxF(v, face, wc, uc + 4, uc + 4, 0, 1, zb + 1, zb + winH - 2, frameCol);
    boxF(v, face, wc, uc - 5, uc + 5, 0, 2, zb, zb, sillCol);
    boxF(v, face, wc, uc - 4, uc - 3, 1, 1, zb - 1, zb - 1, PAL.stoneDark);
    boxF(v, face, wc, uc + 3, uc + 4, 1, 1, zb - 1, zb - 1, PAL.stoneDark);
    boxF(v, face, wc, uc - 5, uc + 5, 0, 2, zb + winH - 1, zb + winH, hCol);
    if (shutterCol) {
      for (const su of [uc - 5, uc + 5]) {
        for (let dz = 1; dz <= winH - 2; dz++) {
          boxF(v, face, wc, su, su, 1, 2, zb + dz, zb + dz, dz % 2 === 0 ? shutterCol : PAL.woodDeep);
        }
      }
    }
    if (flowerBox) {
      boxF(v, face, wc, uc - 3, uc + 3, 1, 2, zb, zb, PAL.oak);
      boxF(v, face, wc, uc - 3, uc + 3, 1, 2, zb + 1, zb + 1, PAL.forest);
      for (let du = -2; du <= 2; du += 2) setF(v, face, wc, uc + du, 2, zb + 2, flowerBox === true ? PAL.crimson : flowerBox);
    }
    return;
  }

  // デフォルト 'casement'（5px幅基準：2px凹み + 2px張り出し窓台/庇 + 開き鎧戸）
  const winH = customH ?? 7;
  if (zb + winH + 2 >= v.d) return;
  const hCol = hoodCol ?? frameCol;
  clearFBox(v, face, wc, uc - 1, uc + 1, -1, 0, zb + 1, zb + winH - 2);
  for (let dz = 1; dz <= winH - 2; dz++) {
    for (let du = -1; du <= 1; du++) {
      const isMullion = (du === 0 && dz >= 1) || dz === Math.floor(winH / 2);
      if (isMullion) {
        setF(v, face, wc, uc + du, -1, zb + dz, mullionCol);
        setF(v, face, wc, uc + du, -2, zb + dz, PAL.woodDeep);
      } else {
        const gc = glow ? ((dz % 2 === 0) ? PAL.lanternGlow : PAL.yellowBright) : ((dz % 2 === 0) ? PAL.sky : PAL.slate);
        if (glow) setEmF(v, face, wc, uc + du, -2, zb + dz, gc);
        else setF(v, face, wc, uc + du, -2, zb + dz, gc);
      }
    }
  }
  // 立体額縁柱 (out=+1)・+2px 張り出し窓台・コーベル・+2px まぐさ庇
  boxF(v, face, wc, uc - 2, uc - 2, 0, 1, zb + 1, zb + winH - 2, frameCol);
  boxF(v, face, wc, uc + 2, uc + 2, 0, 1, zb + 1, zb + winH - 2, frameCol);
  boxF(v, face, wc, uc - 3, uc + 3, 0, 2, zb, zb, sillCol);
  setF(v, face, wc, uc - 2, 1, zb - 1, PAL.stoneDark);
  setF(v, face, wc, uc + 2, 1, zb - 1, PAL.stoneDark);
  boxF(v, face, wc, uc - 3, uc + 3, 0, 2, zb + winH - 1, zb + winH - 1, hCol);
  boxF(v, face, wc, uc - 2, uc + 2, 1, 1, zb + winH, zb + winH, hCol);

  if (shutterCol) {
    for (const su of [uc - 3, uc + 3]) {
      for (let dz = 1; dz <= winH - 2; dz++) {
        boxF(v, face, wc, su, su, 1, 2, zb + dz, zb + dz, dz % 2 === 0 ? shutterCol : PAL.woodDeep);
      }
    }
  }
  if (flowerBox) {
    boxF(v, face, wc, uc - 2, uc + 2, 1, 2, zb, zb, PAL.oak);
    boxF(v, face, wc, uc - 2, uc + 2, 1, 2, zb + 1, zb + 1, PAL.forest);
    setF(v, face, wc, uc - 1, 2, zb + 2, flowerBox === true ? PAL.crimson : flowerBox);
    setF(v, face, wc, uc + 1, 2, zb + 2, flowerBox === true ? PAL.goldBright : flowerBox);
  }
}

/** 2F 張り出し出窓（オリエル / エルカー Bay Window, 外側へ +3〜+4px 突出） */
export function drawOrielWindow(v, face, wc, uc, zb, opts = {}) {
  const {
    wallCol = PAL.plasterLight,
    timberCol = PAL.woodDeep,
    roofCol = PAL.tileDeep,
    roofAlt = PAL.terracotta,
    glow = true,
  } = opts;
  if (zb < 4 || zb + 13 >= v.d) return;

  // 段付き持ち送りコーベル基盤 (z = zb-3..zb-1)
  boxF(v, face, wc, uc - 2, uc + 2, 1, 1, zb - 3, zb - 3, PAL.oak);
  boxF(v, face, wc, uc - 3, uc + 3, 1, 2, zb - 2, zb - 2, timberCol);
  boxF(v, face, wc, uc - 4, uc + 4, 1, 3, zb - 1, zb - 1, PAL.stoneCream);

  // 出窓本体（+1..+3px 突出、角柱は木骨/石、窓面は側面含め全面ガラス）
  boxF(v, face, wc, uc - 3, uc + 3, 1, 3, zb, zb + 7, wallCol);
  boxF(v, face, wc, uc - 4, uc + 4, 1, 4, zb, zb, PAL.stoneCream);
  for (const cu of [uc - 3, uc + 3]) boxF(v, face, wc, cu, cu, 1, 3, zb + 1, zb + 7, timberCol);
  boxF(v, face, wc, uc - 3, uc + 3, 1, 4, zb + 7, zb + 7, timberCol);

  // 正面3連＋側面ガラス
  for (let dz = 1; dz <= 6; dz++) {
    for (let du = -2; du <= 2; du++) {
      if (du === 0 || dz === 4) {
        setF(v, face, wc, uc + du, 3, zb + dz, PAL.woodPale);
      } else {
        clearF(v, face, wc, uc + du, 3, zb + dz);
        const gc = glow ? (dz % 2 === 0 ? PAL.lanternGlow : PAL.yellowBright) : PAL.sky;
        if (glow) setEmF(v, face, wc, uc + du, 2, zb + dz, gc);
        else setF(v, face, wc, uc + du, 2, zb + dz, gc);
      }
    }
    // 側面小窓
    for (const su of [uc - 3, uc + 3]) {
      if (dz >= 2 && dz <= 5) {
        clearF(v, face, wc, su, 2, zb + dz);
        if (glow) setEmF(v, face, wc, su, 1, zb + dz, PAL.lanternGlow);
        else setF(v, face, wc, su, 1, zb + dz, PAL.sky);
      }
    }
  }

  // 出窓の独立傾斜小屋根 (out = +1..+4..+5, z = zb+8..zb+11)
  for (let k = 0; k < 4; k++) {
    const outEnd = Math.max(2, 4 - k);
    boxF(v, face, wc, uc - 4 + (k >= 2 ? 1 : 0), uc + 4 - (k >= 2 ? 1 : 0), 1, outEnd, zb + 8 + k, zb + 8 + k, k % 2 === 0 ? roofCol : roofAlt);
  }
}

/** 張り出しバルコニー（石手すり / 鍛鉄柵 / 木柵 + 持ち送りブラケット + 任意バルコニー扉） */
export function drawBalcony(v, face, wc, uc, zFloor, halfW = 5, style = 'stone', withDoor = true) {
  if (zFloor < 3 || zFloor + 8 >= v.d) return;
  // 持ち送りコンソール群
  for (let du = -halfW + 1; du <= halfW - 1; du += 4) {
    boxF(v, face, wc, uc + du, uc + du + 1, 1, 2, zFloor - 2, zFloor - 2, PAL.stoneDark);
    boxF(v, face, wc, uc + du, uc + du + 1, 1, 3, zFloor - 1, zFloor - 1, PAL.stoneMid);
  }
  // 張り出し床スラブ (+1..+4)
  boxF(v, face, wc, uc - halfW, uc + halfW, 1, 4, zFloor, zFloor, style === 'timber' ? PAL.oak : PAL.stoneCream);

  // 手すり (zFloor+1..zFloor+4, out=+4)
  const railZ = zFloor + 4;
  if (style === 'iron') {
    for (let du = -halfW; du <= halfW; du += 2) {
      boxF(v, face, wc, uc + du, uc + du, 4, 4, zFloor + 1, railZ - 1, PAL.iron);
    }
    for (const sideOut of [1, 2, 3]) {
      setF(v, face, wc, uc - halfW, sideOut, railZ, PAL.iron);
      setF(v, face, wc, uc + halfW, sideOut, railZ, PAL.iron);
    }
    boxF(v, face, wc, uc - halfW, uc + halfW, 4, 4, railZ, railZ, PAL.iron);
    setF(v, face, wc, uc - halfW, 4, railZ + 1, PAL.goldBright);
    setF(v, face, wc, uc + halfW, 4, railZ + 1, PAL.goldBright);
  } else {
    const postCol = style === 'timber' ? PAL.woodDeep : PAL.marble;
    const railCol = style === 'timber' ? PAL.oak : PAL.stoneCream;
    for (let du = -halfW; du <= halfW; du += 3) {
      boxF(v, face, wc, uc + du, uc + du + 1, 3, 4, zFloor + 1, railZ - 1, postCol);
    }
    boxF(v, face, wc, uc - halfW, uc + halfW, 3, 4, railZ, railZ, railCol);
    boxF(v, face, wc, uc - halfW, uc - halfW, 1, 4, railZ, railZ, railCol);
    boxF(v, face, wc, uc + halfW, uc + halfW, 1, 4, railZ, railZ, railCol);
  }

  if (withDoor) {
    clearFBox(v, face, wc, uc - 2, uc + 2, -1, 0, zFloor + 1, zFloor + 8);
    for (let dz = 1; dz <= 8; dz++) for (let du = -2; du <= 2; du++) {
      if (du === 0 || dz === 5) setF(v, face, wc, uc + du, -2, zFloor + dz, PAL.woodPale);
      else setEmF(v, face, wc, uc + du, -2, zFloor + dz, dz % 2 === 0 ? PAL.lanternGlow : PAL.yellowBright);
    }
    boxF(v, face, wc, uc - 3, uc + 3, 0, 1, zFloor + 9, zFloor + 10, style === 'timber' ? PAL.oak : PAL.marble);
  }
}

/** 2px 凹んだ立体玄関扉・石段・張り出しポーチ庇・吊り看板ブラケット */
export function drawPortal(v, face, wc, uc, zb = 2, opts = {}) {
  const {
    halfW = 3,
    doorH = 18,
    doorCol = PAL.oak,
    frameCol = PAL.stoneCream,
    arch = true,
    steps = true,
    porch = false,
    porchRoofCol = PAL.terracotta,
    awningCol = null,
    lantern = true,
    signCol = null,
  } = opts;

  // 石段 (z = 0..zb-1, out = +1..+3)
  if (steps && zb >= 1) {
    boxF(v, face, wc, uc - halfW - 2, uc + halfW + 2, 1, 3, 0, Math.min(1, zb - 1), PAL.stoneCream);
    if (zb >= 2) boxF(v, face, wc, uc - halfW - 1, uc + halfW + 1, 1, 2, zb - 1, zb - 1, PAL.stoneLight);
  }

  // 2px 彫り込んだ扉パネル + 金属鋲・取っ手
  for (let dz = 0; dz < doorH; dz++) {
    const ins = (arch && dz > doorH - 4) ? Math.floor((dz - (doorH - 4)) * 0.65) : 0;
    const hw = Math.max(1, halfW - 1 - ins);
    clearFBox(v, face, wc, uc - hw, uc + hw, -1, 0, zb + dz, zb + dz);
    for (let du = -hw; du <= hw; du++) {
      const plank = du === 0 || dz % 6 === 0;
      setF(v, face, wc, uc + du, -2, zb + dz, plank ? PAL.woodDeep : doorCol);
    }
  }
  setF(v, face, wc, uc + halfW - 2, -2, zb + Math.floor(doorH * 0.45), PAL.goldBright);

  // +1px 張り出し額縁＆キーストーン
  boxF(v, face, wc, uc - halfW, uc - halfW, 0, 1, zb, zb + doorH, frameCol);
  boxF(v, face, wc, uc + halfW, uc + halfW, 0, 1, zb, zb + doorH, frameCol);
  boxF(v, face, wc, uc - halfW, uc + halfW, 0, 1, zb + doorH, zb + doorH + 1, frameCol);
  if (arch) setF(v, face, wc, uc, 2, zb + doorH + 1, PAL.marble);

  // 張り出し切妻ポーチ（2本柱＋三角切妻小屋根 out=+1..+4）
  if (porch) {
    const pw = halfW + 2;
    boxF(v, face, wc, uc - pw, uc - pw + 1, 3, 4, zb, zb + doorH + 1, frameCol);
    boxF(v, face, wc, uc + pw - 1, uc + pw, 3, 4, zb, zb + doorH + 1, frameCol);
    const prZ = zb + doorH + 2;
    for (let k = 0; k < 5; k++) {
      const span = Math.max(1, pw + 1 - k);
      boxF(v, face, wc, uc - span, uc + span, 1, 5, prZ + k, prZ + k, k === 4 ? PAL.tileDeep : porchRoofCol);
      if (k < 4) boxF(v, face, wc, uc - span + 1, uc + span - 1, 3, 4, prZ + k, prZ + k, PAL.plasterLight);
    }
  }

  // オーニング庇（商店街向け）
  if (awningCol) {
    const span = Math.min(11, halfW + 8);
    const az = zb + doorH + 4;
    for (let k = 0; k < 3; k++) {
      for (let du = -span; du <= span; du++) {
        const stripe = Math.floor((du + span) / 2) % 2 === 0 ? awningCol : PAL.clothCream;
        setF(v, face, wc, uc + du, 1 + k, az - k, stripe);
        if (k < 2) setF(v, face, wc, uc + du, 1 + k, az - k - 1, PAL.woodDeep);
      }
    }
  }

  // 鍛鉄ブラケットランタン
  if (lantern) {
    const lx = uc - halfW - 1;
    setF(v, face, wc, lx, 1, zb + doorH - 2, PAL.iron);
    setF(v, face, wc, lx, 2, zb + doorH - 2, PAL.iron);
    setEmF(v, face, wc, lx, 2, zb + doorH - 3, PAL.lanternGlow);
    setEmF(v, face, wc, lx, 2, zb + doorH - 4, PAL.lanternGlow);
  }

  // 鍛鉄吊り看板ブラケット
  if (signCol) {
    const sx = uc + halfW + 1;
    const sz = zb + doorH + 3;
    boxF(v, face, wc, sx, sx, 1, 5, sz, sz, PAL.iron);
    boxF(v, face, wc, sx, sx, 2, 4, sz - 4, sz - 1, signCol);
    setF(v, face, wc, sx, 3, sz - 2, PAL.goldBright);
  }
}

/** 外壁から +2〜+3px せり出す石造煙突胸壁（Chimney breast + Corbeled stack & chimney pots） */
export function drawChimneyBreast(v, face, wc, uc, z0, zTop, opts = {}) {
  const {
    colMain = PAL.stoneMid,
    colTrim = PAL.stoneCream,
    colDeep = PAL.stoneDark,
    halfW = 2,
    shoulderZ = Math.floor(zTop * 0.55),
  } = opts;
  const zEnd = Math.min(v.d - 1, zTop);
  for (let z = Math.max(0, z0); z <= zEnd; z++) {
    const outEnd = z < shoulderZ ? 3 : 2;
    const hw = z < shoulderZ ? halfW + 1 : halfW;
    const isCap = z >= zEnd - 2;
    const capOut = z === zEnd - 1 ? 3 : outEnd;
    const cHw = z === zEnd - 1 ? hw + 1 : hw;
    const col = isCap ? colTrim : (z === shoulderZ ? colTrim : (z % 6 === 0 ? colDeep : colMain));
    boxF(v, face, wc, uc - cHw, uc + cHw, 0, capOut, z, z, col);
  }
  // 煙突鉢ポット & 暗い火道穴
  if (zEnd < v.d - 1) {
    setF(v, face, wc, uc - 1, 1, zEnd, PAL.terracotta);
    setF(v, face, wc, uc + 1, 1, zEnd, PAL.terracotta);
  }
  setF(v, face, wc, uc, 1, zEnd, PAL.charcoal);
}

/** 段付き石造控え壁（Stepped Masonry Buttress, 下段 +3px -> 中段 +2px -> 上段 +1px） */
export function drawButtress(v, face, wc, uc, z0, zTop, opts = {}) {
  const { colMain = PAL.stoneCream, colDark = PAL.stoneMid, pinnacle = false } = opts;
  const h = zTop - z0;
  const s1 = z0 + Math.floor(h * 0.42);
  const s2 = z0 + Math.floor(h * 0.78);
  boxF(v, face, wc, uc - 1, uc + 1, 0, 3, z0, s1, colDark);
  boxF(v, face, wc, uc - 1, uc + 1, 0, 3, s1, s1 + 1, colMain);
  boxF(v, face, wc, uc - 1, uc + 1, 0, 2, s1 + 2, s2, colMain);
  boxF(v, face, wc, uc - 1, uc + 1, 0, 2, s2, s2 + 1, PAL.marble);
  boxF(v, face, wc, uc, uc, 0, 1, s2 + 2, zTop, colMain);
  if (pinnacle && zTop + 7 < v.d) {
    boxF(v, face, wc, uc, uc + 1, 1, 2, zTop + 1, zTop + 5, PAL.marble);
    setF(v, face, wc, uc, 1, zTop + 6, PAL.goldBright);
  }
}

/** 屋根面を貫き張り出す垂直ドーマー窓（ルカルヌ / 屋根小屋根＋光る窓＋突き出し庇） */
export function drawDormer(v, face, wc, uc, zWallTop, opts = {}) {
  const {
    wallCol = PAL.plasterLight,
    roofCol = PAL.tileDeep,
    timberCol = PAL.oak,
    glow = true,
    setback = -3,
  } = opts;
  const zb = zWallTop + 2;
  if (zb + 12 >= v.d) return;
  const outFront = setback + 4; // setback=-3 -> out=+1 (屋根勾配から手前へ突き出す)
  // ドーマー側壁箱体
  boxF(v, face, wc, uc - 3, uc + 3, setback - 4, outFront, zb, zb + 6, wallCol);
  // 木/石枠 + 凹み窓 + 突き出し窓台
  boxF(v, face, wc, uc - 3, uc + 3, outFront, outFront + 1, zb, zb, PAL.stoneCream);
  clearFBox(v, face, wc, uc - 1, uc + 1, outFront - 1, outFront, zb + 1, zb + 5);
  for (let dz = 1; dz <= 5; dz++) for (let du = -1; du <= 1; du++) {
    if (du === 0) setF(v, face, wc, uc, outFront - 1, zb + dz, timberCol);
    else if (glow) setEmF(v, face, wc, uc + du, outFront - 2, zb + dz, PAL.lanternGlow);
    else setF(v, face, wc, uc + du, outFront - 2, zb + dz, PAL.sky);
  }
  boxF(v, face, wc, uc - 3, uc - 3, outFront, outFront, zb + 1, zb + 6, timberCol);
  boxF(v, face, wc, uc + 3, uc + 3, outFront, outFront, zb + 1, zb + 6, timberCol);
  // ドーマー切妻小屋根（+2px 張り出し庇）
  for (let k = 0; k < 5; k++) {
    const span = Math.max(0, 4 - k);
    boxF(v, face, wc, uc - span, uc + span, setback - 5, outFront + 2, zb + 7 + k, zb + 7 + k, roofCol);
  }
}

/** 切妻頂部の荷物引き上げ滑車梁＋屋根裏荷積み扉（商館・倉庫の必須ディテール） */
export function drawHoistBeam(v, face, wc, uc, zLoft, timberCol = PAL.oak) {
  if (zLoft + 8 >= v.d) return;
  // 荷揚げ扉
  clearFBox(v, face, wc, uc - 2, uc + 2, -1, 0, zLoft, zLoft + 5);
  boxF(v, face, wc, uc - 2, uc + 2, -2, -2, zLoft, zLoft + 5, PAL.woodDeep);
  boxF(v, face, wc, uc - 3, uc + 3, 0, 1, zLoft, zLoft, PAL.woodPale);
  // 突き出し滑車梁 (out = +1..+5)
  const bz = zLoft + 7;
  boxF(v, face, wc, uc, uc, 0, 5, bz, bz, timberCol);
  boxF(v, face, wc, uc, uc, 4, 4, bz - 3, bz - 1, PAL.iron);
}

/**
 * 深い軒の出（eave = 3〜4px）と軒下垂木（Rafter tails）付きの 2× 屋根ビルダー
 * roofStyle: 'gable-y' | 'gable-x' | 'stepped-gable' | 'jerkinhead' | 'hip' | 'mansard' | 'gambrel' | 'lean-to'
 */
export function drawPitchedRoof2x(v, wallBox, wallH, roofH, opts = {}) {
  const { x0, y0, x1, y1 } = wallBox;
  const {
    roofStyle = 'gable-y',
    roofMain = PAL.terracotta,
    roofAlt = PAL.brickDark,
    ridgeCol = null,
    wallColor = PAL.plaster,
    timberColor = PAL.woodDeep,
    bargeCol = null,
    eave = 3,
    mossSpots = false,
  } = opts;

  const { w, h, d } = v;
  const ex0 = Math.max(0, x0 - eave);
  const ex1 = Math.min(w - 1, x1 + eave);
  const ey0 = Math.max(0, y0 - eave);
  const ey1 = Math.min(h - 1, y1 + eave);
  const mx = Math.floor((x0 + x1) / 2);
  const my = Math.floor((y0 + y1) / 2);
  const rSpanX = Math.floor((ex1 - ex0) / 2);
  const rSpanY = Math.floor((ey1 - ey0) / 2);
  const defRidge = (roofMain === PAL.slate || roofMain === PAL.slateDark || roofMain === PAL.slateLight)
    ? PAL.slateDeep
    : (roofMain === PAL.blue || roofMain === PAL.blueDark || roofMain === PAL.clothNavy ? PAL.goldBright : PAL.tileDeep);
  const rCol = ridgeCol ?? defRidge;
  const vergeCol = bargeCol ?? timberColor;

  // 軒下垂木（Rafter tails）を壁のすぐ外側 z = wallH - 1 に配置
  if (wallH - 1 >= 0 && wallH - 1 < d) {
    for (let x = ex0 + 1; x <= ex1 - 1; x += 3) {
      v.box(x, ey0 + 1, wallH - 1, x, y0, wallH - 1, timberColor);
      v.box(x, y1, wallH - 1, x, ey1 - 1, wallH - 1, timberColor);
    }
    for (let y = ey0 + 1; y <= ey1 - 1; y += 3) {
      v.box(ex0 + 1, y, wallH - 1, x0, y, wallH - 1, timberColor);
      v.box(x1, y, wallH - 1, ex1 - 1, y, wallH - 1, timberColor);
    }
  }

  for (let k = 0; k < roofH; k++) {
    const z = wallH + k;
    if (z >= d) break;
    const t = k / Math.max(1, roofH - 1);
    let rx0 = ex0, rx1 = ex1, ry0 = ey0, ry1 = ey1;

    if (roofStyle === 'gable-y' || roofStyle === 'stepped-gable' || roofStyle === 'jerkinhead') {
      const rawInset = Math.floor(t * Math.max(1, rSpanX - 1));
      const inset = roofStyle === 'stepped-gable' ? Math.floor(rawInset / 3) * 3 : rawInset;
      rx0 = ex0 + inset;
      rx1 = ex1 - inset;
      // 切妻妻壁（壁コア面 + 軒内張り）
      if (x0 + inset <= x1 - inset) {
        const gWallStart = Math.max(x0, ex0 + inset + 1);
        const gWallEnd = Math.min(x1, ex1 - inset - 1);
        for (let x = gWallStart; x <= gWallEnd; x++) {
          const isPost = Math.abs(x - mx) <= 0 || (k < 4 && (x === gWallStart || x === gWallEnd));
          const gc = isPost ? timberColor : wallColor;
          v.box(x, y0, z, x, y0 + 1, z, gc);
          v.box(x, y1 - 1, z, x, y1, z, gc);
        }
      }
      if (roofStyle === 'stepped-gable') {
        for (let x = Math.max(x0, rx0); x <= Math.min(x1, rx1); x++) {
          v.box(x, Math.max(0, y0 - 1), z, x, y0, z, PAL.brickDark);
          v.box(x, y1, z, x, Math.min(h - 1, y1 + 1), z, PAL.brickDark);
        }
      }
      if (roofStyle === 'jerkinhead' && t > 0.65) {
        const jInset = Math.floor(((t - 0.65) / 0.35) * 6);
        ry0 = ey0 + jInset;
        ry1 = ey1 - jInset;
      }
    } else if (roofStyle === 'gable-x') {
      const inset = Math.floor(t * Math.max(1, rSpanY - 1));
      ry0 = ey0 + inset;
      ry1 = ey1 - inset;
      const gStart = Math.max(y0, ey0 + inset + 1);
      const gEnd = Math.min(y1, ey1 - inset - 1);
      if (gStart <= gEnd) {
        for (let y = gStart; y <= gEnd; y++) {
          const gc = y === my ? timberColor : wallColor;
          v.box(x0, y, z, x0 + 1, y, z, gc);
          v.box(x1 - 1, y, z, x1, y, z, gc);
        }
      }
    } else if (roofStyle === 'gambrel') {
      const inset = t < 0.48
        ? Math.floor((t / 0.48) * (rSpanY * 0.36))
        : Math.floor(rSpanY * 0.36 + ((t - 0.48) / 0.52) * (rSpanY * 0.6));
      ry0 = ey0 + inset;
      ry1 = ey1 - inset;
      const gStart = Math.max(y0, ry0 + 1), gEnd = Math.min(y1, ry1 - 1);
      if (gStart <= gEnd) {
        for (let y = gStart; y <= gEnd; y++) {
          v.box(x0, y, z, x0 + 1, y, z, wallColor);
          v.box(x1 - 1, y, z, x1, y, z, wallColor);
        }
      }
    } else if (roofStyle === 'lean-to') {
      const inset = Math.floor(t * Math.max(4, ey1 - ey0 - 6));
      ry0 = ey0;
      ry1 = Math.max(ey0 + 4, ey1 - inset);
      for (let y = Math.max(y0, ry0); y <= Math.min(y1, ry1); y++) {
        v.set(x0, y, z, wallColor);
        v.set(x1, y, z, wallColor);
      }
    } else if (roofStyle === 'hip') {
      const ix = Math.floor(t * Math.max(1, rSpanX - 3));
      const iy = Math.floor(t * Math.max(1, rSpanY - 3));
      rx0 = ex0 + ix; rx1 = ex1 - ix;
      ry0 = ey0 + iy; ry1 = ey1 - iy;
    } else {
      // 'mansard': 急勾配下段(65%) + 緩傾斜上段テラス
      const steepT = Math.min(1, t / 0.72);
      const ix = Math.floor(steepT * Math.min(10, Math.floor(rSpanX * 0.45)));
      const iy = Math.floor(steepT * Math.min(10, Math.floor(rSpanY * 0.45)));
      const flatInset = t > 0.72 ? Math.floor(((t - 0.72) / 0.28) * 5) : 0;
      rx0 = ex0 + ix + flatInset; rx1 = ex1 - ix - flatInset;
      ry0 = ey0 + iy + flatInset; ry1 = ey1 - iy - flatInset;
    }

    if (rx0 > rx1 || ry0 > ry1) break;
    const isRidge = k >= roofH - 3;
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        if (roofStyle === 'stepped-gable' && (y < y0 - 1 || y > y1 + 1)) continue;
        const isEaveRim = k <= 1 && (x === ex0 || x === ex1 || y === ey0 || y === ey1);
        const isGableBarge = ((roofStyle === 'gable-y' || roofStyle === 'jerkinhead') && (y <= ey0 + 1 || y >= ey1 - 1))
          || ((roofStyle === 'gable-x' || roofStyle === 'gambrel') && (x <= ex0 + 1 || x >= ex1 - 1));
        const tileWave = ((Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(k / 2)) % 3 === 0);
        let col = isRidge ? rCol : (isGableBarge ? vergeCol : (isEaveRim ? PAL.woodDeep : (tileWave ? roofAlt : roofMain)));
        if (mossSpots && !isRidge && ((x * 11 + y * 17 + z * 13) % 23 === 0)) col = PAL.pineDark;

        const isShell = k <= 1 || k >= roofH - 2 || roofStyle === 'mansard'
          || x <= rx0 + 2 || x >= rx1 - 2 || y <= ry0 + 2 || y >= ry1 - 2;
        if (isShell) v.set(x, y, z, col);
      }
    }
  }

  if (roofStyle === 'stepped-gable') {
    const capZ = Math.min(d - 1, wallH + roofH - 1);
    v.box(mx - 1, Math.max(0, y0 - 1), capZ - 1, mx + 1, y0, capZ, PAL.goldBright);
    v.box(mx - 1, y1, capZ - 1, mx + 1, Math.min(h - 1, y1 + 1), capZ, PAL.goldBright);
  }
}
