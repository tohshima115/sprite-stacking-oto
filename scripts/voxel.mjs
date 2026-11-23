// ボクセル体積ユーティリティ（3D AO ライティング・2×細分化・8bitインデックスPNG最適化・四面図カービング共用）
// 体積は [z][y][x] の RGBA。z=0 が地面、+y が「正面（南・シートの下方向）」。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';

function isAutoEmissiveRgb(r, g, b) {
  // シアン魔導光 (#73eff7) / 暖色ランタン灯 (#ffe08a)
  return (r === 115 && g === 239 && b === 247) || (r === 255 && g === 224 && b === 138);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & (-(c & 1)));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** 標準 8-bit インデックスカラー PNG (PLTE + tRNS, colorType=3) エンコーダ。256色超過時は null を返す */
export function encodeIndexedPng(w, h, rgba) {
  const pal = [];
  const map = new Map();
  let hasTrans = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) { hasTrans = true; break; }
  }
  if (hasTrans) {
    pal.push([0, 0, 0]);
    map.set(0, 0);
  }
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * (w + 1);
    raw[rowOff] = 0; // filter None (インデックス画像と zlib LZ77 との相性が最良)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a === 0) {
        raw[rowOff + 1 + x] = 0;
        continue;
      }
      const key = ((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]) + 1;
      let idx = map.get(key);
      if (idx === undefined) {
        if (pal.length >= 256) return null;
        idx = pal.length;
        pal.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
        map.set(key, idx);
      }
      raw[rowOff + 1 + x] = idx;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 3; // colorType = indexed-color
  const plte = Buffer.alloc(pal.length * 3);
  for (let i = 0; i < pal.length; i++) {
    plte[i * 3] = pal[i][0];
    plte[i * 3 + 1] = pal[i][1];
    plte[i * 3 + 2] = pal[i][2];
  }
  const chunks = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
  ];
  if (hasTrans) chunks.push(pngChunk('tRNS', Buffer.from([0])));
  chunks.push(pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

export class Volume {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d; // w=X(幅) h=Y(奥行き) d=Z(高さ=スライス枚数)
    this.data = new Uint8ClampedArray(w * h * d * 4);
    this.emissive = new Uint8Array(w * h * d);
  }
  vidx(x, y, z) { return (z * this.h + y) * this.w + x; }
  idx(x, y, z) { return ((z * this.h + y) * this.w + x) * 4; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  set(x, y, z, rgb) {
    if (!this.inside(x, y, z)) return;
    const vi = this.vidx(x, y, z);
    const i = vi * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = 255;
    this.emissive[vi] = 0;
  }
  setEmissive(x, y, z, rgb) {
    if (!this.inside(x, y, z)) return;
    const vi = this.vidx(x, y, z);
    const i = vi * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = 255;
    this.emissive[vi] = 1;
  }
  clear(x, y, z) {
    if (!this.inside(x, y, z)) return;
    const vi = this.vidx(x, y, z);
    this.data[vi * 4 + 3] = 0;
    this.emissive[vi] = 0;
  }
  filled(x, y, z) { return this.inside(x, y, z) && this.data[this.idx(x, y, z) + 3] > 0; }
  rgbAt(x, y, z) {
    if (!this.filled(x, y, z)) return null;
    const i = this.idx(x, y, z);
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  box(x0, y0, z0, x1, y1, z1, rgb) { // 両端含む
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, rgb);
  }
  boxEmissive(x0, y0, z0, x1, y1, z1, rgb) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setEmissive(x, y, z, rgb);
  }

  /**
   * 方向非依存の量子化 3D アンビエントオクルージョン＋軒下影＋接地 AO を焼き込む。
   * - 不可視内部コア（上面＋4側面がすべて埋まっているボクセル）は単一固定色へ統一し、PNG圧縮率を最大化
   * - ランダム白ノイズを廃し、明度係数を 1/16 刻みへ量子化してクリーンな面を保つ
   * - 発光ボクセルは減光しない
   */
  bakeLighting({ density = 2, aoStrength = 0.28, grain = 0 } = {}) {
    const { w, h, d } = this;
    const src = new Uint8ClampedArray(this.data);
    const filledSrc = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d) && src[((z * h + y) * w + x) * 4 + 3] > 0;
    const zGroundMax = density >= 2 ? 6 : 4;
    const reach = density >= 2 ? 2 : 1;

    // 体積内の最頻出色を求め、深部コア（外表面から2ボクセル以上内側）をその代表色で統一する
    const hist = new Map();
    let domKey = 0, domCnt = 0, domRgb = [160, 154, 142];
    const stepStride = Math.max(1, Math.floor((w * h * d) / 4096));
    for (let p = 0; p < w * h * d; p += stepStride) {
      const i = p * 4;
      if (src[i + 3] === 0) continue;
      const r = src[i], g = src[i + 1], b = src[i + 2];
      if (this.emissive[p] || isAutoEmissiveRgb(r, g, b)) continue;
      const k = (r << 16) | (g << 8) | b;
      const c = (hist.get(k) ?? 0) + 1;
      hist.set(k, c);
      if (c > domCnt) {
        domCnt = c;
        domKey = k;
        domRgb = [Math.round(r * 0.875), Math.round(g * 0.875), Math.round(b * 0.875)];
      }
    }

    for (let z = 0; z < d; z++) {
      const groundAO = z < zGroundMax ? 0.81 + (z / zGroundMax) * 0.19 : 1.0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const vi = (z * h + y) * w + x;
          const i = vi * 4;
          if (src[i + 3] === 0) continue;

          const topOpen = !filledSrc(x, y, z + 1);
          const buried = !topOpen
            && !this.emissive[vi]
            && filledSrc(x, y, z + 2)
            && filledSrc(x - 1, y, z) && filledSrc(x - 2, y, z)
            && filledSrc(x + 1, y, z) && filledSrc(x + 2, y, z)
            && filledSrc(x, y - 1, z) && filledSrc(x, y - 2, z)
            && filledSrc(x, y + 1, z) && filledSrc(x, y + 2, z);
          if (buried) {
            this.data[i] = domRgb[0];
            this.data[i + 1] = domRgb[1];
            this.data[i + 2] = domRgb[2];
            continue;
          }

          const r = src[i], g = src[i + 1], b = src[i + 2];
          if (this.emissive[vi] || isAutoEmissiveRgb(r, g, b)) continue;

          let light = 1.0;
          if (topOpen) {
            let upperOcc = 0;
            for (let dz = 1; dz <= 2; dz++) {
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (filledSrc(x + dx, y + dy, z + dz)) upperOcc += 1 / (dz + Math.abs(dx) + Math.abs(dy));
              }
            }
            light = 1.09 - Math.min(0.16, upperOcc * 0.045 * (aoStrength / 0.28));
          } else {
            let eaveOcc = 0;
            let hasAirFace = false;
            for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (!filledSrc(x + nx, y + ny, z)) {
                hasAirFace = true;
                if (filledSrc(x + nx, y + ny, z + 1)) eaveOcc += 1.0;
                else if (filledSrc(x + nx, y + ny, z + 2)) eaveOcc += 0.55;
                if (reach >= 2 && filledSrc(x + nx * 2, y + ny * 2, z + 1)) eaveOcc += 0.35;
              }
            }
            if (hasAirFace) {
              let neigh = 0;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                if (filledSrc(x + dx, y + dy, z)) neigh++;
              }
              const concaveOcc = Math.max(0, (neigh - 5) / 3);
              light = 0.91 - Math.min(0.22, eaveOcc * 0.10 * (aoStrength / 0.28)) - concaveOcc * 0.16 * (aoStrength / 0.28);
            } else {
              // 表面直下(1ボクセル内側)は凹み影を付けず外壁標準明度を保ち、回転/縦つぶしサンプリング時の縦筋を防ぐ
              light = 0.91;
            }
          }

          const rawF = Math.max(0.64, Math.min(1.15, light * groundAO + (grain ? 0 : 0)));
          const f = Math.round(rawF * 16) / 16;
          this.data[i] = Math.min(255, Math.round(r * f));
          this.data[i + 1] = Math.min(255, Math.round(g * f));
          this.data[i + 2] = Math.min(255, Math.round(b * f));
        }
      }
    }
  }

  /** 後方互換ライトベイク（密度1向け） */
  bakeTopLight() {
    this.bakeLighting({ density: 1, aoStrength: 0.18, grain: 0 });
  }

  /**
   * 1× 体積をクリーンな高精細 2×（2w × 2h × 2d）へ細分化する。
   * - 斜め/円弧段差の角だけ自動面取り（直角建物の角はシャープに保持）
   * - 勾配屋根・円錐屋根の上側段差を半ボクセル分なめらかに傾斜補間
   */
  upscale2xRefined({ bevel = true, texture = false } = {}) {
    const out = new Volume(this.w * 2, this.h * 2, this.d * 2);
    for (let z = 0; z < this.d; z++) {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const rgb = this.rgbAt(x, y, z);
          if (!rgb) continue;
          const vi = this.vidx(x, y, z);
          const isEm = this.emissive[vi] === 1 || isAutoEmissiveRgb(rgb[0], rgb[1], rgb[2]);

          for (let sz = 0; sz < 2; sz++) {
            const oz = sz === 0 ? -1 : 1;
            const nz = this.filled(x, y, z + oz);
            for (let sy = 0; sy < 2; sy++) {
              const oy = sy === 0 ? -1 : 1;
              const ny = this.filled(x, y + oy, z);
              const opy = this.filled(x, y - oy, z);
              for (let sx = 0; sx < 2; sx++) {
                const ox = sx === 0 ? -1 : 1;
                const nx = this.filled(x + ox, y, z);
                const opx = this.filled(x - ox, y, z);

                if (bevel && !isEm) {
                  if (!nx && !ny && !this.filled(x + ox, y + oy, z) && opx && opy) {
                    const d1 = this.filled(x + ox, y - oy, z);
                    const d2 = this.filled(x - ox, y + oy, z);
                    if (d1 !== d2) continue;
                  }
                  if (!nz && sz === 1) {
                    const slopeX = !nx && opx && this.filled(x - ox, y, z + 1);
                    const slopeY = !ny && opy && this.filled(x, y - oy, z + 1);
                    if (slopeX || slopeY) continue;
                  }
                }

                const tx = x * 2 + sx, ty = y * 2 + sy, tz = z * 2 + sz;
                let [r, g, b] = rgb;
                if (texture && !isEm && sz === 0 && (tz % 4 === 0) && ((Math.max(r, g, b) - Math.min(r, g, b)) < 36)) {
                  r = Math.max(0, r - 6);
                  g = Math.max(0, g - 6);
                  b = Math.max(0, b - 6);
                }
                if (isEm) out.setEmissive(tx, ty, tz, [r, g, b]);
                else out.set(tx, ty, tz, [r, g, b]);
              }
            }
          }
        }
      }
    }
    return out;
  }
}

