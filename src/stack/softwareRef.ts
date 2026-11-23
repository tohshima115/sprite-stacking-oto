// 参照用のソフトウェアラスタライザ（テスト・検証専用）。
// Canvas2D 実装と同じ変換（translate → scale(1,squash) → rotate）を逆写像で再現する。
import type { StackParams } from './types';
import { liftFor } from './math';

export interface Slices { w: number; h: number; n: number; /** [z][y][x] RGBA */ data: Uint8ClampedArray; }

export function sliceAlpha(s: Slices, x: number, y: number, z: number) {
  return s.data[((z * s.h + y) * s.w + x) * 4 + 3];
}

/**
 * 出力 outW x outH に、地面中心 (sx, sy) でスタックを描く。返り値は各ピクセルの「勝ったスライス z」（-1=空）。
 * 下から上へ重ね描きするのと等価（上のスライスが勝つ）。
 */
export function rasterize(s: Slices, outW: number, outH: number, sx: number, sy: number, relYaw: number, p: StackParams): Int16Array {
  const out = new Int16Array(outW * outH).fill(-1);
  const c = Math.cos(-relYaw), sn = Math.sin(-relYaw);
  for (let z = 0; z < s.n; z++) {
    for (let k = 0; k < p.thickness; k++) {
      const lift = liftFor(z, k, p);
      for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
        // 画面ピクセル中心 → スライスのローカル座標
        const lx = px + 0.5 - sx;
        const ly = (py + 0.5 - (sy - lift)) / p.squash;
        const ux = lx * c - ly * sn + s.w / 2;
        const uy = lx * sn + ly * c + s.h / 2;
        const ix = Math.floor(ux), iy = Math.floor(uy);
        if (ix < 0 || iy < 0 || ix >= s.w || iy >= s.h) continue;
        if (sliceAlpha(s, ix, iy, z) > 0) out[py * outW + px] = z;
      }
    }
  }
  return out;
}

/** 不透明ピクセルの外接矩形 */
export function opaqueBounds(buf: Int16Array, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[y * w + x] >= 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
