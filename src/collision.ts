// プレイヤー衝突解決とランドマーク近接判定（DOM なし・純粋関数）。

export interface ObbCollider {
  x: number;
  y: number;
  hw: number; // X方向半幅
  hd: number; // Y方向半奥行
  yaw: number;
  label?: string;
}

export interface LandmarkRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  hw: number;
  hd: number;
  yaw: number;
  priority: number; // 高いほど優先（建物=2、広場や通り=1）
}

export interface OtoCollisionMap {
  obbs: ObbCollider[];
  landmarks: LandmarkRegion[];
  worldRadius: number;
  moatInnerR: number;
  moatOuterR: number;
  bridgeHalfW: number;
  bridgeYMin: number;
  bridgeYMax: number;
  wallInnerR: number;
  wallOuterR: number;
  southGateHalfW: number;
  southGateYMin: number;
  gates?: { angleDeg: number; halfW: number; rMin: number }[];
  inBlockingWater?: (x: number, y: number) => boolean;
  isCliffBlocked?: (x0: number, y0: number, x1: number, y1: number) => boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 回転矩形 (OBB) と円 (px, py, radius) の押し戻し */
function resolveObbCircle(px: number, py: number, radius: number, b: ObbCollider): [number, number] {
  const dx = px - b.x;
  const dy = py - b.y;
  const c = Math.cos(-b.yaw);
  const s = Math.sin(-b.yaw);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;

  const cx = clamp(lx, -b.hw, b.hw);
  const cy = clamp(ly, -b.hd, b.hd);
  const ox = lx - cx;
  const oy = ly - cy;
  const distSq = ox * ox + oy * oy;

  if (distSq >= radius * radius) return [px, py];

  let pushLx = 0;
  let pushLy = 0;
  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const pen = radius - dist;
    pushLx = (ox / dist) * pen;
    pushLy = (oy / dist) * pen;
  } else {
    // 円の中心が矩形の内部にある場合は最も近い辺へ押し出す
    const penX = b.hw - Math.abs(lx) + radius;
    const penY = b.hd - Math.abs(ly) + radius;
    if (penX < penY) pushLx = lx >= 0 ? penX : -penX;
    else pushLy = ly >= 0 ? penY : -penY;
  }

  const rc = Math.cos(b.yaw);
  const rs = Math.sin(b.yaw);
  return [px + (pushLx * rc - pushLy * rs), py + (pushLx * rs + pushLy * rc)];
}

/** リング状の障害（水堀・城壁）と開口部（橋・南門）による押し戻し */
function resolveRingBand(
  px: number,
  py: number,
  radius: number,
  rInner: number,
  rOuter: number,
  inOpening: boolean,
): [number, number] {
  if (inOpening) return [px, py];
  const r = Math.hypot(px, py);
  const minR = rInner - radius;
  const maxR = rOuter + radius;
  if (r <= minR || r >= maxR) return [px, py];
  if (r < 1e-6) return [px, maxR];
  const mid = (rInner + rOuter) * 0.5;
  const targetR = r < mid ? minR : maxR;
  const scale = targetR / r;
  return [px * scale, py * scale];
}

/**
 * プレイヤーの現在位置 (x, y) を衝突解決後の位置に補正する。
 * 建物・堀・城壁・世界境界を考慮し、壁沿いに滑らかに移動できるよう反復する。
 */
