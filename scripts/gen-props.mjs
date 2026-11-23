// 王都の小物（針葉樹3種・広葉樹・並木・魔導設備・街角家具・船・トロフィー）と
// 3頭身RPGキャラクター全10職＋ゴーレム＋環状魔導路面電車をネイティブ2×（density: 2, oto-64）で生成する。
import fs from 'node:fs';
import { Volume, writeSheet } from './voxel.mjs';
import { PAL } from './palette.mjs';

const PROPS = 'assets/stacks/props';
const CHARS = 'assets/stacks/characters';

function save2x(dir, id, frames, category, notes, footprint, lightOpt = {}) {
  const arr = Array.isArray(frames) ? frames : [frames];
  arr.forEach((v) => v.bakeLighting({ density: 2, aoStrength: lightOpt.aoStrength ?? 0.24, grain: lightOpt.grain ?? 0.03 }));
  return writeSheet(`${dir}/${id}.png`, arr, {
    id,
    category,
    density: 2,
    footprint: footprint ?? [Math.round(arr[0].w / 2), Math.round(arr[0].h / 2)],
    pivot: [arr[0].w / 2, arr[0].h / 2],
    source: 'procedural',
    palette: 'oto-64',
    notes,
  });
}

function upscaleAndSave(dir, id, frames1x, category, notes, opt = {}) {
  const arr = (Array.isArray(frames1x) ? frames1x : [frames1x]).map((v) =>
    v.upscale2xRefined({ bevel: opt.bevel ?? true, texture: opt.texture ?? false }),
  );
  const fw = (Array.isArray(frames1x) ? frames1x[0] : frames1x).w;
  const fh = (Array.isArray(frames1x) ? frames1x[0] : frames1x).h;
  return save2x(dir, id, arr, category, notes, [fw, fh], opt);
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

function fillSphere(v, cx, cy, cz, rx, ry, rz, fn) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(v.w - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(v.h - 1, Math.ceil(cy + ry));
  const z0 = Math.max(0, Math.floor(cz - rz)), z1 = Math.min(v.d - 1, Math.ceil(cz + rz));
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
    if (d <= 1.0) fn(x, y, z, d);
  }
}

// 1) ネイティブ 2× 自然樹木（4f 風揺らぎ・非蛍光64色グラデーション・不規則枝垂れ樹冠）
function makeConifer2x(size1x, height1x, trunkH1x) {
  const N = size1x * 2 - 1;
  const Z = height1x * 2;
  const trunkH = trunkH1x * 2;
  const c = (N - 1) / 2;
  const rMax = c - 2.2;
  const leafStart = Math.max(5, trunkH - 3);
  const sways = [0, 1.3, 2.2, 0.8];

  return sways.map((sway, f) => {
    const v = new Volume(N, N, Z);
    const ci = Math.floor(c);
    // 根張り＋粗皮幹
    for (let z = 0; z <= trunkH + 6; z++) {
      const rr = z <= 3 ? 2.6 - z * 0.35 : (size1x >= 19 ? 1.5 : 1.2);
      for (let y = ci - 3; y <= ci + 3; y++) for (let x = ci - 3; x <= ci + 3; x++) {
        if (Math.hypot(x - ci, y - ci) <= rr || (z <= 2 && (Math.abs(x - ci) + Math.abs(y - ci) <= 3))) {
          v.set(x, y, z, z <= 2 || ((x + y + z) % 3 === 0) ? PAL.woodDeep : PAL.bark);
        }
      }
    }
    // 段々枝葉（枝先ギザギザ＋垂れ表現）
    for (let z = leafStart; z < Z; z++) {
      const t = (z - leafStart) / Math.max(1, Z - 1 - leafStart);
      const step = (z - leafStart) % 10;
      const tierFlare = Math.max(0, 1 - step / 8) * 2.2 * (1 - t * 0.4);
      const baseR = Math.max(0.9, rMax * (1 - t * 0.94) + tierFlare);
      const ox = sway * t * t;
      const oy = sway * 0.45 * t * t;
      const lobePhase = Math.floor((z - leafStart) / 10) * 0.7;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x - c - ox, dy = y - c - oy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const branchLobe = 1 + 0.20 * Math.cos(6 * ang + lobePhase) + 0.10 * Math.sin(9 * ang - z * 0.3);
        const effR = baseR * branchLobe;
        if (dist <= effR) {
          const edge = dist > effR * 0.72;
          const glint = (f === 2 || t > 0.65) && edge && ((x + y * 3 + z) % 7 === 0);
          const col = glint
            ? PAL.leafSun
            : edge
              ? (((x * 3 + y + z) % 3 === 0) ? PAL.leafMid : PAL.forest)
              : (dist < effR * 0.45 ? PAL.pineDeep : PAL.pineDark);
          v.set(x, y, z, col);
        }
      }
    }
    return v;
  });
}

