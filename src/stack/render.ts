// Canvas2D による正しい Sprite Stacking 描画。
//  - 全スライスを同じ相対角で回転（オブジェクト向き - カメラ向き）
//  - 回転・縦つぶしの「あと」で、画面の真上方向へ z * spacing px 持ち上げる（カメラが回っても常に画面上）
//  - 下のスライスから順に描く。ソートはスタック単位。
//  - 位置は整数 px。サンプリングは最近傍。
import type { StackAsset, StackParams } from './types';
import { liftFor, stackBounds } from './math';

export const stats = { drawImage: 0, composites: 0 };

export function drawStack(
  g: CanvasRenderingContext2D, a: StackAsset, frame: number,
  sx: number, sy: number, relYaw: number, p: StackParams, drawScale = 1,
) {
  const { sliceWidth: w, sliceHeight: h, sliceCount: n, pivot } = a.meta;
  const fy = (frame % a.meta.frames) * h;
  const subSteps = drawScale > 1 && p.spacing >= 1 ? Math.max(1, Math.round(drawScale)) : 1;
  for (let z = 0; z < n; z++) {
    for (let k = 0; k < p.thickness; k++) {
      const baseLift = drawScale === 1 ? liftFor(z, k, p) : Math.round(liftFor(z, k, p) * drawScale);
      for (let sub = 0; sub < subSteps; sub++) {
        // 行列の合成順: translate(地面点 - 持ち上げ) · scale(drawScale, squash*drawScale) · rotate(relYaw)
        g.setTransform(1, 0, 0, 1, sx, sy - (baseLift + sub));
        g.scale(drawScale, p.squash * drawScale);
        g.rotate(relYaw);
        g.drawImage(a.image, z * w, fy, w, h, -pivot[0], -pivot[1], w, h);
        stats.drawImage++;
      }
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * 合成キャッシュ。静的なスタックは (asset, frame, 相対角, squash, spacing, thickness) が同じなら
 * 見た目が完全に同じなので、1回だけ全スライスを描いて以後は1枚の blit で済ませる。
 * カメラが平行移動しているだけならキャッシュはそのまま使える。回転するとキーが変わる。
 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class CompositeCache {
  private map = new Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number }>();
  private epoch = '';
  maxEntries = 3600;
  /** Canvas2D は回転した drawImage の「縁」をアンチエイリアスする（imageSmoothingEnabled=false でも）。
   *  合成後にアルファを 0/255 に二値化して、縁のにじみを消す＝ピクセルパーフェクトにする */
  hardenAlpha = true;
  /** 合成後に 1px の色馴染み外周輪郭線を描く（D10 準拠：スライスには焼き込まず合成後に 1 回だけ） */
  outline = false;

  /** つぶし・間隔・厚み・輪郭・ワールド倍率が変わったら呼ぶ（カメラ角の変化だけでは消さない） */
  beginFrame(epochKey: string) {
    if (epochKey !== this.epoch) { this.map.clear(); this.epoch = epochKey; }
  }

  private quantizeKeyAndYaw(a: StackAsset, frame: number, relYaw: number, drawScale: number): [string, number] {
    const scaleTag = drawScale === 1 ? '' : `|s${drawScale}`;
    if (a.meta.category === 'props') {
      // 回らない小物は 16 方向（22.5° 刻み）に量子化してキャッシュを共有する（§6.5.2）
      const step = ((Math.round((relYaw * 8) / Math.PI) % 16) + 16) % 16;
      return [`${a.meta.id}|${frame}|p${step}${scaleTag}`, (step * Math.PI) / 8];
    }
    // 正方位（0°/90°/180°/270°）はピクセル完全一致のため厳密値にスナップ
    const rawDeg = (relYaw * 180) / Math.PI;
    const nearest90 = Math.round(rawDeg / 90) * 90;
    if (Math.abs(rawDeg - nearest90) < 0.05) {
      const q = ((Math.round(rawDeg / 90) % 4) + 4) % 4;
      return [`${a.meta.id}|${frame}|c${q}${scaleTag}`, (q * Math.PI) / 2];
    }
    // 2× 高精細建築・地形は 6° 刻み（60方向）× 16 位相分散で回転時の再合成スパイクを抑制
    if ((a.meta.density ?? 1) >= 2) {
      const phaseDeg = (hashId(a.meta.id) % 16) * 0.375;
      const idx = ((Math.round((rawDeg - phaseDeg) / 6) % 60) + 60) % 60;
      return [`${a.meta.id}|${frame}|q${idx}${scaleTag}`, ((idx * 6 + phaseDeg) * Math.PI) / 180];
    }
    // 1× はアセット ID ごとに 6 位相（0°〜2.5° の 0.5° 刻み）へ分散して 3° 刻みで量子化
    const phaseDeg = (hashId(a.meta.id) % 6) * 0.5;
    const idx = ((Math.round((rawDeg - phaseDeg) / 3) % 120) + 120) % 120;
    return [`${a.meta.id}|${frame}|d${idx}${scaleTag}`, ((idx * 3 + phaseDeg) * Math.PI) / 180];
  }

  private buildEntry(a: StackAsset, frame: number, qYaw: number, p: StackParams, drawScale: number) {
    const b = stackBounds(
      Math.ceil(a.meta.sliceWidth * drawScale),
      Math.ceil(a.meta.sliceHeight * drawScale),
      Math.ceil(a.meta.sliceCount * drawScale),
      p,
    );
    let canvas: HTMLCanvasElement;
    if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      const oldest = oldestKey !== undefined ? this.map.get(oldestKey) : undefined;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
      canvas = oldest ? oldest.canvas : document.createElement('canvas');
      canvas.width = b.width;
      canvas.height = b.height;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = b.width;
      canvas.height = b.height;
    }
    const cg = canvas.getContext('2d', { willReadFrequently: true })!;
    cg.imageSmoothingEnabled = false;
    drawStack(cg, a, frame, b.originX, b.originY, qYaw, p, drawScale);
    if (this.hardenAlpha || this.outline) finalizeComposite(cg, b.width, b.height, this.hardenAlpha, this.outline);
    stats.composites++;
    return { canvas, ox: b.originX, oy: b.originY };
  }

  /** 小物を起動時に 16 方向×全アニメフレーム事前合成しておく（風揺らぎ・回転中のスパイクを防ぐ） */
  prewarmProps(assets: Iterable<StackAsset>, p: StackParams, worldScale = 1) {
    for (const a of assets) {
      if (a.meta.category !== 'props') continue;
      const drawScale = worldScale / (a.meta.density ?? 1);
      const scaleTag = drawScale === 1 ? '' : `|s${drawScale}`;
      const frames = Math.max(1, a.meta.frames);
      for (let f = 0; f < frames; f++) {
        for (let step = 0; step < 16; step++) {
          const key = `${a.meta.id}|${f}|p${step}${scaleTag}`;
          if (!this.map.has(key)) {
            this.map.set(key, this.buildEntry(a, f, (step * Math.PI) / 8, p, drawScale));
          }
        }
      }
    }
  }

  draw(g: CanvasRenderingContext2D, a: StackAsset, frame: number, sx: number, sy: number, relYaw: number, p: StackParams, worldScale = 1) {
    const drawScale = worldScale / (a.meta.density ?? 1);
    const [key, qYaw] = this.quantizeKeyAndYaw(a, frame, relYaw, drawScale);
    let e = this.map.get(key);
    if (e) {
      // LRU 更新
      this.map.delete(key);
      this.map.set(key, e);
    } else {
      e = this.buildEntry(a, frame, qYaw, p, drawScale);
      this.map.set(key, e);
    }
    g.drawImage(e.canvas, sx - e.ox, sy - e.oy);
    stats.drawImage++;
  }

  get size() { return this.map.size; }
}

let alphaScratch = new Uint8Array(0);

/** 合成済みバッファに対し、アルファ二値化＋タイト範囲の色馴染み 1px 輪郭線を 1 回の ImageData 読み書きで実行する */
export function finalizeComposite(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  doHarden: boolean,
  doOutline: boolean,
  threshold = 128,
) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const total = w * h;
  if (doOutline && alphaScratch.length < total) alphaScratch = new Uint8Array(total);
  let minX = w, maxX = -1, minY = h, maxY = -1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const p = row + x;
      const i = p * 4;
      let a = d[i + 3];
      if (doHarden && a > 0 && a < 255) {
        if (a < threshold) {
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
          a = 0;
        } else {
          d[i + 3] = 255;
          a = 255;
        }
      }
      if (doOutline) {
        alphaScratch[p] = a;
        if (a > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  if (doOutline && maxX >= minX) {
    const x0 = Math.max(0, minX - 1);
    const x1 = Math.min(w - 1, maxX + 1);
    const y0 = Math.max(0, minY - 1);
    const y1 = Math.min(h - 1, maxY + 1);
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const p = row + x;
        if (alphaScratch[p] > 0) continue;
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        if (x > 0 && alphaScratch[p - 1] > 0) { const ni = (p - 1) * 4; sr += d[ni]; sg += d[ni + 1]; sb += d[ni + 2]; cnt++; }
        if (x + 1 < w && alphaScratch[p + 1] > 0) { const ni = (p + 1) * 4; sr += d[ni]; sg += d[ni + 1]; sb += d[ni + 2]; cnt++; }
        if (y > 0 && alphaScratch[p - w] > 0) { const ni = (p - w) * 4; sr += d[ni]; sg += d[ni + 1]; sb += d[ni + 2]; cnt++; }
        if (y + 1 < h && alphaScratch[p + w] > 0) { const ni = (p + w) * 4; sr += d[ni]; sg += d[ni + 1]; sb += d[ni + 2]; cnt++; }
        if (cnt > 0) {
          const inv = 1 / cnt;
          const i = p * 4;
          d[i] = Math.min(68, Math.round(sr * inv * 0.36));
          d[i + 1] = Math.min(70, Math.round(sg * inv * 0.37));
          d[i + 2] = Math.min(84, Math.round(sb * inv * 0.43));
          d[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** アルファを 0 か 255 に丸め、半透明で薄まった色を不透明に戻す（縁の AA 除去） */
export function hardenAlpha(g: CanvasRenderingContext2D, w: number, h: number, threshold = 128) {
  finalizeComposite(g, w, h, true, false, threshold);
}

/** 合成済みスタックの外周透明ピクセルに 1px の暗い輪郭線を付ける */
export function applyOutline(g: CanvasRenderingContext2D, w: number, h: number) {
  finalizeComposite(g, w, h, false, true);
}
