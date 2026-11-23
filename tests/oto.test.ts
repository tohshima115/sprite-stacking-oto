import { describe, it, expect } from 'vitest';
import { buildOtoLayoutData, OTO_ASSET_MANIFEST, TELEPORT_HUBS, YAW_NORTH, YAW_SOUTH, YAW_EAST, YAW_WEST } from '../src/oto';
import { resolvePlayerMovement, findNearbyLandmark } from '../src/collision';
import { cameraLattice, worldToLatticeScreen, yawFromVelocity, type Camera } from '../src/stack/math';
import { createNpcAgent, OTO_NPC_SPECS, updateNpcs } from '../src/npc';
import { elevationAt, isCliffBlocked } from '../src/terrain';
import { collectAmbientEntities, updateAmbientEntities, updateManaTrams, type ManaTramAgent } from '../src/ambient';
import type { StackAsset, StackMeta } from '../src/stack/types';
import type { Entity } from '../src/world';

const allJsonModules = import.meta.glob('../assets/stacks/*/*.json', { eager: true, import: 'default' }) as Record<string, StackMeta>;

function loadAllProductionMetas(): Record<string, StackMeta> {
  const metas: Record<string, StackMeta> = {};
  for (const item of OTO_ASSET_MANIFEST) {
    const key = `../assets/stacks/${item.dir}/${item.id}.json`;
    metas[item.id] = allJsonModules[key];
  }
  return metas;
}

