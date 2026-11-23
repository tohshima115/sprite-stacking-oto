import { describe, it, expect } from 'vitest';
import { rasterize, opaqueBounds, type Slices } from '../src/stack/softwareRef';
import { worldToScreen, screenUpInWorld, yawFromVelocity, compareDrawOrder, liftFor, type Camera } from '../src/stack/math';
import type { StackParams } from '../src/stack/types';

/** w x h x n の中身が詰まった直方体のスライス */
function solid(w: number, h: number, n: number): Slices {
  const data = new Uint8ClampedArray(w * h * n * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { w, h, n, data };
}
const P = (o: Partial<StackParams> = {}): StackParams => ({ squash: 1, spacing: 1, thickness: 1, ...o });
const OUT = 96;

describe('正しい Sprite Stacking の幾何（SpriteCook「Check that it works」準拠）', () => {
  it('squash=1・回転0なら、スライスを1pxずつ上に貼ったものとピクセル単位で一致する', () => {
    const s = solid(6, 4, 5);
    // 段ごとに形を変える（上の段ほど細い）
    for (let z = 0; z < s.n; z++) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      if (x < z / 2 || x >= s.w - z / 2) s.data[((z * s.h + y) * s.w + x) * 4 + 3] = 0;
    }
    const sx = 40, sy = 60;
    const got = rasterize(s, OUT, OUT, sx, sy, 0, P());
    for (let py = 0; py < OUT; py++) for (let px = 0; px < OUT; px++) {
      let exp = -1;
      for (let z = 0; z < s.n; z++) {
        const ix = px - (sx - s.w / 2), iy = py - (sy - z - s.h / 2);
        if (ix >= 0 && iy >= 0 && ix < s.w && iy < s.h && s.data[((z * s.h + iy) * s.w + ix) * 4 + 3] > 0) exp = z;
      }
      expect(got[py * OUT + px]).toBe(exp);
    }
  });

  it('squash=1・回転0の外接矩形は 幅=スライス幅、高さ=スライス縦+(枚数-1)', () => {
    const b = opaqueBounds(rasterize(solid(10, 14, 8), OUT, OUT, 48, 60, 0, P()), OUT, OUT);
    expect(b.width).toBe(10);
    expect(b.height).toBe(14 + 7);
  });

  it('90°回すと幅がスライス縦と等しくなる', () => {
    const b = opaqueBounds(rasterize(solid(10, 14, 8), OUT, OUT, 48, 60, Math.PI / 2, P()), OUT, OUT);
    expect(b.width).toBe(14);
  });

  it('squash 0.75 は squash 1 より低く、spacing 2 は spacing 1 より高い', () => {
    const s = solid(10, 14, 8);
    const h1 = opaqueBounds(rasterize(s, OUT, OUT, 48, 70, 0, P()), OUT, OUT).height;
    const h075 = opaqueBounds(rasterize(s, OUT, OUT, 48, 70, 0, P({ squash: 0.75 })), OUT, OUT).height;
    const h2 = opaqueBounds(rasterize(s, OUT, OUT, 48, 70, 0, P({ spacing: 2 })), OUT, OUT).height;
    expect(h075).toBeLessThan(h1);
    expect(h2).toBeGreaterThan(h1);
  });

  it('spacing=0・squash=1 だと平らになり、最上段のスライスがすべてを覆う', () => {
    const s = solid(6, 6, 4);
    const got = rasterize(s, OUT, OUT, 30, 30, 0.3, P({ spacing: 0 }));
    const zs = new Set(Array.from(got).filter((z) => z >= 0));
    expect([...zs]).toEqual([3]);
  });

  it('積み上げ方向はどの相対角でも画面の真上（柱を回しても幅は1枚ぶんのまま・左右にずれない）', () => {
    for (const yaw of [0, 0.4, 1.3, 2.9, -2.2]) {
      const one = opaqueBounds(rasterize(solid(3, 3, 1), OUT, OUT, 40, 60, yaw, P()), OUT, OUT);
      const pole = opaqueBounds(rasterize(solid(3, 3, 12), OUT, OUT, 40, 60, yaw, P()), OUT, OUT);
      expect(pole.x0).toBe(one.x0);           // 左右にずれない
      expect(pole.x1).toBe(one.x1);
      expect(pole.y1).toBe(one.y1);           // 接地点（下端）は同じ
      expect(pole.height).toBe(one.height + 11); // 真上に 11px 伸びる
    }
  });

  it('thickness=2 は高さが約2倍で、隙間ができない', () => {
    const s = solid(4, 4, 6);
    const got = rasterize(s, OUT, OUT, 40, 60, 0, P({ thickness: 2 }));
    const b = opaqueBounds(got, OUT, OUT);
    expect(b.height).toBe(4 + (6 * 2 - 1));
    expect(liftFor(1, 0, P({ thickness: 2 }))).toBe(2);
  });
});

describe('カメラ・向き・ソート', () => {
  const cam: Camera = { x: 0, y: 0, yaw: 0, squash: 1, spacing: 1, thickness: 1, zoom: 1 };
  it('yaw=0 では北(-y)が画面上', () => {
    expect(worldToScreen(cam, 0, -10, 100, 100).sy).toBe(40);
  });
  it('yaw=90° では東(+x)が画面上に来て、screenUpInWorld と一致する', () => {
    const c = { ...cam, yaw: Math.PI / 2 };
    const s = worldToScreen(c, 10, 0, 100, 100);
    expect(s.sx).toBe(50); expect(s.sy).toBe(40);
    const up = screenUpInWorld(c.yaw);
    expect(up[0]).toBeCloseTo(1); expect(up[1]).toBeCloseTo(0);
  });
  it('南(+y)へ進むと向きは 0（シートの正面 +y がそのまま進行方向）', () => {
    expect(yawFromVelocity(0, 1)).toBeCloseTo(0);
    expect(yawFromVelocity(1, 0)).toBeCloseTo(-Math.PI / 2);
  });
  it('ソートは奥行き（カメラ基準）でスタック単位。回転後の奥行きを使う', () => {
    const c = { ...cam, yaw: Math.PI }; // 180°回すと南北が逆
    const north = worldToScreen(c, 0, -10, 100, 100), south = worldToScreen(c, 0, 10, 100, 100);
    const arr = [{ depth: south.depth, baseZ: 0, id: 1 }, { depth: north.depth, baseZ: 0, id: 2 }].sort(compareDrawOrder);
    expect(arr.map((a) => a.id)).toEqual([1, 2]); // 180°では南が奥なので先に描く
  });
});