// 2) ネイティブ 2×（17x17x28, footprint=[9,9]）3 頭身 RPG キャラクター共通ビルダー
function makeCharacter2x(spec) {
  const {
    bootCol, legCol, tunicCol, trimCol, sleeveCol, beltCol, buckleCol,
    skinCol, skinShadeCol, hairCol, capeCol, hatCol, helmetCol, apronCol,
    hasSpear, hasBackSword, hasCross,
    pointedHat, hasStaff, hasShield, hasSword, hasQuiver, hasBow, hoodCol,
  } = spec;
  const W = 17, H = 17, Z = 28;
  const legSteps = [2, 0, -2, 0];
  const skinShade = skinShadeCol ?? PAL.skinShade;
  const trim = trimCol ?? PAL.slateLight;

  return legSteps.map((step, idx) => {
    const v = new Volume(W, H, Z);
    const armShift = -step;

    // 脚・ブーツ（z=0..10、スリムで自然な歩幅と足先）
    for (const [lx0, lx1, s] of [[6, 7, step], [9, 10, -step]]) {
      const by0 = 7 + s, by1 = 9 + s;
      v.box(lx0, by0, 0, lx1, by1 + 1, 1, PAL.woodDeep);     // 靴底・つま先 (+y)
      v.box(lx0, by0, 2, lx1, by1, 4, bootCol);              // ブーツ筒
      v.box(lx0, by0, 4, lx1, by1, 4, trim);                 // ブーツ折返し
      const ty = 7 + Math.round(s * 0.55);
      v.box(lx0, ty, 5, lx1, ty + 2, 10, legCol);            // 脚・膝当て
    }

    // 腰回り・チュニック・鎧胴（z=10..18）
    v.box(6, 7, 10, 10, 9, 12, tunicCol);                    // 引き締まった腰
    v.box(5, 6, 13, 11, 10, 17, tunicCol);                   // 胸郭・上衣
    v.box(6, 6, 18, 10, 10, 18, trim);                       // 襟元・肩帯
    v.box(5, 6, 12, 11, 10, 12, beltCol);                    // 革ベルト
    v.box(7, 10, 12, 9, 10, 13, buckleCol);                  // バックル
    v.set(8, 10, 14, trim); v.set(8, 10, 15, trim);          // 胸部留め具/縫製ライン
    // 肩パッド（騎士・冒険者・衛兵等の立体感）
    if (helmetCol || hasShield || hasBackSword) {
      v.box(4, 7, 15, 5, 9, 18, trim);
      v.box(11, 7, 15, 12, 9, 18, trim);
    }

    if (apronCol) {
      v.box(6, 10, 5, 10, 10, 13, apronCol);
      v.box(7, 10, 14, 9, 10, 16, apronCol);
    }
    if (hasCross) {
      v.box(8, 10, 13, 8, 10, 16, PAL.goldBright);
      v.box(7, 10, 15, 9, 10, 15, PAL.goldBright);
    }

    // 流れるマント（-y 背面・裾に向けて緩やかに広がる）
    if (capeCol) {
      const sway = idx === 0 ? 1 : idx === 2 ? -1 : 0;
      for (let z = 5; z <= 18; z++) {
        const half = z >= 15 ? 2 : z >= 9 ? 3 : 4;
        const cy = z <= 8 ? 4 : 5;
        v.box(8 - half, cy, z, 8 + half, cy, z, z === 5 ? trim : capeCol);
      }
      if (sway !== 0) {
        v.set(8 + sway * 4, 4, 5, capeCol);
      }
    }

    // 背負い大剣 / 矢筒（y=4）
    if (hasBackSword) {
      for (let k = 0; k < 10; k++) {
        v.set(5 + Math.floor(k * 0.6), 4, 12 + k, k < 7 ? PAL.steel : PAL.goldBright);
      }
      v.box(10, 4, 20, 12, 4, 20, PAL.gold);
      v.set(11, 4, 22, PAL.leather); v.set(12, 4, 23, PAL.pommel ?? PAL.crimson);
    }
    if (hasQuiver) {
      v.box(9, 4, 12, 11, 5, 18, PAL.leather);
      v.set(9, 4, 19, PAL.white); v.set(10, 5, 20, PAL.crimson); v.set(11, 4, 19, PAL.white);
    }

    // 両腕（前腕・手・歩調逆位相）
    const ayL = 7 + Math.round(armShift * 0.5);
    const ayR = 7 - Math.round(armShift * 0.5);
    v.box(4, ayL, 13, 4, ayL + 2, 17, sleeveCol);
    v.box(12, ayR, 13, 12, ayR + 2, 17, sleeveCol);
    v.box(4, ayL, 11, 4, ayL + 1, 12, skinCol);
    v.box(12, ayR, 11, 12, ayR + 1, 12, skinCol);

    // 装備（長槍 / 魔導杖 / 騎士剣 / 紋章カイトシールド / 長弓）
    if (hasSpear) {
      const sx = 14, sy = ayR + 1;
      v.box(sx, sy, 1, sx, sy, 22, PAL.oak);
      v.box(sx, sy, 23, sx, sy, 23, PAL.gold);
      v.box(sx, sy, 24, sx, sy, 27, PAL.silver);
      v.set(sx, sy + 1, 25, PAL.steel);
    }
    if (hasStaff) {
      const sx = 14, sy = ayR + 1;
      v.box(sx, sy, 1, sx, sy, 21, PAL.woodDark);
      v.box(sx - 1, sy, 22, sx + 1, sy, 22, PAL.goldBright);
      v.box(sx, sy - 1, 22, sx, sy + 1, 22, PAL.goldBright);
      v.boxEmissive(sx, sy, 23, sx, sy, 25, (idx % 2 === 0) ? PAL.cyan : PAL.white);
      v.set(sx, sy, 26, PAL.sky);
    }
    if (hasSword) {
      const sx = 14, sy = ayR + 2;
      v.box(sx, sy, 10, sx, sy, 11, PAL.leather);
      v.box(sx - 1, sy, 12, sx + 1, sy, 12, PAL.goldBright);
      v.box(sx, sy, 13, sx, sy, 22, PAL.silver);
      v.set(sx, sy, 23, PAL.white);
    }
    if (hasShield) {
      const shx = 2, shy = ayL + 1;
      v.box(shx, shy - 2, 11, shx, shy + 2, 18, PAL.blue);
      v.box(shx, shy - 1, 9, shx, shy + 1, 10, PAL.blue);
      v.box(shx, shy - 2, 18, shx, shy + 2, 18, PAL.goldBright);
      v.set(shx, shy, 14, PAL.goldBright);
      v.set(shx, shy, 15, PAL.white);
    }
    if (hasBow) {
      const bx = 2, by = ayL + 1;
      for (let kz = 8; kz <= 21; kz++) {
        const bend = Math.round(Math.abs(kz - 14.5) * 0.28);
        v.set(bx, by + 1 - bend, kz, PAL.oak);
      }
      v.box(bx, by - 1, 9, bx, by - 1, 20, PAL.clothCream);
    }

    // 頭部（z=19..24: スリムな3頭身サイズ x=6..10, y=6..10）
    v.box(7, 7, 19, 9, 9, 19, skinShade);                    // 首・顎下影
    v.box(6, 6, 20, 10, 10, 23, skinCol);                    // 顔コア
    v.box(6, 6, 20, 6, 10, 23, skinShade);                   // 頬輪郭陰
    v.box(10, 6, 20, 10, 10, 23, skinShade);
    if (helmetCol) {
      v.box(6, 6, 22, 10, 10, 25, helmetCol);
      v.box(6, 6, 20, 10, 7, 24, helmetCol);
      v.box(8, 10, 22, 8, 10, 24, trim);                     // 兜鼻当て
      v.set(7, 10, 21, PAL.ink); v.set(9, 10, 21, PAL.ink);  // スリット目
      if (capeCol) v.box(8, 6, 26, 8, 9, 27, capeCol);       // 羽根飾り
    } else {
      v.box(6, 6, 24, 10, 9, 25, hairCol);                   // 頭頂髪
      v.box(6, 6, 20, 10, 6, 24, hairCol);                   // 後髪
      v.box(6, 7, 21, 6, 9, 24, hairCol);                    // もみあげ
      v.box(10, 7, 21, 10, 9, 24, hairCol);
      v.set(7, 10, 24, hairCol); v.set(9, 10, 24, hairCol);  // 前髪房
      v.set(7, 10, 21, PAL.ink); v.set(9, 10, 21, PAL.ink);  // 瞳
      if (pointedHat) {
        v.box(4, 4, 24, 12, 12, 24, pointedHat);
        v.box(6, 6, 25, 10, 10, 25, PAL.goldBright);
        v.box(7, 7, 26, 9, 9, 26, pointedHat);
        v.set(8, 7, 27, pointedHat);
      } else if (hoodCol) {
        v.box(5, 5, 20, 11, 8, 25, hoodCol);
        v.box(6, 9, 24, 10, 10, 25, hoodCol);
      } else if (hatCol) {
        v.box(4, 5, 24, 12, 11, 24, hatCol);
        v.box(6, 6, 25, 10, 10, 26, hatCol);
      }
    }
    return v;
  });
}

const made = [];

// === A. ネイティブ 2× 樹木 5 種 ===
made.push(save2x(PROPS, 'prop_conifer_a', makeConifer2x(19, 40, 8), 'props', '針葉樹A（2x・高さ80・風揺らぎ4f）', [19, 19], { aoStrength: 0.22 }));
made.push(save2x(PROPS, 'prop_conifer_b', makeConifer2x(23, 48, 10), 'props', '針葉樹B（2x・高さ96・風揺らぎ4f）', [23, 23], { aoStrength: 0.22 }));
made.push(save2x(PROPS, 'prop_conifer_c', makeConifer2x(15, 32, 6), 'props', '針葉樹C（2x・高さ64・風揺らぎ4f）', [15, 15], { aoStrength: 0.22 }));

