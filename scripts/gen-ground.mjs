// v5: 中世ヨーロッパ都市・経済地理（平坦シームレス 2560x2560 単一地面 oto_ground.png）を生成する。
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { PAL, createRng } from './palette.mjs';
import { encodeIndexedPng } from './voxel.mjs';
import {
  terrain,
  degCW,
  mainRiverDist,
  artisanCanalDist,
  intakeCanalDist,
  inTier2,
  onAnyBridge,
} from './terrain-eval.mjs';

const SIZE = terrain.groundSize ?? 2560;
const HALF = SIZE / 2;
const WALL_R = terrain.wallRadius ?? 820;

const pngBase = new PNG({ width: SIZE, height: SIZE });
const rng = createRng(7711);
const noise = new Uint8Array(SIZE * SIZE);
for (let i = 0; i < noise.length; i++) noise[i] = (rng() * 32) | 0;

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function setIdxRGB(data, idx4, rgb) {
  data[idx4] = rgb[0];
  data[idx4 + 1] = rgb[1];
  data[idx4 + 2] = rgb[2];
  data[idx4 + 3] = 255;
}

function cobbleColor(px, py, lightCol, midCol, mortarCol, blockW = 5, blockH = 4) {
  const row = Math.floor(py / blockH);
  const sy = ((py % blockH) + blockH) % blockH;
  const shiftedX = px + (row % 2) * Math.floor(blockW / 2);
  const colIdx = Math.floor(shiftedX / blockW);
  const sx = ((shiftedX % blockW) + blockW) % blockW;
  if (sy === 0 || sx === 0) return mortarCol;
  const h = hash2(colIdx, row) % 7;
  if (h <= 1) return lightCol;
  if (h === 6 && mortarCol === PAL.stoneDark) return PAL.stone;
  return midCol;
}

function inRect(wx, wy, x0, y0, x1, y1) {
  return wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1;
}

const radialAngles = [20, 150, 210, 270, 330];
function radialDist(wx, wy, r) {
  if (r < 190 || r > WALL_R - 12) return 99;
  let best = 99;
  for (const deg of radialAngles) {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const proj = wx * ux + wy * uy;
    const perp = Math.abs(-wx * uy + wy * ux);
    if (proj >= 190 && proj <= WALL_R - 12 && perp < best) best = perp;
  }
  return best;
}

const flowerColors = [PAL.white, PAL.yellowBright, PAL.orange, PAL.crimson];
const gates = terrain.gates;
const gateUnits = gates.map((g) => {
  const rad = (g.angleDeg * Math.PI) / 180;
  return { id: g.id, ux: Math.cos(rad), uy: Math.sin(rad), halfW: (g.width ?? 36) / 2 };
});

function outerRoadDist(wx, wy, r) {
  if (r < WALL_R - 16) return 999;
  let best = 999;
  for (const g of gateUnits) {
    const proj = wx * g.ux + wy * g.uy;
    const perp = Math.abs(-wx * g.uy + wy * g.ux);
    if (proj >= WALL_R - 20 && perp <= g.halfW + 10) {
      const ratio = perp / Math.max(1, g.halfW);
      if (ratio < best) best = ratio;
    }
  }
  return best;
}

const dMain = terrain.mainRiver.halfW;
const dBank = dMain + (terrain.mainRiver.bankW ?? 12);
const dCanal = terrain.artisanCanal.halfW;
const dCanalBank = dCanal + (terrain.artisanCanal.bankW ?? 5);

