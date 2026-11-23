// 王都の環境＆魔導アニメーション：流水・水堀・魔導インフラ（環状マナ軌道トラム・結界・儀式陣・転移陣・浮遊結晶・飛空艇）・風揺らぎ管理。
import { TERRAIN, onAnyBridge } from './terrain';
import { type Camera, cameraLattice, yawFromVelocity } from './stack/math';
import type { Entity } from './world';

const ANIMATED_IDS = new Set([
  'prop_conifer_a',
  'prop_conifer_b',
  'prop_conifer_c',
  'prop_tree_town_a',
  'prop_boulevard_tree_a',
  'prop_banner_a',
  'prop_mana_well_a',
  'prop_dock_boat_a',
  'prop_mana_crystal_cluster',
  'prop_floating_crystal',
  'prop_teleport_pad',
  'prop_barrier_pylon',
  'prop_sky_skiff',
  'bld_windmill',
  'bld_watermill',
  'bld_aqueduct_arch',
  'bld_arcane_siphon',
  'bld_mana_refinery',
  'bld_smithy',
  'bld_potion_shop',
  'bld_magic_forge',
  'bld_mana_station',
]);

export interface ManaTramAgent {
  entity: Entity;
  radius: number;
  angle: number;
  angSpeed: number; // rad/s (+ で時計回り方向へ周回)
}

export function updateManaTrams(trams: ManaTramAgent[], dt: number, timeSec: number): void {
  for (let i = 0; i < trams.length; i++) {
    const t = trams[i];
    t.angle += t.angSpeed * dt;
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    t.entity.x = c * t.radius;
    t.entity.y = s * t.radius;
    const dir = t.angSpeed >= 0 ? 1 : -1;
    t.entity.yaw = yawFromVelocity(-s * dir, c * dir);
    t.entity.frame = Math.floor(timeSec * 6 + i) & 3;
  }
}

interface FlowSeg {
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  len: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function buildSegments(pts: readonly (readonly number[])[], pad: number): FlowSeg[] {
  const out: FlowSeg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1];
    const bx = pts[i + 1][0], by = pts[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const tx = dx / len, ty = dy / len;
    out.push({
      ax, ay, tx, ty, nx: -ty, ny: tx, len,
      minX: Math.min(ax, bx) - pad,
      minY: Math.min(ay, by) - pad,
      maxX: Math.max(ax, bx) + pad,
      maxY: Math.max(ay, by) + pad,
    });
  }
  return out;
}

const MAIN_RIVER_SEGS = buildSegments(TERRAIN.mainRiver.points, TERRAIN.mainRiver.halfW + 10);
const ARTISAN_CANAL_SEGS = buildSegments(TERRAIN.artisanCanal.points, TERRAIN.artisanCanal.halfW + 8);
const INTAKE_CANAL_SEGS = buildSegments(TERRAIN.intakeCanal.points, TERRAIN.intakeCanal.halfW + 6);

const MAIN_LANES = [-24, -12, 0, 12, 24];
const CANAL_LANES = [-4, 4];
const FOUNTAIN_SPOUT_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3);
const PORT_BOAT_CENTERS: readonly [number, number][] = [[944, -108], [946, 48], [942, 162]];

export function collectAmbientEntities(entities: Entity[]): Entity[] {
  return entities.filter((e) => e.asset.meta.frames > 1 && ANIMATED_IDS.has(e.asset.meta.id));
}

