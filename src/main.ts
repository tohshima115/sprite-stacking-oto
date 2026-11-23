import { Input } from './input';
import { loadStack, loadGroundImage } from './stack/loader';
import type { StackAsset } from './stack/types';
import { CompositeCache, stats } from './stack/render';
import { type Camera, screenUpInWorld, screenRightInWorld, yawFromVelocity, params } from './stack/math';
import { renderWorld, type World, type Entity } from './world';
import { buildScene, type SceneName } from './scenes';
import { buildOtoWorld, OTO_ASSET_MANIFEST, TELEPORT_HUBS } from './oto';
import { resolvePlayerMovement, findNearbyLandmark, type OtoCollisionMap } from './collision';
import { updateNpcs, type NpcAgent } from './npc';
import { districtAt, TERRAIN } from './terrain';
import { collectAmbientEntities, updateAmbientEntities, updateManaTrams, type ManaTramAgent } from './ambient';

const DUMMY = ['prop_crate_a', 'bld_tower_round_a', 'bld_house_gable_a', 'prop_tree_round_a', 'bld_wall_segment_a', 'chr_hero_walk', 'prop_arrow_a', 'bld_tower_carved_a'];
type AllSceneName = SceneName | 'oto';
type TimeOfDay = 'day' | 'evening' | 'night';
type HudMode = 'compact' | 'full' | 'hidden';

const MINIMAP_PINS: { x: number; y: number; color: string; r: number }[] = [
  { x: 0, y: 0, color: '#3b5dc9', r: 3.5 },        // 王城
  { x: -114, y: 172, color: '#94b0c2', r: 2.5 },   // 大聖堂
  { x: -140, y: 286, color: '#3b5dc9', r: 2.5 },   // ギルド本部
  { x: 46, y: 336, color: '#ff6b9d', r: 2.5 },     // 大通りの角店
  { x: 45, y: 384, color: '#b455d9', r: 2.5 },     // 大通りのギルド支部
  { x: -320, y: -240, color: '#73eff7', r: 3.2 },  // 魔導学院
  { x: -495, y: -455, color: '#41a6f6', r: 2.5 },  // 魔導揚水塔
  { x: 420, y: 110, color: '#c9c2b0', r: 2.5 },    // 教会
  { x: 420, y: 295, color: '#ef7d57', r: 2.8 },    // 工業区
  { x: 300, y: 560, color: '#8f5f3a', r: 2.8 },    // 貧民街
  { x: 900, y: 20, color: '#257179', r: 2.8 },     // 大河の川港
  { x: -960, y: 140, color: '#ffcd75', r: 2.8 },   // 西部農地・風車
  { x: 0, y: 820, color: '#f4f4f4', r: 2.5 },      // 南大門
];

function drawMinimap(
  mc: HTMLCanvasElement,
  ground: HTMLCanvasElement,
  px: number,
  py: number,
  camYaw: number,
) {
  const mg = mc.getContext('2d')!;
  const size = mc.width;
  const scale = size / ground.width;
  const half = ground.width / 2;
  mg.imageSmoothingEnabled = false;
  mg.clearRect(0, 0, size, size);
  mg.drawImage(ground, 0, 0, size, size);
  for (const p of MINIMAP_PINS) {
    mg.fillStyle = p.color;
    mg.beginPath();
    mg.arc((p.x + half) * scale, (p.y + half) * scale, p.r, 0, Math.PI * 2);
    mg.fill();
  }
  const mx = (px + half) * scale;
  const my = (py + half) * scale;
  const [ux, uy] = screenUpInWorld(camYaw);
  mg.strokeStyle = '#ffcd75';
  mg.lineWidth = 2;
  mg.beginPath();
  mg.moveTo(mx, my);
  mg.lineTo(mx + ux * 10, my + uy * 10);
  mg.stroke();
  mg.fillStyle = '#ffffff';
  mg.strokeStyle = '#1a1c2c';
  mg.lineWidth = 1.5;
  mg.beginPath();
  mg.arc(mx, my, 3.5, 0, Math.PI * 2);
  mg.fill();
  mg.stroke();
}

