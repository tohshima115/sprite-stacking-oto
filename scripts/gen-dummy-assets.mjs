// ダミーのスライス素材をコードで生成する（本番素材ではない）。
// 出力: assets/stacks/_dummy/<id>.png + <id>.json
import { Volume, writeSheet } from './voxel.mjs';

const OUT = 'assets/stacks/_dummy';
const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const P = {
  stone: hex('a39e93'), stoneDark: hex('7a7a7a'), plaster: hex('f4e4c1'), wood: hex('8f5f3a'), woodDark: hex('6b4a2b'),
  roofRed: hex('c25a3c'), roofBlue: hex('3b5dc9'), leaf: hex('38b764'), leafDark: hex('2f5a3a'), trunk: hex('6b4a2b'),
  glass: hex('41a6f6'), gold: hex('e0b84a'), skin: hex('ef7d57'), cloth: hex('b13e53'), hair: hex('333c57'), white: hex('f4f4f4'), black: hex('1a1c2c'),
};
const made = [];
const out = (v, meta) => { v = Array.isArray(v) ? v : [v]; v.forEach((f) => f.bakeTopLight()); made.push(writeSheet(`${OUT}/${meta.id}.png`, v, meta)); };

// 1) 木箱 12x12x12：前面(+y)に目印の帯
{
  const v = new Volume(12, 12, 12);
  v.box(0, 0, 0, 11, 11, 11, P.wood);
  for (let z = 0; z < 12; z++) for (let i = 0; i < 12; i++) { v.set(i, 11, z, (z === 0 || z === 11 || i === 0 || i === 11) ? P.woodDark : P.wood); }
  v.box(4, 11, 4, 7, 11, 7, P.gold); // 正面マーカー
  out(v, { id: 'prop_crate_a', category: 'props', notes: '正面(+y)に金色マーカー' });
}

// 2) 丸い塔 21x21x40：円柱＋胸壁＋円錐屋根。正面に扉
{
  const N = 21, c = 10; const v = new Volume(N, N, 40);
  for (let z = 0; z < 40; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - c, y - c);
    if (z < 28 && r <= 8.5 && r > 6.5) v.set(x, y, z, z % 6 === 0 ? P.stoneDark : P.stone);
    if (z < 2 && r <= 8.5) v.set(x, y, z, P.stoneDark);
    if (z >= 28 && z < 30 && r <= 9.5) v.set(x, y, z, P.stoneDark);
    if (z >= 30 && z < 32 && r <= 9.5 && r > 8) { const a = Math.atan2(y - c, x - c); if (Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 === 0) v.set(x, y, z, P.stone); }
    if (z >= 30) { const rr = 7.5 * (1 - (z - 30) / 10); if (r <= rr) v.set(x, y, z, P.roofBlue); }
  }
  v.box(9, 18, 2, 11, 18, 7, P.woodDark); // 扉（正面）
  for (const z of [12, 20]) { v.set(10, 18, z, P.glass); v.set(2, 10, z, P.glass); v.set(18, 10, z, P.glass); }
  out(v, { id: 'bld_tower_round_a', category: 'buildings', notes: '円柱の塔。正面(+y)に扉' });
}