export function updateAmbientEntities(entities: Entity[], timeSec: number): void {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const id = e.asset.meta.id;
    switch (id) {
      case 'prop_conifer_a':
      case 'prop_conifer_b':
      case 'prop_conifer_c':
      case 'prop_tree_town_a':
      case 'prop_boulevard_tree_a': {
        const phase = timeSec * 2.2 - (e.x * 0.008 + e.y * 0.006);
        e.frame = ((Math.floor(phase) % 4) + 4) % 4;
        break;
      }
      case 'prop_banner_a':
        e.frame = Math.floor(timeSec * 4.8 + e.id * 0.7) & 3;
        break;
      case 'prop_mana_well_a':
      case 'prop_mana_crystal_cluster':
      case 'prop_teleport_pad':
      case 'bld_potion_shop':
        e.frame = Math.floor(timeSec * 4.0 + e.id) & 3;
        break;
      case 'prop_floating_crystal':
        e.frame = Math.floor(timeSec * 4.5 + e.id) & 3;
        e.baseZ = 14 + Math.round(Math.sin(timeSec * 2.4 + e.id) * 1.5);
        break;
      case 'prop_sky_skiff':
        e.frame = Math.floor(timeSec * 3.8 + e.id) & 3;
        e.baseZ = 16 + Math.round(Math.sin(timeSec * 1.6 + e.id) * 1.5);
        break;
      case 'prop_barrier_pylon':
      case 'bld_magic_forge':
      case 'bld_mana_station':
        e.frame = Math.floor(timeSec * 5.2 + e.id * 0.9) & 3;
        break;
      case 'prop_dock_boat_a':
        e.frame = Math.floor(timeSec * 2.2 + e.id * 1.1) & 3;
        break;
      case 'bld_windmill':
        e.frame = Math.floor(timeSec * 4.5 + e.id) & 3;
        break;
      case 'bld_watermill':
        e.frame = Math.floor(timeSec * 6.0 + e.id) & 3;
        break;
      case 'bld_aqueduct_arch':
        e.frame = ((Math.floor(timeSec * 5.0 - e.id * 0.45) % 4) + 4) % 4;
        break;
      case 'bld_arcane_siphon':
      case 'bld_mana_refinery':
        e.frame = Math.floor(timeSec * 3.5 + e.id) & 3;
        break;
      case 'bld_smithy':
        e.frame = Math.floor(timeSec * 6.5 + e.id) & 3;
        break;
    }
  }
}

type Lattice = ReturnType<typeof cameraLattice>;