// prop_tree_town_a (37x37x72, footprint=[19,19]): 幹＋多枝＋不定形複数クラスター樹冠
{
  const N = 37, Z = 72, c = 18;
  const sways = [0, 1.1, 2.0, 0.7];
  const clusters = [
    [0, 0, 56, 8.2, 7.6],
    [-6, -3, 47, 7.4, 6.2],
    [6, -4, 48, 7.0, 6.0],
    [-4, 6, 44, 7.2, 6.0],
    [6, 5, 45, 7.0, 5.8],
    [0, -7, 50, 6.5, 5.6],
    [-2, 2, 63, 6.0, 5.4],
  ];
  const frames = sways.map((sway, f) => {
    const v = new Volume(N, N, Z);
    for (let z = 0; z < 44; z++) {
      const rr = z < 6 ? 3.5 - z * 0.3 : (z < 28 ? 2.1 : 1.5);
      const bx = c + (z > 30 ? -Math.floor((z - 30) * 0.25) : 0);
      for (let y = c - 4; y <= c + 4; y++) for (let x = c - 4; x <= c + 4; x++) {
        if (Math.hypot(x - bx, y - c) <= rr) v.set(x, y, z, (x + y + z) % 3 === 0 ? PAL.woodDeep : PAL.bark);
      }
      if (z >= 26 && z <= 46) {
        const k = z - 26;
        v.box(c + Math.floor(k * 0.25), c - Math.floor(k * 0.15), z, c + Math.floor(k * 0.25) + 1, c - Math.floor(k * 0.15) + 1, z, PAL.bark);
        v.box(c - Math.floor(k * 0.2), c + Math.floor(k * 0.2), z, c - Math.floor(k * 0.2) + 1, c + Math.floor(k * 0.2) + 1, z, PAL.bark);
      }
    }
    for (const [ox0, oy0, cz, rx, rz] of clusters) {
      const t = (cz - 30) / 40;
      fillSphere(v, c + ox0 + sway * t, c + oy0 + sway * 0.45 * t, cz, rx, rx, rz, (x, y, z, d) => {
        const up = z >= cz + rz * 0.35;
        const sun = up && (f === 2 ? ((x + y + z) % 3 === 0) : ((x * 3 + y * 5 + z) % 5 === 0));
        const col = sun ? PAL.leafSun : (d > 0.72 || up ? PAL.leafMid : (d < 0.32 ? PAL.pineDark : PAL.forest));
        v.set(x, y, z, col);
      });
    }
    return v;
  });
  made.push(save2x(PROPS, 'prop_tree_town_a', frames, 'props', '町の広葉樹（2x・高さ72・不定形樹冠4f）', [19, 19], { aoStrength: 0.22 }));
}

// prop_boulevard_tree_a (29x29x68, footprint=[15,15]): 面取り八角石プランター＋枝別れ大通り並木
{
  const N = 29, Z = 68, c = 14;
  const sways = [0, 1.0, 1.8, 0.6];
  const clusters = [
    [0, 0, 54, 7.2, 6.8],
    [-5, 3, 44, 6.2, 5.4],
    [5, -3, 45, 6.2, 5.4],
    [4, 4, 42, 5.6, 5.0],
    [-4, -4, 43, 5.6, 5.0],
  ];
  const frames = sways.map((sway, f) => {
    const v = new Volume(N, N, Z);
    for (let z = 0; z <= 7; z++) {
      for (let y = 7; y <= 21; y++) for (let x = 7; x <= 21; x++) {
        if (Math.abs(x - c) + Math.abs(y - c) > 11) continue;
        if (z <= 5 || Math.max(Math.abs(x - c), Math.abs(y - c)) >= 6 || Math.abs(x - c) + Math.abs(y - c) >= 10) {
          v.set(x, y, z, z === 7 || z === 1 ? PAL.stoneCream : PAL.stone);
        } else {
          v.set(x, y, z, PAL.bark);
        }
      }
    }
    v.box(13, 13, 6, 15, 15, 34, PAL.bark);
    v.set(12, 13, 30, PAL.woodDeep); v.set(16, 15, 32, PAL.woodDeep);
    for (const [ox0, oy0, cz, rx, rz] of clusters) {
      const t = (cz - 28) / 36;
      fillSphere(v, c + ox0 + sway * t, c + oy0 + sway * 0.45 * t, cz, rx, rx, rz, (x, y, z, d) => {
        const up = z >= cz + rz * 0.3;
        const sun = up && ((x * 5 + y * 3 + z + f) % 5 === 0);
        v.set(x, y, z, sun ? PAL.leafSun : (up || d > 0.7 ? PAL.leafMid : PAL.forest));
      });
    }
    return v;
  });
  made.push(save2x(PROPS, 'prop_boulevard_tree_a', frames, 'props', '大通りの並木（2x・八角プランター4f）', [15, 15], { aoStrength: 0.22 }));
}

// === B. ネイティブ 2× 主役街角・魔導プロップ ===
// prop_lamp_a (13x13x52, footprint=[7,7])
{
  const v = new Volume(13, 13, 52);
  v.box(4, 4, 0, 8, 8, 3, PAL.iron);
  v.box(5, 5, 4, 7, 7, 8, PAL.stoneDeep);
  v.box(6, 6, 9, 6, 6, 36, PAL.iron);
  v.box(5, 5, 37, 7, 7, 38, PAL.charcoal);
  v.boxEmissive(5, 5, 39, 7, 7, 45, PAL.lanternGlow);
  v.setEmissive(6, 6, 42, PAL.white);
  v.box(4, 4, 39, 4, 4, 45, PAL.iron); v.box(8, 4, 39, 8, 4, 45, PAL.iron);
  v.box(4, 8, 39, 4, 8, 45, PAL.iron); v.box(8, 8, 39, 8, 8, 45, PAL.iron);
  v.box(4, 4, 46, 8, 8, 47, PAL.iron);
  v.box(5, 5, 48, 7, 7, 49, PAL.iron);
  v.box(6, 6, 50, 6, 6, 51, PAL.goldBright);
  made.push(save2x(PROPS, 'prop_lamp_a', v, 'props', '王都の鍛鉄ランタン街灯（2x・高さ52）', [7, 7]));
}

// prop_arcane_lamp_a (13x13x56, footprint=[7,7])
{
  const v = new Volume(13, 13, 56);
  v.box(4, 4, 0, 8, 8, 5, PAL.stoneCream);
  v.box(5, 5, 6, 7, 7, 9, PAL.gold);
  v.box(6, 6, 10, 6, 6, 39, PAL.slateDeep);
  v.box(4, 4, 40, 8, 8, 41, PAL.goldBright);
  v.boxEmissive(5, 5, 42, 7, 7, 49, PAL.cyan);
  v.boxEmissive(6, 6, 44, 6, 6, 47, PAL.white);
  v.set(4, 4, 45, PAL.gold); v.set(8, 4, 45, PAL.gold);
  v.set(4, 8, 45, PAL.gold); v.set(8, 8, 45, PAL.gold);
  v.box(4, 4, 50, 8, 8, 51, PAL.goldBright);
  v.box(5, 5, 52, 7, 7, 53, PAL.blue);
  v.box(6, 6, 54, 6, 6, 55, PAL.goldBright);
  made.push(save2x(PROPS, 'prop_arcane_lamp_a', v, 'props', '魔導エーテル街灯（2x・高さ56）', [7, 7]));
}

