import type { StackAsset, StackMeta } from './types';

const BASE = import.meta.env.BASE_URL ?? '/';

/** /stacks/<dir>/<id>.json と .png を読む。vertical / top-first は horizontal / bottom-first に正規化する */
export async function loadStack(dir: string, id: string): Promise<StackAsset> {
  const url = `${BASE}stacks/${dir}/${id}`;
  const meta = (await (await fetch(`${url}.json`)).json()) as StackMeta;
  const img = new Image();
  img.src = `${url}.png`;
  await img.decode();
  validate(meta, img);
  return { meta: { ...meta, layout: 'horizontal', order: 'bottom-first' }, image: normalize(meta, img) };
}

/** /ground/<file> などの静的画像を読む */
export async function loadGroundImage(file: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `${BASE}${file.replace(/^\/+/, '')}`;
  await img.decode();
  return img;
}

function validate(m: StackMeta, img: HTMLImageElement) {
  const expW = m.layout === 'horizontal' ? m.sliceWidth * m.sliceCount : m.sliceWidth * m.frames;
  const expH = m.layout === 'horizontal' ? m.sliceHeight * m.frames : m.sliceHeight * m.sliceCount;
  if (img.naturalWidth !== expW || img.naturalHeight !== expH) {
    throw new Error(`[stack ${m.id}] シートのサイズが不正: ${img.naturalWidth}x${img.naturalHeight}（期待 ${expW}x${expH}）`);
  }
}

/** 内部表現: 横一列・左が z0・行がフレーム */
function normalize(m: StackMeta, img: HTMLImageElement): CanvasImageSource {
  if (m.layout === 'horizontal' && m.order === 'bottom-first') return img;
  const c = document.createElement('canvas');
  c.width = m.sliceWidth * m.sliceCount; c.height = m.sliceHeight * m.frames;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (let f = 0; f < m.frames; f++) for (let z = 0; z < m.sliceCount; z++) {
    const srcZ = m.order === 'top-first' ? m.sliceCount - 1 - z : z;
    const sx = m.layout === 'horizontal' ? srcZ * m.sliceWidth : f * m.sliceWidth;
    const sy = m.layout === 'horizontal' ? f * m.sliceHeight : srcZ * m.sliceHeight;
    g.drawImage(img, sx, sy, m.sliceWidth, m.sliceHeight, z * m.sliceWidth, f * m.sliceHeight, m.sliceWidth, m.sliceHeight);
  }
  return c;
}
