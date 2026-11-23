// 王都の箱庭 全都市レイアウト構築（平坦・シームレス歩行可能な中世魔導王都：大河水運・職人運河・偏西風ゾーニング・26住宅＋17産業魔導建築・4城門・64NPC）。
import layout from './data/oto-layout.json';
import type { StackAsset, StackMeta } from './stack/types';
import type { Entity, World } from './world';
import type { LandmarkRegion, ObbCollider, OtoCollisionMap } from './collision';
import { createNpcAgent, OTO_NPC_SPECS, type NpcAgent } from './npc';
import { collectAmbientEntities, updateAmbientEntities, updateManaTrams, type ManaTramAgent } from './ambient';
import {
  TERRAIN,
  degCW,
  distToPolyline,
  elevationAt,
  inBlockingWater,
  inTier2,
  isCliffBlocked,
} from './terrain';

export interface OtoEntitySpec {
  id: number;
  assetId: string;
  x: number;
  y: number;
  yaw: number;
  baseZ?: number;
  noShadow?: boolean;
  dynamic?: boolean;
}

export interface OtoLayoutResult {
  specs: OtoEntitySpec[];
  collision: OtoCollisionMap;
  wallStackCount: number;
  townStackCount: number;
  forestStackCount: number;
  spawn: { x: number; y: number; yaw: number };
}

export const TELEPORT_HUBS: { id: string; label: string; x: number; y: number }[] = [
  { id: 'south_gate_tp', label: '南大門 転移陣', x: 0, y: 775 },
  { id: 'plaza_tp', label: '城前広場 中枢転移陣', x: 0, y: 198 },
  { id: 'guild_tp', label: 'ギルド本部 転移陣', x: -90, y: 286 },
  { id: 'academy_tp', label: '王立魔導学院 転移陣', x: -320, y: -190 },
  { id: 'port_tp', label: '大河の川港 転移陣', x: 875, y: 0 },
];

/** シート正面 +y（南）を各ワールド方角へ向ける yaw */
export const YAW_SOUTH = 0;
export const YAW_WEST = Math.PI / 2;
export const YAW_NORTH = Math.PI;
export const YAW_EAST = -Math.PI / 2;

export function facingToYaw(facing?: string): number {
  switch (facing) {
    case 'west': return YAW_WEST;
    case 'north': return YAW_NORTH;
    case 'east': return YAW_EAST;
    case 'south':
    default: return YAW_SOUTH;
  }
}

function createRng(seed = 20261123) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function obbsOverlap(a: ObbCollider, b: ObbCollider, margin: number): boolean {
  const rough = a.hw + a.hd + b.hw + b.hd + margin;
  if (Math.abs(a.x - b.x) > rough || Math.abs(a.y - b.y) > rough) return false;
  const ca = Math.abs(Math.cos(a.yaw)), sa = Math.abs(Math.sin(a.yaw));
  const cb = Math.abs(Math.cos(b.yaw)), sb = Math.abs(Math.sin(b.yaw));
  const ahw = ca * a.hw + sa * a.hd;
  const ahd = sa * a.hw + ca * a.hd;
  const bhw = cb * b.hw + sb * b.hd;
  const bhd = sb * b.hw + cb * b.hd;
  return Math.abs(a.x - b.x) < ahw + bhw + margin && Math.abs(a.y - b.y) < ahd + bhd + margin;
}

function rectInRect(x: number, y: number, hw: number, hd: number, rx: number, ry: number, rw: number, rh: number, pad = 2): boolean {
  return x + hw + pad > rx && x - hw - pad < rx + rw && y + hd + pad > ry && y - hd - pad < ry + rh;
}

const RADIAL_ANGLES = [20, 150, 210, 270, 330];
function onRadialStreet(x: number, y: number, pad: number): boolean {
  const fromR = 190;
  const toR = TERRAIN.wallRadius - 10;
  const halfW = 7 + pad;
  for (const deg of RADIAL_ANGLES) {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const proj = x * ux + y * uy;
    const perp = Math.abs(-x * uy + y * ux);
    if (proj >= fromR - pad && proj <= toR + pad && perp <= halfW) return true;
  }
  return false;
}

function nearWaterway(x: number, y: number, pad: number): boolean {
  if (distToPolyline(x, y, TERRAIN.mainRiver.points) <= TERRAIN.mainRiver.halfW + 14 + pad) return true;
  if (distToPolyline(x, y, TERRAIN.artisanCanal.points) <= TERRAIN.artisanCanal.halfW + 8 + pad) return true;
  if (distToPolyline(x, y, TERRAIN.intakeCanal.points) <= TERRAIN.intakeCanal.halfW + 6 + pad) return true;
  return false;
}