// prop_teleport_pad (53x53x36, footprint=[27,27], 4f)
{
  const W = 53, H = 53, Z = 36, c = 26;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    for (let z = 0; z <= 3; z++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r <= 24.5 - (z >= 2 ? 1.5 : 0)) {
        const isStep = r >= 21.5;
        const col = z === 0 ? PAL.stoneDeep : isStep ? PAL.stoneMid : PAL.stoneCream;
        v.set(x, y, z, col);
      }
    }
    for (let z = 4; z <= 5; z++) for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r >= 17.5 && r <= 22.8) {
        v.set(x, y, z, r >= 21.2 || r <= 18.2 ? PAL.bronze : PAL.stoneLight);
      } else if (z === 4 && r < 17.5) {
        const ang = Math.atan2(y - c, x - c);
        const spoke = Math.abs(Math.sin(ang * 4 + f * 0.4)) < 0.22;
        if (Math.abs(r - 12.5) < 1.3 || Math.abs(r - 6.5) < 1.2 || (r > 3 && spoke)) {
          v.setEmissive(x, y, z, PAL.cyan);
        } else if (r <= 3.0) {
          v.setEmissive(x, y, z, f % 2 === 0 ? PAL.white : PAL.cyan);
        } else {
          v.set(x, y, z, PAL.blueDeep);
        }
      }
    }
    // 4本のルーンオベリスク柱
    for (const [ox, oy] of [[7, 7], [43, 7], [7, 43], [43, 43]]) {
      v.box(ox - 1, oy - 1, 4, ox + 2, oy + 2, 7, PAL.stoneDeep);
      v.box(ox, oy, 8, ox + 1, oy + 1, 26, PAL.stoneLight);
      v.box(ox, oy, 16, ox + 1, oy + 1, 17, PAL.bronze);
      v.box(ox - 1, oy - 1, 27, ox + 2, oy + 2, 28, PAL.goldBright);
      v.boxEmissive(ox, oy, 29, ox + 1, oy + 1, 35, (f % 2 === 0) ? PAL.cyan : PAL.white);
    }
    return v;
  });
  made.push(save2x(PROPS, 'prop_teleport_pad', frames, 'props', '公衆魔導転移陣（2x・53x53x36・4f）', [27, 27]));
}

// prop_floating_crystal (25x25x44, footprint=[13,13], 4f): z=0から確実に接地開始＋多面体カット結晶＋二重真鍮リング
{
  const W = 25, H = 25, Z = 44, c = 12;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    for (let z = 0; z < Z; z++) {
      const distMid = Math.abs(z - 21.5) / 21.5;
      const r = Math.max(1.2, (1 - distMid * 0.88) * 7.8);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        // 8角カット断面
        const ax = Math.abs(x - c), ay = Math.abs(y - c);
        const dOct = Math.max(ax, ay) * 0.76 + (ax + ay) * 0.44;
        if (dOct <= r) {
          const isRidge = dOct > r - 1.1;
          const shine = z >= 16 && z <= 27 && ((z + f * 2) % 5 === 0);
          if (shine || isRidge) v.setEmissive(x, y, z, shine ? PAL.white : PAL.cyan);
          else v.set(x, y, z, z < 12 ? PAL.blue : PAL.sky);
        }
      }
    }
    // 外周の真鍮アストロラーベ導輪
    for (let z = 18; z <= 25; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= 8.6 && d <= 10.8 && (z === 21 || z === 22 || ((Math.round(Math.atan2(y - c, x - c) * 2 + z + f) & 1) === 0))) {
        v.set(x, y, z, PAL.goldBright);
      }
    }
    return v;
  });
  made.push(save2x(PROPS, 'prop_floating_crystal', frames, 'props', '浮遊中継マナ結晶（2x・25x25x44・4f）', [13, 13]));
}

// prop_barrier_pylon (29x29x84, footprint=[15,15], 4f)
{
  const W = 29, H = 29, Z = 84, c = 14;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    for (let z = 0; z < 56; z++) {
      const r = z < 10 ? 11.5 - z * 0.2 : (z % 16 <= 1 ? 8.2 : 6.2 - (z - 10) * 0.03);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) {
          v.set(x, y, z, z < 6 ? PAL.stoneDeep : (z % 16 <= 1 ? PAL.bronze : PAL.stoneCream));
        }
      }
    }
    for (let z = 56; z < 76; z++) {
      const r = 6.0 - Math.abs(z - 66) * 0.45;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.hypot(x - c, y - c) <= r) v.setEmissive(x, y, z, ((z + f * 2) % 4 === 0) ? PAL.white : PAL.cyan);
      }
      for (const [cx, cy] of [[7, 7], [21, 7], [7, 21], [21, 21]]) {
        v.box(cx, cy, z, cx + 1, cy + 1, z, PAL.goldBright);
      }
    }
    v.box(12, 12, 76, 16, 16, 78, PAL.goldBright);
    v.boxEmissive(13, 13, 79, 15, 15, 83, (f === 1 || f === 3) ? PAL.white : PAL.cyan);
    return v;
  });
  made.push(save2x(PROPS, 'prop_barrier_pylon', frames, 'props', '対魔獣結界発生パイロン（2x・29x29x84・4f）', [15, 15]));
}

// prop_sky_skiff (33x57x36, footprint=[17,29], 4f)
{
  const W = 33, H = 57, Z = 36;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    for (let z = 0; z < 16; z++) {
      for (let y = 4; y <= 52; y++) {
        const dy = Math.abs(y - 28);
        const taper = dy > 12 ? (dy - 12) * 0.65 : 0;
        const halfW = Math.max(2.0, (z <= 4 ? 6.5 : 10.8) - taper);
        const x0 = Math.round(16 - halfW), x1 = Math.round(16 + halfW);
        for (let x = x0; x <= x1; x++) {
          const rim = x <= x0 + 1 || x >= x1 - 1 || y <= 6 || y >= 50;
          if (z <= 5 || z === 6 || rim) {
            const col = z === 15 ? PAL.goldBright : (z === 14 ? PAL.bronze : (z <= 3 ? PAL.iron : PAL.oak));
            v.set(x, y, z, col);
          }
        }
      }
    }
    // 両舷の真鍮浮揚ポッド
    const glowCol = (f % 2 === 0) ? PAL.cyan : PAL.white;
    for (const wx of [2, 27]) {
      v.box(wx, 20, 8, wx + 3, 36, 13, PAL.bronze);
      v.box(wx + 1, 19, 9, wx + 2, 37, 12, PAL.goldBright);
      v.boxEmissive(wx + 1, 22, 10, wx + 2, 34, 11, glowCol);
    }
    // 甲板貨物・魔石タンク・艦尾マスト旗
    v.box(12, 30, 7, 20, 40, 15, PAL.woodLight);
    v.boxEmissive(13, 16, 7, 19, 24, 15, PAL.cyan);
    v.box(12, 16, 12, 20, 24, 13, PAL.gold);
    v.box(15, 9, 7, 17, 11, 33, PAL.woodDark);
    v.box(15, 3, 25, 17, 10, 32, PAL.blue);
    const fy = (f === 1) ? 17 : (f === 3 ? 15 : 16);
    v.box(fy - 1, 4, 27, fy + 1, 9, 30, PAL.goldBright);
    return v;
  });
  made.push(save2x(PROPS, 'prop_sky_skiff', frames, 'props', '浮遊魔導飛空艇スカイスキフ（2x・33x57x36・4f）', [17, 29]));
}