describe('v5 王都レイアウト・建築史アセット・平坦移動・環境アニメ仕様', () => {
  const metas = loadAllProductionMetas();
  const layout = buildOtoLayoutData(metas, Boolean(metas.prop_fountain_a));

  it('全本番スタック(119種+)が density=2 かつ接地面 footprint <= 32x32・スライス <= 64x64x128', () => {
    expect(Object.keys(metas).length).toBeGreaterThanOrEqual(119);
    for (const [id, m] of Object.entries(metas)) {
      expect(m.density, `${id} density`).toBe(2);
      expect(m.footprint[0], `${id} footprint[0]`).toBeLessThanOrEqual(32);
      expect(m.footprint[1], `${id} footprint[1]`).toBeLessThanOrEqual(32);
      expect(m.sliceWidth, `${id} sliceWidth`).toBeLessThanOrEqual(64);
      expect(m.sliceHeight, `${id} sliceHeight`).toBeLessThanOrEqual(64);
      expect(m.sliceCount, `${id} sliceCount`).toBeGreaterThanOrEqual(2);
      expect(m.sliceCount, `${id} sliceCount`).toBeLessThanOrEqual(128);
    }
  });

  it('4方位の yaw が進行方向ベクトルと一致し、初期出現は南大門内側で北向き', () => {
    expect(YAW_SOUTH).toBeCloseTo(yawFromVelocity(0, 1));
    expect(YAW_NORTH).toBeCloseTo(Math.PI);
    expect(Math.sin(YAW_WEST)).toBeCloseTo(1);
    expect(Math.sin(YAW_EAST)).toBeCloseTo(-1);
    expect(layout.spawn.x).toBe(0);
    expect(layout.spawn.y).toBe(710);
    expect(layout.spawn.yaw).toBeCloseTo(YAW_NORTH);
  });

  it('城内スタック数 (>=800) と防風薪炭林 (<=300) が v4 大都市規模要件を満たす', () => {
    expect(layout.townStackCount).toBeGreaterThanOrEqual(800);
    expect(layout.forestStackCount).toBeGreaterThanOrEqual(150);
    expect(layout.forestStackCount).toBeLessThanOrEqual(300);
  });

  it('土地が平坦(z=0)で階段や段差による通行不能箇所が存在しない', () => {
    expect(elevationAt(0, 710)).toBe(0);
    expect(elevationAt(0, 244)).toBe(0);
    expect(elevationAt(0, 0)).toBe(0);
    expect(elevationAt(-390, -290)).toBe(0);
    expect(isCliffBlocked(80, 456, 80, 450)).toBe(false);
    expect(isCliffBlocked(-185, -70, -185, -120)).toBe(false);
    const stairOrWall = layout.specs.filter((s) => s.assetId === 'ter_stair_wide' || s.assetId === 'ter_retaining_wall');
    expect(stairOrWall.length).toBe(0);
  });

  it('樹木・垂れ幕・水車・風車・水道橋・魔導設備・トラムが4フレームアニメを持ち進行する', () => {
    const animIds = [
      'prop_conifer_a', 'prop_conifer_b', 'prop_conifer_c', 'prop_tree_town_a', 'prop_boulevard_tree_a',
      'prop_banner_a', 'prop_mana_well_a', 'prop_dock_boat_a',
      'prop_mana_crystal_cluster', 'prop_floating_crystal', 'prop_teleport_pad', 'prop_barrier_pylon', 'prop_sky_skiff',
      'bld_windmill', 'bld_watermill', 'bld_aqueduct_arch', 'bld_smithy', 'bld_arcane_siphon', 'bld_mana_refinery',
      'bld_potion_shop', 'bld_magic_forge', 'bld_mana_station',
    ];
    const entities: Entity[] = animIds.map((id, idx) => {
      expect(metas[id]?.frames, `${id} frames`).toBe(4);
      return {
        id: idx + 1,
        asset: { meta: metas[id], image: null as unknown as CanvasImageSource },
        x: idx * 40,
        y: idx * 25,
        yaw: 0,
        frame: 0,
        baseZ: 0,
        dynamic: false,
      };
    });
    const ambient = collectAmbientEntities(entities);
    expect(ambient.length).toBe(animIds.length);
    const seenFrames = animIds.map(() => new Set<number>());
    for (let t = 0; t < 3; t += 0.15) {
      updateAmbientEntities(ambient, t);
      ambient.forEach((e, i) => seenFrames[i].add(e.frame));
    }
    for (let i = 0; i < animIds.length; i++) {
      expect(seenFrames[i].size, `${animIds[i]} animated frames`).toBeGreaterThanOrEqual(4);
    }
    // 環状マナ軌道トラムが軌道上を滑らかに周回し接線yawを更新する
    expect(metas.chr_mana_tram?.frames).toBe(4);
    const tramEntity: Entity = {
      id: 999,
      asset: { meta: metas.chr_mana_tram, image: null as unknown as CanvasImageSource },
      x: 467,
      y: 0,
      yaw: 0,
      frame: 0,
      baseZ: 0,
      dynamic: true,
    };
    const trams: ManaTramAgent[] = [{ entity: tramEntity, radius: 467, angle: 0, angSpeed: 0.072 }];
    updateManaTrams(trams, 1.0, 1.0);
    expect(Math.hypot(tramEntity.x, tramEntity.y)).toBeCloseTo(467, 4);
    expect(tramEntity.y).toBeGreaterThan(20);
  });

  it('公衆魔導転移陣 5 拠点と冒険者酒場・錬金工房・エンチャント鍛冶場が配置されている', () => {
    expect(TELEPORT_HUBS.length).toBe(5);
    for (const h of TELEPORT_HUBS) {
      const [rx, ry] = resolvePlayerMovement(h.x, h.y, 4, layout.collision);
      expect(Math.hypot(rx - h.x, ry - h.y), `teleport hub ${h.id} walkable`).toBeLessThan(2);
    }
    expect(findNearbyLandmark(45, 586, layout.collision.landmarks, 36)?.label).toBe('冒険者酒場');
    expect(findNearbyLandmark(-45, 502, layout.collision.landmarks, 36)?.label).toBe('魔導武具・エンチャント鍛冶場');
    expect(findNearbyLandmark(-45, 544, layout.collision.landmarks, 36)?.label).toBe('錬金・ポーション工房');
  });
});