function nearOuterGateRoad(x: number, y: number, pad: number): boolean {
  const r = Math.hypot(x, y);
  if (r < TERRAIN.wallRadius - 20) return false;
  for (const g of TERRAIN.gates) {
    const rad = (g.angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const proj = x * ux + y * uy;
    const perp = Math.abs(-x * uy + y * ux);
    if (proj >= TERRAIN.wallRadius - 24 && perp <= g.width * 0.5 + 10 + pad) return true;
  }
  return false;
}

/**
 * 王都の配置データと衝突・ランドマークマップを純粋に構築する（テストでも使用）。
 */
export function buildOtoLayoutData(
  metas: Record<string, Pick<StackMeta, 'footprint'>>,
  hasFountain: boolean,
): OtoLayoutResult {
  const rng = createRng(94821);
  const specs: OtoEntitySpec[] = [];
  const obbs: ObbCollider[] = [];
  const landmarks: LandmarkRegion[] = [];
  let nextId = 1;

  const fp = (id: string): [number, number] => metas[id]?.footprint ?? [16, 16];

  const place = (
    assetId: string,
    x: number,
    y: number,
    yaw = 0,
    opts?: {
      collide?: boolean;
      customBox?: [number, number];
      label?: string;
      dynamic?: boolean;
      extraZ?: number;
      absZ?: number;
      noShadow?: boolean;
    },
  ) => {
    const baseZ = opts?.absZ !== undefined ? opts.absZ : elevationAt(x, y) + (opts?.extraZ ?? 0);
    specs.push({ id: nextId++, assetId, x, y, yaw, dynamic: opts?.dynamic, baseZ, noShadow: opts?.noShadow });
    if (opts?.collide !== false) {
      const [w, h] = opts?.customBox ?? fp(assetId);
      obbs.push({ x, y, hw: w * 0.5, hd: h * 0.5, yaw, label: opts?.label });
    }
  };

  const addLandmark = (id: string, label: string, x: number, y: number, w: number, h: number, priority = 2, yaw = 0) => {
    landmarks.push({ id, label, x, y, hw: w * 0.5, hd: h * 0.5, yaw, priority });
  };

  // --- 1) 王城シタデル (+12 岩盤丘・面積に対してリアルな中核規模) ---
  place('bld_castle_keep', 0, -10, YAW_SOUTH, { label: '王城' });
  place('bld_castle_keep_top', 0, -10, YAW_SOUTH, { collide: false, extraZ: 52, noShadow: true });
  place('bld_castle_wing', -26, -8, YAW_EAST, { label: '王城' });
  place('bld_castle_wing', 26, -8, YAW_WEST, { label: '王城' });
  place('bld_castle_wing', 0, -35, YAW_NORTH, { label: '王城' });
  for (const [tx, ty] of [[-36, -34], [36, -34], [-36, 20], [36, 20]]) {
    place('bld_castle_tower', tx, ty, YAW_SOUTH, { label: '王城' });
    place('bld_castle_tower_top', tx, ty, YAW_SOUTH, { collide: false, extraZ: 50, noShadow: true });
  }
  place('bld_castle_gate', 0, 22, YAW_SOUTH, { label: '王城' });
  addLandmark('castle', '王城', 0, -4, 96, 92, 2);

  // --- 2) 城の橋（橋欄干） ---
  place('ter_bridge_rail', -16, 118, YAW_SOUTH, { collide: false, noShadow: true });
  place('ter_bridge_rail', -16, 144, YAW_SOUTH, { collide: false, noShadow: true });
  place('ter_bridge_rail', 16, 118, YAW_SOUTH, { collide: false, noShadow: true });
  place('ter_bridge_rail', 16, 144, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('castle_bridge', '城の橋', 0, 131, 30, 54, 1);

  // --- 3) 城前の大広場 ---
  addLandmark('plaza', '城前の大広場', 0, 244, 172, 112, 1);
  if (hasFountain && metas.prop_fountain_a) {
    place('prop_fountain_a', 0, 244, YAW_SOUTH, { label: '広場の噴水' });
  } else {
    place('prop_well_a', 0, 244, YAW_SOUTH, { label: '広場の泉' });
  }
  if (metas.prop_monument_a) {
    place('prop_monument_a', -54, 240, YAW_SOUTH, { label: '騎士の記念碑' });
    place('prop_monument_a', 54, 240, YAW_SOUTH, { label: '騎士の記念碑' });
  }
  for (const [lx, ly] of [[-76, 198], [76, 198], [-76, 290], [76, 290]]) {
    place('prop_arcane_lamp_a', lx, ly, YAW_SOUTH);
  }
  place('prop_flowerbed_a', -34, 198, YAW_SOUTH);
  place('prop_flowerbed_a', 34, 198, YAW_SOUTH);
  place('prop_bench_a', -54, 282, YAW_NORTH);
  place('prop_bench_a', 54, 282, YAW_NORTH);
  place('prop_banner_a', -22, 166, YAW_SOUTH);
  place('prop_banner_a', 22, 166, YAW_SOUTH);
  place('prop_banner_a', -28, 298, YAW_SOUTH);
  place('prop_banner_a', 28, 298, YAW_SOUTH);
  place('prop_hedge_a', -80, 240, YAW_WEST);
  place('prop_hedge_a', 80, 240, YAW_EAST);
  place('prop_cafe_table_a', -62, 268, YAW_SOUTH);
  place('prop_cafe_table_a', 70, 224, YAW_SOUTH);
  place('prop_boulevard_tree_a', -78, 222, YAW_SOUTH);
  place('prop_boulevard_tree_a', 78, 268, YAW_SOUTH);
  // 城前中枢転移陣＋広場四隅の浮遊中継マナ結晶
  place('prop_teleport_pad', 0, 198, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('plaza_tp', '城前広場 中枢転移陣', 0, 198, 26, 26, 2);
  for (const [fx, fy] of [[-70, 206], [70, 206], [-70, 282], [70, 282], [-28, 304], [28, 304]]) {
    place('prop_floating_crystal', fx, fy, YAW_SOUTH, { collide: false, extraZ: 14 });
  }

  // --- 4) 大聖堂 & 公認ギルド本部（討伐碑・訓練場・転移陣） & 中央市場 ---
  place('bld_cathedral_apse', -114, 146, YAW_NORTH, { label: '大聖堂' });
  place('bld_cathedral_nave', -114, 172, YAW_SOUTH, { label: '大聖堂' });
  place('bld_cathedral_spire', -114, 198, YAW_SOUTH, { label: '大聖堂' });
  place('bld_cathedral_spire_top', -114, 198, YAW_SOUTH, { collide: false, extraZ: 50, noShadow: true });
  addLandmark('cathedral', '大聖堂', -114, 172, 56, 86, 2);

  place('bld_guild_hq_main', -126, 286, YAW_EAST, { label: '王都公認ギルド本部' });
  place('bld_guild_hq_wing', -152, 286, YAW_EAST, { label: '王都公認ギルド本部' });
  place('prop_questboard_a', -106, 304, YAW_EAST);
  place('prop_teleport_pad', -90, 286, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('guild_tp', 'ギルド本部 転移陣', -90, 286, 26, 26, 2);
  place('prop_monster_trophy', -92, 246, YAW_SOUTH, { label: 'ワイバーン討伐記念碑' });
  place('prop_mana_crystal_cluster', -98, 224, YAW_SOUTH);
  place('prop_training_dummy', -154, 326, YAW_SOUTH);
  place('prop_training_dummy', -138, 326, YAW_SOUTH);
  addLandmark('guild_hq', '王都公認ギルド本部', -140, 286, 84, 64, 2);

  place('bld_market_hall', -116, 376, YAW_EAST, { label: '中央市場ホール' });
  place('bld_market_hall', -116, 418, YAW_EAST, { label: '中央市場ホール' });
  place('prop_stall_a', -82, 366, YAW_EAST);
  place('prop_stall_a', -82, 392, YAW_EAST);
  place('prop_crate_a', -82, 418, YAW_SOUTH);
  place('prop_barrel_a', -80, 434, YAW_SOUTH);
  place('prop_cart_a', -76, 344, YAW_SOUTH);
  place('prop_signpost_a', -80, 314, YAW_SOUTH);
  addLandmark('market_hall', '中央市場ホール', -108, 398, 66, 98, 2);

  // --- 5) メインストリート（北部商業段丘 +8 → 大石段スロープ → 南部低地 0） ---
  // 段丘上の東側（大通りの角店・大通りギルド支部・街のギルド支部・タレット商館）
  place('bld_shop_corner', 46, 336, YAW_WEST, { label: '大通りの角店' });
  place('prop_flowerbed_a', 27, 326, YAW_WEST);
  addLandmark('shop_corner', '大通りの角店', 46, 336, 42, 36, 3);

  place('bld_guild_branch', 45, 384, YAW_WEST, { label: '大通りのギルド支部' });
  place('prop_questboard_a', 27, 364, YAW_WEST);
  addLandmark('guild_branch', '大通りのギルド支部', 45, 384, 42, 38, 3);

  place('bld_guild_small_b', 86, 362, YAW_EAST, { label: '街のギルド支部' });
  place('prop_training_dummy', 86, 398, YAW_WEST);
  addLandmark('guild_small_1', '街のギルド支部', 86, 362, 32, 32, 2);

  place('bld_house_main_e', 46, 422, YAW_WEST, { label: '大通りの商館' });

  // 西側商店（北端）
  place('bld_house_main_b', -45, 336, YAW_EAST);
  place('bld_house_main_c', -46, 378, YAW_EAST);
  place('bld_house_main_f', -46, 420, YAW_EAST);

  // 南部メインストリート両側（冒険者酒場・魔導武具鍛冶・錬金工房＋ギルド支部群）
  const eastLowerShops: [string, number, string?][] = [
    ['bld_guild_small_a', 502, '街のギルド支部'],
    ['bld_guild_small_a', 544, '街のギルド支部'],
    ['bld_guild_tavern', 586, '冒険者酒場'],
    ['bld_house_main_d', 628],
    ['bld_house_main_b', 670],
    ['bld_house_main_e', 712],
    ['bld_house_main_c', 754],
  ];
  for (const [id, y, label] of eastLowerShops) {
    place(id, 45, y, YAW_WEST, label ? { label } : undefined);
  }
  addLandmark('guild_small_2', '街のギルド支部', 45, 502, 38, 34, 2);
  addLandmark('guild_small_3', '街のギルド支部', 45, 544, 38, 34, 2);
  addLandmark('guild_tavern', '冒険者酒場', 45, 586, 42, 38, 3);

  const westLowerShops: [string, number, string?][] = [
    ['bld_magic_forge', 502, '魔導武具・エンチャント鍛冶場'],
    ['bld_potion_shop', 544, '錬金・ポーション工房'],
    ['bld_house_main_c', 586],
    ['bld_house_main_b', 628],
    ['bld_house_main_f', 670],
    ['bld_house_main_c', 712],
    ['bld_house_main_d', 754],
  ];
  for (const [id, y, label] of westLowerShops) {
    place(id, -45, y, YAW_EAST, label ? { label } : undefined);
  }
  addLandmark('magic_forge', '魔導武具・エンチャント鍛冶場', -45, 502, 42, 36, 3);
  addLandmark('potion_shop', '錬金・ポーション工房', -45, 544, 42, 36, 3);
  place('prop_mana_crystal_cluster', -68, 502, YAW_SOUTH);

  // 大通りの街灯・並木・オープンカフェ・南大門転移陣
  for (const ly of [322, 370, 418]) {
    place('prop_arcane_lamp_a', -15, ly, YAW_SOUTH);
    place('prop_arcane_lamp_a', 15, ly, YAW_SOUTH);
  }
  for (const ly of [494, 540, 586, 634, 682, 728]) {
    place('prop_lamp_a', -15, ly, YAW_SOUTH);
    place('prop_lamp_a', 15, ly, YAW_SOUTH);
  }
  place('prop_arcane_lamp_a', -18, 774, YAW_SOUTH);
  place('prop_arcane_lamp_a', 18, 774, YAW_SOUTH);
  place('prop_teleport_pad', 0, 775, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('south_gate_tp', '南大門 転移陣', 0, 775, 26, 26, 2);
  for (const [bx, by] of [[-20, 358], [20, 358], [-20, 428], [20, 428], [-20, 520], [20, 520], [-20, 610], [20, 610], [-20, 700], [20, 700], [-20, 746], [20, 746]]) {
    place('prop_boulevard_tree_a', bx, by, YAW_SOUTH);
  }
  for (const [cx, cy] of [[-20, 400], [20, 404], [-20, 566], [20, 568], [-20, 654], [20, 656]]) {
    place('prop_cafe_table_a', cx, cy, YAW_SOUTH);
  }
  place('prop_bench_a', -23, 738, YAW_EAST);
  place('prop_bench_a', 23, 738, YAW_WEST);
  place('prop_mana_well_a', 34, 480, YAW_SOUTH, { label: '魔導浄水泉' });

  place('prop_signpost_a', 72, 294, YAW_SOUTH);
  place('prop_lamp_a', 106, 326, YAW_SOUTH);
  place('prop_lamp_a', 106, 402, YAW_SOUTH);
  place('prop_lamp_a', 106, 496, YAW_SOUTH);
  addLandmark('back_street', '一本裏の通り', 120, 420, 26, 240, 1);
  addLandmark('main_street', 'メインストリート', 0, 540, 52, 480, 1);

  // --- 6) 北西：貴族街・王立魔導学院・揚水塔・水道橋・浮遊飛空艇発着所 ---
  place('bld_arcane_academy', -320, -240, YAW_SOUTH, { label: '王立魔導学院' });
  place('prop_questboard_a', -296, -214, YAW_SOUTH);
  place('prop_mana_well_a', -348, -210, YAW_SOUTH, { label: '学院の星紋浄水泉' });
  place('prop_teleport_pad', -320, -190, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('academy_tp', '王立魔導学院 転移陣', -320, -190, 26, 26, 2);
  place('prop_floating_crystal', -355, -240, YAW_SOUTH, { collide: false, extraZ: 14 });
  place('prop_floating_crystal', -285, -240, YAW_SOUTH, { collide: false, extraZ: 14 });
  place('prop_sky_skiff', -465, -245, YAW_SOUTH, { collide: false, extraZ: 16, label: '魔導学院 飛空艇繋留船' });
  addLandmark('arcane_academy', '王立魔導学院', -320, -230, 78, 78, 3);

  place('bld_arcane_siphon', -495, -455, YAW_SOUTH, { label: '魔導揚水塔' });
  addLandmark('arcane_siphon', '魔導揚水塔', -495, -455, 44, 44, 3);

  // 揚水塔から王城水堀方面へ連なる魔導水道橋列（環状トラム軌道帯 r=438..492 は地中サイフォン化し軌道を妨げない）
  const aqAngle = Math.atan2(325, 365);
  for (let i = 0; i < 13; i++) {
    const t = 0.06 + i * 0.061;
    const ax = Math.round(-495 + 365 * t);
    const ay = Math.round(-455 + 325 * t);
    const ar = Math.hypot(ax, ay);
    if (inTier2(ax, ay) && (ar < 438 || ar > 492)) {
      place('bld_aqueduct_arch', ax, ay, aqAngle, { collide: false, noShadow: true });
    }
  }

  // 貴族邸宅群 (+16)
  place('bld_noble_manor_a', -435, -335, YAW_SOUTH, { label: '貴族の白石邸' });
  place('bld_noble_manor_b', -355, -355, YAW_SOUTH, { label: '伯爵邸' });
  place('bld_noble_villa_a', -255, -355, YAW_SOUTH, { label: '貴族中庭ヴィラ' });
  place('bld_noble_manor_a', -220, -240, YAW_WEST, { label: '貴族邸宅' });
  place('bld_noble_manor_b', -535, -295, YAW_EAST, { label: '大貴族邸' });
  place('bld_noble_villa_a', -420, -145, YAW_NORTH, { label: '貴族ヴィラ' });
  place('bld_noble_manor_a', -535, -185, YAW_SOUTH, { label: '貴族邸' });
  place('bld_noble_gatehouse', -435, -280, YAW_SOUTH, { collide: false });
  place('bld_noble_gatehouse', -320, -145, YAW_SOUTH, { collide: false });
  addLandmark('noble_quarter', '北西の貴族邸宅街', -420, -295, 220, 170, 2);

  for (const [lx, ly] of [[-465, -290], [-395, -290], [-275, -290], [-365, -220], [-275, -220], [-350, -170], [-290, -170], [-460, -400]]) {
    place('prop_arcane_lamp_a', lx, ly, YAW_SOUTH);
  }
  for (const [tx, ty] of [[-490, -340], [-390, -305], [-215, -300], [-365, -180], [-480, -210]]) {
    place('prop_boulevard_tree_a', tx, ty, YAW_SOUTH);
  }

  // --- 7) 東の教会・孤児院微高地 (+8) ---
  place('bld_church_hall', 420, 118, YAW_WEST, { label: '教会' });
  place('bld_church_belfry', 420, 94, YAW_SOUTH, { label: '教会' });
  place('prop_flowerbed_a', 394, 142, YAW_WEST);
  place('prop_arcane_lamp_a', 392, 118, YAW_SOUTH);
  addLandmark('church', '教会', 420, 110, 52, 66, 2);

  place('bld_orphanage', 468, 152, YAW_SOUTH, { label: '孤児院' });
  place('prop_hedge_a', 468, 176, YAW_SOUTH);
  addLandmark('orphanage', '孤児院', 468, 152, 42, 42, 2);

  // --- 8) 職人運河・工業区 (0: 水車・鍛冶・染色・鞣革・魔石精錬) ---
  place('bld_watermill', 296, 198, YAW_SOUTH, { label: '運河水車製粉所' });
  place('bld_watermill', 494, 332, YAW_SOUTH, { label: '運河水車製粉所' });
  place('bld_smithy', 345, 215, YAW_SOUTH, { label: '大鍛冶場' });
  place('bld_smithy', 442, 315, YAW_EAST, { label: '金属工房鍛冶' });
  place('bld_dyeworks', 332, 286, YAW_EAST, { label: '染色工房' });
  place('bld_dyeworks', 492, 392, YAW_WEST, { label: '染色工房' });
  place('bld_tannery', 402, 362, YAW_SOUTH, { label: '鞣革工房' });
  place('bld_mana_refinery', 558, 342, YAW_SOUTH, { label: '魔石精錬工房' });
  place('prop_mana_crystal_cluster', 576, 360, YAW_SOUTH);
  place('prop_crate_a', 368, 240, YAW_SOUTH);
  place('prop_barrel_a', 468, 336, YAW_SOUTH);
  place('prop_cart_a', 525, 355, YAW_WEST);
  // 運河橋欄干（環状マナ軌道 r=455..469 の内側 x=352 / 外側 x=436 へ寄せて軌道を妨げない）
  for (const ry of [246, 278]) {
    place('ter_river_bridge', 352, ry, YAW_WEST, { collide: false, noShadow: true });
    place('ter_river_bridge', 436, ry, YAW_WEST, { collide: false, noShadow: true });
  }
  for (const ry of [398, 442]) {
    place('ter_river_bridge', 616, ry, YAW_WEST, { collide: false, noShadow: true });
    place('ter_river_bridge', 674, ry, YAW_WEST, { collide: false, noShadow: true });
  }
  addLandmark('industry_district', '職人運河・工業区', 420, 295, 220, 170, 2);

  // --- 9) 4城門 & 円形城壁リング (radius=820) ---
  const WALL_R = TERRAIN.wallRadius; // 820
  // 9a) 南大門 (0, 820)
  place('bld_south_gate_arch_w', -14, WALL_R, YAW_SOUTH, { collide: false });
  place('bld_south_gate_arch_e', 14, WALL_R, YAW_SOUTH, { collide: false });
  obbs.push({ x: -26, y: WALL_R, hw: 3, hd: 10.5, yaw: 0, label: '南の城門' });
  obbs.push({ x: 26, y: WALL_R, hw: 3, hd: 10.5, yaw: 0, label: '南の城門' });
  place('bld_south_gate_tower', -42, WALL_R, YAW_SOUTH, { label: '南の城門' });
  place('bld_south_gate_tower_top', -42, WALL_R, YAW_SOUTH, { collide: false, extraZ: 52, noShadow: true });
  place('bld_south_gate_tower', 42, WALL_R, YAW_SOUTH, { label: '南の城門' });
  place('bld_south_gate_tower_top', 42, WALL_R, YAW_SOUTH, { collide: false, extraZ: 52, noShadow: true });
  place('prop_banner_a', -18, WALL_R - 18, YAW_SOUTH);
  place('prop_banner_a', 18, WALL_R - 18, YAW_SOUTH);
  place('prop_barrier_pylon', -30, WALL_R - 24, YAW_SOUTH, { label: '対魔獣結界発生パイロン' });
  place('prop_barrier_pylon', 30, WALL_R - 24, YAW_SOUTH, { label: '対魔獣結界発生パイロン' });
  place('prop_monster_trophy', 36, 784, YAW_WEST, { label: '討伐記念碑' });
  place('prop_signpost_a', -24, 758, YAW_SOUTH);
  addLandmark('south_gate', '南の城門（南大門）', 0, WALL_R, 86, 46, 2);

  // 9b) 西交易門 (-820, 0) & 東河港門 (+820, 0) & 北西丘陵門 (-580, -580) + 各門結界パイロン
  place('bld_side_gate_w', -WALL_R, -11, YAW_WEST, { collide: false });
  place('bld_side_gate_e', -WALL_R, 11, YAW_WEST, { collide: false });
  obbs.push({ x: -WALL_R, y: -21, hw: 8.5, hd: 2.5, yaw: 0, label: '西の交易門' });
  obbs.push({ x: -WALL_R, y: 21, hw: 8.5, hd: 2.5, yaw: 0, label: '西の交易門' });
  place('bld_wall_tower_a', -WALL_R, -34, YAW_SOUTH, { label: '西の交易門' });
  place('bld_wall_tower_a', -WALL_R, 34, YAW_SOUTH, { label: '西の交易門' });
  place('prop_barrier_pylon', -WALL_R + 24, -24, YAW_SOUTH);
  place('prop_barrier_pylon', -WALL_R + 24, 24, YAW_SOUTH);
  addLandmark('west_gate', '西の交易門', -WALL_R, 0, 50, 74, 2);

  place('bld_side_gate_w', WALL_R, 11, YAW_EAST, { collide: false });
  place('bld_side_gate_e', WALL_R, -11, YAW_EAST, { collide: false });
  obbs.push({ x: WALL_R, y: -21, hw: 8.5, hd: 2.5, yaw: 0, label: '東の河港門' });
  obbs.push({ x: WALL_R, y: 21, hw: 8.5, hd: 2.5, yaw: 0, label: '東の河港門' });
  place('bld_wall_tower_a', WALL_R, -34, YAW_SOUTH, { label: '東の河港門' });
  place('bld_wall_tower_a', WALL_R, 34, YAW_SOUTH, { label: '東の河港門' });
  place('prop_barrier_pylon', WALL_R - 24, -24, YAW_SOUTH);
  place('prop_barrier_pylon', WALL_R - 24, 24, YAW_SOUTH);
  addLandmark('east_gate', '東の河港門', WALL_R, 0, 50, 74, 2);

  const nwC = -Math.round(WALL_R * Math.SQRT1_2); // -580
  const nwYaw = (3 * Math.PI) / 4;
  place('bld_side_gate_w', nwC + 8, nwC - 8, nwYaw, { collide: false });
  place('bld_side_gate_e', nwC - 8, nwC + 8, nwYaw, { collide: false });
  place('bld_wall_tower_a', nwC + 24, nwC - 24, YAW_SOUTH, { label: '北西丘陵門' });
  place('bld_wall_tower_a', nwC - 24, nwC + 24, YAW_SOUTH, { label: '北西丘陵門' });
  place('prop_barrier_pylon', nwC + 32, nwC, YAW_SOUTH);
  place('prop_barrier_pylon', nwC, nwC + 32, YAW_SOUTH);
  addLandmark('northwest_gate', '北西丘陵門', nwC, nwC, 66, 66, 2);

  // 9c) 15°ごとの城壁隅塔＆カーテンウォール（4城門箇所を除いて接続）
  const gateAngles = new Set([0, 90, 180, 225]);
  const ringNodes: { deg: number; x: number; y: number; hasGate: boolean }[] = [];
  for (let i = 0; i < 24; i++) {
    const deg = i * 15;
    const rad = (deg * Math.PI) / 180;
    const hasGate = gateAngles.has(deg);
    ringNodes.push({ deg, x: Math.cos(rad) * WALL_R, y: Math.sin(rad) * WALL_R, hasGate });
    if (!hasGate) {
      place('bld_wall_tower_a', Math.round(Math.cos(rad) * WALL_R), Math.round(Math.sin(rad) * WALL_R), YAW_SOUTH);
    }
  }
  const addWallSpan = (ax: number, ay: number, bx: number, by: number, trimStart: number, trimEnd: number) => {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    let segYaw = Math.atan2(dy, dx);
    if (segYaw < 0) segYaw += Math.PI;
    if (segYaw >= Math.PI - 1e-4) segYaw -= Math.PI;
    const usable = len - trimStart - trimEnd;
    if (usable < 10) return;
    const count = Math.max(1, Math.round(usable / 24));
    const step = usable / count;
    for (let i = 0; i < count; i++) {
      const d = trimStart + (i + 0.5) * step;
      place('bld_wall_segment_a', Math.round(ax + ux * d), Math.round(ay + uy * d), segYaw, { collide: false });
    }
  };
  for (let i = 0; i < 24; i++) {
    const j = (i + 1) % 24;
    const a = ringNodes[i], b = ringNodes[j];
    let ax = a.x, ay = a.y, bx = b.x, by = b.y, ts = 13, te = 13;
    if (a.hasGate) {
      if (a.deg === 0) { ax = WALL_R; ay = 34; }
      else if (a.deg === 90) { ax = -42; ay = WALL_R; }
      else if (a.deg === 180) { ax = -WALL_R; ay = -34; }
      else if (a.deg === 225) { ax = nwC + 24; ay = nwC - 24; }
    }
    if (b.hasGate) {
      if (b.deg === 0) { bx = WALL_R; by = -34; }
      else if (b.deg === 90) { bx = 42; by = WALL_R; }
      else if (b.deg === 180) { bx = -WALL_R; by = 34; }
      else if (b.deg === 225) { bx = nwC - 24; by = nwC + 24; }
    }
    addWallSpan(ax, ay, bx, by, ts, te);
  }
  const wallStackCount = specs.length;

  // 9d) 環状マナ軌道トラム 4駅舎（自動街区充填の前に配置し衝突回避） & 外周結界補助パイロン
  place('bld_mana_station', 74, 488, YAW_NORTH, { label: '大通りマナ軌道駅' });
  place('bld_mana_station', -42, -490, YAW_SOUTH, { label: '北部マナ軌道駅' });
  place('bld_mana_station', -490, 42, YAW_EAST, { label: '西門マナ軌道駅' });
  place('bld_mana_station', 490, -42, YAW_WEST, { label: '東門マナ軌道駅' });
  addLandmark('mana_station_main', '大通りマナ軌道駅', 74, 488, 36, 28, 3);
  for (const deg of [45, 135, 315]) {
    const rad = (deg * Math.PI) / 180;
    place('prop_barrier_pylon', Math.round(Math.cos(rad) * 800), Math.round(Math.sin(rad) * 800), YAW_SOUTH);
  }

  // --- 10) 階級・建築史別 街区自動充填（貧民街・職人下町・中産市民街・内環状並木） ---
  const slumIds = ['bld_house_slum_a', 'bld_house_slum_b', 'bld_house_slum_c', 'bld_house_slum_d', 'bld_house_slum_e'];
  const downIds = ['bld_house_down_a', 'bld_house_down_b', 'bld_house_down_c', 'bld_house_down_d', 'bld_house_down_e'];
  const resIds = ['bld_house_res_a', 'bld_house_res_b', 'bld_house_res_c', 'bld_house_res_d', 'bld_house_res_e', 'bld_house_res_f'];

  const isForbiddenForTown = (x: number, y: number, hw: number, hd: number) => {
    const r = Math.hypot(x, y);
    const rr = Math.hypot(hw, hd);
    const maxR = Math.hypot(Math.abs(x) + hw, Math.abs(y) + hd);
    if (r - rr < 194) return true; // open_ring + moat + castle
    if (maxR > WALL_R - 34) return true; // 城壁内側余白
    if (r + rr > 444 && r - rr < 480) return true; // 内環状大通り
    if (Math.abs(y) < 22 + hd && Math.abs(x) > 150) return true; // 東西門横断路
    if (rectInRect(x, y, hw, hd, -92, 182, 184, 124, 8)) return true; // plaza
    if (rectInRect(x, y, hw, hd, -26, 302, 52, 520, 36)) return true; // main_street & shops
    if (rectInRect(x, y, hw, hd, -172, 260, 146, 200, 12)) return true; // market & guild HQ
    if (rectInRect(x, y, hw, hd, 108, 302, 24, 242, 6)) return true; // back_street
    if (rectInRect(x, y, hw, hd, 24, 520, 110, 26, 4)) return true; // back_street south link
    if (rectInRect(x, y, hw, hd, 355, 65, 160, 140, 6)) return true; // 教会・孤児院石畳
    if (nearWaterway(x, y, Math.max(hw, hd) + 6)) return true;
    if (onRadialStreet(x, y, Math.max(hw, hd) + 6)) return true;
    return false;
  };

  const tryPlaceTown = (assetId: string, x: number, y: number, yaw: number, minGap = 4, allowNoble = false) => {
    const [w, h] = fp(assetId);
    const rhw = Math.abs(Math.cos(yaw)) * (w * 0.5) + Math.abs(Math.sin(yaw)) * (h * 0.5);
    const rhd = Math.abs(Math.sin(yaw)) * (w * 0.5) + Math.abs(Math.cos(yaw)) * (h * 0.5);
    if (!allowNoble && inTier2(x, y)) return false;
    if (isForbiddenForTown(x, y, rhw, rhd)) return false;
    const cand: ObbCollider = { x, y, hw: w * 0.5, hd: h * 0.5, yaw };
    for (let i = 0; i < obbs.length; i++) {
      if (obbsOverlap(cand, obbs[i], minGap)) return false;
    }
    place(assetId, x, y, yaw);
    return true;
  };

  // 10a) 南東・最風下の貧民街 (slum_a..e: 密生・低い藁葺き/粗板小屋)
  addLandmark('slum_quarter', '南東の下町・貧民街', 300, 560, 180, 170, 2);
  for (let gy = 390; gy <= 770; gy += 25) {
    for (let gx = 120; gx <= 610; gx += 25) {
      const r = Math.hypot(gx, gy);
      const deg = degCW(gx, gy);
      if (r < 484 || r > 775 || deg < 47 || deg > 77) continue;
      const jx = gx + Math.round((rng() - 0.5) * 6);
      const jy = gy + Math.round((rng() - 0.5) * 6);
      const id = slumIds[Math.floor(rng() * slumIds.length)];
      const yaw = rng() < 0.5 ? 0 : Math.PI / 2;
      tryPlaceTown(id, jx, jy, yaw, 2);
    }
  }

  // 10b) 下町商業・職人長屋 (down_a..e: deg 46..80, r 225..444)
  for (let gy = 160; gy <= 440; gy += 29) {
    for (let gx = 80; gx <= 380; gx += 30) {
      const r = Math.hypot(gx, gy);
      const deg = degCW(gx, gy);
      if (r < 225 || r > 442 || deg < 46 || deg > 80) continue;
      const jx = gx + Math.round((rng() - 0.5) * 4);
      const jy = gy + Math.round((rng() - 0.5) * 4);
      const id = downIds[Math.floor(rng() * downIds.length)];
      const yaw = rng() < 0.5 ? 0 : Math.PI / 2;
      tryPlaceTown(id, jx, jy, yaw, 3);
    }
  }

  // 一本裏の通り東側の小商店・住宅
  for (let gy = 316; gy <= 528; gy += 36) {
    const id = downIds[Math.floor(rng() * downIds.length)];
    tryPlaceTown(id, 148, gy, YAW_WEST, 3);
  }

  // 10c) 中産市民住宅街（全周シャッフル：北・東微高地・西・南西に均等配置）
  const TOWN_CAP = 1120;
  const resCells: [number, number][] = [];
  for (let gy = -775; gy <= 775; gy += 38) {
    for (let gx = -775; gx <= 775; gx += 38) {
      const r = Math.hypot(gx, gy);
      if (r < 200 || r > 770) continue;
      const deg = degCW(gx, gy);
      if (inTier2(gx, gy)) continue; // 貴族高台には市民住宅を混ぜない
      if (r >= 220 && deg >= 16 && deg <= 79) continue; // 工業区・下町・貧民街は専用建物
      resCells.push([gx, gy]);
    }
  }
  for (let i = resCells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [resCells[i], resCells[j]] = [resCells[j], resCells[i]];
  }
  for (const [gx, gy] of resCells) {
    if (specs.length >= TOWN_CAP) break;
    const jx = gx + Math.round((rng() - 0.5) * 8);
    const jy = gy + Math.round((rng() - 0.5) * 8);
    const id = resIds[Math.floor(rng() * resIds.length)];
    const yaw = rng() < 0.5 ? 0 : Math.PI / 2;
    if (!tryPlaceTown(id, jx, jy, yaw, 5)) {
      if (rng() < 0.28) tryPlaceTown('prop_tree_town_a', jx, jy, YAW_SOUTH, 4);
    }
  }

  // 10d) 内環状大通り (r ≈ 462) 沿いの並木・街灯・貧民街/市民街の小道具
  for (let a = 0; a < 360; a += 18) {
    const rad = (a * Math.PI) / 180;
    const lx = Math.round(Math.cos(rad) * 448);
    const ly = Math.round(Math.sin(rad) * 448);
    if (Math.abs(lx) < 34 && ly > 0) continue;
    if (nearWaterway(lx, ly, 12)) continue;
    const isArcaneSide = ly < 320;
    tryPlaceTown(isArcaneSide ? 'prop_arcane_lamp_a' : 'prop_lamp_a', lx, ly, YAW_SOUTH, 2);
  }
  for (let i = 0; i < 160 && specs.length < 1180; i++) {
    const a = rng() * Math.PI * 2;
    const r = 204 + rng() * 555;
    const tx = Math.round(Math.cos(a) * r);
    const ty = Math.round(Math.sin(a) * r);
    if (inTier2(tx, ty)) continue;
    const deg = degCW(tx, ty);
    const isSlumZone = r > 475 && deg >= 48 && deg <= 76;
    const pid = isSlumZone
      ? (rng() < 0.5 ? 'prop_barrel_a' : 'prop_crate_a')
      : (rng() < 0.14 ? 'prop_well_a' : (rng() < 0.24 ? 'prop_mana_well_a' : (rng() < 0.45 ? 'prop_lamp_a' : 'prop_tree_town_a')));
    tryPlaceTown(pid, tx, ty, YAW_SOUTH, 4);
  }
  const townStackCount = specs.length;

  // --- 11) 城外世界：大河の川港・西部三圃制農業圏・南フォーブール・北防風薪炭林 ---
  // 11a) 大河の川港 (東門外 x=855..955, y=-220..220)
  place('bld_warehouse_dock', 866, -74, YAW_EAST, { label: '川港大型倉庫' });
  place('bld_warehouse_dock', 866, 78, YAW_EAST, { label: '川港大型倉庫' });
  place('prop_dock_boat_a', 944, -108, YAW_EAST, { noShadow: true });
  place('prop_dock_boat_a', 946, 48, YAW_EAST, { noShadow: true });
  place('prop_dock_boat_a', 942, 162, YAW_EAST, { noShadow: true });
  place('prop_sky_skiff', 952, -46, YAW_WEST, { collide: false, extraZ: 16, label: '川港 飛空艇荷役ドック' });
  place('prop_teleport_pad', 875, 0, YAW_SOUTH, { collide: false, noShadow: true });
  addLandmark('port_tp', '大河の川港 転移陣', 875, 0, 26, 26, 2);
  place('prop_mana_crystal_cluster', 854, -44, YAW_SOUTH);
  for (const [px, py] of [[900, -110], [906, -40], [900, 42], [908, 118], [896, 152]]) {
    place(px % 4 === 0 ? 'prop_crate_a' : 'prop_barrel_a', px, py, YAW_SOUTH);
  }
  place('prop_cart_a', 898, 26, YAW_SOUTH);
  place('prop_lamp_a', 918, -32, YAW_SOUTH);
  place('prop_lamp_a', 918, 32, YAW_SOUTH);
  // 東川港橋＆北西渓流橋の石欄干
  for (const bx of [936, 976, 1014]) {
    place('ter_river_bridge', bx, -24, YAW_SOUTH, { collide: false, noShadow: true });
    place('ter_river_bridge', bx, 24, YAW_SOUTH, { collide: false, noShadow: true });
  }
  place('ter_river_bridge', -782, -648, nwYaw, { collide: false, noShadow: true });
  place('ter_river_bridge', -782, -602, nwYaw, { collide: false, noShadow: true });
  addLandmark('river_port', '大河の川港', 900, 20, 120, 260, 2);

  // 11b) 西〜南西の農村帯（風車・農家・納屋・牧場柵・羊・ぶどう棚・干し草）
  place('bld_windmill', -980, 118, YAW_SOUTH, { label: '丘の石造風車' });
  place('bld_windmill', -896, 365, YAW_SOUTH, { label: '小麦製粉風車' });
  place('bld_farmhouse_a', -936, -72, YAW_SOUTH, { label: '農家の家' });
  place('bld_barn_a', -1012, -56, YAW_SOUTH, { label: '穀物納屋' });
  place('bld_farmhouse_a', -920, 178, YAW_EAST, { label: '農家' });
  place('bld_barn_a', -978, 224, YAW_SOUTH, { label: '納屋' });
  place('bld_farmhouse_a', -846, 448, YAW_EAST, { label: '農家' });
  place('bld_barn_a', -895, 505, YAW_SOUTH, { label: '納屋' });
  place('bld_farmhouse_a', -668, 692, YAW_SOUTH, { label: '南西の農家' });
  addLandmark('western_farms', '西部の風車と三圃制農地', -960, 140, 180, 200, 2);

  // 牧場区画（羊＋柵＋干し草）
  for (const fx of [-950, -915, -880]) {
    place('prop_fence_wood', fx, -190, YAW_SOUTH);
    place('prop_fence_wood', fx, -140, YAW_SOUTH);
  }
  for (const [sx, sy] of [[-942, -168], [-926, -158], [-908, -172], [-892, -156], [-935, -150]]) {
    place('prop_sheep_a', sx, sy, YAW_SOUTH);
  }
  place('prop_haystack_a', -992, 152, YAW_SOUTH);
  place('prop_haystack_a', -905, 405, YAW_SOUTH);

  // 北西丘陵ぶどう畑棚
  for (const [vx, vy] of [[-1050, -240], [-1050, -264], [-1050, -288], [-980, -320], [-980, -344], [-980, -368]]) {
    place('prop_vineyard_row', vx, vy, YAW_SOUTH);
  }

  // 南門外フォーブール（市場園芸・魔導薬草温室・馬車荷待ち）
  place('bld_arcane_greenhouse', -118, 910, YAW_SOUTH, { label: '魔導薬草温室' });
  place('bld_arcane_greenhouse', -178, 910, YAW_SOUTH, { label: '魔導薬草温室' });
  place('bld_farmhouse_a', 112, 895, YAW_WEST, { label: 'フォーブールの宿・農家' });
  place('prop_stall_a', -48, 868, YAW_EAST);
  place('prop_cart_a', 46, 875, YAW_WEST);
  place('prop_lamp_a', -26, 860, YAW_SOUTH);
  place('prop_lamp_a', 26, 860, YAW_SOUTH);

  // 11c) 北〜北東外周の薪炭・防風針葉樹林 (<= 300 本)
  const coniferIds = ['prop_conifer_a', 'prop_conifer_b', 'prop_conifer_c'];
  const FOREST_CAP = 260;
  let forestCount = 0;
  for (let gy = -1170; gy <= 1170; gy += 64) {
    for (let gx = -1170; gx <= 1170; gx += 64) {
      if (forestCount >= FOREST_CAP) break;
      const jx = gx + Math.round((rng() - 0.5) * 32);
      const jy = gy + Math.round((rng() - 0.5) * 32);
      const r = Math.hypot(jx, jy);
      const deg = degCW(jx, jy);
      if (r < WALL_R + 55 || r > TERRAIN.worldRadius - 30) continue;
      if (deg >= 102 && deg <= 240) continue; // 西〜南西の農地開墾地には森を生やさない
      if (nearWaterway(jx, jy, 18) || nearOuterGateRoad(jx, jy, 24)) continue;
      if (jx > 820 && Math.abs(jy) < 250) continue; // 川港クリア
      const id = coniferIds[Math.floor(rng() * coniferIds.length)];
      place(id, jx, jy, YAW_SOUTH);
      forestCount++;
    }
    if (forestCount >= FOREST_CAP) break;
  }

  // --- 12) プレイヤー（南大門を抜けた大通り中央 (0, 710)、北向き） ---
  const spawn = { x: layout.spawn.x, y: layout.spawn.y, yaw: YAW_NORTH };
  place('chr_hero_walk', spawn.x, spawn.y, spawn.yaw, { collide: false, dynamic: true });

  const collision: OtoCollisionMap = {
    obbs,
    landmarks,
    worldRadius: TERRAIN.worldRadius - 8,
    moatInnerR: TERRAIN.moatInnerR,
    moatOuterR: TERRAIN.moatOuterR,
    bridgeHalfW: 13,
    bridgeYMin: 102,
    bridgeYMax: 160,
    wallInnerR: WALL_R - 8,
    wallOuterR: WALL_R + 8,
    southGateHalfW: 22,
    southGateYMin: WALL_R - 20,
    gates: TERRAIN.gates.map((g) => ({
      angleDeg: g.angleDeg,
      halfW: g.id === 'south' ? 22 : g.width * 0.5 - 1,
      rMin: WALL_R - 22,
    })),
    inBlockingWater,
    isCliffBlocked,
  };

  return {
    specs,
    collision,
    wallStackCount,
    townStackCount,
    forestStackCount: forestCount,
    spawn,
  };
}

function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  return c;
}

/** ブラウザ用：読み込んだアセット群＋基底地面から王都ワールドと NPC を組み立てる */
export function buildOtoWorld(
  assets: Record<string, StackAsset>,
  groundImg: HTMLImageElement,
): {
  world: World;
  player: Entity;
  npcs: NpcAgent[];
  trams: ManaTramAgent[];
  collision: OtoCollisionMap;
  spawn: { x: number; y: number; yaw: number };
} {
  const metas: Record<string, Pick<StackMeta, 'footprint'>> = {};
  for (const [k, v] of Object.entries(assets)) metas[k] = v.meta;
  const data = buildOtoLayoutData(metas, Boolean(assets.prop_fountain_a));

  const ground = imgToCanvas(groundImg);

  let player!: Entity;
  let maxId = 0;
  const entities: Entity[] = data.specs.map((s) => {
    const asset = assets[s.assetId];
    if (!asset) throw new Error(`Missing stack asset: ${s.assetId}`);
    if (s.id > maxId) maxId = s.id;
    const e: Entity = {
      id: s.id,
      asset,
      x: s.x,
      y: s.y,
      yaw: s.yaw,
      frame: 0,
      baseZ: s.baseZ ?? 0,
      noShadow: s.noShadow,
      dynamic: Boolean(s.dynamic),
    };
    if (s.dynamic) player = e;
    return e;
  });

  // 王都全域の NPC 64人を追加
  const npcs: NpcAgent[] = [];
  for (const spec of OTO_NPC_SPECS) {
    const asset = assets[spec.assetId];
    if (!asset) continue;
    const [sx, sy] = spec.waypoints[0];
    const e: Entity = {
      id: ++maxId,
      asset,
      x: sx,
      y: sy,
      yaw: spec.idleYaw ?? YAW_SOUTH,
      frame: 1,
      baseZ: elevationAt(sx, sy),
      dynamic: true,
    };
    entities.push(e);
    npcs.push(createNpcAgent(e, spec));
  }

  // 環状マナ軌道トラム 4 編成を追加（内外複線 r=457 / 467）
  const trams: ManaTramAgent[] = [];
  const tramAsset = assets.chr_mana_tram;
  if (tramAsset) {
    const specsTram: [number, number, number][] = [
      [467, Math.PI / 2 - 0.04, 0.072],
      [467, Math.PI * 1.5 - 0.04, 0.072],
      [457, 0.18, -0.072],
      [457, Math.PI + 0.18, -0.072],
    ];
    for (const [radius, angle, angSpeed] of specsTram) {
      const e: Entity = {
        id: ++maxId,
        asset: tramAsset,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        yaw: 0,
        frame: 0,
        baseZ: 0,
        dynamic: true,
      };
      entities.push(e);
      trams.push({ entity: e, radius, angle, angSpeed });
    }
    updateManaTrams(trams, 0, 0);
  }

  // 初期状態でアニメフレームが均一にならないよう進める
  const ambient = collectAmbientEntities(entities);
  updateAmbientEntities(ambient, 0);

  return {
    world: { ground, entities },
    player,
    npcs,
    trams,
    collision: data.collision,
    spawn: data.spawn,
  };
}

/** 王都シーンで読み込むアセット一覧（v6 魔導都市・冒険者経済フルセット） */
export const OTO_ASSET_MANIFEST: { dir: string; id: string; optional?: boolean }[] = [
  { dir: 'buildings', id: 'bld_castle_keep' },
  { dir: 'buildings', id: 'bld_castle_keep_top' },
  { dir: 'buildings', id: 'bld_castle_tower' },
  { dir: 'buildings', id: 'bld_castle_tower_top' },
  { dir: 'buildings', id: 'bld_castle_wing' },
  { dir: 'buildings', id: 'bld_castle_gate' },
  { dir: 'buildings', id: 'bld_cathedral_nave' },
  { dir: 'buildings', id: 'bld_cathedral_spire' },
  { dir: 'buildings', id: 'bld_cathedral_spire_top' },
  { dir: 'buildings', id: 'bld_cathedral_apse' },
  { dir: 'buildings', id: 'bld_guild_hq_main' },
  { dir: 'buildings', id: 'bld_guild_hq_wing' },
  { dir: 'buildings', id: 'bld_market_hall' },
  { dir: 'buildings', id: 'bld_shop_corner' },
  { dir: 'buildings', id: 'bld_guild_branch' },
  { dir: 'buildings', id: 'bld_guild_small_a' },
  { dir: 'buildings', id: 'bld_guild_small_b' },
  { dir: 'buildings', id: 'bld_church_hall' },
  { dir: 'buildings', id: 'bld_church_belfry' },
  { dir: 'buildings', id: 'bld_orphanage' },
  { dir: 'buildings', id: 'bld_wall_segment_a' },
  { dir: 'buildings', id: 'bld_wall_tower_a' },
  { dir: 'buildings', id: 'bld_south_gate_tower' },
  { dir: 'buildings', id: 'bld_south_gate_tower_top' },
  { dir: 'buildings', id: 'bld_south_gate_arch_w' },
  { dir: 'buildings', id: 'bld_south_gate_arch_e' },
  { dir: 'buildings', id: 'bld_side_gate_w' },
  { dir: 'buildings', id: 'bld_side_gate_e' },
  // 貧民街 5種
  { dir: 'buildings', id: 'bld_house_slum_a' },
  { dir: 'buildings', id: 'bld_house_slum_b' },
  { dir: 'buildings', id: 'bld_house_slum_c' },
  { dir: 'buildings', id: 'bld_house_slum_d' },
  { dir: 'buildings', id: 'bld_house_slum_e' },
  // 下町 5種
  { dir: 'buildings', id: 'bld_house_down_a' },
  { dir: 'buildings', id: 'bld_house_down_b' },
  { dir: 'buildings', id: 'bld_house_down_c' },
  { dir: 'buildings', id: 'bld_house_down_d' },
  { dir: 'buildings', id: 'bld_house_down_e' },
  // 中産市民 6種
  { dir: 'buildings', id: 'bld_house_res_a' },
  { dir: 'buildings', id: 'bld_house_res_b' },
  { dir: 'buildings', id: 'bld_house_res_c' },
  { dir: 'buildings', id: 'bld_house_res_d' },
  { dir: 'buildings', id: 'bld_house_res_e' },
  { dir: 'buildings', id: 'bld_house_res_f' },
  // 大通り商館 6種
  { dir: 'buildings', id: 'bld_house_main_a' },
  { dir: 'buildings', id: 'bld_house_main_b' },
  { dir: 'buildings', id: 'bld_house_main_c' },
  { dir: 'buildings', id: 'bld_house_main_d' },
  { dir: 'buildings', id: 'bld_house_main_e' },
  { dir: 'buildings', id: 'bld_house_main_f' },
  // 貴族邸宅 4種
  { dir: 'buildings', id: 'bld_noble_manor_a' },
  { dir: 'buildings', id: 'bld_noble_manor_b' },
  { dir: 'buildings', id: 'bld_noble_villa_a' },
  { dir: 'buildings', id: 'bld_noble_gatehouse' },
  // 農業・工業・魔導インフラ・冒険者店舗・軌道駅舎 17種
  { dir: 'buildings', id: 'bld_windmill' },
  { dir: 'buildings', id: 'bld_farmhouse_a' },
  { dir: 'buildings', id: 'bld_barn_a' },
  { dir: 'buildings', id: 'bld_arcane_greenhouse' },
  { dir: 'buildings', id: 'bld_watermill' },
  { dir: 'buildings', id: 'bld_smithy' },
  { dir: 'buildings', id: 'bld_dyeworks' },
  { dir: 'buildings', id: 'bld_tannery' },
  { dir: 'buildings', id: 'bld_warehouse_dock' },
  { dir: 'buildings', id: 'bld_mana_refinery' },
  { dir: 'buildings', id: 'bld_arcane_academy' },
  { dir: 'buildings', id: 'bld_arcane_siphon' },
  { dir: 'buildings', id: 'bld_aqueduct_arch' },
  { dir: 'buildings', id: 'bld_potion_shop' },
  { dir: 'buildings', id: 'bld_magic_forge' },
  { dir: 'buildings', id: 'bld_guild_tavern' },
  { dir: 'buildings', id: 'bld_mana_station' },
  // 地形パーツ 2種
  { dir: 'terrain', id: 'ter_bridge_rail' },
  { dir: 'terrain', id: 'ter_river_bridge' },
  // 小物 32種
  { dir: 'props', id: 'prop_fountain_a', optional: true },
  { dir: 'props', id: 'prop_monument_a', optional: true },
  { dir: 'props', id: 'prop_conifer_a' },
  { dir: 'props', id: 'prop_conifer_b' },
  { dir: 'props', id: 'prop_conifer_c' },
  { dir: 'props', id: 'prop_tree_town_a' },
  { dir: 'props', id: 'prop_boulevard_tree_a' },
  { dir: 'props', id: 'prop_lamp_a' },
  { dir: 'props', id: 'prop_arcane_lamp_a' },
  { dir: 'props', id: 'prop_mana_well_a' },
  { dir: 'props', id: 'prop_barrel_a' },
  { dir: 'props', id: 'prop_crate_a' },
  { dir: 'props', id: 'prop_stall_a' },
  { dir: 'props', id: 'prop_well_a' },
  { dir: 'props', id: 'prop_banner_a' },
  { dir: 'props', id: 'prop_bench_a' },
  { dir: 'props', id: 'prop_flowerbed_a' },
  { dir: 'props', id: 'prop_signpost_a' },
  { dir: 'props', id: 'prop_cart_a' },
  { dir: 'props', id: 'prop_hedge_a' },
  { dir: 'props', id: 'prop_cafe_table_a' },
  { dir: 'props', id: 'prop_questboard_a' },
  { dir: 'props', id: 'prop_haystack_a' },
  { dir: 'props', id: 'prop_vineyard_row' },
  { dir: 'props', id: 'prop_fence_wood' },
  { dir: 'props', id: 'prop_sheep_a' },
  { dir: 'props', id: 'prop_dock_boat_a' },
  { dir: 'props', id: 'prop_monster_trophy' },
  { dir: 'props', id: 'prop_training_dummy' },
  { dir: 'props', id: 'prop_mana_crystal_cluster' },
  { dir: 'props', id: 'prop_floating_crystal' },
  { dir: 'props', id: 'prop_teleport_pad' },
  { dir: 'props', id: 'prop_barrier_pylon' },
  { dir: 'props', id: 'prop_sky_skiff' },
  // キャラクター＆魔導車両 12種
  { dir: 'characters', id: 'chr_hero_walk' },
  { dir: 'characters', id: 'chr_guard_walk' },
  { dir: 'characters', id: 'chr_townsfolk_a' },
  { dir: 'characters', id: 'chr_townsfolk_b' },
  { dir: 'characters', id: 'chr_merchant_a' },
  { dir: 'characters', id: 'chr_adventurer_a' },
  { dir: 'characters', id: 'chr_sister_a' },
  { dir: 'characters', id: 'chr_mage_a' },
  { dir: 'characters', id: 'chr_knight_a' },
  { dir: 'characters', id: 'chr_ranger_a' },
  { dir: 'characters', id: 'chr_golem_a' },
  { dir: 'characters', id: 'chr_mana_tram' },
];
