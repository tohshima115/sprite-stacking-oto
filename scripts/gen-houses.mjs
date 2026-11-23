// 手続き生成で王都の住宅・商館・貴族邸全26種を建築史基準＋立体凹凸（density: 2, oto-64）で生成する。
// 正面は +y（下向き）。全4面ファサード・2px凹み窓・張り出し窓台/ペディメント/出窓/バルコニー/ドーマー/煙突胸壁/深い軒を含む。
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
  drawDormer,
  drawHoistBeam,
  drawPitchedRoof2x,
} from './arch.mjs';

const OUT = 'assets/stacks/buildings';

function saveVol2x(id, v, footprint, notes) {
  v.bakeLighting({ density: 2, aoStrength: 0.28, grain: 0 });
  return writeSheet(`${OUT}/${id}.png`, [v], {
    id,
    category: 'buildings',
    density: 2,
    footprint,
    pivot: [v.w / 2, v.h / 2],
    source: 'procedural',
    palette: 'oto-64',
    notes,
  });
}

/** 1F 石柱アーケード柱廊（+y 前面：2F 張り出し下に深い影付き連続アーチ歩廊と奥まった店頭壁を作る） */
function buildGroundArcadeFront(v, x0, x1, wallY, zBottom, splitZ, colPier = PAL.stoneCream, colDark = PAL.stoneDark) {
  const arcadeY = wallY;
  const shopY = Math.max(wallY - 4, 2);
  // 歩廊奥の通路空間 (z = zBottom..splitZ-3, y = shopY+1..arcadeY) を一旦くり抜く
  for (let z = zBottom; z <= splitZ - 3; z++) {
    for (let y = shopY + 1; y <= arcadeY; y++) {
      for (let x = x0 + 2; x <= x1 - 2; x++) v.clear(x, y, z);
    }
  }
  // 4 本の切石ピラスター柱＋半円アーチ迫石
  const span = x1 - x0;
  const piers = [x0, x0 + Math.round(span * 0.33), x1 - Math.round(span * 0.33), x1];
  for (const px of piers) {
    const xa = Math.max(x0, px - 1), xb = Math.min(x1, px + 1);
    v.box(xa, arcadeY - 1, 0, xb, arcadeY + 1, splitZ - 2, colPier);
    v.box(xa, arcadeY - 1, 0, xb, arcadeY + 1, 3, colDark); // 土台礎石
    v.box(xa, arcadeY - 1, splitZ - 4, xb, arcadeY + 1, splitZ - 3, PAL.marble); // 柱頭
  }
  // アーチ開口上の石帯＆スパンドレル（各スパンごとに小さなアーチ曲線を彫る）
  v.box(x0, arcadeY - 1, splitZ - 4, x1, arcadeY + 1, splitZ - 1, colPier);
  for (let s = 0; s < piers.length - 1; s++) {
    const ax0 = piers[s] + 2, ax1 = piers[s + 1] - 2;
    const amx = Math.floor((ax0 + ax1) / 2);
    for (let x = ax0; x <= ax1; x++) {
      const dist = Math.abs(x - amx) / Math.max(1, (ax1 - ax0) * 0.5);
      const archDrop = Math.round(dist * dist * 3);
      for (let z = splitZ - 4; z <= splitZ - 2 - archDrop; z++) {
        v.clear(x, arcadeY - 1, z);
        v.clear(x, arcadeY, z);
        v.clear(x, arcadeY + 1, z);
      }
    }
  }
  // 奥まった店舗正面壁（暖色灯りショーウィンドウ＋扉）
  v.box(x0 + 1, shopY, zBottom, x1 - 1, shopY, splitZ - 2, PAL.oak);
  const midX = Math.floor((x0 + x1) / 2);
  v.boxEmissive(x0 + 4, shopY + 1, zBottom + 4, midX - 4, shopY + 1, splitZ - 5, PAL.lanternGlow);
  v.boxEmissive(midX + 4, shopY + 1, zBottom + 4, x1 - 4, shopY + 1, splitZ - 5, PAL.lanternGlow);
  v.box(midX - 2, shopY + 1, 1, midX + 2, shopY + 1, splitZ - 4, PAL.woodDeep);
  v.set(midX + 1, shopY + 2, 8, PAL.goldBright);
  v.box(x0, shopY, 0, x1, arcadeY + 1, 1, PAL.stoneMid); // 歩廊石畳フロア
}

