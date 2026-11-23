// 地形・段丘標高・水系・橋・地区分類の評価ロジック（DOM 非依存・oto-terrain.json 準拠）。
import terrainData from './data/oto-terrain.json';

export const TERRAIN = terrainData;

export function degCW(x: number, y: number): number {
  let d = (Math.atan2(y, x) * 180) / Math.PI;
  if (d < 0) d += 360;
  return d;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolyline(px: number, py: number, pts: readonly (readonly number[])[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

export function inTier2(x: number, y: number): boolean {
  const e = terrainData.tier2.nobleEllipse;
  const r = Math.hypot(x, y);
  if (r < e.minR || r > e.maxR || x > e.clipXMax || y > e.clipYMax) return false;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function inTier1Main(x: number, y: number): boolean {
  const e = terrainData.tier1.mainEllipse;
  const r = Math.hypot(x, y);
  if (y > e.clipYMax || r < e.minR || r > e.maxR) return false;
  const deg = degCW(x, y);
  if (r >= e.excludeSector.rMin && deg >= e.excludeSector.fromDeg && deg <= e.excludeSector.toDeg) return false;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function inTier1Church(x: number, y: number): boolean {
  const e = terrainData.tier1.eastChurchEllipse;
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function rawTierAt(x: number, y: number): 0 | 1 | 2 | 3 {
  if (Math.hypot(x, y) <= terrainData.castleIsland.r) return 3;
  if (inTier2(x, y)) return 2;
  if (inTier1Main(x, y) || inTier1Church(x, y)) return 1;
  return 0;
}

export function onAnyRamp(_x: number, _y: number): boolean {
  return false;
}

export function elevationAt(_x: number, _y: number): number {
  return 0;
}

export function onAnyBridge(x: number, y: number): boolean {
  if (Math.abs(x) <= 14 && y >= 104 && y <= 158) return true;
  for (const b of terrainData.bridges) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

export function inMainRiver(x: number, y: number): boolean {
  return distToPolyline(x, y, terrainData.mainRiver.points) <= terrainData.mainRiver.halfW;
}

export function inArtisanCanal(x: number, y: number): boolean {
  return (
    distToPolyline(x, y, terrainData.artisanCanal.points) <= terrainData.artisanCanal.halfW &&
    Math.hypot(x, y) >= terrainData.moatOuterR - 2
  );
}

export function inBlockingWater(x: number, y: number): boolean {
  if (onAnyBridge(x, y)) return false;
  return inMainRiver(x, y) || inArtisanCanal(x, y);
}

export function isCliffBlocked(_x0: number, _y0: number, _x1: number, _y1: number): boolean {
  return false;
}

export function districtAt(x: number, y: number): { id: string; label: string } {
  const r = Math.hypot(x, y);
  const deg = degCW(x, y);
  if (r <= terrainData.castleIsland.r) return { id: 'castle', label: '王城' };
  if (inTier2(x, y)) return { id: 'noble_arcane', label: '北西貴族街・魔導学院区' };
  if (inTier1Church(x, y)) return { id: 'church_hill', label: '東の教会・孤児院区' };
  if (r > terrainData.wallRadius) {
    if (x > 680 && y > -260 && y < 440) return { id: 'river_port', label: '大河の川港' };
    if (x < -200 && y > -380 && y < 780) return { id: 'farmlands', label: '王都西部の田園地帯' };
    if (Math.abs(x) < 220 && y > 820) return { id: 'faubourg', label: '南門外フォーブール' };
    return { id: 'forest', label: '王都外周の薪炭林' };
  }
  if (Math.abs(x) <= 30 && y >= 302 && y <= 800) return { id: 'main_street', label: 'メインストリート' };
  if (x >= -92 && x <= 92 && y >= 184 && y <= 304) return { id: 'plaza', label: '城前の大広場' };
  if (r >= 225 && deg >= 42 && deg <= 72 && r > 470) return { id: 'slum', label: '南東下町・貧民街' };
  if (r >= 225 && deg >= 16 && deg <= 68) return { id: 'artisan_canal', label: '職人運河・工業区' };
  if (inTier1Main(x, y)) return { id: 'upper_town', label: '中央市民街' };
  return { id: 'lower_town', label: '南西市街' };
}
