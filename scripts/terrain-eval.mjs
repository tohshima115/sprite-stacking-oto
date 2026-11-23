// src/data/oto-terrain.json から標高・河川・段丘・街区を評価する共通ロジック（スクリプト用 ESM）。
import fs from 'node:fs';

export const terrain = JSON.parse(fs.readFileSync(new URL('../src/data/oto-terrain.json', import.meta.url), 'utf8'));

export function degCW(x, y) {
  let d = (Math.atan2(y, x) * 180) / Math.PI;
  if (d < 0) d += 360;
  return d;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

export function inTier2(x, y) {
  const e = terrain.tier2.nobleEllipse;
  const r = Math.hypot(x, y);
  if (r < e.minR || r > e.maxR || x > e.clipXMax || y > e.clipYMax) return false;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function inTier1Main(x, y) {
  const e = terrain.tier1.mainEllipse;
  const r = Math.hypot(x, y);
  if (y > e.clipYMax || r < e.minR || r > e.maxR) return false;
  const deg = degCW(x, y);
  if (r >= e.excludeSector.rMin && deg >= e.excludeSector.fromDeg && deg <= e.excludeSector.toDeg) return false;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function inTier1Church(x, y) {
  const e = terrain.tier1.eastChurchEllipse;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function rawTierAt(x, y) {
  if (Math.hypot(x, y) <= terrain.castleIsland.r) return 3;
  if (inTier2(x, y)) return 2;
  if (inTier1Main(x, y) || inTier1Church(x, y)) return 1;
  return 0;
}

export function rampElevationAt(x, y) {
  for (const r of terrain.ramps) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) {
      const t = r.axis === 'x'
        ? (x - r.x0) / Math.max(1, r.x1 - r.x0)
        : (y - r.y0) / Math.max(1, r.y1 - r.y0);
      return r.fromZ + (r.toZ - r.fromZ) * t;
    }
  }
  return null;
}

export function elevationAt(x, y) {
  const rz = rampElevationAt(x, y);
  if (rz !== null) return Math.round(rz * 10) / 10;
  const tier = rawTierAt(x, y);
  if (tier === 3) return terrain.castleIsland.z;
  if (tier === 2) return terrain.tier2.z;
  if (tier === 1) return terrain.tier1.z;
  return 0;
}

export function onAnyBridge(x, y) {
  if (Math.abs(x) <= 14 && y >= 104 && y <= 158) return true;
  for (const b of terrain.bridges) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

export function mainRiverDist(x, y) {
  return distToPolyline(x, y, terrain.mainRiver.points);
}

export function artisanCanalDist(x, y) {
  return distToPolyline(x, y, terrain.artisanCanal.points);
}

export function intakeCanalDist(x, y) {
  return distToPolyline(x, y, terrain.intakeCanal.points);
}

export function inMainRiver(x, y) {
  return mainRiverDist(x, y) <= terrain.mainRiver.halfW;
}

export function inArtisanCanal(x, y) {
  return artisanCanalDist(x, y) <= terrain.artisanCanal.halfW && Math.hypot(x, y) >= terrain.moatOuterR - 2;
}

export function inBlockingWater(x, y) {
  if (onAnyBridge(x, y)) return false;
  if (inMainRiver(x, y)) return true;
  if (inArtisanCanal(x, y)) return true;
  return false;
}