function buildHouse2x(spec) {
  const w = spec.w * 2;
  const h = spec.h * 2;
  const wallH = spec.wallH * 2;
  const roofH = spec.roofH * 2;
  const {
    id, roofStyle, roofMain, roofAlt, wallColor, timberColor, plinthColor,
    awningColor, shutterColor, hasChimney, hasDormer, secondFloorOverhang,
    isSlum, mossSpots, hasArcade, hasOrielSide, hasPorch, notes,
  } = spec;

  const totalH = wallH + roofH;
  const v = new Volume(w, h, totalH);
  const margin = isSlum ? 3 : (Math.min(w, h) >= 50 ? 5 : 4);
  const pad = secondFloorOverhang ? 2 : 0;

  const x0 = margin, x1 = w - 1 - margin;
  const y0 = margin, y1 = h - 1 - margin;
  const mx = Math.floor((x0 + x1) / 2);
  const my = Math.floor((y0 + y1) / 2);

  const floors3 = wallH >= 60;
  const splitZ = wallH >= 40 ? Math.floor(wallH * (floors3 ? 0.40 : 0.48)) : wallH;
  const mid3Z = floors3 ? Math.floor(splitZ + (wallH - splitZ) * 0.50) : wallH;
  const plinthTop = isSlum ? 3 : 6;
  const useStoneBody = !isSlum && (floors3 || wallColor === PAL.stoneCream || wallColor === PAL.marble);
  const useQuoins = !isSlum && (floors3 || roofStyle === 'stepped-gable' || roofStyle === 'mansard');

  // 1) ソリッド壁コア充填（2F 張り出し時は 1F を pad 分内側に引き締める）
  const f1x0 = x0 + pad, f1x1 = x1 - pad;
  const f1y0 = y0 + pad, f1y1 = y1 - pad;
  fillStoneBox(v, f1x0 - 1, f1y0 - 1, 0, f1x1 + 1, f1y1 + 1, 1, PAL.stoneDeep, PAL.stoneDark, PAL.iron);
  fillStoneBox(v, f1x0, f1y0, 1, f1x1, f1y1, plinthTop, plinthColor, PAL.stoneDark, PAL.stoneDeep);

  if (!isSlum && (hasArcade || floors3)) {
    fillStoneBox(v, f1x0, f1y0, plinthTop + 1, f1x1, f1y1, splitZ - 1, plinthColor, PAL.stoneMid, PAL.stoneDark);
  } else {
    v.box(f1x0, f1y0, plinthTop + 1, f1x1, f1y1, splitZ - 1, wallColor);
  }
  if (splitZ < wallH) {
    v.box(x0, y0, splitZ, x1, y1, wallH - 1, wallColor);
    drawJettyCorbels(v, x0, y0, x1, y1, splitZ, pad, timberColor);
  }

  // 2) 木骨ハーフティンバー / 石隅石クオイン / 胴蛇腹・コーニス
  if (isSlum) {
    // 貧民街の不揃いな当て板＆角柱＋粗雑な斜め突っ張り棒
    for (let z = 3; z < wallH - 1; z++) {
      for (const cx of [f1x0, f1x1]) for (const cy of [f1y0, f1y1]) v.set(cx, cy, z, timberColor);
    }
    for (let z = 4; z < wallH - 3; z += 4) {
      for (let x = f1x0 + 3; x <= f1x1 - 4; x += 5) {
        if ((x * 7 + z * 5) % 3 === 0) {
          v.box(x, f1y1, z, x + 2, f1y1, z + 1, PAL.oak);
          v.box(x, f1y0, z, x + 2, f1y0, z + 1, PAL.woodDark);
        }
      }
      for (let y = f1y0 + 3; y <= f1y1 - 4; y += 5) {
        if ((y * 5 + z * 3) % 3 === 0) {
          v.box(f1x0, y, z, f1x0, y + 2, z + 1, PAL.oak);
          v.box(f1x1, y, z, f1x1, y + 2, z + 1, PAL.woodDark);
        }
      }
    }
    // 貧民街らしい片流れ差しかけ物置（片側面に不規則な張り出しボリューム）
    if (id === 'bld_house_slum_a' || id === 'bld_house_slum_e') {
      const sy0 = my - 5, sy1 = my + 6;
      const sx0 = Math.max(0, x0 - 3);
      for (let z = 0; z <= 11; z++) {
        const reach = Math.max(sx0, x0 - 3 + Math.floor(z / 4));
        v.box(reach, sy0, z, x0, sy1, z, z >= 9 ? PAL.woodDeep : PAL.oak);
      }
    }
  } else {
    if (useQuoins) {
      drawStoneQuoins(v, x0, y0, x1, y1, splitZ < wallH ? splitZ : 4, wallH - 4, PAL.stoneCream, PAL.stoneLight);
      if (splitZ < wallH) drawStringcourse(v, x0, y0, x1, y1, splitZ, PAL.stoneCream);
      if (floors3) drawStringcourse(v, x0, y0, x1, y1, mid3Z, PAL.stoneCream);
    }
    if (!useStoneBody) {
      if (splitZ < wallH) {
        drawTimberFrame2x(v, f1x0, f1y0, f1x1, f1y1, plinthTop + 1, splitZ - 1, timberColor, { braces: false, topPlateOut: false });
        drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, timberColor, {
          braces: true,
          midZ: floors3 ? mid3Z : null,
          topPlateOut: false,
        });
      } else {
        drawTimberFrame2x(v, f1x0, f1y0, f1x1, f1y1, plinthTop + 1, wallH - 3, timberColor, { braces: true, topPlateOut: false });
      }
    }
    // 屋根直下の張り出し軒蛇腹（コーニス / 上枠梁）
    drawCornice(v, x0, y0, x1, y1, wallH - 3, useStoneBody ? PAL.stoneCream : timberColor, useStoneBody ? PAL.marble : PAL.oak, useStoneBody);
  }

  // 3) 正面玄関（1F アーケード or 立体玄関ポーチ/扉＋オーニング＋看板）
  const doorH = isSlum ? Math.min(14, wallH - 6) : Math.min(20, Math.max(15, splitZ - 7));
  if (hasArcade && splitZ < wallH) {
    buildGroundArcadeFront(v, f1x0, f1x1, f1y1, 2, splitZ, PAL.stoneCream, PAL.stoneDark);
    if (awningColor) {
      const span = Math.min(13, Math.floor((f1x1 - f1x0) * 0.42));
      const az = splitZ - 1;
      for (let k = 0; k < 3; k++) {
        for (let x = mx - span; x <= mx + span; x++) {
          const st = Math.floor((x - mx + span) / 2) % 2 === 0 ? awningColor : PAL.clothCream;
          v.set(x, f1y1 + 1 + k, az - k, st);
        }
      }
    }
    // 商店街用吊り看板
    v.box(mx + 10, f1y1 + 1, splitZ + 2, mx + 10, f1y1 + 4, splitZ + 2, PAL.iron);
    v.box(mx + 10, f1y1 + 2, splitZ - 2, mx + 10, f1y1 + 4, splitZ + 1, awningColor ?? PAL.goldBright);
  } else {
    drawPortal(v, '+y', f1y1, mx, isSlum ? 1 : 2, {
      halfW: isSlum ? 2 : 3,
      doorH,
      doorCol: isSlum ? PAL.woodDark : PAL.oak,
      frameCol: isSlum ? timberColor : (useStoneBody ? PAL.marble : PAL.stoneCream),
      arch: !isSlum,
      steps: !isSlum,
      porch: !isSlum && hasPorch,
      porchRoofCol: roofAlt,
      awningCol: isSlum ? null : awningColor,
      lantern: !isSlum,
      signCol: awningColor ?? null,
    });
  }

  // 背面裏口（小規模な木戸＋踏み石）
  if (!isSlum) {
    drawPortal(v, '-y', f1y0, mx, 1, {
      halfW: 2,
      doorH: Math.min(15, Math.max(12, doorH - 3)),
      doorCol: PAL.woodDeep,
      frameCol: PAL.stoneMid,
      arch: false,
      steps: true,
      porch: false,
      lantern: false,
    });
  }

  // 4) 全4面への立体窓配置（コーナー干渉を避けて均等・重厚に配置）
  const levels = isSlum
    ? [Math.min(wallH - 7, 7)]
    : floors3
      ? [9, splitZ + 4, mid3Z + 4]
      : splitZ < wallH ? [9, splitZ + 4] : [9, 21];

  const orielFace = hasOrielSide ?? (secondFloorOverhang && !isSlum && w >= 48 ? '+x' : null);

  for (let li = 0; li < levels.length; li++) {
    const wz = levels[li];
    const winStyle = isSlum
      ? 'slum'
      : (floors3 && li >= 1 && (useStoneBody || id === 'bld_house_main_c'))
        ? 'pediment'
        : ((x1 - x0 >= 40 && li === 1) ? 'double' : 'casement');
    const winH = winStyle === 'pediment' ? 10 : (isSlum ? 4 : 7);
    if (wz + winH + (winStyle === 'pediment' ? 3 : 2) >= wallH) continue;

    const isF1 = wz < splitZ;
    const fx0 = isF1 ? f1x0 : x0, fx1 = isF1 ? f1x1 : x1;
    const fy0 = isF1 ? f1y0 : y0, fy1 = isF1 ? f1y1 : y1;
    const xSafe = winStyle === 'double' ? 7 : 6;
    const xCenters = (fx1 - fx0) >= 24 ? [fx0 + xSafe, fx1 - xSafe] : [mx];
    const ySafe = winStyle === 'double' ? 7 : 6;
    const yCenters = (fy1 - fy0) >= 24 ? [fy0 + ySafe, fy1 - ySafe] : [my];

    // +y (正面) & -y (背面)
    for (const ux of xCenters) {
      if (!(isF1 && hasArcade)) {
        if (!(isF1 && Math.abs(ux - mx) <= 7)) {
          drawArchWindow(v, '+y', fy1, ux, wz, {
            style: winStyle,
            glow: !isSlum && (li === 1 || (ux + li) % 2 === 0),
            shutterCol: shutterColor,
            flowerBox: !isSlum && li === 1 && !floors3 ? (ux < mx ? PAL.crimson : PAL.goldBright) : false,
            frameCol: useStoneBody ? PAL.marble : timberColor,
            juliet: floors3 && li === 1,
          });
        }
      }
      if (!(isF1 && Math.abs(ux - mx) <= 6)) {
        drawArchWindow(v, '-y', fy0, ux, wz, {
          style: winStyle,
          glow: !isSlum && (ux % 2 === 0),
          shutterCol: shutterColor,
          frameCol: useStoneBody ? PAL.marble : timberColor,
        });
      }
    }

    // +x (右側面) & -x (左側面)
    for (const face of ['+x', '-x']) {
      const wc = face === '+x' ? fx1 : fx0;
      const hasBayHere = orielFace === face && li === 1 && !isF1 && (fy1 - fy0) >= 22;
      if (hasBayHere) {
        drawOrielWindow(v, face, wc, my, wz, {
          wallCol: wallColor,
          timberCol: timberColor,
          roofCol: roofAlt,
          roofAlt: roofMain,
          glow: true,
        });
      } else {
        for (const uy of yCenters) {
          if (hasChimney && face === '-x' && Math.abs(uy - (fy0 + 8)) <= 5) continue;
          drawArchWindow(v, face, wc, uy, wz, {
            style: (!isSlum && face === orielFace && li === 1) ? 'double' : winStyle,
            glow: !isSlum && ((li === 1) || (uy % 2 === 0)),
            shutterCol: shutterColor,
            flowerBox: !isSlum && li === 1 && uy === yCenters[0] ? PAL.crimson : false,
            frameCol: useStoneBody ? PAL.marble : timberColor,
            juliet: floors3 && li === 1,
          });
        }
      }
    }
  }

  // 5) 深い軒の出（eave=3）付き屋根
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, roofH, {
    roofStyle,
    roofMain,
    roofAlt,
    wallColor,
    timberColor,
    bargeCol: roofStyle === 'stepped-gable' ? PAL.brickDark : PAL.woodDeep,
    eave: isSlum ? 2 : 3,
    mossSpots,
  });

  // 6) 屋根上ドーマー窓（左右両面の傾斜に突き出し設置）
  if (hasDormer && roofH >= 16) {
    if (roofStyle === 'gable-y' || roofStyle === 'mansard' || roofStyle === 'jerkinhead') {
      const dyList = (y1 - y0) >= 34 ? [y0 + 12, y1 - 12] : [my];
      for (const dy of dyList) {
        drawDormer(v, '-x', x0, dy, wallH, { wallCol: wallColor, roofCol: roofAlt, timberCol: timberColor, glow: true, setback: -2 });
        drawDormer(v, '+x', x1, dy, wallH, { wallCol: wallColor, roofCol: roofAlt, timberCol: timberColor, glow: true, setback: -2 });
      }
    }
    if (roofStyle === 'gable-x' || roofStyle === 'mansard' || roofStyle === 'hip') {
      drawDormer(v, '+y', y1, mx, wallH, { wallCol: wallColor, roofCol: roofAlt, timberCol: timberColor, glow: true, setback: -2 });
      drawDormer(v, '-y', y0, mx, wallH, { wallCol: wallColor, roofCol: roofAlt, timberCol: timberColor, glow: false, setback: -2 });
    }
  }

  // 7) 切妻頂部滑車ビーム（下町職人・中産商館の象徴）
  if (!isSlum && roofStyle === 'gable-y' && roofH >= 20) {
    drawHoistBeam(v, '+y', y1, mx, wallH + 4, timberColor);
  }

  // 8) 外壁張り出し石造煙突胸壁（外壁の基壇から屋根上へ立ち上がり、棟を越えて抜ける）
  if (hasChimney) {
    drawChimneyBreast(v, '-x', x0, y0 + 8, 0, totalH - 1, {
      colMain: isSlum ? PAL.stoneDark : PAL.stoneMid,
      colTrim: isSlum ? PAL.stoneMid : PAL.stoneCream,
      colDeep: PAL.stoneDeep,
      halfW: isSlum ? 1 : 2,
      shoulderZ: Math.max(12, wallH - 4),
    });
  }

  return saveVol2x(id, v, [spec.w, spec.h], notes);
}

