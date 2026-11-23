/** ダミーの地面テクスチャ（ワールド原点が中心）。本番は assets/ground/ の 1 枚絵に置き換える */
export function makeGround(size: number, draw?: (g: CanvasRenderingContext2D, half: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#4f7d4a'; g.fillRect(0, 0, size, size);
  // 16px グリッド（回転・つぶしの確認用）
  g.fillStyle = '#47703f';
  for (let i = 0; i < size; i += 16) { g.fillRect(i, 0, 1, size); g.fillRect(0, i, size, 1); }
  const half = size / 2;
  // 原点の十字と北マーカー
  g.fillStyle = '#e0b84a'; g.fillRect(half - 8, half, 17, 1); g.fillRect(half, half - 8, 1, 17);
  g.fillStyle = '#b13e53'; g.fillRect(half - 2, 4, 5, 10); // 北(-y)
  draw?.(g, half);
  return c;
}