// prop_monster_trophy (45x41x60, footprint=[23,21]): 討伐ワイバーン骨格＆魔石台座
{
  const W = 45, H = 41, Z = 60, v = new Volume(W, H, Z);
  v.box(6, 6, 0, 38, 34, 6, PAL.stoneDeep);
  v.box(8, 8, 7, 36, 32, 21, PAL.stoneMid);
  v.box(10, 10, 22, 34, 30, 24, PAL.goldBright);
  v.box(17, 33, 10, 27, 33, 18, PAL.bronze); // 討伐銘板
  for (const [cx, cy] of [[8, 8], [36, 8], [8, 32], [36, 32]]) {
    v.boxEmissive(cx - 1, cy - 1, 8, cx + 1, cy + 1, 28, PAL.cyan);
  }
  // ワイバーン頭蓋と大角
  v.box(16, 20, 25, 28, 36, 34, PAL.stoneCream);
  v.box(14, 12, 25, 30, 28, 43, PAL.marble);
  v.boxEmissive(17, 31, 30, 19, 31, 33, PAL.cyan);
  v.boxEmissive(25, 31, 30, 27, 31, 33, PAL.cyan);
  for (let k = 0; k < 16; k++) {
    const z = 43 + k;
    v.box(12 - Math.floor(k * 0.6), 14 - Math.floor(k * 0.4), z, 16 - Math.floor(k * 0.5), 18 - Math.floor(k * 0.3), z, PAL.stoneLight);
    v.box(28 + Math.floor(k * 0.5), 14 - Math.floor(k * 0.4), z, 32 + Math.floor(k * 0.6), 18 - Math.floor(k * 0.3), z, PAL.stoneLight);
  }
  made.push(save2x(PROPS, 'prop_monster_trophy', v, 'props', 'ワイバーン討伐記念トロフィー（2x・45x41x60）', [23, 21]));
}