const specs = [
  // --- 下町・職人街 (down_a..d) ---
  {
    id: 'bld_house_down_a', w: 19, h: 21, wallH: 18, roofH: 11, roofStyle: 'gable-y',
    roofMain: PAL.brickDark, roofAlt: PAL.tileDeep, wallColor: PAL.plaster, timberColor: PAL.woodDeep, plinthColor: PAL.stoneDark,
    shutterColor: PAL.oak, hasChimney: true, hasDormer: true, hasPorch: true, secondFloorOverhang: false, notes: '下町の家A（2x・切妻ポーチ＆煙突胸壁）',
  },
  {
    id: 'bld_house_down_b', w: 21, h: 21, wallH: 19, roofH: 11, roofStyle: 'jerkinhead',
    roofMain: PAL.tileDeep, roofAlt: PAL.crimson, wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, plinthColor: PAL.stoneDark,
    shutterColor: PAL.burgundy, hasChimney: false, hasDormer: true, hasPorch: false, secondFloorOverhang: false, notes: '下町の家B（2x・半切妻＆鎧戸花台）',
  },
  {
    id: 'bld_house_down_c', w: 21, h: 23, wallH: 21, roofH: 12, roofStyle: 'gable-x',
    roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.plaster, timberColor: PAL.oak, plinthColor: PAL.stone,
    shutterColor: PAL.woodDark, hasChimney: true, hasDormer: true, hasPorch: true, secondFloorOverhang: true, notes: '下町の家C（2x・2F張り出し平入）',
  },
  {
    id: 'bld_house_down_d', w: 19, h: 23, wallH: 20, roofH: 11, roofStyle: 'mansard',
    roofMain: PAL.slateDark, roofAlt: PAL.slate, wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, plinthColor: PAL.stoneDark,
    shutterColor: PAL.oak, hasChimney: false, hasDormer: true, hasPorch: false, secondFloorOverhang: false, notes: '下町の家D（2x・マンサード＆ドーマー）',
  },
  // --- 貧民街 (slum_a..e) ---
  {
    id: 'bld_house_slum_a', w: 15, h: 17, wallH: 11, roofH: 8, roofStyle: 'gable-y',
    roofMain: PAL.thatchDark, roofAlt: PAL.oak, wallColor: PAL.stoneDark, timberColor: PAL.woodDeep, plinthColor: PAL.woodDark,
    hasChimney: false, secondFloorOverhang: false, isSlum: true, mossSpots: true, notes: '貧民街の小屋A（2x・藁葺き＆差しかけ）',
  },
  {
    id: 'bld_house_slum_b', w: 17, h: 17, wallH: 12, roofH: 8, roofStyle: 'lean-to',
    roofMain: PAL.oak, roofAlt: PAL.woodDeep, wallColor: PAL.daub, timberColor: PAL.woodDeep, plinthColor: PAL.stoneDeep,
    hasChimney: true, secondFloorOverhang: false, isSlum: true, mossSpots: true, notes: '貧民街の片流れ小屋B（2x・外煙突）',
  },
  {
    id: 'bld_house_slum_c', w: 17, h: 19, wallH: 13, roofH: 9, roofStyle: 'hip',
    roofMain: PAL.bark, roofAlt: PAL.stoneDeep, wallColor: PAL.daub, timberColor: PAL.oak, plinthColor: PAL.woodDark,
    hasChimney: false, secondFloorOverhang: false, isSlum: true, mossSpots: true, notes: '貧民街のボロ長屋C（2x・苔屋根）',
  },
  {
    id: 'bld_house_slum_d', w: 19, h: 19, wallH: 12, roofH: 8, roofStyle: 'gable-x',
    roofMain: PAL.thatchDark, roofAlt: PAL.bark, wallColor: PAL.stoneMid, timberColor: PAL.woodDeep, plinthColor: PAL.stoneDeep,
    hasChimney: true, secondFloorOverhang: false, isSlum: true, mossSpots: true, notes: '貧民街の平屋D（2x・粗煙突＆鎧戸）',
  },
  {
    id: 'bld_house_slum_e', w: 19, h: 21, wallH: 14, roofH: 10, roofStyle: 'lean-to',
    roofMain: PAL.thatchLight, roofAlt: PAL.woodDark, wallColor: PAL.stoneDark, timberColor: PAL.oak, plinthColor: PAL.woodDark,
    hasChimney: true, secondFloorOverhang: false, isSlum: true, mossSpots: true, notes: '貧民街の増築小屋E（2x・増築差しかけ）',
  },
  // --- 中産市民住宅街 (res_a..e) ---
  {
    id: 'bld_house_res_a', w: 23, h: 25, wallH: 23, roofH: 13, roofStyle: 'gable-y',
    roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, plinthColor: PAL.stoneMid,
    shutterColor: PAL.pineDark, hasChimney: true, hasDormer: true, hasPorch: true, secondFloorOverhang: false, notes: '住宅街の家A（2x・切妻ポーチ＆両面ドーマー）',
  },
  {
    id: 'bld_house_res_b', w: 25, h: 25, wallH: 25, roofH: 14, roofStyle: 'gable-y',
    roofMain: PAL.tileSun, roofAlt: PAL.terracotta, wallColor: PAL.plaster, timberColor: PAL.oak, plinthColor: PAL.stoneDark,
    shutterColor: PAL.clothNavy, hasChimney: true, hasDormer: true, hasPorch: true, secondFloorOverhang: true, hasOrielSide: '+x', notes: '住宅街の家B（2x・2F張り出し＆出窓）',
  },
  {
    id: 'bld_house_res_c', w: 25, h: 27, wallH: 26, roofH: 14, roofStyle: 'jerkinhead',
    roofMain: PAL.terracotta, roofAlt: PAL.tileSun, wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, plinthColor: PAL.stone,
    shutterColor: PAL.oak, hasChimney: false, hasDormer: true, hasPorch: true, secondFloorOverhang: false, notes: '住宅街の家C（2x・半切妻＆組窓）',
  },
  {
    id: 'bld_house_res_d', w: 27, h: 27, wallH: 28, roofH: 16, roofStyle: 'gable-x',
    roofMain: PAL.brickDark, roofAlt: PAL.terracotta, wallColor: PAL.plaster, timberColor: PAL.woodDeep, plinthColor: PAL.stone,
    shutterColor: PAL.pineDark, hasChimney: true, hasDormer: true, hasPorch: true, secondFloorOverhang: true, hasOrielSide: '+x', notes: '住宅街の大住宅D（2x・平入＆出窓）',
  },
  {
    id: 'bld_house_res_e', w: 21, h: 27, wallH: 31, roofH: 17, roofStyle: 'stepped-gable',
    roofMain: PAL.slate, roofAlt: PAL.slateDeep, wallColor: PAL.plasterLight, timberColor: PAL.brickDark, plinthColor: PAL.stoneMid,
    shutterColor: PAL.brickDark, hasChimney: true, hasDormer: false, hasPorch: false, secondFloorOverhang: false, notes: '市民街の高層タウンハウスE（2x・階段切妻＆滑車）',
  },
  // --- メインストリート大商館 (main_a..d) ---
  {
    id: 'bld_house_main_a', w: 27, h: 29, wallH: 30, roofH: 16, roofStyle: 'gable-y',
    roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, plinthColor: PAL.stoneMid,
    awningColor: PAL.crimson, shutterColor: PAL.burgundy, hasChimney: true, hasDormer: true, secondFloorOverhang: true, hasArcade: true, hasOrielSide: '-x', notes: '大通りの商店A（2x・歩廊アーケード＆出窓）',
  },
  {
    id: 'bld_house_main_b', w: 29, h: 29, wallH: 32, roofH: 17, roofStyle: 'hip',
    roofMain: PAL.slate, roofAlt: PAL.slateDeep, wallColor: PAL.stoneCream, timberColor: PAL.oak, plinthColor: PAL.stoneLight,
    awningColor: PAL.clothNavy, shutterColor: PAL.clothNavy, hasChimney: true, hasDormer: true, secondFloorOverhang: true, hasArcade: true, notes: '大通りの商店B（2x・全4面ペディメント窓＆バルコニー）',
  },
  {
    id: 'bld_house_main_c', w: 29, h: 31, wallH: 36, roofH: 18, roofStyle: 'gable-y',
    roofMain: PAL.tileSun, roofAlt: PAL.terracotta, wallColor: PAL.plasterWarm, timberColor: PAL.woodDeep, plinthColor: PAL.stone,
    awningColor: PAL.gold, shutterColor: PAL.oak, hasChimney: true, hasDormer: true, secondFloorOverhang: true, hasArcade: true, hasOrielSide: '+x', notes: '大通りの商館C（2x・3Fバルコニー＆出窓）',
  },
  {
    id: 'bld_house_main_d', w: 31, h: 31, wallH: 40, roofH: 18, roofStyle: 'mansard',
    roofMain: PAL.brickDark, roofAlt: PAL.tileDeep, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, plinthColor: PAL.stoneLight,
    awningColor: PAL.forest, shutterColor: PAL.pineDeep, hasChimney: true, hasDormer: true, secondFloorOverhang: true, hasArcade: true, notes: '大通りの館D（2x・マンサード＆全4面ペディメント窓）',
  },
];

