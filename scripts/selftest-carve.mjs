// 自己テスト: ダミーの家の体積から四面図を作り、carve-views で切り直してスライスに戻す。
// 「四面図 → スライス」パイプラインが動くことの確認用。出力は assets/views/_dummy と assets/stacks/_dummy
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { readPng } from './voxel.mjs';

const src = JSON.parse(fs.readFileSync('assets/stacks/_dummy/bld_tower_round_a.json', 'utf8'));
const png = readPng('assets/stacks/_dummy/bld_tower_round_a.png');
const { sliceWidth: W, sliceHeight: L, sliceCount: H } = src;
const vox = (x, y, z) => { const i = (y * png.width + z * W + x) * 4; return png.data[i + 3] ? [png.data[i], png.data[i + 1], png.data[i + 2]] : null; };
const save = (name, w, h, fn) => { const p = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); if (c) { const i = (y * w + x) * 4; p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255; } } fs.mkdirSync('assets/views/_dummy', { recursive: true }); fs.writeFileSync(`assets/views/_dummy/${name}.png`, PNG.sync.write(p)); };
// TOP: 真上から（正面=下）。最上段の色
save('tower_top', W, L, (x, y) => { for (let z = H - 1; z >= 0; z--) { const c = vox(x, y, z); if (c) return c; } return null; });
// SIDE: 左を向いた横から（列0=正面）。+x 側から見る
save('tower_side', L, H, (c, r) => { const y = L - 1 - c, z = H - 1 - r; for (let x = W - 1; x >= 0; x--) { const v = vox(x, y, z); if (v) return v; } return null; });
save('tower_front', W, H, (x, r) => { const z = H - 1 - r; for (let y = L - 1; y >= 0; y--) { const v = vox(x, y, z); if (v) return v; } return null; });
save('tower_back', W, H, (c, r) => { const x = W - 1 - c, z = H - 1 - r; for (let y = 0; y < L; y++) { const v = vox(x, y, z); if (v) return v; } return null; });
execFileSync('node', ['scripts/carve-views.mjs', '--top', 'assets/views/_dummy/tower_top.png', '--side', 'assets/views/_dummy/tower_side.png', '--front', 'assets/views/_dummy/tower_front.png', '--back', 'assets/views/_dummy/tower_back.png', '--id', 'bld_tower_carved_a', '--category', '_dummy', '--round', '--out', 'assets/stacks/_dummy/bld_tower_carved_a.png'], { stdio: 'inherit' });
const outMeta = JSON.parse(fs.readFileSync('assets/stacks/_dummy/bld_tower_carved_a.json', 'utf8'));
if (Math.abs(outMeta.sliceWidth - W) > 2 || Math.abs(outMeta.sliceHeight - L) > 2 || outMeta.sliceCount !== H) { console.error('寸法が一致しません', outMeta); process.exit(1); }
console.log('selftest-carve ok: 四面図 → スライスの往復で寸法一致（外周の空白ぶんの差は許容）');
