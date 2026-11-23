// v4: 王都全域（10ゾーン：貴族街・魔導学院・王城・広場・大通り・市場・工業運河・貧民街・川港・農村）の NPC 48人配置と標高追従ロジック。
import { yawFromVelocity } from './stack/math';
import { elevationAt } from './terrain';
import type { Entity } from './world';

export interface NpcSpec {
  assetId: string;
  waypoints: [number, number][];
  speed?: number;
  idleYaw?: number;
  waitSec?: number;
  phase?: number;
}

export interface NpcAgent {
  entity: Entity;
  waypoints: [number, number][];
  speed: number;
  waitTimer: number;
  waitDuration: number;
  currentWp: number;
  walkT: number;
  idleYaw: number;
  lookPhase: number;
}

const SOUTH = 0;
const WEST = Math.PI / 2;
const NORTH = Math.PI;
const EAST = -Math.PI / 2;

/** 王都の NPC 配置（64人：4城門衛兵・王立魔導師・冒険者パーティ[騎士/斥候]・荷役ゴーレム・商人・職人・農夫・シスター） */
export const OTO_NPC_SPECS: NpcSpec[] = [
  // 1) 4城門 & 王城橋 衛兵 (7人)
  { assetId: 'chr_guard_walk', waypoints: [[-16, 800]], idleYaw: SOUTH, phase: 0.1 },
  { assetId: 'chr_guard_walk', waypoints: [[16, 800]], idleYaw: SOUTH, phase: 1.7 },
  { assetId: 'chr_guard_walk', waypoints: [[-10, 152]], idleYaw: SOUTH, phase: 0.8 },
  { assetId: 'chr_guard_walk', waypoints: [[10, 102]], idleYaw: SOUTH, phase: 2.3 },
  { assetId: 'chr_guard_walk', waypoints: [[800, -12]], idleYaw: EAST, phase: 0.4 },
  { assetId: 'chr_guard_walk', waypoints: [[-800, 12]], idleYaw: WEST, phase: 1.9 },
  { assetId: 'chr_guard_walk', waypoints: [[-566, -566]], idleYaw: NORTH, phase: 1.1 },

  // 2) 店番・シスター・カフェ客・ギルド受付 (15人)
  { assetId: 'chr_merchant_a', waypoints: [[-71, 366]], idleYaw: EAST, phase: 0.5 },
  { assetId: 'chr_merchant_a', waypoints: [[-71, 392]], idleYaw: EAST, phase: 1.9 },
  { assetId: 'chr_townsfolk_b', waypoints: [[27, 336]], idleYaw: EAST, phase: 1.1 },
  { assetId: 'chr_adventurer_a', waypoints: [[27, 380]], idleYaw: EAST, phase: 0.4 },
  { assetId: 'chr_adventurer_a', waypoints: [[27, 390]], idleYaw: NORTH, phase: 2.8 },
  { assetId: 'chr_townsfolk_b', waypoints: [[-26, 400]], idleYaw: EAST, phase: 1.4 },
  { assetId: 'chr_townsfolk_a', waypoints: [[26, 404]], idleYaw: WEST, phase: 2.2 },
  { assetId: 'chr_adventurer_a', waypoints: [[24, 377]], idleYaw: SOUTH, phase: 0.7 },
  { assetId: 'chr_adventurer_a', waypoints: [[-96, 323]], idleYaw: NORTH, phase: 1.6 },
  { assetId: 'chr_adventurer_a', waypoints: [[-100, 274]], idleYaw: EAST, phase: 1.2 },
  { assetId: 'chr_adventurer_a', waypoints: [[-100, 294]], idleYaw: SOUTH, phase: 2.1 },
  { assetId: 'chr_sister_a', waypoints: [[-84, 174]], idleYaw: EAST, phase: 0.9 },
  { assetId: 'chr_sister_a', waypoints: [[396, 110]], idleYaw: WEST, phase: 2.5 },
  { assetId: 'chr_townsfolk_b', waypoints: [[445, 165]], idleYaw: NORTH, phase: 0.3 },
  { assetId: 'chr_merchant_a', waypoints: [[885, 65]], idleYaw: EAST, phase: 1.5 },

  // 3) 大通り（南大門〜大石段〜広場）巡回・散歩 (8人)
  { assetId: 'chr_guard_walk', waypoints: [[-8, 520], [-8, 308]], speed: 24, waitSec: 1.4, phase: 0.2 },
  { assetId: 'chr_guard_walk', waypoints: [[8, 308], [8, 514]], speed: 24, waitSec: 1.4, phase: 1.6 },
  { assetId: 'chr_townsfolk_a', waypoints: [[13, 502], [13, 320]], speed: 28, waitSec: 1.2, phase: 0.7 },
  { assetId: 'chr_townsfolk_b', waypoints: [[-13, 476], [-13, 316]], speed: 25, waitSec: 1.5, phase: 2.0 },
  { assetId: 'chr_adventurer_a', waypoints: [[-4, 524], [-4, 296], [-88, 296], [-4, 296]], speed: 34, waitSec: 1.0, phase: 1.3 },
  { assetId: 'chr_townsfolk_a', waypoints: [[4, 336], [4, 496]], speed: 27, waitSec: 1.1, phase: 2.7 },
  { assetId: 'chr_merchant_a', waypoints: [[-6, 444], [-64, 444], [-64, 362], [-6, 362]], speed: 23, waitSec: 1.5, phase: 0.9 },
  { assetId: 'chr_townsfolk_a', waypoints: [[-8, 760], [-8, 520]], speed: 28, waitSec: 1.0, phase: 0.6 },

  // 4) 城前広場（噴水周囲）(5人)
  { assetId: 'chr_townsfolk_b', waypoints: [[-30, 214], [30, 214], [30, 274], [-30, 274]], speed: 25, waitSec: 1.2, phase: 0.3 },
  { assetId: 'chr_townsfolk_a', waypoints: [[34, 270], [-34, 270], [-34, 210], [34, 210]], speed: 24, waitSec: 1.1, phase: 1.8 },
  { assetId: 'chr_merchant_a', waypoints: [[-50, 266], [50, 266]], speed: 22, waitSec: 1.8, phase: 0.9 },
  { assetId: 'chr_adventurer_a', waypoints: [[-44, 204], [44, 204], [0, 170], [-44, 204]], speed: 26, waitSec: 1.0, phase: 2.1 },
  { assetId: 'chr_sister_a', waypoints: [[-74, 218], [-74, 174], [-96, 174], [-74, 174]], speed: 22, waitSec: 1.6, phase: 0.4 },

  // 5) 貴族街・王立魔導学院区（高台 +16）(5人)
  { assetId: 'chr_sister_a', waypoints: [[-320, -185], [-320, -290], [-420, -290], [-320, -290]], speed: 24, waitSec: 1.6, phase: 0.2 },
  { assetId: 'chr_townsfolk_b', waypoints: [[-460, -290], [-250, -290]], speed: 23, waitSec: 1.5, phase: 1.4 },
  { assetId: 'chr_guard_walk', waypoints: [[-185, -135], [-185, -240]], speed: 22, waitSec: 1.8, phase: 0.8 },
  { assetId: 'chr_townsfolk_a', waypoints: [[-345, -195], [-290, -195]], speed: 20, waitSec: 2.0, phase: 2.3 },
  { assetId: 'chr_adventurer_a', waypoints: [[-470, -430], [-340, -340]], speed: 26, waitSec: 1.4, phase: 1.1 },

  // 6) 工業区・職人運河・貧民街・一本裏の通り (5人)
  { assetId: 'chr_adventurer_a', waypoints: [[120, 314], [120, 526]], speed: 30, waitSec: 1.0, phase: 0.5 },
  { assetId: 'chr_townsfolk_a', waypoints: [[116, 514], [116, 290], [82, 290], [116, 290]], speed: 26, waitSec: 1.3, phase: 2.4 },
  { assetId: 'chr_merchant_a', waypoints: [[385, 225], [385, 285]], speed: 21, waitSec: 1.6, phase: 0.7 },
  { assetId: 'chr_townsfolk_a', waypoints: [[430, 305], [510, 355]], speed: 22, waitSec: 1.5, phase: 1.8 },
  { assetId: 'chr_townsfolk_b', waypoints: [[275, 535], [345, 585]], speed: 19, waitSec: 2.0, phase: 1.2 },

  // 7) 川港・農村帯 (3人)
  { assetId: 'chr_merchant_a', waypoints: [[900, -45], [900, 95]], speed: 23, waitSec: 1.5, phase: 0.6 },
  { assetId: 'chr_townsfolk_a', waypoints: [[-915, 55], [-915, -55]], speed: 21, waitSec: 1.8, phase: 1.3 },
  { assetId: 'chr_townsfolk_b', waypoints: [[-920, 145], [-990, 145]], speed: 20, waitSec: 1.9, phase: 2.2 },

  // 8) 魔導師・重装騎士/弓兵冒険者パーティ・荷役ゴーレム (16人 → 計64人)
  { assetId: 'chr_mage_a', waypoints: [[-18, 224], [18, 224], [18, 264], [-18, 264]], speed: 22, waitSec: 1.4, phase: 0.2 },
  { assetId: 'chr_mage_a', waypoints: [[-335, -210], [-305, -210]], speed: 20, waitSec: 1.8, phase: 1.1 },
  { assetId: 'chr_mage_a', waypoints: [[-410, -290], [-315, -290]], speed: 22, waitSec: 1.5, phase: 2.0 },
  { assetId: 'chr_mage_a', waypoints: [[22, 788]], idleYaw: WEST, phase: 0.9 },
  { assetId: 'chr_mage_a', waypoints: [[-6, 330], [-6, 450]], speed: 23, waitSec: 1.2, phase: 1.6 },

  { assetId: 'chr_knight_a', waypoints: [[10, 740], [10, 560]], speed: 25, waitSec: 1.2, phase: 0.3 },
  { assetId: 'chr_ranger_a', waypoints: [[18, 732], [18, 552]], speed: 25, waitSec: 1.2, phase: 0.4 },
  { assetId: 'chr_knight_a', waypoints: [[-104, 262]], idleYaw: EAST, phase: 1.3 },
  { assetId: 'chr_ranger_a', waypoints: [[-146, 340], [-126, 340]], speed: 24, waitSec: 1.6, phase: 0.7 },
  { assetId: 'chr_knight_a', waypoints: [[28, 586]], idleYaw: EAST, phase: 2.1 },
  { assetId: 'chr_ranger_a', waypoints: [[-26, 514], [26, 514], [26, 550], [-26, 550]], speed: 26, waitSec: 1.0, phase: 1.8 },

  { assetId: 'chr_golem_a', waypoints: [[890, -70], [890, 70]], speed: 17, waitSec: 1.8, phase: 0.1 },
  { assetId: 'chr_golem_a', waypoints: [[430, 310], [540, 345]], speed: 16, waitSec: 2.0, phase: 1.0 },
  { assetId: 'chr_golem_a', waypoints: [[-8, 690], [-8, 505]], speed: 17, waitSec: 1.5, phase: 0.5 },
  { assetId: 'chr_golem_a', waypoints: [[-86, 355], [-86, 430]], speed: 16, waitSec: 1.8, phase: 2.4 },
  { assetId: 'chr_golem_a', waypoints: [[-465, -275], [-465, -215]], speed: 16, waitSec: 1.8, phase: 1.5 },
];