function setupTouchControls(input: Input) {
  const buttons = document.querySelectorAll<HTMLButtonElement>('#touch-ui [data-key], #touch-ui [data-tap]');
  buttons.forEach((btn) => {
    const key = btn.dataset.key;
    const tap = btn.dataset.tap;
    if (key) {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.setVirtual(key, true); });
      btn.addEventListener('pointerup', () => input.setVirtual(key, false));
      btn.addEventListener('pointercancel', () => input.setVirtual(key, false));
      btn.addEventListener('pointerleave', () => input.setVirtual(key, false));
    } else if (tap) {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.tapKey(tap); });
    }
  });
}

async function boot() {
  const view = document.getElementById('view') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  const landmarkEl = document.getElementById('landmark')!;
  const minimapEl = document.getElementById('minimap') as HTMLCanvasElement;
  const vg = view.getContext('2d')!;
  const q = new URLSearchParams(location.search);
  const buf = document.createElement('canvas');
  const g = buf.getContext('2d', { alpha: false, willReadFrequently: q.get('cpu') !== '0' })!;

  if (q.get('touch') === '1') document.body.classList.add('touch-force');

  const scene = (q.get('scene') ?? 'oto') as AllSceneName;
  let world: World;
  let player: Entity | null = null;
  let npcs: NpcAgent[] = [];
  let autoSpin = false;
  let collision: OtoCollisionMap | null = null;
  let usedPropAssets: StackAsset[] = [];
  let ambientEntities: Entity[] = [];
  let trams: ManaTramAgent[] = [];
  let worldScale = 1;

  if (scene === 'oto') {
    worldScale = 2;
    const assets: Record<string, StackAsset> = {};
    const [groundImg] = await Promise.all([
      loadGroundImage('ground/oto_ground.png'),
      ...OTO_ASSET_MANIFEST.map(async (item) => {
        try {
          assets[item.id] = await loadStack(item.dir, item.id);
        } catch (err) {
          if (!item.optional) throw err;
        }
      }),
    ]);
    const built = buildOtoWorld(assets, groundImg);
    world = built.world;
    player = built.player;
    npcs = built.npcs;
    trams = built.trams;
    collision = built.collision;
    usedPropAssets = Array.from(new Set(world.entities.filter((e) => e.asset.meta.category === 'props').map((e) => e.asset)));
    ambientEntities = collectAmbientEntities(world.entities);
    if (q.has('x') || q.has('y')) {
      const tx = Number(q.get('x') ?? player.x);
      const ty = Number(q.get('y') ?? player.y);
      const [rx, ry] = resolvePlayerMovement(tx, ty, 4, collision);
      player.x = rx;
      player.y = ry;
    }
    player.baseZ = 0;
  } else {
    const assets: Record<string, StackAsset> = {};
    await Promise.all(DUMMY.map(async (id) => { assets[id] = await loadStack('_dummy', id); }));
    const custom = q.get('asset');
    if (custom) {
      const [dir, id] = custom.split('/');
      assets.__custom = await loadStack(dir, id);
      if ((assets.__custom.meta.density ?? 1) >= 2) worldScale = 2;
    }
    const built = buildScene(scene, assets, Number(q.get('n') ?? 400));
    world = built.world;
    player = built.player;
    autoSpin = built.autoSpin;
  }

  const otoDefaultZoom = innerWidth >= 1100 ? 2 : 1;
  const singleDefaultZoom = worldScale >= 2 ? 3 : 6;
  const defaultZoom = scene === 'single' ? singleDefaultZoom : scene === 'oto' ? otoDefaultZoom : 3;
  const initZoom = q.has('zoom') ? Math.max(1, Math.min(8, Math.round(Number(q.get('zoom'))))) : defaultZoom;
  const cam: Camera = {
    x: player ? player.x : 0,
    y: player ? player.y : 0,
    z: player ? player.baseZ : 0,
    yaw: (Number(q.get('yaw') ?? 0) * Math.PI) / 180,
    squash: Number(q.get('squash') ?? (scene === 'oto' ? 0.65 : 0.75)),
    spacing: Number(q.get('spacing') ?? 1),
    thickness: Number(q.get('thickness') ?? 1),
    zoom: initZoom,
    scale: worldScale,
  };
  const cache = new CompositeCache();
  const input = new Input(view);
  setupTouchControls(input);

  // ミニマップクリックで街のどこへでも安全にファストトラベル
  minimapEl.addEventListener('pointerdown', (e) => {
    if (!player || !collision || !world.ground) return;
    e.preventDefault();
    const rect = minimapEl.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const half = TERRAIN.groundSize / 2;
    const tx = u * TERRAIN.groundSize - half;
    const ty = v * TERRAIN.groundSize - half;
    let [rx, ry] = resolvePlayerMovement(tx, ty, 4, collision);
    if (collision.inBlockingWater && collision.inBlockingWater(rx, ry)) {
      for (const dist of [32, 64, 96]) {
        let found = false;
        for (let a = 0; a < 8; a++) {
          const rad = (a * Math.PI) / 4;
          const [cx, cy] = resolvePlayerMovement(tx + Math.cos(rad) * dist, ty + Math.sin(rad) * dist, 4, collision);
          if (!collision.inBlockingWater(cx, cy)) {
            rx = cx; ry = cy; found = true; break;
          }
        }
        if (found) break;
      }
    }
    player.x = rx;
    player.y = ry;
    player.baseZ = 0;
    cam.x = rx;
    cam.y = ry;
    cam.z = 0;
  });

  const bench = q.get('bench') === '1' ? { samples: [] as number[], done: '' } : null;
  let useCache = q.get('cache') !== '0';
  let spin = q.has('spin') ? q.get('spin') === '1' : autoSpin;
  if (bench && !q.has('spin')) spin = true;

  let hudMode: HudMode =
    q.get('hud') === '0' ? 'hidden' :
    q.get('hud') === '1' || bench || scene !== 'oto' ? 'full' :
    'compact';

  let showShadows = q.has('shadows') ? q.get('shadows') === '1' : scene === 'oto';
  let showOutline = q.has('outline') ? q.get('outline') === '1' : scene === 'oto';
  let showMinimap = q.has('minimap') ? q.get('minimap') === '1' : scene === 'oto';
  const times: TimeOfDay[] = ['day', 'evening', 'night'];
  let timeIdx = Math.max(0, times.indexOf((q.get('time') ?? 'day') as TimeOfDay));

  if (scene === 'oto' && useCache) {
    cache.outline = showOutline;
    cache.beginFrame(`${cam.squash}|${cam.spacing}|${cam.thickness}|${cache.outline ? 1 : 0}|${cam.scale ?? 1}`);
    cache.prewarmProps(usedPropAssets, params(cam), cam.scale ?? 1);
  }

  let last = performance.now(), acc = 0, frames = 0, fps = 0, ms = 0;
  let walkT = 0;
  let animT = 0;
  let teleportFlash = 0;

  const findTeleportHubIdx = (x: number, y: number) =>
    TELEPORT_HUBS.findIndex((h) => Math.hypot(x - h.x, y - h.y) <= 32);

  function resize() {
    view.width = innerWidth; view.height = innerHeight;
    buf.width = Math.ceil(innerWidth / cam.zoom); buf.height = Math.ceil(innerHeight / cam.zoom);
  }
  addEventListener('resize', resize); resize();
  try { view.focus({ preventScroll: true }); } catch { /* ignore */ }

  function update(dt: number) {
    const rot = (input.isDown('KeyE', 'e') ? 1 : 0) - (input.isDown('KeyQ', 'q') ? 1 : 0);
    cam.yaw += rot * dt * Math.PI * 0.5 + input.dragDX * 0.01 + (spin ? dt * 0.6 : 0);
    if (input.wasPressed('KeyT', 't')) spin = !spin;
    if (input.wheel !== 0 || input.wasPressed('KeyZ', 'z') || input.wasPressed('KeyX', 'x')) {
      const d = input.wheel + (input.wasPressed('KeyX', 'x') ? 1 : 0) - (input.wasPressed('KeyZ', 'z') ? 1 : 0);
      cam.zoom = Math.max(1, Math.min(8, cam.zoom - Math.sign(d)));
      resize();
    }
    if (input.wasPressed('KeyR', 'r')) cam.squash = Math.min(1, +(cam.squash + 0.05).toFixed(2));
    if (input.wasPressed('KeyF', 'f')) cam.squash = Math.max(0.6, +(cam.squash - 0.05).toFixed(2));
    if (input.wasPressed('Digit1', '1')) cam.spacing = 1;
    if (input.wasPressed('Digit2', '2')) cam.spacing = 3;
    if (input.wasPressed('Digit0', '0')) cam.spacing = 0;
    if (input.wasPressed('KeyY', 'y')) cam.thickness = cam.thickness === 1 ? 2 : 1;
    if (input.wasPressed('KeyC', 'c')) useCache = !useCache;
    if (input.wasPressed('KeyH', 'h')) {
      if (scene === 'oto') {
        hudMode = hudMode === 'compact' ? 'full' : hudMode === 'full' ? 'hidden' : 'compact';
      } else {
        hudMode = hudMode === 'full' ? 'hidden' : 'full';
      }
    }
    if (input.wasPressed('KeyG', 'g')) showShadows = !showShadows;
    if (input.wasPressed('KeyO', 'o')) showOutline = !showOutline;
    if (input.wasPressed('KeyM', 'm')) showMinimap = !showMinimap;
    if (input.wasPressed('KeyN', 'n')) timeIdx = (timeIdx + 1) % times.length;

    if (player) {
      const f = (input.isDown('KeyW', 'w') || input.isDown('ArrowUp') ? 1 : 0)
        - (input.isDown('KeyS', 's') || input.isDown('ArrowDown') ? 1 : 0);
      const r = (input.isDown('KeyD', 'd') || input.isDown('ArrowRight') ? 1 : 0)
        - (input.isDown('KeyA', 'a') || input.isDown('ArrowLeft') ? 1 : 0);
      const up = screenUpInWorld(cam.yaw), right = screenRightInWorld(cam.yaw);
      let vx = up[0] * f + right[0] * r, vy = up[1] * f + right[1] * r;
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        vx /= len; vy /= len;
        const dash = input.isDown('ShiftLeft', 'shift') || input.isDown('ShiftRight');
        const speed = dash ? 128 : 64; // px/s
        const prevX = player.x;
        const prevY = player.y;
        const nx = prevX + vx * speed * dt;
        const ny = prevY + vy * speed * dt;
        if (collision) {
          const [rx, ry] = resolvePlayerMovement(nx, ny, 4, collision, prevX, prevY);
          player.x = rx;
          player.y = ry;
        } else {
          player.x = nx;
          player.y = ny;
        }
        player.yaw = yawFromVelocity(vx, vy);
        walkT += dt; player.frame = Math.floor(walkT * (dash ? 11 : 7)) % player.asset.meta.frames;
      } else if (player.asset.meta.frames > 1) {
        player.frame = 1;
      }
      if (scene === 'oto') {
        player.baseZ = 0;
        cam.z = 0;
        if (input.wasPressed('Space')) {
          const hubIdx = findTeleportHubIdx(player.x, player.y);
          if (hubIdx >= 0) {
            const nextHub = TELEPORT_HUBS[(hubIdx + 1) % TELEPORT_HUBS.length];
            player.x = nextHub.x;
            player.y = nextHub.y;
            teleportFlash = 0.32;
          }
        }
      }
      cam.x = player.x;
      cam.y = player.y;
    }

    if (npcs.length > 0) updateNpcs(npcs, dt);
    animT += dt;
    teleportFlash = Math.max(0, teleportFlash - dt);
    if (ambientEntities.length > 0) updateAmbientEntities(ambientEntities, animT);
    if (trams.length > 0) updateManaTrams(trams, dt, animT);
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    stats.drawImage = 0; stats.composites = 0;
    const t0 = performance.now();
    const drawn = renderWorld(g, buf.width, buf.height, world, cam, cache, {
      mode: useCache ? 'composite' : 'direct',
      shadows: showShadows,
      outline: showOutline,
      timeSec: animT,
      waterFx: scene === 'oto',
    });
    const tod = times[timeIdx];
    if (tod === 'evening') {
      g.fillStyle = 'rgba(220, 110, 48, 0.20)';
      g.fillRect(0, 0, buf.width, buf.height);
    } else if (tod === 'night') {
      g.fillStyle = 'rgba(20, 32, 78, 0.42)';
      g.fillRect(0, 0, buf.width, buf.height);
    }
    if (teleportFlash > 0) {
      g.fillStyle = `rgba(115, 239, 247, ${((teleportFlash / 0.32) * 0.45).toFixed(3)})`;
      g.fillRect(0, 0, buf.width, buf.height);
    }
    vg.imageSmoothingEnabled = false;
    vg.drawImage(buf, 0, 0, buf.width * cam.zoom, buf.height * cam.zoom);
    const took = performance.now() - t0;
    ms = ms * 0.9 + took * 0.1;

    if (bench && !bench.done) {
      bench.samples.push(took);
      if (bench.samples.length >= 300) {
        const a = [...bench.samples].sort((x, y) => x - y);
        const avg = a.reduce((x, y) => x + y, 0) / a.length;
        bench.done = `BENCH scene=${scene} stacks=${world.entities.length} mode=${useCache ? 'composite' : 'direct'} spin=${spin ? 1 : 0} zoom=${cam.zoom} outline=${showOutline ? 1 : 0} avg=${avg.toFixed(2)}ms p95=${a[Math.floor(a.length * 0.95)].toFixed(2)}ms buffer=${buf.width}x${buf.height}`;
        document.title = bench.done; console.log(bench.done);
      }
    }
    acc += dt; frames++;
    if (acc >= 0.5) { fps = Math.round(frames / acc); acc = 0; frames = 0; }

    if (collision && player && scene === 'oto') {
      const hubIdx = findTeleportHubIdx(player.x, player.y);
      if (hubIdx >= 0) {
        landmarkEl.textContent = `${TELEPORT_HUBS[hubIdx].label}（Space:転移）`;
      } else {
        const lm = findNearbyLandmark(player.x, player.y, collision.landmarks, 36);
        landmarkEl.textContent = lm ? lm.label : districtAt(player.x, player.y).label;
      }
      landmarkEl.style.display = 'block';
    } else {
      landmarkEl.style.display = 'none';
    }

    if (showMinimap && scene === 'oto' && world.ground && player) {
      minimapEl.style.display = 'block';
      drawMinimap(minimapEl, world.ground, player.x, player.y, cam.yaw);
    } else {
      minimapEl.style.display = 'none';
    }

    if (hudMode === 'compact') {
      hud.style.display = '';
      hud.textContent = `WASD:歩く Shift:走る Q/E:回転 ZX:ズーム(${cam.zoom}x) Space:転移陣 N:時間 地図:移動 H:詳細`;
    } else if (hudMode === 'full') {
      hud.style.display = '';
      const posStr = player ? ` pos=(${Math.round(player.x)},${Math.round(player.y)},z=${Math.round(player.baseZ)})` : '';
      hud.textContent =
        `scene=${scene}  fps=${fps}  render=${ms.toFixed(2)}ms${bench?.done ? '\n' + bench.done : ''}\n` +
        `stacks=${world.entities.length} npcs=${npcs.length} drawn=${drawn} drawImage=${stats.drawImage} newComposites=${stats.composites} mode=${useCache ? 'composite' : 'direct'}(${cache.size})\n` +
        `buffer=${buf.width}x${buf.height} zoom=${cam.zoom}x yaw=${(((cam.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(1)}° squash=${cam.squash} spacing=${cam.spacing} thickness=${cam.thickness}${posStr}\n` +
        `Q/E・ドラッグ:回転  T:自動  Z/X:ズーム  R/F:つぶし  1/2/0:間隔  Y:厚み  C:キャッシュ  O:輪郭(${showOutline ? 'ON' : 'OFF'})  G:影  N:時間(${tod})  Space:転移陣  M:地図ワープ  H:表示切替` +
        (player ? `  WASD:歩く  Shift:走る` : '');
    } else {
      hud.style.display = 'none';
    }

    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  (window as unknown as { __oto: unknown }).__oto = { cam, world, stats, player, npcs, trams, collision };
}

boot().catch((e) => { document.getElementById('hud')!.textContent = String(e?.stack ?? e); console.error(e); });

export type { World, Entity };