/** 川の流水・王城水堀・職人運河・環状マナ軌道誘導脈動・広場儀式陣・結界薄膜のライブオーバーレイ */
export function renderWaterOverlay(
  g: CanvasRenderingContext2D,
  bufW: number,
  bufH: number,
  cam: Camera,
  lat: Lattice,
  timeSec: number,
): void {
  const sc = cam.scale ?? 1;
  const halfW = Math.floor(bufW / 2);
  const halfH = Math.floor(bufH / 2);
  const viewSpan = (Math.max(bufW, bufH / cam.squash) / sc) * 0.72 + 48;
  const vx0 = cam.x - viewSpan, vx1 = cam.x + viewSpan;
  const vy0 = cam.y - viewSpan, vy1 = cam.y + viewSpan;

  const plot = (wx: number, wy: number, sizeX: number, sizeY: number, col: string) => {
    const rx = (wx * sc) * lat.c - (wy * sc) * lat.s;
    const ry = (wx * sc) * lat.s + (wy * sc) * lat.c;
    const sx = halfW + Math.round(rx) - lat.intCamX;
    const sy = halfH + Math.round(ry * cam.squash) - lat.intCamY;
    if (sx < -4 || sx > bufW + 4 || sy < -4 || sy > bufH + 4) return;
    g.fillStyle = col;
    g.fillRect(sx, sy, sizeX, sizeY);
  };

  // 1) 大河
  for (let si = 0; si < MAIN_RIVER_SEGS.length; si++) {
    const s = MAIN_RIVER_SEGS[si];
    if (s.maxX < vx0 || s.minX > vx1 || s.maxY < vy0 || s.minY > vy1) continue;
    for (let li = 0; li < MAIN_LANES.length; li++) {
      const off = MAIN_LANES[li];
      const norm = off / 32;
      const speed = 17 + (1 - norm * norm) * 14;
      const spacing = 26;
      const phase = ((timeSec * speed + li * 7.3) % spacing + spacing) % spacing;
      for (let d = phase; d < s.len; d += spacing) {
        const wx = s.ax + s.tx * d + s.nx * off;
        const wy = s.ay + s.ty * d + s.ny * off;
        if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1 || onAnyBridge(wx, wy)) continue;
        plot(wx - s.tx * 2.5, wy - s.ty * 2.5, 1, 1, '#41a6f6');
        plot(wx, wy, 2, 1, ((Math.floor(d / spacing) + li) & 3) === 0 ? '#f4f4f4' : '#73eff7');
        plot(wx + s.tx * 2.5, wy + s.ty * 2.5, 1, 1, '#41a6f6');
      }
    }
  }

  // 2) 職人運河
  for (let si = 0; si < ARTISAN_CANAL_SEGS.length; si++) {
    const s = ARTISAN_CANAL_SEGS[si];
    if (s.maxX < vx0 || s.minX > vx1 || s.maxY < vy0 || s.minY > vy1) continue;
    for (let li = 0; li < CANAL_LANES.length; li++) {
      const off = CANAL_LANES[li];
      const spacing = 18;
      const phase = ((timeSec * 25 + li * 6.5) % spacing + spacing) % spacing;
      for (let d = phase; d < s.len; d += spacing) {
        const wx = s.ax + s.tx * d + s.nx * off;
        const wy = s.ay + s.ty * d + s.ny * off;
        if (Math.hypot(wx, wy) < TERRAIN.moatOuterR + 4) continue;
        if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1 || onAnyBridge(wx, wy)) continue;
        plot(wx, wy, 1, 1, (li === 0 && (Math.floor(d / spacing) & 1) === 0) ? '#f4f4f4' : '#73eff7');
      }
    }
  }

  // 3) 北西取水路
  for (let si = 0; si < INTAKE_CANAL_SEGS.length; si++) {
    const s = INTAKE_CANAL_SEGS[si];
    if (s.maxX < vx0 || s.minX > vx1 || s.maxY < vy0 || s.minY > vy1) continue;
    const spacing = 14;
    const phase = (timeSec * 28) % spacing;
    for (let d = phase; d < s.len; d += spacing) {
      const wx = s.ax + s.tx * d;
      const wy = s.ay + s.ty * d;
      if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1 || onAnyBridge(wx, wy)) continue;
      plot(wx, wy, 1, 1, ((Math.floor(d / spacing) & 1) === 0) ? '#f4f4f4' : '#73eff7');
    }
  }

  const camDist = Math.hypot(cam.x, cam.y);

  // 4) 王城水堀
  if (camDist <= viewSpan + TERRAIN.moatOuterR + 10) {
    const rings = [119, 131, 143];
    for (let ri = 0; ri < rings.length; ri++) {
      const rad = rings[ri];
      const count = 24 + ri * 6;
      const angSpeed = 0.08 + ri * 0.015;
      for (let k = 0; k < count; k++) {
        const a = (k * Math.PI * 2) / count + timeSec * angSpeed;
        const wx = Math.cos(a) * rad;
        const wy = Math.sin(a) * rad;
        if (Math.abs(wx) <= 18 && wy >= 104 && wy <= 158) continue;
        if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1) continue;
        plot(wx, wy, 1, 1, (k % 5 === 0) ? '#f4f4f4' : (k % 2 === 0 ? '#73eff7' : '#41a6f6'));
      }
    }
  }

  // 5) 東川港船の曳波
  if (vx1 >= 920 && vx0 <= 975 && vy1 >= -135 && vy0 <= 185) {
    for (let bi = 0; bi < PORT_BOAT_CENTERS.length; bi++) {
      const [bx, by] = PORT_BOAT_CENTERS[bi];
      const waveT = (timeSec * 1.4 + bi * 0.37) % 1;
      for (let k = 0; k < 4; k++) {
        const wy = by - 10 + k * 6 + waveT * 4;
        plot(bx - 6 + (k & 1) * 12, wy, 1, 1, waveT < 0.5 ? '#f4f4f4' : '#73eff7');
      }
    }
  }

  // 6) メインストリート & 東西横断道路のレイライン魔導導管パルス
  if (vx0 <= 6 && vx1 >= -6 && vy1 >= 302 && vy0 <= 832) {
    const startY = Math.max(304, Math.floor(vy0 / 26) * 26);
    const endY = Math.min(826, vy1);
    const shift = (timeSec * 40) % 26;
    for (let y = endY - shift; y >= startY; y -= 26) {
      plot(0, y, 1, 2, ((Math.floor(y / 26) & 1) === 0) ? '#f4f4f4' : '#73eff7');
    }
  }
  if (vy0 <= 6 && vy1 >= -6) {
    const step = 30;
    const shift = (timeSec * 38) % step;
    for (let x = Math.max(-815, Math.floor(vx0 / step) * step) + shift; x <= Math.min(815, vx1); x += step) {
      if (Math.abs(x) < 162) continue;
      plot(x, 0, 2, 1, '#73eff7');
    }
  }

  // 7) 城前広場・大魔導儀式陣の回転ルーン輝点 (0, 244)
  if (vx0 <= 60 && vx1 >= -60 && vy0 <= 290 && vy1 >= 195) {
    for (let k = 0; k < 8; k++) {
      const a1 = (k * Math.PI) / 4 + timeSec * 0.35;
      plot(Math.cos(a1) * 35, 244 + Math.sin(a1) * 35, 1, 1, (k & 1) === 0 ? '#ffcd75' : '#73eff7');
      const a2 = (k * Math.PI) / 4 - timeSec * 0.55;
      plot(Math.cos(a2) * 21, 244 + Math.sin(a2) * 21, 1, 1, '#73eff7');
    }
  }

  // 8) 内環状マナ軌道 (r=462) の誘導エネルギーパルス
  if (camDist + viewSpan >= 445 && camDist - viewSpan <= 480) {
    const count = 48;
    const stepRad = (Math.PI * 2) / count;
    const shift = (timeSec * 0.085) % stepRad;
    for (let k = 0; k < count; k++) {
      const a = k * stepRad + shift;
      const wx = Math.cos(a) * 462;
      const wy = Math.sin(a) * 462;
      if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1) continue;
      plot(wx, wy, 1, 1, (k & 3) === 0 ? '#f4f4f4' : '#73eff7');
    }
  }

  // 9) 城壁外周・対魔獣結界の淡いシアン波動（城壁近傍に居る時だけ描画）
  if (camDist + viewSpan >= TERRAIN.wallRadius - 20 && camDist - viewSpan <= TERRAIN.wallRadius + 24) {
    const count = 64;
    const stepRad = (Math.PI * 2) / count;
    const shift = (timeSec * 0.04) % stepRad;
    for (let k = 0; k < count; k++) {
      const a = k * stepRad - shift;
      const wx = Math.cos(a) * (TERRAIN.wallRadius + 3);
      const wy = Math.sin(a) * (TERRAIN.wallRadius + 3);
      if (wx < vx0 || wx > vx1 || wy < vy0 || wy > vy1) continue;
      plot(wx, wy, 1, 1, (k & 1) === 0 ? '#73eff7' : '#41a6f6');
    }
  }
}