/** 体積を横一列のスライスシート（左=z0）に書き出す（8bitインデックスカラーPNG優先） */
export function writeSheet(file, frames, meta) {
  const v0 = frames[0];
  const density = meta.density ?? 1;
  const W = v0.w * v0.d, H = v0.h * frames.length;
  const png = new PNG({ width: W, height: H });
  frames.forEach((v, f) => {
    for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
      const s = v.idx(x, y, z);
      const o = (((f * v.h) + y) * W + (z * v.w + x)) * 4;
      for (let c = 0; c < 4; c++) png.data[o + c] = v.data[s + c];
    }
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let outBuf = encodeIndexedPng(W, H, png.data);
  if (!outBuf) {
    // 256色超過時は8刻み量子化でインデックスPNG再試行
    const q = new Uint8Array(png.data);
    for (let i = 0; i < q.length; i += 4) {
      if (q[i + 3] === 0) continue;
      q[i] = Math.min(255, Math.round(q[i] / 8) * 8);
      q[i + 1] = Math.min(255, Math.round(q[i + 1] / 8) * 8);
      q[i + 2] = Math.min(255, Math.round(q[i + 2] / 8) * 8);
    }
    outBuf = encodeIndexedPng(W, H, q) ?? PNG.sync.write(png, { deflateLevel: 9 });
  }
  fs.writeFileSync(file, outBuf);
  const json = {
    id: meta.id,
    category: meta.category,
    sliceWidth: v0.w,
    sliceHeight: v0.h,
    sliceCount: v0.d,
    density,
    frames: frames.length,
    layout: 'horizontal',
    order: 'bottom-first',
    front: '+y',
    pivot: meta.pivot ?? [v0.w / 2, v0.h / 2],
    footprint: meta.footprint ?? [Math.round(v0.w / density), Math.round(v0.h / density)],
    source: meta.source ?? 'procedural',
    palette: meta.palette ?? 'oto-64',
    notes: meta.notes ?? '',
  };
  fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(json, null, 2) + '\n');
  return json;
}

export function readPng(file) { return PNG.sync.read(fs.readFileSync(file)); }