describe('王都 v4 衝突判定・探索（4城門・河川・段丘崖・ランドマーク）', () => {
  const metas = loadAllProductionMetas();
  const { collision, spawn } = buildOtoLayoutData(metas, Boolean(metas.prop_fountain_a));

  const walkAlong = (start: [number, number], waypoints: [number, number][], maxSteps = 220) => {
    let [x, y] = start;
    for (const [tx, ty] of waypoints) {
      for (let step = 0; step < maxSteps; step++) {
        const dx = tx - x, dy = ty - y;
        const d = Math.hypot(dx, dy);
        if (d < 0.5) break;
        const move = Math.min(2.5, d);
        const px = x, py = y;
        [x, y] = resolvePlayerMovement(px + (dx / d) * move, py + (dy / d) * move, 4, collision, px, py);
      }
      expect(Math.hypot(x - tx, y - ty), `target=(${tx},${ty}) reached=(${x.toFixed(1)},${y.toFixed(1)})`).toBeLessThan(4);
    }
    return [x, y];
  };

  it('B1: 南大門(0,710)→大石段スロープ(0,462)→広場→城の橋→王城正門前(0,62)まで踏破できる', () => {
    walkAlong([spawn.x, spawn.y], [
      [0, 560],
      [0, 462],
      [0, 320],
      [28, 270],
      [28, 210],
      [0, 175],
      [0, 130],
      [0, 62],
    ]);
  });

  it('B5: 4城門（南・東・西・北西）から外へ通過でき、城壁の別地点からは抜けられない', () => {
    // 南大門
    const [, sy] = walkAlong([0, 785], [[0, 860]]);
    expect(sy).toBeGreaterThan(850);
    // 東河港門
    const [ex] = walkAlong([785, 0], [[860, 0]]);
    expect(ex).toBeGreaterThan(850);
    // 西交易門
    const [wxGate] = walkAlong([-785, 0], [[-860, 0]]);
    expect(wxGate).toBeLessThan(-850);
    // 北西丘陵門
    const [nx, ny] = walkAlong([-548, -548], [[-608, -608]]);
    expect(Math.hypot(nx, ny)).toBeGreaterThan(850);

    // 北側の城壁 (x=0, y=-802) からは外に出られない
    let bx = 0, by = -802;
    for (let i = 0; i < 15; i++) {
      const px = bx, py = by;
      [bx, by] = resolvePlayerMovement(bx, by - 3, 4, collision, px, py);
    }
    expect(by).toBeGreaterThanOrEqual(-814);
  });

  it('水堀・大河（橋以外はブロック、川港橋は通行可）と段丘崖ブロック', () => {
    // 水堀外周は通過不可
    let mx = 74, my = 148;
    for (let i = 0; i < 20; i++) {
      const r = Math.hypot(mx, my);
      const px = mx, py = my;
      [mx, my] = resolvePlayerMovement(mx - (mx / r) * 2, my - (my / r) * 2, 4, collision, px, py);
    }
    expect(Math.hypot(mx, my)).toBeGreaterThanOrEqual(157.5);

    // 東川港橋 (y=0, x=915..1028) は渡れる
    const [rxBridge] = walkAlong([905, 0], [[1035, 0]]);
    expect(rxBridge).toBeGreaterThan(1025);

    // 橋以外の川 (y=120, x=920 -> 965) は入水ブロックされる
    let wx = 920, wy = 120;
    for (let i = 0; i < 25; i++) {
      const px = wx, py = wy;
      [wx, wy] = resolvePlayerMovement(wx + 2, wy, 4, collision, px, py);
    }
    expect(wx).toBeLessThan(938);

    // 旧段差境界 ((80,456)->(80,450), (-185,-70)->(-185,-120)) を段差ストレスなく歩行できる
    walkAlong([80, 456], [[80, 444]]);
    walkAlong([-185, -70], [[-185, -120]]);
  });

  it('M4: 各地区の主要ランドマーク付近で正しい名前が取得できる', () => {
    expect(findNearbyLandmark(28, 336, collision.landmarks, 36)?.label).toBe('大通りの角店');
    expect(findNearbyLandmark(28, 384, collision.landmarks, 36)?.label).toBe('大通りのギルド支部');
    expect(findNearbyLandmark(-74, 172, collision.landmarks, 36)?.label).toBe('大聖堂');
    expect(findNearbyLandmark(0, 62, collision.landmarks, 36)?.label).toBe('王城');
    expect(findNearbyLandmark(-320, -195, collision.landmarks, 36)?.label).toBe('王立魔導学院');
    expect(findNearbyLandmark(390, 260, collision.landmarks, 36)?.label).toBe('職人運河・工業区');
  });

  it('地震防止: 連続歩行中も静的建物間の画面相対座標ズレが 0px かつ主人公が画面中央に固定される（1x/2x両対応）', () => {
    for (const mode of [{ scale: 1, zoom: 4, bufW: 360, bufH: 202 }, { scale: 2, zoom: 2, bufW: 720, bufH: 405 }]) {
      for (const yawDeg of [0, 37, 90]) {
        const cam: Camera = {
          x: 0,
          y: 710,
          z: 0,
          yaw: (yawDeg * Math.PI) / 180,
          squash: 0.65,
          spacing: 1,
          thickness: 1,
          zoom: mode.zoom,
          scale: mode.scale,
        };
        const { bufW, bufH } = mode;
        const lat0 = cameraLattice(cam);
        const a0 = worldToLatticeScreen(cam, 46, 336, bufW, bufH, lat0);
        const b0 = worldToLatticeScreen(cam, -46, 378, bufW, bufH, lat0);
        const baseDx = a0.sx - b0.sx;
        const baseDy = a0.sy - b0.sy;

        for (let step = 1; step <= 60; step++) {
          cam.x += 0.37;
          cam.y -= 0.73;
          const lat = cameraLattice(cam);
          const p = worldToLatticeScreen(cam, cam.x, cam.y, bufW, bufH, lat);
          expect(p.sx).toBe(Math.floor(bufW / 2));
          expect(p.sy).toBe(Math.floor(bufH / 2));
          const a = worldToLatticeScreen(cam, 46, 336, bufW, bufH, lat);
          const b = worldToLatticeScreen(cam, -46, 378, bufW, bufH, lat);
          expect(a.sx - b.sx).toBe(baseDx);
          expect(a.sy - b.sy).toBe(baseDy);
        }
      }
    }
  });

  it('NPC: 64人配置され（魔導師・騎士・弓兵・ゴーレム含む）、巡回 NPC が歩行してフレーム・向きを更新できる', () => {
    expect(OTO_NPC_SPECS.length).toBeGreaterThanOrEqual(64);
    const npcAssetSet = new Set(OTO_NPC_SPECS.map((s) => s.assetId));
    expect(npcAssetSet.has('chr_mage_a')).toBe(true);
    expect(npcAssetSet.has('chr_knight_a')).toBe(true);
    expect(npcAssetSet.has('chr_ranger_a')).toBe(true);
    expect(npcAssetSet.has('chr_golem_a')).toBe(true);
    const dummyAsset: StackAsset = {
      meta: metas.chr_hero_walk,
      image: null as unknown as CanvasImageSource,
    };
    const agents = OTO_NPC_SPECS.map((s, idx) => {
      const e: Entity = {
        id: idx + 1,
        asset: dummyAsset,
        x: s.waypoints[0][0],
        y: s.waypoints[0][1],
        yaw: s.idleYaw ?? 0,
        frame: 1,
        baseZ: 0,
        dynamic: true,
      };
      return createNpcAgent(e, s);
    });
    const patrolIdx = OTO_NPC_SPECS.findIndex((s) => s.waypoints.length > 1);
    const startX = agents[patrolIdx].entity.x;
    const startY = agents[patrolIdx].entity.y;
    for (let i = 0; i < 20; i++) updateNpcs(agents, 0.05);
    const moved = Math.hypot(agents[patrolIdx].entity.x - startX, agents[patrolIdx].entity.y - startY);
    expect(moved).toBeGreaterThan(5);
  });
});