export function resolvePlayerMovement(
  x: number,
  y: number,
  radius: number,
  map: OtoCollisionMap,
  prevX?: number,
  prevY?: number,
): [number, number] {
  let px = x;
  let py = y;

  const solveBodyAndWalls = (tx: number, ty: number): [number, number] => {
    let rx = tx;
    let ry = ty;
    for (let iter = 0; iter < 3; iter++) {
      // 1) すべての建物・障害物 OBB（広域化対応のため粗距離で高速足切り）
      for (let i = 0; i < map.obbs.length; i++) {
        const b = map.obbs[i];
        const span = b.hw + b.hd + radius + 4;
        if (Math.abs(rx - b.x) > span || Math.abs(ry - b.y) > span) continue;
        [rx, ry] = resolveObbCircle(rx, ry, radius, b);
      }

      // 2) 円形の水堀（橋の内側のみ通行可）
      const onBridgeLat = Math.abs(rx) <= map.bridgeHalfW - radius;
      const onBridgeLong = ry >= map.bridgeYMin && ry <= map.bridgeYMax;
      const inBridgeBand = Math.abs(rx) <= map.bridgeHalfW + radius + 2 && onBridgeLong;
      if (inBridgeBand && !onBridgeLat) {
        const maxX = Math.max(0.5, map.bridgeHalfW - radius);
        rx = clamp(rx, -maxX, maxX);
      } else {
        [rx, ry] = resolveRingBand(rx, ry, radius, map.moatInnerR, map.moatOuterR, onBridgeLat && onBridgeLong);
      }

      // 3) 円形の城壁（4城門いずれかの開口のみ通行可）
      let inAnyGate = false;
      if (map.gates && map.gates.length > 0) {
        for (let i = 0; i < map.gates.length; i++) {
          const g = map.gates[i];
          const rad = (g.angleDeg * Math.PI) / 180;
          const ux = Math.cos(rad);
          const uy = Math.sin(rad);
          const proj = rx * ux + ry * uy;
          const perp = Math.abs(-rx * uy + ry * ux);
          if (proj >= g.rMin && perp <= g.halfW - radius) {
            inAnyGate = true;
            break;
          }
        }
      } else {
        inAnyGate = Math.abs(rx) <= map.southGateHalfW - radius && ry >= map.southGateYMin;
      }
      [rx, ry] = resolveRingBand(rx, ry, radius, map.wallInnerR, map.wallOuterR, inAnyGate);

      // 4) ワールド外周クランプ
      const maxR = map.worldRadius - radius;
      const r = Math.hypot(rx, ry);
      if (r > maxR && r > 1e-6) {
        rx = (rx / r) * maxR;
        ry = (ry / r) * maxR;
      }
    }
    return [rx, ry];
  };

  [px, py] = solveBodyAndWalls(px, py);

  // 5) 河川・運河・段丘崖チェック（移動前座標がある場合は軸別スライドで滑らかに岸や崖に沿う）
  const isTerrainInvalid = (tx: number, ty: number) => {
    if (map.inBlockingWater && map.inBlockingWater(tx, ty)) return true;
    if (map.isCliffBlocked && prevX !== undefined && prevY !== undefined && map.isCliffBlocked(prevX, prevY, tx, ty)) return true;
    return false;
  };

  if (isTerrainInvalid(px, py)) {
    if (prevX !== undefined && prevY !== undefined) {
      const [sx, sy1] = solveBodyAndWalls(px, prevY);
      if (!isTerrainInvalid(sx, sy1)) return [sx, sy1];
      const [sx2, sy2] = solveBodyAndWalls(prevX, py);
      if (!isTerrainInvalid(sx2, sy2)) return [sx2, sy2];
      return [prevX, prevY];
    }
  }

  return [px, py];
}

/** プレイヤーから各ランドマーク領域までの距離（矩形外縁まで）を測り、threshold 以内で最寄りの名前を返す */
export function findNearbyLandmark(
  x: number,
  y: number,
  landmarks: LandmarkRegion[],
  threshold = 24,
): LandmarkRegion | null {
  let best: LandmarkRegion | null = null;
  let bestScore = Infinity;

  for (const lm of landmarks) {
    const dx = x - lm.x;
    const dy = y - lm.y;
    const c = Math.cos(-lm.yaw);
    const s = Math.sin(-lm.yaw);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const cx = clamp(lx, -lm.hw, lm.hw);
    const cy = clamp(ly, -lm.hd, lm.hd);
    const dist = Math.hypot(lx - cx, ly - cy);
    if (dist <= threshold) {
      // 優先度が高い建物ランドマークを優先しつつ近いものを選択
      const score = dist - lm.priority * 10;
      if (score < bestScore) {
        bestScore = score;
        best = lm;
      }
    }
  }
  return best;
}