const out = specs.map(buildHouse2x);

// --- 特殊建築形態 8種（すべて建築史仕様・全4面立体ディテール付き） ---

// 1) bld_house_down_e (54x42x68, fp=27x21): 職人2連切妻長屋
{
  const W = 54, H = 42, wallH = 42, roofH = 26, v = new Volume(W, H, wallH + roofH);
  const x0 = 4, x1 = 49, y0 = 5, y1 = 36, splitZ = 20;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, 5, PAL.stoneDark, PAL.stoneDeep, PAL.iron);
  v.box(x0 + 1, y0 + 1, 6, x1 - 1, y1 - 1, splitZ - 1, PAL.plaster);
  v.box(x0, y0, splitZ, x1, y1, wallH - 2, PAL.plasterLight);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.woodDeep);
  drawTimberFrame2x(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.woodDeep, { braces: true });
  for (let z = 6; z < wallH - 2; z++) { v.set(26, y0, z, PAL.woodDeep); v.set(27, y0, z, PAL.woodDeep); v.set(26, y1, z, PAL.woodDeep); v.set(27, y1, z, PAL.woodDeep); }
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  for (const dx of [15, 38]) {
    drawPortal(v, '+y', y1 - 1, dx, 1, { halfW: 3, doorH: 15, porch: true, porchRoofCol: PAL.brickDark });
    drawArchWindow(v, '+y', y1, dx, 24, { style: 'double', glow: true, shutterCol: PAL.oak, flowerBox: PAL.crimson });
    drawArchWindow(v, '-y', y0, dx, 24, { style: 'double', glow: false, shutterCol: PAL.oak });
    drawArchWindow(v, '-y', y0 + 1, dx, 8, { style: 'casement', glow: true, shutterCol: PAL.oak });
  }
  drawArchWindow(v, '+x', x1, 20, 24, { style: 'casement', glow: true, shutterCol: PAL.oak });
  drawArchWindow(v, '-x', x0, 20, 24, { style: 'casement', glow: false, shutterCol: PAL.oak });
  for (let k = 0; k < roofH; k++) {
    const z = wallH + k, inset = Math.floor((k / (roofH - 1)) * 12);
    for (const [bx0, bx1] of [[x0 - 3, 26], [27, x1 + 3]]) {
      const rx0 = bx0 + inset, rx1 = bx1 - inset;
      if (rx0 > rx1) continue;
      for (let y = y0 - 3; y <= y1 + 3; y++) for (let x = rx0; x <= rx1; x++) {
        const isRidge = k >= roofH - 3;
        const isEdge = y <= y0 - 2 || y >= y1 + 2;
        v.set(x, y, z, isRidge ? PAL.tileDeep : (isEdge ? PAL.woodDeep : ((x + z) % 3 === 0 ? PAL.terracotta : PAL.brickDark)));
      }
      if (bx0 + 3 + inset <= bx1 - 3 - inset) {
        for (let x = Math.max(x0, bx0 + 3 + inset); x <= Math.min(x1, bx1 - 3 - inset); x++) {
          v.box(x, y0, z, x, y0 + 1, z, PAL.plasterLight);
          v.box(x, y1 - 1, z, x, y1, z, PAL.plasterLight);
        }
      }
    }
  }
  drawHoistBeam(v, '+y', y1, 15, wallH + 4, PAL.oak);
  drawHoistBeam(v, '+y', y1, 38, wallH + 4, PAL.oak);
  drawChimneyBreast(v, '-x', x0, 12, 0, wallH + roofH - 1, { shoulderZ: wallH - 4 });
  out.push(saveVol2x('bld_house_down_e', v, [27, 21], '下町の2連切妻職人長屋（2x・54x42x68）'));
}