// === C. 補助街角小物（2×精細化＋ベベル＆テクスチャベイク） ===
{
  const v = new Volume(7, 7, 9);
  for (let z = 0; z < 9; z++) {
    const r = (z === 0 || z === 8) ? 2.4 : 3.1;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (Math.hypot(x - 3, y - 3) <= r) {
        v.set(x, y, z, (z === 2 || z === 6) ? PAL.iron : ((x + y) % 3 === 0 ? PAL.woodDark : PAL.wood));
      }
    }
  }
  made.push(upscaleAndSave(PROPS, 'prop_barrel_a', v, 'props', '木樽（2x）'));
}
{
  const v = new Volume(9, 9, 9);
  v.box(0, 0, 0, 8, 8, 8, PAL.wood);
  for (let z = 0; z < 9; z++) for (let i = 0; i < 9; i++) {
    if (z === 0 || z === 8 || i === 0 || i === 8) {
      v.set(i, 0, z, PAL.woodDark); v.set(i, 8, z, PAL.woodDark);
      v.set(0, i, z, PAL.woodDark); v.set(8, i, z, PAL.woodDark);
    }
  }
  v.box(3, 8, 3, 5, 8, 5, PAL.bronze);
  made.push(upscaleAndSave(PROPS, 'prop_crate_a', v, 'props', '木箱（2x）', { bevel: false }));
}
{
  const v = new Volume(19, 15, 20);
  v.box(1, 2, 0, 17, 12, 5, PAL.oak);
  v.box(2, 3, 5, 16, 11, 5, PAL.woodLight);
  v.set(5, 8, 6, PAL.burgundy); v.set(9, 7, 6, PAL.goldBright); v.set(13, 8, 6, PAL.leafMid);
  for (const x of [1, 17]) for (const y of [2, 12]) v.box(x, y, 0, x, y, 14, PAL.woodDeep);
  for (let k = 0; k < 6; k++) {
    const z = 14 + k;
    const inset = Math.floor(k * 0.8);
    for (let y = 1 + inset; y <= 13 - inset; y++) for (let x = 0; x <= 18; x++) {
      v.set(x, y, z, Math.floor(x / 2) % 2 === 0 ? PAL.crimson : PAL.clothCream);
    }
  }
  made.push(upscaleAndSave(PROPS, 'prop_stall_a', v, 'props', '市場の露店（2x）'));
}
if (!isViewsCarve(PROPS, 'prop_well_a')) {
  const v = new Volume(15, 15, 20);
  for (let z = 0; z < 8; z++) for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    const r = Math.hypot(x - 7, y - 7);
    if (r <= 6.2 && (z < 3 || r > 3.4)) v.set(x, y, z, (x + y + z) % 3 === 0 ? PAL.stoneDark : PAL.stoneCream);
    else if (z === 3 && r <= 3.4) v.set(x, y, z, PAL.waterDeep);
  }
  v.box(2, 7, 8, 2, 7, 14, PAL.woodDeep);
  v.box(12, 7, 8, 12, 7, 14, PAL.woodDeep);
  v.box(3, 7, 11, 11, 7, 11, PAL.wood);
  for (let k = 0; k < 6; k++) v.box(1, 2 + k, 14 + k, 13, 12 - k, 14 + k, k % 2 === 0 ? PAL.tileWarm : PAL.tileDeep);
  made.push(upscaleAndSave(PROPS, 'prop_well_a', v, 'props', '石造りの井戸（2x）'));
}
{
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(7, 7, 30);
    v.box(2, 2, 0, 4, 4, 2, PAL.stoneDeep);
    v.box(3, 3, 3, 3, 3, 28, PAL.oak);
    for (let z = 13; z <= 25; z++) {
      const wave = Math.sin((25 - z) * 0.65 - f * (Math.PI / 2));
      const wy = (z >= 23 || wave <= 0.25) ? 4 : 5;
      for (let x = 2; x <= 4; x++) {
        v.set(x, wy, z, x === 3 && z >= 17 && z <= 22 ? PAL.goldBright : PAL.blue);
      }
    }
    v.box(2, 3, 26, 4, 4, 26, PAL.goldBright);
    v.set(3, 3, 29, PAL.goldBright);
    return v;
  });
  made.push(upscaleAndSave(PROPS, 'prop_banner_a', frames, 'props', '王都の青×金垂れ幕ポール（2x・4f）', { bevel: false }));
}
{
  const v = new Volume(15, 7, 8);
  v.box(1, 1, 0, 2, 5, 2, PAL.iron);
  v.box(12, 1, 0, 13, 5, 2, PAL.iron);
  v.box(0, 1, 3, 14, 5, 3, PAL.woodLight);
  v.box(0, 1, 4, 14, 2, 7, PAL.oak);
  v.set(0, 1, 7, PAL.woodDeep); v.set(14, 1, 7, PAL.woodDeep);
  made.push(upscaleAndSave(PROPS, 'prop_bench_a', v, 'props', '木製ベンチ（2x）', { bevel: false }));
}
{
  const v = new Volume(13, 7, 6);
  v.box(0, 0, 0, 12, 6, 3, PAL.stoneCream);
  v.box(1, 1, 3, 11, 5, 4, PAL.forest);
  for (const [fx, fy, col] of [[2, 2, PAL.crimson], [4, 4, PAL.yellowBright], [6, 2, PAL.white], [8, 4, PAL.orange], [10, 2, PAL.burgundy], [6, 3, PAL.goldBright]]) {
    v.set(fx, fy, 5, col);
  }
  made.push(upscaleAndSave(PROPS, 'prop_flowerbed_a', v, 'props', '石枠の花壇（2x）'));
}
{
  const v = new Volume(7, 7, 16);
  v.box(2, 2, 0, 4, 4, 2, PAL.stoneDeep);
  v.box(3, 3, 3, 3, 3, 14, PAL.woodDark);
  v.box(0, 3, 9, 6, 3, 11, PAL.woodPale);
  v.box(3, 0, 11, 3, 6, 13, PAL.plasterWarm);
  v.box(2, 2, 14, 4, 4, 14, PAL.woodDark);
  v.set(3, 3, 15, PAL.bronze);
  made.push(upscaleAndSave(PROPS, 'prop_signpost_a', v, 'props', '街角の道標（2x）', { bevel: false }));
}
{
  const v = new Volume(17, 13, 13);
  for (const x of [1, 15]) {
    v.box(x, 3, 0, x, 9, 6, PAL.woodDeep);
    v.set(x, 6, 3, PAL.bronze);
  }
  v.box(2, 2, 4, 14, 10, 6, PAL.oak);
  v.box(3, 3, 7, 8, 9, 11, PAL.thatchLight);
  v.box(9, 3, 7, 13, 9, 12, PAL.woodPale);
  v.box(4, 11, 4, 4, 12, 4, PAL.woodDark);
  v.box(12, 11, 4, 12, 12, 4, PAL.woodDark);
  made.push(upscaleAndSave(PROPS, 'prop_cart_a', v, 'props', '荷積みの荷車（2x）'));
}
{
  const v = new Volume(15, 7, 9);
  v.box(1, 1, 0, 13, 5, 3, PAL.pineDeep);
  v.box(0, 1, 3, 14, 5, 7, PAL.pineDark);
  for (let x = 1; x <= 13; x++) for (let y = 1; y <= 5; y++) {
    v.set(x, y, 8, (x + y) % 3 === 0 ? PAL.leafMid : PAL.forest);
  }
  v.set(3, 3, 8, PAL.goldBright); v.set(11, 3, 8, PAL.crimson);
  made.push(upscaleAndSave(PROPS, 'prop_hedge_a', v, 'props', '刈り込み生垣（2x）'));
}
{
  const v = new Volume(15, 15, 17);
  v.box(6, 6, 0, 8, 8, 3, PAL.iron);
  v.box(5, 5, 4, 9, 9, 4, PAL.marble);
  v.set(6, 7, 5, PAL.plasterWarm); v.set(8, 7, 5, PAL.burgundy);
  v.box(1, 5, 0, 3, 9, 3, PAL.oak);
  v.box(1, 5, 4, 1, 9, 7, PAL.woodDeep);
  v.box(11, 5, 0, 13, 9, 3, PAL.oak);
  v.box(13, 5, 4, 13, 9, 7, PAL.woodDeep);
  v.box(7, 7, 4, 7, 7, 11, PAL.woodDark);
  v.box(6, 7, 10, 8, 7, 11, PAL.woodDark);
  v.box(7, 6, 10, 7, 8, 11, PAL.woodDark);
  const radii = [[12, 3.6], [13, 5.4], [14, 6.8], [15, 5.0], [16, 2.2]];
  for (const [z, r] of radii) {
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      if (Math.hypot(x - 7, y - 7) <= r) {
        const stripe = Math.floor((Math.atan2(y - 7, x - 7) + Math.PI) / (Math.PI / 4)) % 2 === 0;
        v.set(x, y, z, stripe ? PAL.clothNavy : PAL.clothCream);
      }
    }
  }
  v.set(7, 7, 16, PAL.goldBright);
  made.push(upscaleAndSave(PROPS, 'prop_cafe_table_a', v, 'props', 'オープンカフェのテラス席（2x）'));
}
{
  const v = new Volume(13, 5, 18);
  v.box(0, 1, 0, 3, 3, 1, PAL.stoneDeep);
  v.box(9, 1, 0, 12, 3, 1, PAL.stoneDeep);
  v.box(1, 2, 2, 2, 2, 14, PAL.woodDeep);
  v.box(10, 2, 2, 11, 2, 14, PAL.woodDeep);
  v.box(2, 2, 5, 10, 2, 14, PAL.oak);
  v.box(3, 1, 8, 5, 3, 11, PAL.clothCream);
  v.box(7, 1, 7, 9, 3, 11, PAL.plasterLight);
  v.set(4, 3, 11, PAL.crimson); v.set(8, 3, 11, PAL.crimson);
  v.box(0, 0, 15, 12, 4, 15, PAL.tileWarm);
  v.box(0, 1, 16, 12, 3, 16, PAL.tileDeep);
  v.box(0, 2, 17, 12, 2, 17, PAL.tileWarm);
  made.push(upscaleAndSave(PROPS, 'prop_questboard_a', v, 'props', '街角のクエスト掲示板（2x）', { bevel: false }));
}
{
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(15, 15, 22);
    for (let z = 0; z < 7; z++) for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const r = Math.hypot(x - 7, y - 7);
      if (r <= 6.2 && (z < 3 || r > 3.6)) v.set(x, y, z, z === 6 ? PAL.marble : PAL.stoneCream);
      else if (z >= 3 && z <= 5 && r <= 3.6) {
        const ring = (Math.floor(r * 1.4 - f) % 3 + 3) % 3;
        v.setEmissive(x, y, z, ring === 0 ? PAL.white : (ring === 1 ? PAL.cyan : PAL.sky));
      }
    }
    v.box(6, 6, 4, 8, 8, 12, PAL.stoneMid);
    v.boxEmissive(6, 6, 13, 8, 8, 17, (f === 1 || f === 2) ? PAL.white : PAL.cyan);
    v.setEmissive(7, 7, 18, PAL.white);
    v.box(5, 5, 19, 9, 9, 19, PAL.goldBright);
    v.box(6, 6, 20, 8, 8, 21, (f === 2) ? PAL.cyan : PAL.blue);
    return v;
  });
  made.push(upscaleAndSave(PROPS, 'prop_mana_well_a', frames, 'props', '魔導浄水泉（2x・4f）'));
}
{
  const v = new Volume(13, 13, 12);
  for (let z = 0; z < 12; z++) {
    const t = z / 11;
    const r = 5.6 * (1 - t * t * 0.85);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      if (Math.hypot(x - 6, y - 6) <= r) v.set(x, y, z, (x + y * 2 + z) % 4 === 0 ? PAL.thatchLight : PAL.thatchDark);
    }
  }
  made.push(upscaleAndSave(PROPS, 'prop_haystack_a', v, 'props', '干し草の山（2x）'));
}
{
  const v = new Volume(21, 7, 10);
  for (const x of [2, 10, 18]) v.box(x, 3, 0, x, 3, 7, PAL.bark);
  v.box(1, 3, 5, 19, 3, 5, PAL.oak);
  for (let x = 1; x <= 19; x++) {
    v.box(x, 2, 6, x, 4, 8, (x % 3 === 0) ? PAL.pineDark : PAL.leafMid);
    if (x % 4 === 1) v.set(x, 4, 5, PAL.purple);
    if (x % 5 === 2) v.set(x, 2, 5, PAL.burgundy);
    if (x % 2 === 0) v.set(x, 3, 9, PAL.leafSun);
  }
  made.push(upscaleAndSave(PROPS, 'prop_vineyard_row', v, 'props', 'ぶどう棚（2x）'));
}
{
  const v = new Volume(17, 5, 7);
  for (const x of [0, 1, 4, 5, 8, 9, 12, 13, 15, 16]) v.box(x, 2, 0, x, 2, 6, PAL.woodDeep);
  v.box(0, 2, 2, 16, 2, 3, PAL.oak);
  v.box(0, 2, 5, 16, 2, 5, PAL.woodPale);
  made.push(upscaleAndSave(PROPS, 'prop_fence_wood', v, 'props', '牧草地の木柵（2x）', { bevel: false }));
}
{
  const v = new Volume(9, 7, 7);
  v.box(2, 2, 0, 2, 2, 1, PAL.iron); v.box(6, 2, 0, 6, 2, 1, PAL.iron);
  v.box(2, 4, 0, 2, 4, 1, PAL.iron); v.box(6, 4, 0, 6, 4, 1, PAL.iron);
  v.box(1, 2, 2, 7, 4, 5, PAL.clothCream);
  v.box(2, 1, 2, 6, 5, 5, PAL.plasterLight);
  v.box(3, 5, 3, 5, 6, 5, PAL.stoneDeep);
  v.set(3, 6, 4, PAL.stoneLight); v.set(5, 6, 4, PAL.stoneLight);
  v.box(2, 2, 6, 6, 4, 6, PAL.white);
  made.push(upscaleAndSave(PROPS, 'prop_sheep_a', v, 'props', '牧場の羊（2x）'));
}
{
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(27, 13, 10);
    const bob = (f === 1 || f === 2) ? 1 : 0;
    for (let z = 0; z < 5; z++) {
      for (let x = 2 - Math.min(2, z); x <= 24 + Math.min(2, z); x++) {
        const taper = Math.abs(x - 13) > 8 ? (Math.abs(x - 13) - 8) * 0.65 : 0;
        const yMin = Math.round(1 + taper), yMax = Math.round(11 - taper);
        for (let y = yMin; y <= yMax; y++) {
          const rim = y === yMin || y === yMax || x <= 2 || x >= 24;
          if (z < 2 || rim || z === 2) v.set(x, y, z, z === 4 ? PAL.woodPale : PAL.oak);
        }
      }
    }
    for (let x = 1; x <= 25; x += 3) {
      const wx = (x + f) % 27;
      if (!v.filled(wx, 0, 0)) v.setEmissive(wx, 0, 0, (x + f) % 6 === 0 ? PAL.white : PAL.cyan);
      if (!v.filled(wx, 12, 0)) v.set(wx, 12, 0, PAL.sky);
    }
    v.box(6, 4, 3, 10, 8, 6 + bob, PAL.woodLight);
    v.box(12, 4, 3, 15, 8, 5, PAL.plasterWarm);
    v.box(17, 5, 3, 19, 7, 6 + bob, PAL.wood);
    v.box(13, 6, 5, 13, 6, 9, PAL.woodDeep);
    const flagY = (f === 1) ? 7 : (f === 3 ? 5 : 6);
    v.set(14, flagY, 9, PAL.clothCream);
    v.set(15, flagY, 9, PAL.burgundy);
    return v;
  });
  made.push(upscaleAndSave(PROPS, 'prop_dock_boat_a', frames, 'props', '川港の木造荷船（2x・4f）'));
}
{
  const v = new Volume(11, 11, 18);
  v.box(3, 3, 0, 7, 7, 1, PAL.stoneDeep);
  v.box(5, 5, 2, 5, 5, 16, PAL.woodDeep);
  v.box(3, 4, 6, 7, 6, 12, PAL.thatchLight);
  v.box(1, 5, 10, 9, 5, 11, PAL.oak);
  v.box(4, 7, 7, 6, 7, 11, PAL.burgundy); v.set(5, 7, 9, PAL.clothCream);
  v.box(4, 4, 13, 6, 6, 16, PAL.plasterWarm);
  v.box(3, 4, 17, 7, 6, 17, PAL.wood);
  made.push(upscaleAndSave(PROPS, 'prop_training_dummy', v, 'props', '冒険者訓練人形（2x）'));
}
{
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(15, 15, 18);
    for (let z = 0; z < 5; z++) for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) {
      if (Math.hypot(x - 7, y - 7) <= 5.5 - z * 0.5) v.set(x, y, z, PAL.stoneDeep);
    }
    const spires = [
      [7, 7, 17, 2.2, (f === 0 || f === 2) ? PAL.cyan : PAL.white],
      [4, 5, 14, 1.5, f === 1 ? PAL.white : PAL.sky],
      [10, 5, 13, 1.5, f === 3 ? PAL.white : PAL.cyan],
      [5, 10, 12, 1.4, PAL.blue],
      [10, 10, 15, 1.6, f === 2 ? PAL.white : PAL.cyan],
    ];
    for (const [sx, sy, topZ, baseR, col] of spires) {
      for (let z = 4; z <= topZ; z++) {
        const rr = Math.max(0.6, baseR * (1 - (z - 4) / (topZ - 2)));
        for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
          if (Math.hypot(x - sx, y - sy) <= rr) v.setEmissive(x, y, z, col);
        }
      }
    }
    return v;
  });
  made.push(upscaleAndSave(PROPS, 'prop_mana_crystal_cluster', frames, 'props', '魔石クラスター塊（2x・4f）'));
}