// 3) 切妻屋根の家 16x24x22：棟は y 方向。正面(+y)の妻側に扉
{
  const W = 16, H = 24, v = new Volume(W, H, 22);
  v.box(1, 1, 0, 14, 22, 11, P.plaster);
  for (let z = 0; z <= 11; z++) { for (const x of [1, 14]) for (const y of [1, 22]) v.set(x, y, z, P.wood); }
  v.box(1, 1, 0, 14, 22, 0, P.stoneDark);
  // 窓
  for (const y of [6, 12, 17]) for (const z of [5, 6]) { v.set(1, y, z, P.glass); v.set(14, y, z, P.glass); }
  v.box(6, 22, 1, 9, 22, 6, P.woodDark); // 扉
  // 切妻屋根（x方向に勾配）
  for (let z = 12; z < 22; z++) { const k = z - 12; const x0 = 0 + k * 0.8 | 0, x1 = 15 - (k * 0.8 | 0); if (x0 > x1) break; for (let y = 0; y < H; y++) { for (let x = x0; x <= x1; x++) { const edge = x === x0 || x === x1 || x === x0 + 1 || x === x1 - 1; if (edge || y === 0 || y === H - 1) v.set(x, y, z, (x + z) % 3 === 0 ? hex('8c3a2e') : P.roofRed); } } }
  out(v, { id: 'bld_house_gable_a', category: 'buildings', notes: '切妻の家。正面(+y)の妻面に扉' });
}

// 4) 木 13x13x22
{
  const N = 13, c = 6, v = new Volume(N, N, 22);
  v.box(5, 5, 0, 7, 7, 9, P.trunk);
  for (let z = 7; z < 22; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c, (z - 14) * 0.9);
    if (d <= 6.2) v.set(x, y, z, ((x * 7 + y * 3 + z * 5) % 5 === 0) ? P.leafDark : P.leaf);
  }
  out(v, { id: 'prop_tree_round_a', category: 'props' });
}

// 5) 城壁の一区画 16x8x18：胸壁つき。外側= -y
{
  const v = new Volume(16, 8, 18);
  v.box(0, 1, 0, 15, 6, 13, P.stone);
  for (let x = 0; x < 16; x++) for (let y = 1; y <= 6; y++) if (y === 1 || y === 6) { if (Math.floor(x / 3) % 2 === 0) v.box(x, y, 14, x, y, 16, P.stone); }
  v.box(0, 2, 13, 15, 5, 13, P.stoneDark); // 通路
  out(v, { id: 'bld_wall_segment_a', category: 'buildings', notes: '城壁モジュール。リング状に並べる。長辺=x' });
}

// 6) キャラクター 9x9x16（2フレームの歩行）。正面(+y)に顔
{
  const frames = [0, 1].map((f) => {
    const v = new Volume(9, 9, 16);
    // 脚（フレームで前後に開く）
    const off = f === 0 ? 1 : -1;
    v.box(2, 4 + off, 0, 3, 5 + off, 4, P.hair);
    v.box(5, 4 - off, 0, 6, 5 - off, 4, P.hair);
    v.box(2, 3, 5, 6, 6, 10, P.cloth);
    v.box(1, 4, 7, 1, 5, 10, P.skin); v.box(7, 4, 7, 7, 5, 10, P.skin);
    v.box(2, 2, 11, 6, 6, 15, P.skin);
    v.box(2, 2, 14, 6, 5, 15, P.hair); v.box(2, 2, 11, 6, 2, 15, P.hair); // 後頭部(-y)
    v.set(3, 6, 13, P.black); v.set(5, 6, 13, P.black); // 目（正面）
    return v;
  });
  out(frames, { id: 'chr_hero_walk', category: 'characters', notes: '行=歩行フレーム(2)。正面(+y)に目' });
}

// 7) 地面パネル用の旗竿（向き確認用の矢印）
{
  const v = new Volume(9, 15, 3);
  for (let y = 0; y < 15; y++) for (let x = 0; x < 9; x++) {
    const inShaft = x >= 3 && x <= 5 && y <= 9;
    const inHead = y > 9 && Math.abs(x - 4) <= (14 - y);
    if (inShaft || inHead) v.box(x, y, 0, x, y, 2, P.gold);
  }
  out(v, { id: 'prop_arrow_a', category: 'props', notes: '+y を指す矢印（回転方向の確認用）' });
}

console.log(`generated ${made.length} dummy stacks:`);
for (const m of made) console.log(`  ${m.id}  ${m.sliceWidth}x${m.sliceHeight}x${m.sliceCount}  frames=${m.frames}`);