// 2) bld_house_res_f (54x54x84, fp=27x27): L字型中庭付き市民宅
{
  const W = 54, H = 54, wallH = 50, v = new Volume(W, H, 84);
  const wx0 = 5, wy0 = 5, mainX1 = 27, mainY1 = 47, wingX1 = 47, wingY1 = 27;
  fillStoneBox(v, wx0, wy0, 0, mainX1, mainY1, 6, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  fillStoneBox(v, mainX1 - 2, wy0, 0, wingX1, wingY1, 6, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(wx0, wy0, 7, mainX1, mainY1, wallH - 1, PAL.plaster);
  v.box(mainX1 - 2, wy0, 7, wingX1, wingY1, wallH - 1, PAL.plaster);
  drawTimberFrame2x(v, wx0, wy0, mainX1, mainY1, 7, wallH - 3, PAL.woodDeep, { midZ: 27, braces: true });
  drawTimberFrame2x(v, mainX1 - 2, wy0, wingX1, wingY1, 7, wallH - 3, PAL.woodDeep, { midZ: 27, braces: false });
  drawCornice(v, wx0, wy0, mainX1, mainY1, wallH - 3, PAL.woodDeep, PAL.oak, false);
  // 扉・出窓・2F 木バルコニー・全4面窓
  drawPortal(v, '+y', mainY1, 16, 1, { halfW: 3, doorH: 18, porch: true, porchRoofCol: PAL.terracotta });
  drawPortal(v, '+y', wingY1, 38, 1, { halfW: 2, doorH: 16, arch: true });
  drawArchWindow(v, '+y', mainY1, 16, 30, { style: 'double', glow: true, shutterCol: PAL.pineDark, flowerBox: PAL.crimson });
  drawArchWindow(v, '+y', wingY1, 38, 30, { style: 'casement', glow: true, shutterCol: PAL.pineDark, flowerBox: PAL.goldBright });
  drawArchWindow(v, '-y', wy0, 14, 11, { style: 'casement', glow: false, shutterCol: PAL.pineDark });
  drawArchWindow(v, '-y', wy0, 14, 30, { style: 'double', glow: true, shutterCol: PAL.pineDark });
  drawArchWindow(v, '-y', wy0, 38, 30, { style: 'casement', glow: true, shutterCol: PAL.pineDark });
  drawArchWindow(v, '-x', wx0, 16, 30, { style: 'double', glow: true, shutterCol: PAL.pineDark });
  drawArchWindow(v, '-x', wx0, 36, 30, { style: 'casement', glow: false, shutterCol: PAL.pineDark });
  drawArchWindow(v, '+x', wingX1, 16, 30, { style: 'casement', glow: true, shutterCol: PAL.pineDark });
  drawBalcony(v, '+x', mainX1, 37, 27, 4, 'timber', true);
  // 深い軒付き L 字屋根
  for (let k = 0; k < 32; k++) {
    const z = wallH + k;
    const ix = Math.floor((k / 31) * 14);
    for (let y = wy0 - 3; y <= mainY1 + 3; y++) {
      for (let x = wx0 - 3 + ix; x <= mainX1 + 3 - ix; x++) {
        if (x >= wx0 - 3 + ix && x <= mainX1 + 3 - ix) {
          v.set(x, y, z, k >= 29 ? PAL.tileDeep : ((x + y + z) % 4 === 0 ? PAL.brickDark : PAL.terracotta));
        }
      }
    }
    for (let x = mainX1 - 3; x <= wingX1 + 3; x++) {
      for (let y = wy0 - 3 + ix; y <= wingY1 + 3 - ix; y++) {
        v.set(x, y, z, k >= 29 ? PAL.tileDeep : ((x + y + z) % 4 === 0 ? PAL.brickDark : PAL.terracotta));
      }
    }
  }
  drawDormer(v, '-x', wx0, 34, wallH, { wallCol: PAL.plaster, roofCol: PAL.brickDark, glow: true, setback: -2 });
  drawChimneyBreast(v, '-y', wy0, 26, 0, 82, { shoulderZ: 46 });
  // 中庭庭園＋アーチ木門
  v.box(29, 47, 0, 48, 49, 8, PAL.stoneMid);
  v.box(47, 29, 0, 49, 49, 8, PAL.stoneMid);
  for (let z = 1; z <= 8; z++) for (let x = 35; x <= 40; x++) { v.clear(x, 47, z); v.clear(x, 48, z); v.clear(x, 49, z); }
  v.box(34, 33, 0, 42, 40, 4, PAL.forest);
  v.set(36, 36, 5, PAL.crimson); v.set(40, 37, 5, PAL.goldBright);
  out.push(saveVol2x('bld_house_res_f', v, [27, 27], '中庭付きL字型市民宅（2x・木バルコニー＆全4面窓）'));
}

// 3) bld_house_main_e (58x58x112, fp=29x29): 角地円錐タレット付き3F商館
{
  const W = 58, H = 58, wallH = 66, v = new Volume(W, H, 112);
  const x0 = 5, x1 = 48, y0 = 5, y1 = 49, splitZ = 27;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneMid, PAL.stoneCream, PAL.stoneDark);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterLight);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.stoneCream);
  drawStoneQuoins(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.stoneCream, PAL.marble);
  drawStringcourse(v, x0, y0, x1, y1, splitZ, PAL.stoneCream);
  drawStringcourse(v, x0, y0, x1, y1, 46, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  buildGroundArcadeFront(v, x0 + 1, x1 - 1, y1 - 1, 2, splitZ, PAL.stoneCream, PAL.stoneDark);
  drawPortal(v, '-x', x0 + 1, 24, 2, { halfW: 3, doorH: 18, arch: true, awningCol: PAL.clothNavy });
  drawPortal(v, '-y', y0 + 1, 26, 2, { halfW: 2, doorH: 16, arch: false, lantern: false });
  // 全4面に 2F/3F ペディメント窓＋ジュリエット手すり
  for (const wz of [31, 50]) {
    const isP = wz === 31;
    drawArchWindow(v, '+y', y1, 14, wz, { style: isP ? 'pediment' : 'casement', glow: true, juliet: isP });
    drawArchWindow(v, '+y', y1, 31, wz, { style: isP ? 'pediment' : 'casement', glow: true, juliet: isP });
    drawArchWindow(v, '-y', y0, 15, wz, { style: isP ? 'pediment' : 'casement', glow: isP });
    drawArchWindow(v, '-y', y0, 35, wz, { style: isP ? 'pediment' : 'casement', glow: !isP });
    drawArchWindow(v, '-x', x0, 16, wz, { style: isP ? 'pediment' : 'casement', glow: true, juliet: isP });
    drawArchWindow(v, '-x', x0, 35, wz, { style: isP ? 'pediment' : 'casement', glow: isP });
    drawArchWindow(v, '+x', x1, 16, wz, { style: isP ? 'pediment' : 'casement', glow: true });
  }
  drawArchWindow(v, '+x', x1 - 1, 16, 10, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
  drawArchWindow(v, '-y', y0 + 1, 15, 10, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 34, {
    roofStyle: 'hip', roofMain: PAL.terracotta, roofAlt: PAL.brickDark, wallColor: PAL.plasterLight, timberColor: PAL.woodDeep, eave: 3,
  });
  drawDormer(v, '+y', y1, 22, wallH, { wallCol: PAL.marble, roofCol: PAL.brickDark, glow: true, setback: -2 });
  drawDormer(v, '-x', x0, 26, wallH, { wallCol: PAL.marble, roofCol: PAL.brickDark, glow: true, setback: -2 });
  // 南東角円錐タレット（持ち送り corbel 環付き＋深い縦長ランセット）
  for (let z = 0; z < 80; z++) {
    const rr = (z >= 75 && z <= 79) ? 10.6 : 9.4;
    for (let y = 34; y <= 57; y++) for (let x = 34; x <= 57; x++) {
      if (Math.hypot(x - 46, y - 46) <= rr) v.set(x, y, z, (z % 20 <= 1 || z === 75) ? PAL.stoneCream : PAL.stoneMid);
    }
  }
  for (const wz of [38, 56]) {
    for (let z = wz; z <= wz + 7; z++) {
      v.clear(46, 55, z); v.clear(46, 54, z); v.setEmissive(46, 53, z, PAL.cyan);
      v.clear(55, 46, z); v.clear(54, 46, z); v.setEmissive(53, 46, z, PAL.cyan);
    }
  }
  for (let k = 0; k < 32; k++) {
    const z = 80 + k, r = Math.max(0.8, 11.4 * (1 - k / 31));
    for (let y = 34; y <= 57; y++) for (let x = 34; x <= 57; x++) {
      if (Math.hypot(x - 46, y - 46) <= r) v.set(x, y, z, k >= 26 || k <= 1 ? PAL.goldBright : (k % 3 === 0 ? PAL.blueDeep : PAL.blue));
    }
  }
  out.push(saveVol2x('bld_house_main_e', v, [29, 29], '角地タレット付き大商館E（2x・1F歩廊＆全4面ペディメント窓）'));
}

// 4) bld_house_main_f (62x58x116, fp=31x29): 時計破風付きギルド商会館
{
  const W = 62, H = 58, wallH = 70, v = new Volume(W, H, 116);
  const x0 = 5, x1 = 56, y0 = 5, y1 = 51, splitZ = 28;
  fillStoneBox(v, x0 + 1, y0 + 1, 0, x1 - 1, y1 - 1, splitZ - 1, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep);
  v.box(x0, y0, splitZ, x1, y1, wallH - 1, PAL.plasterWarm);
  drawJettyCorbels(v, x0, y0, x1, y1, splitZ, 1, PAL.stoneCream);
  drawStoneQuoins(v, x0, y0, x1, y1, splitZ, wallH - 3, PAL.stoneCream, PAL.marble);
  drawStringcourse(v, x0, y0, x1, y1, splitZ, PAL.stoneCream);
  drawStringcourse(v, x0, y0, x1, y1, 49, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  buildGroundArcadeFront(v, x0 + 1, x1 - 1, y1 - 1, 2, splitZ, PAL.stoneCream, PAL.stoneDark);
  drawPortal(v, '-y', y0 + 1, 31, 2, { halfW: 3, doorH: 18, arch: true });
  for (const wz of [32, 52]) {
    const isP = wz === 32;
    for (const ux of [16, 30, 45]) {
      drawArchWindow(v, '+y', y1, ux, wz, { style: isP ? 'pediment' : 'casement', glow: true, juliet: isP && ux !== 30 });
      drawArchWindow(v, '-y', y0, ux, wz, { style: isP ? 'pediment' : 'casement', glow: isP });
    }
    for (const uy of [16, 38]) {
      drawArchWindow(v, '+x', x1, uy, wz, { style: isP ? 'pediment' : 'double', glow: true, juliet: isP });
      drawArchWindow(v, '-x', x0, uy, wz, { style: isP ? 'pediment' : 'double', glow: true, juliet: isP });
    }
  }
  drawBalcony(v, '+y', y1, 30, 31, 6, 'iron', true);
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 36, {
    roofStyle: 'gable-y', roofMain: PAL.slate, roofAlt: PAL.slateDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.plasterWarm, timberColor: PAL.stoneCream, bargeCol: PAL.stoneCream, eave: 3,
  });
  drawDormer(v, '-x', x0, 28, wallH, { wallCol: PAL.marble, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  drawDormer(v, '+x', x1, 28, wallH, { wallCol: PAL.marble, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  // +y 張り出し中央大時計破風（段付き三角切妻＋金色文字盤額縁）
  v.box(22, 49, 70, 39, 54, 93, PAL.stoneCream);
  for (let k = 0; k < 8; k++) v.box(22 + k, 49, 94 + k, 39 - k, 55, 94 + k, k >= 6 ? PAL.goldBright : PAL.slateDeep);
  v.box(26, 54, 77, 35, 55, 86, PAL.goldBright);
  v.box(27, 54, 78, 34, 54, 85, PAL.marble);
  v.box(30, 54, 81, 30, 54, 84, PAL.ink);
  v.box(30, 54, 81, 32, 54, 81, PAL.ink);
  v.box(30, 51, 102, 31, 52, 114, PAL.goldBright);
  v.box(32, 51, 110, 36, 51, 113, PAL.crimson);
  out.push(saveVol2x('bld_house_main_f', v, [31, 29], '時計破風ギルド商会館F（2x・全4面ペディメント窓＆時計塔）'));
}

// 5) bld_noble_manor_a (62x58x108, fp=31x29): 大理石ピアノ・ノービレ貴族邸
{
  const W = 62, H = 58, wallH = 68, v = new Volume(W, H, 108);
  const x0 = 5, x1 = 56, y0 = 5, y1 = 51, mx = 30, my = 28;
  fillStoneBox(v, x0, y0, 0, x1, y1, 25, PAL.stoneLight, PAL.stone, PAL.stoneDark); // ルスティカ 1F
  v.box(x0, y0, 26, x1, y1, wallH - 1, PAL.marble);
  drawStoneQuoins(v, x0, y0, x1, y1, 4, wallH - 3, PAL.stoneCream, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 26, PAL.stoneCream);
  drawStringcourse(v, x0, y0, x1, y1, 48, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  // 古典ペディメント付 4 本柱ポルチコ玄関 (+y)
  v.box(19, y1 + 1, 0, 41, 57, 3, PAL.stoneCream);
  for (const px of [20, 25, 35, 40]) v.box(px, 55, 4, px + 1, 56, 24, PAL.marble);
  v.box(19, y1 + 1, 25, 41, 57, 27, PAL.stoneCream);
  for (let k = 0; k < 6; k++) v.box(19 + k * 2, y1 + 1, 28 + k, 41 - k * 2, 57, 28 + k, PAL.blueDark);
  drawPortal(v, '+y', y1, mx, 4, { halfW: 4, doorH: 19, doorCol: PAL.woodDeep, frameCol: PAL.goldBright, steps: false });
  // 全4面にピアノ・ノービレ大ペディメント窓＋上階窓
  for (const ux of [12, 48]) {
    drawArchWindow(v, '+y', y1, ux, 9, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
    drawArchWindow(v, '+y', y1, ux, 31, { style: 'pediment', glow: true, juliet: true });
    drawArchWindow(v, '+y', y1, ux, 52, { style: 'casement', glow: true, frameCol: PAL.marble });
  }
  drawBalcony(v, '+y', y1, mx, 30, 8, 'stone', true);
  for (const ux of [14, 30, 46]) {
    drawArchWindow(v, '-y', y0, ux, 31, { style: 'pediment', glow: ux === 30, juliet: true });
    drawArchWindow(v, '-y', y0, ux, 52, { style: 'casement', glow: ux !== 30, frameCol: PAL.marble });
  }
  drawArchWindow(v, '-y', y0, 14, 9, { style: 'casement', glow: false, frameCol: PAL.stoneCream });
  drawArchWindow(v, '-y', y0, 46, 9, { style: 'casement', glow: false, frameCol: PAL.stoneCream });
  for (const uy of [16, 38]) {
    drawArchWindow(v, '-x', x0, uy, 9, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
    drawArchWindow(v, '-x', x0, uy, 31, { style: 'pediment', glow: true, juliet: true });
    drawArchWindow(v, '-x', x0, uy, 52, { style: 'casement', glow: false, frameCol: PAL.marble });
    drawArchWindow(v, '+x', x1, uy, 9, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
    drawArchWindow(v, '+x', x1, uy, 31, { style: 'pediment', glow: true, juliet: true });
    drawArchWindow(v, '+x', x1, uy, 52, { style: 'casement', glow: true, frameCol: PAL.marble });
  }
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 38, {
    roofStyle: 'hip', roofMain: PAL.blueDark, roofAlt: PAL.blueDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.marble, timberColor: PAL.stoneCream, eave: 3,
  });
  for (const [f, wc, uc] of [['+y', y1, 20], ['+y', y1, 40], ['-y', y0, 30], ['-x', x0, my], ['+x', x1, my]]) {
    drawDormer(v, f, wc, uc, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
  }
  drawChimneyBreast(v, '-x', x0, 27, 0, 106, { colMain: PAL.marble, colTrim: PAL.stoneCream, shoulderZ: 64 });
  out.push(saveVol2x('bld_noble_manor_a', v, [31, 29], '大理石ピアノ・ノービレ貴族邸A（2x・全4面ペディメント窓＆ポルチコ）'));
}

// 6) bld_noble_manor_b (58x58x120, fp=29x29): 石バルコニー・螺旋階段塔付き伯爵邸
{
  const W = 58, H = 58, wallH = 72, v = new Volume(W, H, 120);
  const x0 = 5, x1 = 49, y0 = 5, y1 = 50;
  fillStoneBox(v, x0, y0, 0, x1, y1, 25, PAL.stoneLight, PAL.stone, PAL.stoneDark);
  v.box(x0, y0, 26, x1, y1, wallH - 1, PAL.marble);
  drawStoneQuoins(v, x0, y0, x1, y1, 4, wallH - 3, PAL.stoneCream, PAL.stoneLight);
  drawStringcourse(v, x0, y0, x1, y1, 26, PAL.stoneCream);
  drawCornice(v, x0, y0, x1, y1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  drawPortal(v, '+y', y1, 24, 2, { halfW: 3, doorH: 19, porch: true, porchRoofCol: PAL.blueDark, frameCol: PAL.marble });
  drawBalcony(v, '+y', y1, 24, 31, 9, 'stone', true);
  for (const wz of [34, 53]) {
    drawArchWindow(v, '+y', y1, 11, wz, { style: wz === 34 ? 'pediment' : 'casement', glow: true });
    drawArchWindow(v, '+y', y1, 36, wz, { style: wz === 34 ? 'pediment' : 'casement', glow: true });
    drawArchWindow(v, '-y', y0, 16, wz, { style: wz === 34 ? 'pediment' : 'double', glow: true });
    drawArchWindow(v, '-y', y0, 32, wz, { style: wz === 34 ? 'pediment' : 'double', glow: wz === 34 });
    drawArchWindow(v, '-x', x0, 16, wz, { style: wz === 34 ? 'pediment' : 'double', glow: true });
    drawArchWindow(v, '-x', x0, 38, wz, { style: wz === 34 ? 'pediment' : 'double', glow: true });
  }
  drawArchWindow(v, '-x', x0, 16, 9, { style: 'casement', glow: true });
  drawArchWindow(v, '-x', x0, 38, 9, { style: 'casement', glow: false });
  drawArchWindow(v, '+x', x1, 38, 34, { style: 'pediment', glow: true, juliet: true });
  drawPitchedRoof2x(v, { x0, y0, x1, y1 }, wallH, 32, {
    roofStyle: 'hip', roofMain: PAL.slate, roofAlt: PAL.slateDeep, ridgeCol: PAL.goldBright,
    wallColor: PAL.marble, timberColor: PAL.stoneCream, eave: 3,
  });
  drawDormer(v, '+y', y1, 24, wallH, { wallCol: PAL.marble, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  drawDormer(v, '-x', x0, 28, wallH, { wallCol: PAL.marble, roofCol: PAL.slateDeep, glow: true, setback: -2 });
  // 階段小塔（持ち送り冠＋螺旋窓）
  for (let z = 0; z < 88; z++) {
    const rr = z >= 83 ? 10.6 : 9.4;
    for (let y = 5; y <= 29; y++) for (let x = 36; x <= 57; x++) {
      if (Math.hypot(x - 46, y - 16) <= rr) v.set(x, y, z, (z % 16 === 0 || z === 83) ? PAL.stoneCream : PAL.marble);
    }
  }
  for (const wz of [20, 44, 68]) {
    for (let z = wz; z <= wz + 6; z++) {
      v.clear(55, 16, z); v.clear(54, 16, z); v.setEmissive(53, 16, z, PAL.lanternGlow);
      v.clear(46, 7, z); v.clear(46, 8, z); v.setEmissive(46, 9, z, PAL.lanternGlow);
    }
  }
  for (let k = 0; k < 32; k++) {
    const z = 88 + k, r = Math.max(0.8, 10.6 * (1 - k / 31));
    for (let y = 5; y <= 29; y++) for (let x = 36; x <= 57; x++) {
      if (Math.hypot(x - 46, y - 16) <= r) v.set(x, y, z, k >= 27 || k <= 1 ? PAL.goldBright : (k % 3 === 0 ? PAL.blueDeep : PAL.blueDark));
    }
  }
  out.push(saveVol2x('bld_noble_manor_b', v, [29, 29], '石造小塔付き伯爵邸B（2x・全4面ペディメント窓＆階段塔）'));
}

// 7) bld_noble_villa_a (62x58x96, fp=31x29): コの字型中庭石造ヴィラ（YAW_NORTH配置のため背面 -y も正面級ファサード）
{
  const W = 62, H = 58, wallH = 58, v = new Volume(W, H, 96);
  const bx0 = 4, bx1 = 57, by0 = 5, by1 = 25; // 主棟
  const lx1 = 18, rx0 = 43, wy1 = 50; // 左右翼棟
  fillStoneBox(v, bx0, by0, 0, bx1, by1, 20, PAL.stoneLight, PAL.stone, PAL.stoneDark);
  v.box(bx0, by0, 21, bx1, by1, wallH - 1, PAL.marble);
  fillStoneBox(v, bx0, by1 - 2, 0, lx1, wy1, 18, PAL.stoneLight, PAL.stone, PAL.stoneDark);
  v.box(bx0, by1 - 2, 19, lx1, wy1, 49, PAL.marble);
  fillStoneBox(v, rx0, by1 - 2, 0, bx1, wy1, 18, PAL.stoneLight, PAL.stone, PAL.stoneDark);
  v.box(rx0, by1 - 2, 19, bx1, wy1, 49, PAL.marble);
  drawStoneQuoins(v, bx0, by0, bx1, by1, 4, wallH - 3, PAL.stoneCream, PAL.stoneLight);
  drawStoneQuoins(v, bx0, by1, lx1, wy1, 4, 46, PAL.stoneCream, PAL.stoneLight);
  drawStoneQuoins(v, rx0, by1, bx1, wy1, 4, 46, PAL.stoneCream, PAL.stoneLight);
  drawStringcourse(v, bx0, by0, bx1, by1, 21, PAL.stoneCream);
  drawCornice(v, bx0, by0, bx1, by1, wallH - 3, PAL.stoneCream, PAL.marble, true);
  drawCornice(v, bx0, by1 - 1, lx1, wy1, 47, PAL.stoneCream, PAL.marble, false);
  drawCornice(v, rx0, by1 - 1, bx1, wy1, 47, PAL.stoneCream, PAL.marble, false);

  // 中庭(+y) & 裏北面(-y, 道路側南向き配置を含む全4面)
  drawPortal(v, '+y', by1, 30, 2, { halfW: 3, doorH: 17, porch: true, porchRoofCol: PAL.blueDark });
  drawPortal(v, '-y', by0, 30, 2, { halfW: 4, doorH: 18, porch: true, porchRoofCol: PAL.blueDark, frameCol: PAL.marble });
  drawBalcony(v, '-y', by0, 30, 26, 7, 'stone', true);
  for (const ux of [12, 48]) {
    drawArchWindow(v, '-y', by0, ux, 9, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
    drawArchWindow(v, '-y', by0, ux, 28, { style: 'pediment', glow: true, juliet: true });
    drawArchWindow(v, '-y', by0, ux, 44, { style: 'casement', glow: true, frameCol: PAL.marble });
  }
  for (const ux of [21, 39]) drawArchWindow(v, '+y', by1, ux, 28, { style: 'pediment', glow: true });
  for (const uy of [15, 36]) {
    drawArchWindow(v, '-x', bx0, uy, 9, { style: 'casement', glow: true, frameCol: PAL.stoneCream });
    drawArchWindow(v, '-x', bx0, uy, 27, { style: 'pediment', glow: true, juliet: true });
    drawArchWindow(v, '+x', bx1, uy, 9, { style: 'casement', glow: false, frameCol: PAL.stoneCream });
    drawArchWindow(v, '+x', bx1, uy, 27, { style: 'pediment', glow: true, juliet: true });
  }
  drawArchWindow(v, '+y', wy1, 11, 27, { style: 'casement', glow: true, shutterCol: PAL.blueDeep });
  drawArchWindow(v, '+y', wy1, 50, 27, { style: 'casement', glow: true, shutterCol: PAL.blueDeep });
  drawArchWindow(v, '+x', lx1, 38, 27, { style: 'double', glow: true });
  drawArchWindow(v, '-x', rx0, 38, 27, { style: 'double', glow: true });

  // 深い軒付き青スレート屋根＋ドーマー＋中庭噴水
  for (let k = 0; k < 34; k++) {
    const z = wallH + k, iy = Math.floor((k / 33) * 12);
    for (let y = by0 - 3 + iy; y <= by1 + 3 - iy; y++) {
      for (let x = bx0 - 3; x <= bx1 + 3; x++) {
        v.set(x, y, z, k >= 31 ? PAL.goldBright : ((x + k) % 4 === 0 ? PAL.blueDeep : PAL.blue));
      }
    }
    if (k < 26) {
      const ix = Math.floor((k / 25) * 9);
      for (let y = by1 - 2; y <= wy1 + 3; y++) {
        for (let x = bx0 - 3 + ix; x <= lx1 + 2 - ix; x++) v.set(x, y, 50 + k, (y + k) % 4 === 0 ? PAL.blueDeep : PAL.blue);
        for (let x = rx0 - 2 + ix; x <= bx1 + 3 - ix; x++) v.set(x, y, 50 + k, (y + k) % 4 === 0 ? PAL.blueDeep : PAL.blue);
      }
    }
  }
  drawDormer(v, '-y', by0, 18, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
  drawDormer(v, '-y', by0, 42, wallH, { wallCol: PAL.marble, roofCol: PAL.blueDeep, glow: true, setback: -2 });
  v.box(21, 28, 0, 39, 50, 2, PAL.stoneCream);
  v.box(26, 35, 3, 34, 43, 7, PAL.stoneMid);
  v.boxEmissive(28, 37, 6, 32, 41, 11, PAL.cyan);
  out.push(saveVol2x('bld_noble_villa_a', v, [31, 29], 'コの字型中庭石造ヴィラ（2x・南北全4面クラシック構成）'));
}

// 8) bld_noble_gatehouse (58x26x56, fp=29x13): 貴族庭園石門＆黒鍛鉄柵壁
{
  const W = 58, H = 26, v = new Volume(W, H, 56);
  for (let z = 0; z < 32; z++) {
    let reach = 17;
    if (z >= 26 && z <= 27) reach = 21;
    else if (z >= 28 && z <= 29) reach = 25;
    else if (z >= 30) reach = 28;
    for (let x = 0; x <= reach; x++) for (let y = 5; y <= 20; y++) {
      const isPier = x >= 11 && x <= 17;
      const isFence = y >= 10 && y <= 15 && (z <= 6 || (x % 3 === 0 && z <= 23));
      if (isPier || isFence || z >= 26) {
        const col = (z <= 23 && !isPier && z > 6) ? PAL.iron : ((z <= 4 || z === 26) ? PAL.stoneCream : PAL.marble);
        v.set(x, y, z, col);
        v.set(W - 1 - x, y, z, col);
      }
    }
  }
  v.box(10, 4, 29, 18, 21, 31, PAL.stoneCream);
  v.box(39, 4, 29, 47, 21, 31, PAL.stoneCream);
  v.setEmissive(14, 21, 22, PAL.lanternGlow); v.setEmissive(43, 21, 22, PAL.lanternGlow);
  v.box(10, 3, 32, 47, 22, 41, PAL.marble);
  drawCornice(v, 11, 4, 46, 21, 39, PAL.stoneCream, PAL.marble, true);
  drawArchWindow(v, '+y', 22, 29, 33, { style: 'casement', glow: true, frameCol: PAL.goldBright, customH: 6 });
  for (let k = 0; k < 15; k++) {
    const z = 41 + k, ix = Math.floor(k * 0.75), iy = Math.floor(k * 0.55);
    for (let y = 2 + iy; y <= 23 - iy; y++) for (let x = 8 + ix; x <= 49 - ix; x++) {
      v.set(x, y, z, k >= 13 ? PAL.goldBright : ((x + k) % 3 === 0 ? PAL.blueDeep : PAL.blueDark));
    }
  }
  out.push(saveVol2x('bld_noble_gatehouse', v, [29, 13], '貴族庭園石門＆鍛鉄柵（2x・58x26x56）'));
}

console.log(`generated ${out.length} houses (all density=2 architectural v8, 26 variants):`);
for (const m of out) console.log(`  ${m.id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount} (fp=${m.footprint.join('x')}, d=${m.density})`);