// === D. 主人公 + 3頭身 RPG 全10職 + 労働ゴーレム + 魔導路面電車（すべてネイティブ 2×） ===
const charSpecs = [
  {
    id: 'chr_hero_walk',
    notes: '主人公（2x・3頭身17x17x28・青チュニック＋短マント・4f）',
    bootCol: PAL.leather, legCol: PAL.clothNavy, tunicCol: PAL.blue, trimCol: PAL.goldBright, sleeveCol: PAL.clothCream,
    beltCol: PAL.woodDark, buckleCol: PAL.goldBright, skinCol: PAL.skin, hairCol: PAL.oak,
    capeCol: PAL.crimson,
  },
  {
    id: 'chr_guard_walk',
    notes: '王都衛兵（2x・銀鎧＋青マント＋ハルバード）',
    bootCol: PAL.iron, legCol: PAL.slate, tunicCol: PAL.steel, trimCol: PAL.silver, sleeveCol: PAL.stoneCream,
    beltCol: PAL.woodDeep, buckleCol: PAL.goldBright, skinCol: PAL.skin, hairCol: PAL.ink,
    capeCol: PAL.blue, helmetCol: PAL.silver, hasSpear: true,
  },
  {
    id: 'chr_townsfolk_a',
    notes: '町の住人（男性・オリーブチュニック）',
    bootCol: PAL.leather, legCol: PAL.stoneDeep, tunicCol: PAL.clothOlive, trimCol: PAL.woodPale, sleeveCol: PAL.clothCream,
    beltCol: PAL.oak, buckleCol: PAL.bronze, skinCol: PAL.skin, hairCol: PAL.woodDark,
  },
  {
    id: 'chr_townsfolk_b',
    notes: '町の住人（女性・暖色服＋白エプロン）',
    bootCol: PAL.leather, legCol: PAL.burgundy, tunicCol: PAL.tileWarm, trimCol: PAL.plasterLight, sleeveCol: PAL.clothCream,
    beltCol: PAL.oak, buckleCol: PAL.goldBright, skinCol: PAL.skinLight, hairCol: PAL.gold,
    apronCol: PAL.clothCream,
  },
  {
    id: 'chr_merchant_a',
    notes: '商人／店主（帽子＋前掛け）',
    bootCol: PAL.woodDeep, legCol: PAL.iron, tunicCol: PAL.purple, trimCol: PAL.gold, sleeveCol: PAL.plasterWarm,
    beltCol: PAL.leather, buckleCol: PAL.goldBright, skinCol: PAL.skin, hairCol: PAL.stoneMid,
    hatCol: PAL.bark, apronCol: PAL.clothCream,
  },
  {
    id: 'chr_adventurer_a',
    notes: '冒険者（革鎧＋赤マント＋背負い剣）',
    bootCol: PAL.woodDeep, legCol: PAL.slateDeep, tunicCol: PAL.leather, trimCol: PAL.bronze, sleeveCol: PAL.plasterWarm,
    beltCol: PAL.woodDeep, buckleCol: PAL.goldBright, skinCol: PAL.skin, hairCol: PAL.ink,
    capeCol: PAL.burgundy, hasBackSword: true,
  },
  {
    id: 'chr_sister_a',
    notes: 'シスター（紺白の修道服）',
    bootCol: PAL.ink, legCol: PAL.blueDeep, tunicCol: PAL.clothNavy, trimCol: PAL.silver, sleeveCol: PAL.slateDark,
    beltCol: PAL.clothCream, buckleCol: PAL.goldBright, skinCol: PAL.skinLight, hairCol: PAL.marble,
    capeCol: PAL.clothNavy, hatCol: PAL.marble, hasCross: true,
  },
  {
    id: 'chr_mage_a',
    notes: '王立魔導学院の魔導師（2x・紺金ローブ＋尖帽＋光る魔導杖）',
    bootCol: PAL.ink, legCol: PAL.blueDeep, tunicCol: PAL.clothNavy, trimCol: PAL.goldBright, sleeveCol: PAL.blue,
    beltCol: PAL.goldBright, buckleCol: PAL.cyan, skinCol: PAL.skinLight, hairCol: PAL.silver,
    capeCol: PAL.purple, pointedHat: PAL.blueDeep, hasStaff: true,
  },
  {
    id: 'chr_knight_a',
    notes: '上位冒険者／重装騎士（2x・白銀甲冑＋紋章盾＋大剣）',
    bootCol: PAL.iron, legCol: PAL.silver, tunicCol: PAL.marble, trimCol: PAL.goldBright, sleeveCol: PAL.steel,
    beltCol: PAL.goldBright, buckleCol: PAL.crimson, skinCol: PAL.skin, hairCol: PAL.gold,
    capeCol: PAL.burgundy, helmetCol: PAL.silver, hasShield: true, hasSword: true,
  },
  {
    id: 'chr_ranger_a',
    notes: '斥候・弓兵冒険者（2x・深緑フード＋矢筒＋長弓）',
    bootCol: PAL.leather, legCol: PAL.pineDeep, tunicCol: PAL.forest, trimCol: PAL.leather, sleeveCol: PAL.clothOlive,
    beltCol: PAL.woodDark, buckleCol: PAL.bronze, skinCol: PAL.skin, hairCol: PAL.oak,
    hoodCol: PAL.pineDeep, hasQuiver: true, hasBow: true,
  },
];

