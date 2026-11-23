// Sprite Stacking の純粋な数式部分。DOM に依存しない（テスト対象）。
import type { StackParams } from './types';

export interface Camera {
  x: number; y: number;   // 注視点（ワールド px）
  z?: number;             // 注視標高（ワールド px、段丘追従用）
  yaw: number;            // カメラの水平回転（ラジアン）。+ で画面上のワールドが時計回りに回る見え方
  squash: number;
  spacing: number;
  thickness: number;
  zoom: number;           // 整数。内部解像度 → 画面の拡大率
  scale?: number;         // 内部バッファの空間密度倍率（既定 1、高精細 oto=2）
}

export const params = (c: Camera): StackParams => ({ squash: c.squash, spacing: c.spacing, thickness: c.thickness });

/**
 * ワールド地面座標 → 内部バッファ座標。
 *   d = R(-yaw) · ((p - cam) * scale)
 *   screen = center + (d.x, d.y * squash)
 * depth は「カメラから見たワールド奥行き」= d.y / scale。大きいほど手前（画面下）。
 */
export function worldToScreen(cam: Camera, wx: number, wy: number, bufW: number, bufH: number) {
  const sc = cam.scale ?? 1;
  const dx = (wx - cam.x) * sc, dy = (wy - cam.y) * sc;
  const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  return {
    sx: Math.round(bufW / 2 + rx),
    sy: Math.round(bufH / 2 + ry * cam.squash),
    depth: ry / sc,
  };
}

/** カメラのバッファ空間における整数アンカー (intCamX, intCamY) と奥行き基準を返す */
export function cameraLattice(cam: Camera) {
  const sc = cam.scale ?? 1;
  const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw);
  const rx = (cam.x * sc) * c - (cam.y * sc) * s;
  const ry = (cam.x * sc) * s + (cam.y * sc) * c;
  return { c, s, scale: sc, camRy: ry, intCamX: Math.round(rx), intCamY: Math.round(ry * cam.squash) };
}

/** 静的ワールド座標を共通の整数格子へ投影（歩行時に地面・建物間の相対ズレが 0px になる） */
export function worldToLatticeScreen(
  cam: Camera,
  wx: number,
  wy: number,
  bufW: number,
  bufH: number,
  lat = cameraLattice(cam),
) {
  const sc = lat.scale;
  const rx = (wx * sc) * lat.c - (wy * sc) * lat.s;
  const ry = (wx * sc) * lat.s + (wy * sc) * lat.c;
  return {
    sx: Math.floor(bufW / 2) + Math.round(rx) - lat.intCamX,
    sy: Math.floor(bufH / 2) + Math.round(ry * cam.squash) - lat.intCamY,
    depth: (ry - lat.camRy) / sc,
  };
}

/** 画面の上方向（前進方向）をワールドのベクトルで返す。WASD 移動に使う */
export function screenUpInWorld(yaw: number): [number, number] {
  // R(yaw) · (0,-1)
  return [Math.sin(yaw), -Math.cos(yaw)];
}
export function screenRightInWorld(yaw: number): [number, number] {
  return [Math.cos(yaw), Math.sin(yaw)];
}

/** スライス z（0 = 地面）の持ち上げ量（画面 px、整数）。thickness 回の重ね描きの k 番目も含む */
export function liftFor(z: number, k: number, p: StackParams): number {
  return Math.round(z * p.spacing * p.thickness + k * Math.min(p.spacing, 1));
}

/** 描画時の相対回転 = オブジェクトのワールド向き - カメラ向き。全スライス同じ値 */
export function relativeYaw(objYaw: number, camYaw: number): number {
  return objYaw - camYaw;
}

/**
 * 進行方向ベクトル → オブジェクトの向き。シート上の正面は +y（下向き）なので -90°。
 * （SpriteCook の turn = atan2(v.y, v.x) - 90° と同じ）
 */
export function yawFromVelocity(vx: number, vy: number): number {
  return Math.atan2(vy, vx) - Math.PI / 2;
}

/** スタック1つが画面上で占める矩形（概算、整数）。キャッシュ用キャンバスの大きさにも使う */
export function stackBounds(w: number, h: number, n: number, p: StackParams) {
  const R = Math.ceil(Math.hypot(w, h) / 2) + 1;
  const maxLift = liftFor(n - 1, Math.max(p.thickness - 1, 0), p);
  const halfH = Math.ceil(R * p.squash) + 1;
  return { width: 2 * R, height: 2 * halfH + maxLift, originX: R, originY: halfH + maxLift };
}

/** 深度ソート用キー。スタック単位で比較する（スライス単位で混ぜない） */
export interface Sortable { depth: number; baseZ: number; id: number; }
export function compareDrawOrder(a: Sortable, b: Sortable): number {
  if (a.depth !== b.depth) return a.depth - b.depth; // 奥（小さい）から先に描く
  if (a.baseZ !== b.baseZ) return a.baseZ - b.baseZ;
  return a.id - b.id; // 安定化
}
