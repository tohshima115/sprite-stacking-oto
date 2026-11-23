import type { StackAsset } from './stack/types';
import { type Camera, cameraLattice, worldToLatticeScreen, relativeYaw, compareDrawOrder, params } from './stack/math';
import { drawStack, CompositeCache, stats } from './stack/render';
import { renderWaterOverlay, renderEntityFx } from './ambient';

export interface Entity {
  id: number;
  asset: StackAsset;
  x: number; y: number;  // 地面の接地点（ワールド px）
  yaw: number;           // ワールドでの向き（ラジアン）。シートの +y が正面
  frame: number;
  baseZ: number;         // 地面からの高さ（段丘・2段積みなど）。通常 0
  dynamic: boolean;      // true: 動く（キャラ等）。描画は同じ合成経路で、向き・フレームが変わった時だけ作り直される
  noShadow?: boolean;    // true: 地面影スタンプを描かない（上層モジュール用）
}

export interface GroundLayer {
  canvas: HTMLCanvasElement;
  wallCanvas?: HTMLCanvasElement | null;
  cx: number;
  cy: number;
  z: number;
  wallSteps?: number[];
}

export interface World {
  ground: HTMLCanvasElement | null; // z=0 の基底地面レイヤー。中心がワールド原点
  groundLayers?: GroundLayer[];     // 段丘・王城島の隆起地形レイヤー（下から z 昇順）
  entities: Entity[];
}

/** composite: 合成キャッシュ＋アルファ二値化（正。既定）/ direct: スライスを毎回そのまま描く（比較用。縁がにじむ） */
export interface RenderOptions {
  mode: 'composite' | 'direct';
  shadows?: boolean;
  outline?: boolean;
  timeSec?: number;
  waterFx?: boolean;
}

const shadowStamps = new Map<string, HTMLCanvasElement>();

function getShadowStamp(rx: number, ry: number): HTMLCanvasElement {
  const key = `${rx}x${ry}`;
  let c = shadowStamps.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = rx * 2 + 2;
    c.height = ry * 2 + 2;
    const sg = c.getContext('2d')!;
    sg.fillStyle = 'rgba(26, 28, 44, 0.28)';
    sg.beginPath();
    sg.ellipse(rx + 1, ry + 1, rx, ry, 0, 0, Math.PI * 2);
    sg.fill();
    if (shadowStamps.size > 128) shadowStamps.clear();
    shadowStamps.set(key, c);
  }
  return c;
}

export function renderWorld(g: CanvasRenderingContext2D, bufW: number, bufH: number, w: World, cam: Camera, cache: CompositeCache, opt: RenderOptions) {
  const p = params(cam);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, bufW, bufH);

  const lat = cameraLattice(cam);
  const sc = lat.scale;
  const halfW = Math.floor(bufW / 2);
  const halfH = Math.floor(bufH / 2);
  const camZOff = Math.round((cam.z ?? 0) * sc * cam.spacing);

  // 1) 基底地面（z=0）と段丘・岩盤島レイヤー
  if (w.ground) {
    g.setTransform(1, 0, 0, 1, halfW - lat.intCamX, halfH - lat.intCamY + camZOff);
    g.scale(1, cam.squash);
    g.rotate(-cam.yaw);
    g.scale(sc, sc);
    g.drawImage(w.ground, -w.ground.width / 2, -w.ground.height / 2);
    stats.drawImage++;
  }
  if (w.groundLayers) {
    for (const layer of w.groundLayers) {
      if (layer.wallCanvas && layer.wallSteps) {
        for (const sz of layer.wallSteps) {
          g.setTransform(1, 0, 0, 1, halfW - lat.intCamX, halfH - lat.intCamY + camZOff - Math.round(sz * sc * cam.spacing));
          g.scale(1, cam.squash);
          g.rotate(-cam.yaw);
          g.scale(sc, sc);
          g.drawImage(layer.wallCanvas, layer.cx - layer.wallCanvas.width / 2, layer.cy - layer.wallCanvas.height / 2);
          stats.drawImage++;
        }
      }
      g.setTransform(1, 0, 0, 1, halfW - lat.intCamX, halfH - lat.intCamY + camZOff - Math.round(layer.z * sc * cam.spacing));
      g.scale(1, cam.squash);
      g.rotate(-cam.yaw);
      g.scale(sc, sc);
      g.drawImage(layer.canvas, layer.cx - layer.canvas.width / 2, layer.cy - layer.canvas.height / 2);
      stats.drawImage++;
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (opt.waterFx && opt.timeSec !== undefined) {
    renderWaterOverlay(g, bufW, bufH, cam, lat, opt.timeSec);
  }

  // 2) スタック単位で奥→手前にソート（広域マップ用・距離ベース粗カリング付き）
  cache.outline = Boolean(opt.outline);
  cache.beginFrame(`${cam.squash}|${cam.spacing}|${cam.thickness}|${cache.outline ? 1 : 0}|${sc}`);
  const margin = 80 * sc;
  const maxSpan = (Math.max(bufW, bufH / cam.squash) / sc) * 0.72 + 120 + 220 / Math.max(0.5, cam.squash);
  const list = [] as { e: Entity; sx: number; sy: number; groundSy: number; depth: number; baseZ: number; id: number }[];
  for (const e of w.entities) {
    if (Math.abs(e.x - cam.x) > maxSpan || Math.abs(e.y - cam.y) > maxSpan) continue;
    const s = worldToLatticeScreen(cam, e.x, e.y, bufW, bufH, lat);
    const groundSy = s.sy + camZOff;
    const sy = groundSy - Math.round(e.baseZ * sc * cam.spacing);
    if (s.sx < -margin || s.sx > bufW + margin || sy < -margin || sy > bufH + 220 * sc) continue;
    list.push({ e, sx: s.sx, sy, groundSy, depth: s.depth, baseZ: e.baseZ, id: e.id });
  }
  list.sort(compareDrawOrder);

  // 2.5) 地面の影（接地面 groundSy に楕円スタンプを貼り、浮遊物体は影の上に浮かぶ）
  if (opt.shadows) {
    for (const it of list) {
      if (it.e.noShadow) continue;
      const [fw, fh] = it.e.asset.meta.footprint;
      const rx = Math.max(3, Math.round(fw * sc * 0.45));
      const ry = Math.max(2, Math.round(fh * sc * 0.35 * cam.squash));
      const stamp = getShadowStamp(rx, ry);
      g.drawImage(stamp, it.sx - rx - 1, it.groundSy - ry);
      stats.drawImage++;
    }
  }

  // 3) 描画
  const fxTime = opt.waterFx ? opt.timeSec : undefined;
  for (const it of list) {
    const rel = relativeYaw(it.e.yaw, cam.yaw);
    if (opt.mode === 'composite') cache.draw(g, it.e.asset, it.e.frame, it.sx, it.sy, rel, p, sc);
    else drawStack(g, it.e.asset, it.e.frame, it.sx, it.sy, rel, p, sc / (it.e.asset.meta.density ?? 1));
    if (fxTime !== undefined) renderEntityFx(g, it.e, cam, bufW, bufH, lat, fxTime);
  }
  return list.length;
}