for (const cs of charSpecs) {
  made.push(save2x(CHARS, cs.id, makeCharacter2x(cs), 'characters', cs.notes, [9, 9], { aoStrength: 0.18, grain: 0.015 }));
}

// chr_golem_a (21x21x32, footprint=[11,11]): ネイティブ 2× マナ荷役ゴーレム
{
  const legSteps = [2, 0, -2, 0];
  const frames = legSteps.map((step, f) => {
    const v = new Volume(21, 21, 32);
    v.box(4, 8 + step, 0, 8, 12 + step, 10, PAL.stoneDeep);
    v.box(12, 8 - step, 0, 16, 12 - step, 10, PAL.stoneDeep);
    v.box(4, 6, 11, 16, 14, 24, PAL.stoneMid);
    v.box(5, 6, 11, 15, 14, 13, PAL.bronze);
    v.box(3, 7, 19, 5, 13, 25, PAL.stoneCream);
    v.box(15, 7, 19, 17, 13, 25, PAL.stoneCream);
    v.boxEmissive(8, 14, 16, 12, 14, 21, (f % 2 === 0) ? PAL.cyan : PAL.white);
    // 両腕＆魔石コンテナ
    v.box(2, 10, 13, 3, 17, 23, PAL.slate);
    v.box(17, 10, 13, 18, 17, 23, PAL.slate);
    v.box(6, 16, 12, 14, 20, 19, PAL.oak);
    v.boxEmissive(8, 17, 14, 12, 19, 18, PAL.cyan);
    v.box(7, 16, 12, 13, 20, 13, PAL.goldBright);
    // 頭部＆発光バイザー
    v.box(6, 7, 25, 14, 14, 31, PAL.stoneCream);
    v.box(6, 7, 30, 14, 14, 31, PAL.bronze);
    v.boxEmissive(8, 14, 27, 12, 14, 28, PAL.cyan);
    return v;
  });
  made.push(save2x(CHARS, 'chr_golem_a', frames, 'characters', 'マナ荷役ゴーレム（2x・21x21x32・4f）', [11, 11], { aoStrength: 0.22 }));
}

// chr_mana_tram (29x53x40, footprint=[15,27]): ネイティブ 2× ヴィクトリアン魔導路面電車
{
  const W = 29, H = 53, Z = 40;
  const frames = [0, 1, 2, 3].map((f) => {
    const v = new Volume(W, H, Z);
    const spark = (f % 2 === 0) ? PAL.cyan : PAL.white;
    // 台車・鉄輪・下部マナ集電シュー
    v.box(6, 4, 0, 9, 48, 3, PAL.iron);
    v.box(19, 4, 0, 22, 48, 3, PAL.iron);
    v.boxEmissive(12, 6, 1, 16, 46, 3, spark);
    // 車体下部スカート・紺＋真鍮腰帯・前面カウキャッチャー＆発光前照灯
    v.box(4, 2, 4, 24, 50, 14, PAL.blueDeep);
    v.box(3, 3, 7, 25, 49, 8, PAL.goldBright);
    v.box(6, 51, 5, 22, 52, 9, PAL.bronze);
    v.boxEmissive(6, 50, 10, 8, 50, 12, PAL.lanternGlow);
    v.boxEmissive(20, 50, 10, 22, 50, 12, PAL.lanternGlow);
    // 客室上部：クリーム壁＋凹み付きアーチ連続窓（暖色車内光）
    v.box(4, 3, 15, 24, 49, 29, PAL.stoneCream);
    for (const wy of [8, 16, 24, 32, 40]) {
      // 左右窓（外壁x=4/24を開口し、1px奥へ凹んだ暖色車内光＋木製十字窓枠）
      for (let z = 18; z <= 25; z++) {
        for (let y = wy + 1; y <= wy + 3; y++) {
          v.clear(4, y, z);
          v.clear(24, y, z);
        }
      }
      v.box(4, wy, 17, 4, wy + 4, 17, PAL.oak);
      v.box(4, wy, 26, 4, wy + 4, 26, PAL.oak);
      v.box(4, wy + 2, 18, 4, wy + 2, 25, PAL.oak);
      v.box(24, wy, 17, 24, wy + 4, 17, PAL.oak);
      v.box(24, wy, 26, 24, wy + 4, 26, PAL.oak);
      v.box(24, wy + 2, 18, 24, wy + 2, 25, PAL.oak);
      v.boxEmissive(5, wy + 1, 18, 5, wy + 3, 25, PAL.lanternGlow);
      v.boxEmissive(23, wy + 1, 18, 23, wy + 3, 25, PAL.lanternGlow);
    }
    // 前面運転席窓（y=49を開口して1px凹んだシアン発光風防）
    for (let z = 18; z <= 25; z++) for (let x = 10; x <= 18; x++) v.clear(x, 49, z);
    v.box(14, 49, 18, 14, 49, 25, PAL.bronze);
    v.boxEmissive(9, 48, 18, 19, 48, 25, PAL.cyan);
    v.box(8, 49, 17, 20, 49, 17, PAL.bronze);
    // 庇＋ダブルデッキ屋根＋パンタグラフ魔導集電器
    v.box(3, 2, 30, 25, 50, 31, PAL.goldBright);
    v.box(5, 4, 32, 23, 48, 35, PAL.blue);
    v.box(8, 10, 36, 20, 42, 36, PAL.bronze);
    v.boxEmissive(12, 19, 37, 16, 33, 39, spark);
    return v;
  });
  made.push(save2x(CHARS, 'chr_mana_tram', frames, 'characters', '環状マナ軌道トラム（2x・29x53x40・4f）', [15, 27], { aoStrength: 0.24 }));
}

console.log(`generated ${made.length} props/characters (all density=2):`);
for (const m of made) console.log(`  ${m.id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount} (fp=${m.footprint.join('x')}, d=${m.density}) frames=${m.frames}`);
