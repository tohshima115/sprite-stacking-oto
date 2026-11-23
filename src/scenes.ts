import type { StackAsset } from './stack/types';
import type { World, Entity } from './world';
import { makeGround } from './ground';

export type SceneName = 'single' | 'few' | 'stress';

let nextId = 1;
const ent = (asset: StackAsset, x: number, y: number, yaw = 0, dynamic = false): Entity =>
  ({ id: nextId++, asset, x, y, yaw, frame: 0, baseZ: 0, dynamic });

/**
 * 参照実装のシーン。町全体は作らない（それは本番実装の仕事）。
 *  single: 1オブジェクト（家）と向き確認用の矢印。自動回転
 *  few:    数個のスタック + 歩けるキャラ + 城壁モジュールの小リング
 *  stress: 同じ素材を n 個グリッドに並べる性能計測用
 */
export function buildScene(name: SceneName, A: Record<string, StackAsset>, n: number): { world: World; player: Entity | null; autoSpin: boolean } {
  nextId = 1;
  if (name === 'single') {
    const main = A.__custom ?? A.bld_house_gable_a;
    return { world: { ground: makeGround(128), entities: [ent(main, 0, 0), ent(A.prop_arrow_a, 0, Math.ceil(main.meta.sliceHeight / 2) + 12)] }, player: null, autoSpin: true };
  }
  if (name === 'few') {
    const es: Entity[] = [];
    es.push(ent(A.bld_tower_round_a, 0, -40));
    es.push(ent(A.bld_tower_carved_a, 70, -60)); // 四面図カービングで作り直した塔（パイプライン確認用）
    es.push(ent(A.bld_house_gable_a, -50, 10, 0));
    es.push(ent(A.bld_house_gable_a, 50, 10, Math.PI / 2));
    es.push(ent(A.bld_house_gable_a, 50, 50, Math.PI));
    for (let i = 0; i < 6; i++) es.push(ent(A.prop_tree_round_a, -90 + i * 36, 90));
    for (let i = 0; i < 5; i++) es.push(ent(A.prop_crate_a, -20 + i * 13, 30, (i * Math.PI) / 8));
    // 半径 120 の城壁リング：モジュールを接線方向に回して並べる
    const R = 120, seg = Math.ceil((2 * Math.PI * R) / 15);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.12) continue; // 南に門の切れ目
      es.push(ent(A.bld_wall_segment_a, Math.cos(a) * R, Math.sin(a) * R, a + Math.PI / 2));
    }
    const player = ent(A.chr_hero_walk, 0, 60, 0, true);
    es.push(player);
    const ground = makeGround(320, (g, h) => {
      g.fillStyle = '#c9c2b0'; g.fillRect(h - 8, h - 20, 16, 200); // 南へ延びる道
      g.fillStyle = '#257179';
      g.beginPath(); g.arc(h, h - 40, 26, 0, Math.PI * 2); g.lineTo(h + 16, h - 40); g.arc(h, h - 40, 16, 0, Math.PI * 2, true); g.fill(); // 堀
    });
    return { world: { ground, entities: es }, player, autoSpin: false };
  }
  // stress
  const kinds = [A.bld_house_gable_a, A.bld_tower_round_a, A.prop_tree_round_a, A.bld_wall_segment_a, A.prop_crate_a];
  const es: Entity[] = [];
  const side = Math.ceil(Math.sqrt(n));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const gx = i % side, gy = Math.floor(i / side);
    const k = kinds[Math.floor(rnd() * kinds.length)];
    es.push(ent(k, (gx - side / 2) * 28, (gy - side / 2) * 28, Math.floor(rnd() * 4) * (Math.PI / 2)));
  }
  return { world: { ground: makeGround(Math.max(256, side * 28 + 64)), entities: es }, player: null, autoSpin: true };
}