export function createNpcAgent(entity: Entity, spec: NpcSpec): NpcAgent {
  const wps = spec.waypoints;
  entity.baseZ = elevationAt(entity.x, entity.y);
  return {
    entity,
    waypoints: wps,
    speed: spec.speed ?? 24,
    waitTimer: 0,
    waitDuration: spec.waitSec ?? 1.2,
    currentWp: wps.length > 1 ? 1 : 0,
    walkT: spec.phase ?? 0,
    idleYaw: spec.idleYaw ?? SOUTH,
    lookPhase: spec.phase ?? 0,
  };
}

export function updateNpcs(npcs: NpcAgent[], dt: number) {
  for (const npc of npcs) {
    const frames = Math.max(1, npc.entity.asset.meta.frames);
    if (npc.waypoints.length <= 1) {
      npc.lookPhase += dt;
      const lookStep = Math.floor(npc.lookPhase / 3.5) % 4;
      const lookOffset = lookStep === 1 ? 0.32 : lookStep === 3 ? -0.32 : 0;
      npc.entity.yaw = npc.idleYaw + lookOffset;
      npc.entity.frame = frames > 1 ? 1 : 0;
      continue;
    }

    if (npc.waitTimer > 0) {
      npc.waitTimer = Math.max(0, npc.waitTimer - dt);
      npc.entity.frame = frames > 1 ? 1 : 0;
      continue;
    }

    const [tx, ty] = npc.waypoints[npc.currentWp];
    const dx = tx - npc.entity.x;
    const dy = ty - npc.entity.y;
    const dist = Math.hypot(dx, dy);
    const step = npc.speed * dt;

    if (dist <= step || dist < 0.5) {
      npc.entity.x = tx;
      npc.entity.y = ty;
      npc.entity.baseZ = elevationAt(tx, ty);
      npc.currentWp = (npc.currentWp + 1) % npc.waypoints.length;
      npc.waitTimer = npc.waitDuration;
      npc.entity.frame = frames > 1 ? 1 : 0;
    } else {
      const vx = dx / dist;
      const vy = dy / dist;
      npc.entity.x += vx * step;
      npc.entity.y += vy * step;
      npc.entity.baseZ = elevationAt(npc.entity.x, npc.entity.y);
      npc.entity.yaw = yawFromVelocity(vx, vy);
      npc.walkT += dt;
      npc.entity.frame = Math.floor(npc.walkT * 5) % frames;
    }
  }
}