for (let py = 0; py < SIZE; py++) {
  const wy = py - HALF;
  for (let px = 0; px < SIZE; px++) {
    const wx = px - HALF;
    const r = Math.hypot(wx, wy);
    const n = noise[py * SIZE + px];
    const patch = hash2(Math.floor(px / 7), Math.floor(py / 7)) % 9;
    let col = PAL.forest;

    if (r > WALL_R + 10) {
      const deg = degCW(wx, wy);
      // 城壁外：北〜北東は薪炭林、西〜南西はチューネン三圃制農地、南門前はフォーブール、東〜南東は川港＆河川敷
      if (deg >= 106 && deg <= 236 && r >= WALL_R + 30 && r <= 1205) {
        const pX = Math.floor(px / 112), pY = Math.floor(py / 96);
        const plotKind = hash2(pX, pY) % 5;
        const margin = (px % 112) < 5 || (py % 96) < 5;
        if (margin) {
          col = PAL.oak;
        } else if (deg > 186) {
          if (plotKind <= 1) {
            col = (py % 10 < 3) ? PAL.pineDark : PAL.forest;
          } else {
            col = patch < 2 ? PAL.leafMid : PAL.forest;
            if (n === 11 && hash2(px, py) % 19 === 0) col = PAL.goldBright;
          }
        } else if (wx > -260 && wy > 840 && wy < 1030) {
          col = (px % 8 < 2) ? PAL.woodDeep : (plotKind % 2 === 0 ? PAL.leafMid : PAL.pineDark);
          if (px % 8 >= 4 && py % 6 === 2) col = PAL.leafSun;
        } else {
          if (plotKind <= 1) {
            const furrow = py % 6 === 0;
            col = furrow ? PAL.woodLight : ((hash2(px, py) % 5 === 0) ? PAL.thatchLight : PAL.gold);
          } else if (plotKind === 2) {
            col = patch <= 2 ? PAL.leafMid : PAL.forest;
          } else if (plotKind === 3) {
            col = (py % 6 === 0) ? PAL.forest : PAL.leafSun;
          } else {
            col = (px % 5 === 0) ? PAL.woodDark : PAL.plasterWarm;
          }
        }
      } else {
        col = patch < 2 ? PAL.forest : (n < 3 ? PAL.leafMid : (n === 31 ? PAL.woodDeep : PAL.pineDark));
        if (n === 17 && (hash2(px, py) % 23 === 0)) col = PAL.leafSun;
      }

      // 南門外のフォーブール馬車広場
      if (Math.abs(wx) <= 72 && wy >= WALL_R + 10 && wy <= WALL_R + 108) {
        const pebble = hash2(px, py) % 7 === 0;
        col = pebble ? PAL.stone : (n < 8 ? PAL.woodLight : PAL.tan);
      }
      // 東門外の大河の川港埠頭
      if (wx >= WALL_R + 10 && wx <= 936 && Math.abs(wy) <= 235) {
        col = cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 6, 5);
        if (wx >= 926) col = PAL.stoneDark;
      }
    } else if (r >= WALL_R - 10) {
      col = cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 6, 4);
    } else if (r >= 154) {
      const deg = degCW(wx, wy);
      const inIndustry = r >= 225 && deg >= 16 && deg <= 50;
      const inSlum = r >= 470 && deg >= 48 && deg <= 76;
      const inDowntown = r >= 225 && r < 470 && deg >= 48 && deg <= 80;
      if (inTier2(wx, wy)) {
        // 北西の貴族街・王立魔導学院区（白石灰石大通り＋星紋前庭＋刈り込み芝生庭園）
        col = patch <= 2 ? PAL.leaf : PAL.grass;
        const onArcaneAxis = Math.abs(wx + 320) <= 32 || Math.abs(wy + 240) <= 26 || Math.hypot(wx + 320, wy + 240) <= 74;
        const onManorBoulevard = inRect(wx, wy, -600, -350, -120, -220) || inRect(wx, wy, -520, -470, -240, -120);
        if (onArcaneAxis || onManorBoulevard) {
          col = cobbleColor(px, py, PAL.white, PAL.plaster, PAL.stoneLight, 6, 5);
          const dA = Math.hypot(wx + 320, wy + 190);
          if (dA >= 24 && dA <= 28) col = PAL.gold;
          else if (dA >= 14 && dA <= 16) col = PAL.blue;
          else if (dA < 24 && (Math.abs(wx + 320) <= 1 || Math.abs(wy + 190) <= 1)) col = PAL.cyan;
        } else if (px % 48 < 3 || py % 48 < 3) {
          col = PAL.stoneLight;
        }
        const aqDist = Math.abs((wx + 500) * 0.65 - (wy + 460) * 0.76);
        if (wx >= -510 && wx <= -100 && wy >= -470 && wy <= -30 && aqDist <= 3.5) {
          col = aqDist <= 1.5 ? PAL.cyan : PAL.sky;
        }
        if (!inTier2(wx - 2, wy) || !inTier2(wx + 2, wy) || !inTier2(wx, wy - 2) || !inTier2(wx, wy + 2)) {
          col = PAL.stoneLight;
        }
      } else if (inSlum) {
        const puddle = hash2(Math.floor(px / 4), Math.floor(py / 4)) % 17 === 0;
        col = puddle ? PAL.charcoal : (n < 6 ? PAL.woodDark : (n > 27 ? PAL.charcoal : PAL.wood));
      } else if (inIndustry) {
        col = cobbleColor(px, py, PAL.stone, PAL.stoneDark, PAL.charcoal, 5, 4);
        if (patch === 0 && n < 8) col = PAL.woodDark;
      } else if (inDowntown) {
        const pebble = hash2(Math.floor(px / 2), Math.floor(py / 2)) % 11 === 0;
        col = pebble ? PAL.stone : (n < 5 ? PAL.wood : (n > 27 ? PAL.tan : PAL.woodLight));
      } else {
        col = patch <= 1 ? PAL.pineDark : (patch === 8 ? PAL.leafMid : PAL.forest);
        if (n === 0) col = PAL.pineDeep;
        if (n === 30) col = PAL.leafMid;
        if (n === 19 && (hash2(px, py) % 13 === 0)) {
          col = flowerColors[hash2(px, py) % flowerColors.length];
        }
      }
    } else if (r >= 108) {
      // 王城水堀（動的オーバーレイが映える落ち着いた水底表現）
      if (r < 112 || r > 150) col = PAL.slateDark;
      else if (r < 117 || r > 145) col = PAL.blueDark;
      else col = PAL.waterDeep;
    } else {
      // 王城中庭石畳
      if (r >= 103) col = PAL.stoneDark;
      else if (Math.abs(wx) <= 18 && wy >= 40) col = cobbleColor(px, py, PAL.white, PAL.plaster, PAL.stoneLight, 5, 4);
      else col = cobbleColor(px, py, PAL.plaster, PAL.stoneLight, PAL.stone, 5, 4);
    }

    // 放射状の通り（城内 r >= 190）
    if (r >= 190) {
      const rd = radialDist(wx, wy, r);
      if (rd <= 7) {
        col = rd >= 5.7 ? PAL.wood : (n < 7 ? PAL.woodLight : PAL.tan);
      }
    }

    // 東西城門へ通じる大横断路＋中央レイライン導管
    if (Math.abs(wy) <= 18 && Math.abs(wx) >= 160 && Math.abs(wx) <= WALL_R + 6) {
      const ay = Math.abs(wy);
      col = ay >= 16 ? PAL.stoneDark : (ay <= 1.2 ? PAL.blue : (ay >= 12 ? cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 4, 4) : cobbleColor(px, py, PAL.plaster, PAL.stoneLight, PAL.stone, 5, 4)));
      if (ay <= 0.7 && Math.floor((wx + 1280) / 10) % 2 === 0) col = PAL.cyan;
    }

    // 城前広場・大魔導儀式陣 (0, 244)
    if (inRect(wx, wy, -88, 186, 88, 302)) {
      const border = wx <= -85 || wx >= 84 || wy <= 189 || wy >= 299;
      const dx = wx, dy = wy - 244, dist = Math.hypot(dx, dy);
      const octant = Math.abs(((Math.atan2(dy, dx) / (Math.PI / 4)) % 1 + 1) % 1 - 0.5);
      if (border) col = PAL.stoneDark;
      else if (dist >= 34 && dist <= 36.5) col = PAL.gold;
      else if (dist >= 27.5 && dist <= 30) col = PAL.cyan;
      else if (dist >= 20 && dist <= 22.5) col = PAL.blue;
      else if (dist >= 19 && dist <= 52 && octant > 0.445) col = octant > 0.47 ? PAL.cyan : PAL.gold;
      else if (dist < 34) col = cobbleColor(px, py, PAL.white, PAL.plaster, PAL.stoneLight, 4, 4);
      else col = cobbleColor(px, py, PAL.plaster, PAL.stoneLight, PAL.stone, 5, 4);
    }

    // 大聖堂・ギルド本部・中央市場・東教会孤児院石畳
    if (
      inRect(wx, wy, -92, 130, -54, 224) ||
      inRect(wx, wy, -104, 240, -56, 340) ||
      inRect(wx, wy, -165, 340, -26, 464) ||
      inRect(wx, wy, 365, 70, 505, 195)
    ) {
      col = cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 4, 4);
    }

    // 一本裏の通り
    if (inRect(wx, wy, 108, 302, 132, 544) || inRect(wx, wy, 68, 278, 132, 304) || inRect(wx, wy, 24, 522, 132, 544)) {
      col = (hash2(px, py) % 9 === 0) ? PAL.stone : (n < 6 ? PAL.woodLight : PAL.tan);
    }

    // 城外 4 方向街道
    const oRatio = outerRoadDist(wx, wy, r);
    if (oRatio <= 1.0) {
      const rut = oRatio >= 0.28 && oRatio <= 0.56;
      col = oRatio >= 0.85 ? PAL.pineDark : (rut ? PAL.wood : (n < 6 ? PAL.tan : PAL.woodLight));
    }

    // メインストリート (w=52: 平坦連続＋中央レイライン魔導導管)
    if (inRect(wx, wy, -26, 302, 26, WALL_R + 12)) {
      const ax = Math.abs(wx);
      if (ax >= 25) col = py % 6 === 0 ? PAL.charcoal : PAL.stoneDark;
      else if (ax >= 14) col = cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 4, 4);
      else if (ax >= 13) col = PAL.stoneLight;
      else if (ax <= 1.2) col = (ax <= 0.6 && py % 14 < 8) ? PAL.cyan : PAL.blue;
      else col = cobbleColor(px, py, PAL.plaster, PAL.stoneLight, PAL.stone, 5, 4);
    }

    // 内環状大通り＆複線マナ軌道トラム線路 (r=448..476、全街区をシームレス横断)
    if (r >= 448 && r <= 476) {
      const edge = r <= 450 || r >= 474;
      const degT = Math.atan2(wy, wx);
      const sleeper = ((Math.floor(degT * 180) % 2) + 2) % 2 === 0;
      const inInnerRail = Math.abs(r - 455) <= 0.9 || Math.abs(r - 459) <= 0.9;
      const inOuterRail = Math.abs(r - 465) <= 0.9 || Math.abs(r - 469) <= 0.9;
      const inManaLine = Math.abs(r - 462) <= 1.1;
      if (edge) col = PAL.stoneDark;
      else if (inManaLine) col = ((Math.floor(degT * 120) % 2) + 2) % 2 === 0 ? PAL.cyan : PAL.blue;
      else if (inInnerRail || inOuterRail) col = PAL.charcoal;
      else if (sleeper && ((r >= 454 && r <= 460) || (r >= 464 && r <= 470))) col = PAL.woodDark;
      else col = cobbleColor(px, py, PAL.stoneLight, PAL.stone, PAL.stoneDark, 5, 4);
    }

    // 公衆転移陣 5 拠点の石床魔法陣リング
    for (const [tx, ty] of [[0, 775], [0, 198], [-90, 286], [-320, -190], [875, 0]]) {
      const td = Math.hypot(wx - tx, wy - ty);
      if (td <= 17) {
        if (td >= 14.5) col = PAL.gold;
        else if (td >= 11 && td <= 12.8) col = PAL.cyan;
        else if (td <= 14.5 && (Math.abs(wx - tx) <= 1 || Math.abs(wy - ty) <= 1)) col = PAL.blue;
        else col = PAL.stoneLight;
      }
    }

    // 取水路（北西の川 → 魔導揚水塔）
    if (wx < -450 && wy < -400) {
      const cd = intakeCanalDist(wx, wy);
      if (cd <= terrain.intakeCanal.halfW) col = cd > 4 ? PAL.slateDark : PAL.blueDark;
    }

    // 職人運河
    if (r >= 152 && wx > 130 && wy > -10 && wy < 620) {
      const ad = artisanCanalDist(wx, wy);
      if (ad <= dCanalBank) {
        if (ad > dCanal) col = cobbleColor(px, py, PAL.stone, PAL.stoneDark, PAL.charcoal, 4, 4);
        else if (ad > dCanal - 2) col = PAL.slateDark;
        else col = PAL.waterDeep;
      }
    }

    // 大河
    if (wx > -200 || wy < -420) {
      const md = mainRiverDist(wx, wy);
      if (md <= dBank) {
        if (md > dMain + 3) col = (n < 10) ? PAL.stoneDark : PAL.stone;
        else if (md > dMain) col = PAL.slateDark;
        else if (md > dMain - 6) col = PAL.blueDark;
        else col = PAL.waterDeep;
      }
    }

    // 河川橋・運河橋・城の橋床板
    if (onAnyBridge(wx, wy)) {
      if (Math.abs(wx) <= 18 && wy >= 104 && wy <= 158) {
        const ax = Math.abs(wx);
        col = ax >= 14 ? PAL.stone : ((py % 5 === 0) ? PAL.woodDark : (hash2(Math.floor(px / 4), Math.floor(py / 5)) % 3 === 0 ? PAL.woodLight : PAL.wood));
      } else {
        col = cobbleColor(px, py, PAL.plaster, PAL.stoneLight, PAL.stoneDark, 6, 4);
        if (r >= 453 && r <= 471) {
          const degT = Math.atan2(wy, wx);
          if (Math.abs(r - 462) <= 1.1) col = ((Math.floor(degT * 120) % 2) + 2) % 2 === 0 ? PAL.cyan : PAL.blue;
          else if (Math.abs(r - 455) <= 0.9 || Math.abs(r - 459) <= 0.9 || Math.abs(r - 465) <= 0.9 || Math.abs(r - 469) <= 0.9) col = PAL.charcoal;
        }
      }
    }

    setIdxRGB(pngBase.data, (py * SIZE + px) * 4, col);
  }
}

const outDir = path.dirname(`assets/${terrain.groundTexture ?? 'ground/oto_ground.png'}`);
fs.mkdirSync(outDir, { recursive: true });
const mainPath = path.join(outDir, 'oto_ground.png');
const buf = encodeIndexedPng(SIZE, SIZE, pngBase.data) ?? PNG.sync.write(pngBase, { colorType: 2, inputHasAlpha: true, deflateLevel: 9 });
fs.writeFileSync(mainPath, buf);
console.log(`generated ${mainPath} (${SIZE}x${SIZE}, ${buf.length} bytes)`);