/** 噴水・魔導施設・飛空艇・マナ軌道トラム・転移陣・鍛冶場の立体エフェクトを描画する */
export function renderEntityFx(
  g: CanvasRenderingContext2D,
  e: Entity,
  cam: Camera,
  bufW: number,
  bufH: number,
  lat: Lattice,
  timeSec: number,
): void {
  const id = e.asset.meta.id;
  if (
    id !== 'prop_fountain_a' &&
    id !== 'prop_mana_well_a' &&
    id !== 'prop_teleport_pad' &&
    id !== 'prop_floating_crystal' &&
    id !== 'prop_barrier_pylon' &&
    id !== 'prop_sky_skiff' &&
    id !== 'chr_mana_tram' &&
    id !== 'bld_watermill' &&
    id !== 'bld_smithy' &&
    id !== 'bld_potion_shop' &&
    id !== 'bld_magic_forge' &&
    id !== 'bld_arcane_siphon'
  ) {
    return;
  }

  const sc = cam.scale ?? 1;
  const halfW = Math.floor(bufW / 2);
  const halfH = Math.floor(bufH / 2);
  const liftScale = sc * cam.spacing * cam.thickness;

  const projectLocal = (lx: number, ly: number, z: number, useAbsZ = false) => {
    const cy = Math.cos(e.yaw), syYaw = Math.sin(e.yaw);
    const wx = e.x + lx * cy - ly * syYaw;
    const wy = e.y + lx * syYaw + ly * cy;
    const rx = (wx * sc) * lat.c - (wy * sc) * lat.s;
    const ry = (wx * sc) * lat.s + (wy * sc) * lat.c;
    const totalZ = useAbsZ ? z : e.baseZ + z;
    return {
      sx: halfW + Math.round(rx) - lat.intCamX,
      sy: halfH + Math.round(ry * cam.squash) - lat.intCamY - Math.round(totalZ * liftScale),
      ry,
    };
  };

  if (id === 'prop_fountain_a') {
    const center = projectLocal(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const u = (timeSec * 2.2 + i * 0.25) % 1;
      const pz = 24 + Math.sin(u * Math.PI) * 10;
      const p = projectLocal((i & 1) * 0.6 - 0.3, ((i >> 1) & 1) * 0.6 - 0.3, pz);
      g.fillStyle = u < 0.6 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 2);
    }
    for (let aIdx = 0; aIdx < FOUNTAIN_SPOUT_ANGLES.length; aIdx++) {
      const ang = FOUNTAIN_SPOUT_ANGLES[aIdx];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let d = 0; d < 4; d++) {
        const u = (timeSec * 1.9 + d * 0.25 + aIdx * 0.11) % 1;
        const rad = 2.8 + u * 6.8;
        const pz = 23 + 4.2 * u - 19.5 * u * u;
        const p = projectLocal(ca * rad, sa * rad, pz);
        if (pz < 22.5 && p.ry < center.ry - 2.2 * sc && Math.abs(p.sx - center.sx) <= 3 * sc) continue;
        g.fillStyle = u < 0.32 ? '#f4f4f4' : (u < 0.72 ? '#73eff7' : '#41a6f6');
        g.fillRect(p.sx, p.sy, 1, 1);
      }
      const splashPhase = (timeSec * 3.8 + aIdx * 0.37) % 1;
      const sp = projectLocal(ca * (9.0 + splashPhase * 1.4), sa * (9.0 + splashPhase * 1.4), 7.8);
      if (sp.ry >= center.ry - 3 * sc || Math.abs(sp.sx - center.sx) > 3 * sc) {
        g.fillStyle = splashPhase < 0.5 ? '#f4f4f4' : '#73eff7';
        g.fillRect(sp.sx, sp.sy, 1, 1);
      }
    }
    return;
  }

  if (id === 'prop_teleport_pad') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + timeSec * 1.3;
      const p = projectLocal(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 4);
      g.fillStyle = (i & 1) === 0 ? '#ffcd75' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    for (let i = 0; i < 4; i++) {
      const u = (timeSec * 1.15 + i * 0.25) % 1;
      const a = i * 1.57 + timeSec * 2.0;
      const p = projectLocal(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 4 + u * 22);
      g.fillStyle = u < 0.45 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 2);
    }
    return;
  }

  if (id === 'prop_floating_crystal') {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + timeSec * 2.4 + e.id;
      const p = projectLocal(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 11 + Math.sin(a * 2) * 3);
      g.fillStyle = (i & 1) === 0 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'prop_barrier_pylon') {
    const pulse = (timeSec * 1.5 + e.id * 0.23) % 1;
    const top = projectLocal(0, 0, 42 + pulse * 6);
    g.fillStyle = pulse < 0.5 ? '#f4f4f4' : '#73eff7';
    g.fillRect(top.sx, top.sy, 1, 2);
    const wing = projectLocal(Math.cos(timeSec * 3 + e.id) * 4, Math.sin(timeSec * 3 + e.id) * 4, 34);
    g.fillStyle = '#73eff7';
    g.fillRect(wing.sx, wing.sy, 1, 1);
    return;
  }

  if (id === 'prop_sky_skiff') {
    for (let i = 0; i < 4; i++) {
      const u = (timeSec * 1.8 + i * 0.25) % 1;
      const lx = (i & 1) === 0 ? -6.5 : 6.5;
      const ly = i < 2 ? -2 : 2;
      const p = projectLocal(lx, ly, Math.max(1, e.baseZ - 1 - u * 13), true);
      g.fillStyle = u < 0.4 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'chr_mana_tram') {
    for (let i = 0; i < 3; i++) {
      const u = (timeSec * 2.8 + i * 0.33) % 1;
      const p = projectLocal((i - 1) * 2.5, -13 - u * 5, 2 + (i & 1));
      g.fillStyle = u < 0.4 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'bld_potion_shop') {
    for (let i = 0; i < 3; i++) {
      const u = (timeSec * 0.75 + i * 0.33) % 1;
      const p = projectLocal(-7.5 + Math.sin(u * 5 + i) * 1.2, -7.5, 43 + u * 14);
      g.fillStyle = i === 0 ? '#a7f070' : (i === 1 ? '#73eff7' : '#b13e53');
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'bld_magic_forge') {
    for (let i = 0; i < 3; i++) {
      const u = (timeSec * 1.7 + i * 0.33) % 1;
      const p = projectLocal(Math.sin(u * 6 + i) * 2.0, 9.5, 7 + u * 8);
      g.fillStyle = (i & 1) === 0 ? '#73eff7' : '#ffcd75';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'prop_mana_well_a') {
    for (let i = 0; i < 4; i++) {
      const u = (timeSec * 0.95 + i * 0.25 + e.id * 0.13) % 1;
      const ang = i * 1.57 + timeSec * 1.4;
      const p = projectLocal(Math.cos(ang) * 2.6, Math.sin(ang) * 2.6, 12 + u * 12);
      g.fillStyle = u < 0.5 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'bld_watermill') {
    for (let i = 0; i < 6; i++) {
      const u = (timeSec * 2.4 + i * 0.17 + e.id * 0.2) % 1;
      const p = projectLocal(10.5 + (i % 3), -4 + u * 11, 2 + Math.sin(u * Math.PI) * 5.5);
      g.fillStyle = (i & 1) === 0 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'bld_smithy') {
    for (let i = 0; i < 5; i++) {
      const u = (timeSec * 0.55 + i * 0.2 + e.id * 0.17) % 1;
      const drift = u * 9.5;
      const p = projectLocal(-6 + drift, -5 + drift * 0.45 + Math.sin(u * 6.2 + i) * 1.2, 35.5 + u * 20);
      g.fillStyle = u < 0.45 ? '#94b0c2' : '#566c86';
      g.fillRect(p.sx, p.sy, u > 0.2 ? 2 : 1, u > 0.2 ? 2 : 1);
    }
    for (let i = 0; i < 2; i++) {
      const u = (timeSec * 1.6 + i * 0.5) % 1;
      const p = projectLocal(-4 + Math.sin(u * 5 + i) * 1.5, 8.2, 7 + u * 7);
      g.fillStyle = u < 0.5 ? '#ffcd75' : '#ef7d57';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
    return;
  }

  if (id === 'bld_arcane_siphon') {
    for (let i = 0; i < 4; i++) {
      const u = (timeSec * 1.1 + i * 0.25) % 1;
      const ang = timeSec * 1.8 + i * 1.57;
      const p = projectLocal(Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 35 + u * 16);
      g.fillStyle = (i & 1) === 0 ? '#f4f4f4' : '#73eff7';
      g.fillRect(p.sx, p.sy, 1, 1);
    }
  }
}
