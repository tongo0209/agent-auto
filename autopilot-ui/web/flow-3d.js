import * as THREE from './vendor/three-0.160.0.module.js';

const MIN_COL_PITCH = 1.9;
const MAX_COL_PITCH = 3.3;
const LABEL_GAP_PX = 8;
const STAGGER_COST = 1.15;
const STAGGER_ROW_PX = 90;
const SIDE_DRIFT_COST = 0.5;
const ROW_PITCH = 3;
const STAND_BACK = 0.3;
const ROBOT_SCALE = 1.5;
const ROBOT_MAX_SCALE = 2.2;
const ROBOT_MIN_PX = 56;
const HEAD_TOP = 1.2;
const WALK_SPEED = 2.4;
const MAX_WALK_SECONDS = 2.6;
const JUMP_SECONDS = 0.9;
const JUMP_HEIGHT = 0.5;
const HOVER_LIFT = 0.12;
const DRAG_THRESHOLD_PX = 4;
const BUBBLE_MAX_CHARS = 40;
const PARTICLE_COUNT = 10;
const DEFAULT_VIEW = { azimuth: -0.04, elevation: 0.86, zoom: 1 };
const LIMITS = { azimuth: 0.5, elevationMin: 0.3, elevationMax: 1.1, zoomMin: 0.45, zoomMax: 1.5 };
const STATION_BOUNDS = [[-0.75, 0, -0.75], [0.75, 0, -0.75], [-0.75, 0, 1.05], [0.75, 0, 1.05], [-0.75, 1.9, -0.75], [0.75, 1.9, -0.75]];
const STATE_TOKEN = { done: '--ok', running: '--run', waiting: '--wait', stopped: '--stop', pending: '--idle', skipped: '--idle' };
const ROBOT_MODE = { running: 'typing', waiting: 'waving', stopped: 'slumped' };
const ACTIVE_STATES = ['running', 'waiting'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function injectCss() {
  if (document.querySelector('link[data-flow3d]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./flow-3d.css', import.meta.url).href });
  link.dataset.flow3d = '';
  document.head.append(link);
}

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const color = (token) => new THREE.Color(css.getPropertyValue(token).trim());
  const state = Object.fromEntries(Object.entries(STATE_TOKEN).map(([name, token]) => [name, color(token)]));
  return { bg: color('--bg'), panel: color('--bg-3'), line: color('--line-2'), text: color('--text-2'), state };
}

// Ô ngoài chuỗi next chỉ vẽ khi là bước vòng về hoặc run đã chạy tới: stage con của nhóm song song không có chỗ đứng
function mainLane(cells) {
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));
  const lane = [];
  for (let c = cells[0]; c && !lane.includes(c); c = byId[c.next]) lane.push(c);
  return { lane, side: cells.filter((c) => !lane.includes(c) && (c.side || c.rounds > 0 || ACTIVE_STATES.includes(c.state))) };
}

// Làn chính chạy rắn (hàng lẻ đi ngược) để flow dài vẫn vừa khung; bước side lấp ô trống cuối lưới, gần nơi gọi nhất
function layoutStations(cells, cols, pitch) {
  const { lane, side } = mainLane(cells);
  const slot = (i) => {
    const row = Math.floor(i / cols);
    const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
    return { x: (col - (cols - 1) / 2) * pitch, z: -row * ROW_PITCH };
  };
  const spot = new Map(lane.map((c, i) => [c.id, slot(i)]));
  const freeSlots = Array.from({ length: Math.ceil(cells.length / cols) * cols - lane.length }, (_, k) => slot(lane.length + k));
  const wantedX = (c) => {
    const callers = lane.filter((l) => l.back === c.id).map((l) => spot.get(l.id).x);
    return callers.length ? callers.reduce((a, b) => a + b, 0) / callers.length : spot.get(c.next)?.x ?? 0;
  };
  let sideDrift = 0;
  for (const c of side) {
    const x = wantedX(c);
    const nearest = freeSlots.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    freeSlots.splice(freeSlots.indexOf(nearest), 1);
    spot.set(c.id, nearest);
    sideDrift = Math.max(sideDrift, Math.abs(nearest.x - x) / (cols * pitch));
  }
  return { lane, spot, pitch, sideDrift };
}

// Đổi hàng thì đi qua khe giữa hai cột (cột các hàng thẳng nhau), không xuyên qua bàn
function walkPath(from, to, pitch) {
  if (Math.abs(from.z - to.z) < 0.01) return [from, to];
  const [rowEnd, otherEnd] = from.z < to.z ? [from, to] : [to, from];
  const x = rowEnd.x + Math.sign(otherEnd.x - rowEnd.x || 1) * (pitch / 2);
  return [from, new THREE.Vector3(x, 0, from.z), new THREE.Vector3(x, 0, to.z), to];
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
  return total;
}

function pointAlong(points, distance, out) {
  for (let i = 1; i < points.length; i++) {
    const segment = points[i].distanceTo(points[i - 1]);
    if (distance <= segment || i === points.length - 1) return out.lerpVectors(points[i - 1], points[i], segment ? Math.min(1, distance / segment) : 1);
    distance -= segment;
  }
  return out.copy(points[0]);
}

function noteOf(c) {
  const main = c.state === 'waiting' ? 'chờ' : c.usd ? `$${c.usd.toFixed(2)}` : c.state === 'skipped' ? `bỏ qua${c.skippedReason ? ` · ${c.skippedReason}` : ''}` : '';
  const rounds = c.rounds > 1 ? (c.max ? `vòng ${c.rounds}/${c.max}` : `×${c.rounds}`) : '';
  return [main, rounds].filter(Boolean).join(' · ');
}

function shadowTexture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function place(object, x, y, z) {
  object.position.set(x, y, z);
  return object;
}

function group(x, y, z, ...children) {
  const g = place(new THREE.Group(), x, y, z);
  g.add(...children);
  return g;
}

function buildRobot() {
  const shell = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.4, metalness: 0.15 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x151a21, roughness: 0.25, metalness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const limb = new THREE.CapsuleGeometry(0.045, 0.16, 4, 8);
  const eye = new THREE.SphereGeometry(0.028, 12, 8);
  const mesh = (geometry, material, x, y, z) => place(new THREE.Mesh(geometry, material), x, y, z);

  const legL = group(-0.08, 0.24, 0, mesh(limb, shell, 0, -0.11, 0));
  const legR = group(0.08, 0.24, 0, mesh(limb, shell, 0, -0.11, 0));
  const armL = group(-0.2, 0.55, 0, mesh(limb, shell, 0, -0.12, 0));
  const armR = group(0.2, 0.55, 0, mesh(limb, shell, 0, -0.12, 0));
  const face = mesh(new THREE.SphereGeometry(0.13, 24, 16), visor, 0, 0.15, 0.1);
  face.scale.set(1.1, 0.7, 0.6);
  const head = group(0, 0.64, 0,
    mesh(new THREE.SphereGeometry(0.17, 24, 16), shell, 0, 0.15, 0),
    face,
    mesh(eye, glow, -0.055, 0.16, 0.18),
    mesh(eye, glow, 0.055, 0.16, 0.18),
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12), shell, 0, 0.36, 0),
    mesh(new THREE.SphereGeometry(0.035, 12, 8), glow, 0, 0.43, 0));
  const torso = group(0, 0, 0, mesh(new THREE.CapsuleGeometry(0.15, 0.16, 6, 16), shell, 0, 0.42, 0), head, armL, armR);
  const body = group(0, 0, 0, torso, legL, legR);
  const shadow = mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }), 0, 0.012, 0);
  shadow.rotation.x = -Math.PI / 2;
  const root = group(0, 0, 0, body, shadow);
  return { root, body, torso, head, armL, armR, legL, legR, glow };
}

function poseRobot(robot, mode, t) {
  const { torso, head, armL, armR, legL, legR } = robot;
  torso.position.y = 0;
  torso.rotation.set(0, 0, 0);
  for (const joint of [head, armL, armR, legL, legR]) joint.rotation.set(0, 0, 0);
  if (mode === 'typing') {
    armL.rotation.x = -0.95 + Math.sin(t * 16) * 0.16;
    armR.rotation.x = -0.95 - Math.sin(t * 16) * 0.16;
    head.rotation.x = 0.18 + Math.sin(t * 2.4) * 0.07;
  } else if (mode === 'waving') {
    armR.rotation.z = 2.6 + Math.sin(t * 7) * 0.35;
    head.rotation.z = Math.sin(t * 2) * 0.08;
  } else if (mode === 'walking') {
    const swing = Math.sin(t * 11);
    legL.rotation.x = swing * 0.6;
    legR.rotation.x = -swing * 0.6;
    armL.rotation.x = -swing * 0.5;
    armR.rotation.x = swing * 0.5;
    torso.position.y = Math.abs(swing) * 0.04;
  } else if (mode === 'cheer') {
    armL.rotation.z = -2.7;
    armR.rotation.z = 2.7;
  } else if (mode === 'slumped') {
    torso.rotation.x = 0.15;
    head.rotation.x = 0.65;
    armL.rotation.x = 0.15;
    armR.rotation.x = 0.15;
  }
}

function stationGeometries() {
  return {
    platform: {
      claude: new THREE.CylinderGeometry(0.62, 0.66, 0.08, 40),
      gate: new THREE.CylinderGeometry(0.66, 0.7, 0.08, 6),
      pause: new THREE.BoxGeometry(1.15, 0.08, 1.15),
    },
    deskTop: new THREE.BoxGeometry(1.05, 0.05, 0.42),
    deskPanel: new THREE.BoxGeometry(0.95, 0.24, 0.04),
    keyboard: new THREE.BoxGeometry(0.34, 0.02, 0.11),
    monitorStand: new THREE.BoxGeometry(0.04, 0.16, 0.04),
    monitorBody: new THREE.BoxGeometry(0.5, 0.32, 0.04),
    screen: new THREE.PlaneGeometry(0.44, 0.26),
    tickShort: new THREE.BoxGeometry(0.05, 0.14, 0.05),
    tickLong: new THREE.BoxGeometry(0.05, 0.3, 0.05),
    hit: new THREE.BoxGeometry(1.5, 1.5, 1.6),
    ribbon: new THREE.BoxGeometry(1, 0.01, 0.06),
    particle: new THREE.BoxGeometry(0.035, 0.035, 0.035),
    packet: new THREE.SphereGeometry(0.06, 16, 12),
  };
}

export function mountFlow3d(containerEl, run, { onNodeClick }) {
  const canvas = document.createElement('canvas');
  const contextOptions = { antialias: true, powerPreference: 'low-power' };
  const context = canvas.getContext('webgl2', contextOptions) ?? canvas.getContext('webgl', contextOptions);
  if (!context) return null;
  injectCss();

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = readPalette();
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const root = document.createElement('div');
  root.className = 'f3d';
  const overlay = document.createElement('div');
  overlay.className = 'f3d-overlay';
  const alertMark = Object.assign(document.createElement('div'), { className: 'f3d-alert', textContent: '!', hidden: true });
  const bubble = Object.assign(document.createElement('div'), { className: 'f3d-bubble', hidden: true });
  overlay.append(alertMark, bubble);
  root.append(canvas, overlay);
  containerEl.append(root);

  const scene = new THREE.Scene();
  scene.background = palette.bg;
  scene.fog = new THREE.Fog(palette.bg, 10, 40);
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2230, 2.2));
  scene.add(place(new THREE.DirectionalLight(0xffffff, 2.2), 4, 8, 6));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: palette.bg, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(80, 80, palette.line, palette.line);
  Object.assign(grid.material, { transparent: true, opacity: 0.35 });
  grid.position.y = 0.002;
  scene.add(floor, grid);

  const geometry = stationGeometries();
  const shared = {
    platform: new THREE.MeshStandardMaterial({ color: palette.panel, roughness: 0.7 }),
    keyboard: new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 0.6 }),
    tick: new THREE.MeshBasicMaterial({ color: palette.state.done }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    particle: new THREE.MeshBasicMaterial({ color: palette.state.running }),
    packet: new THREE.MeshBasicMaterial({ color: palette.state.running }),
  };
  const ribbonMaterial = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const edgeMaterial = {
    done: ribbonMaterial(palette.state.done, 0.7),
    running: ribbonMaterial(palette.state.running, 1),
    waiting: ribbonMaterial(palette.state.waiting, 1),
    idle: ribbonMaterial(palette.line, 0.8),
  };
  const arcMaterial = { used: ribbonMaterial(palette.state.waiting, 0.75), idle: ribbonMaterial(palette.line, 0.6) };

  const robot = buildRobot();
  const packet = new THREE.Mesh(geometry.packet, shared.packet);
  const particles = Array.from({ length: PARTICLE_COUNT }, () => new THREE.Mesh(geometry.particle, shared.particle));
  scene.add(robot.root, packet, ...particles);

  let current = run;
  let cellById = new Map();
  let stations = new Map();
  let structure = '';
  let layout = null;
  let edges = [];
  let incomingEdge = null;
  const agent = { stationId: null, previousId: null, position: new THREE.Vector3(), walk: null, jumpElapsed: null };
  let view = { ...DEFAULT_VIEW };
  const fit = { target: new THREE.Vector3(), distance: 10 };
  const size = { width: 1, height: 1 };
  let hovered = null;
  let drag = null;
  let raf = 0;
  let lastFrame = 0;
  let time = 0;
  let visible = true;
  const scratch = new THREE.Vector3();

  const stateOf = (id) => cellById.get(id)?.state;
  const standSpot = (id) => new THREE.Vector3(layout.spot.get(id).x, 0, layout.spot.get(id).z - STAND_BACK);
  const robotMode = () => (current.status === 'done' ? 'idle' : ROBOT_MODE[stateOf(agent.stationId)] ?? 'idle');

  function buildStation(cell) {
    const desk = new THREE.MeshStandardMaterial({ color: 0x3a4350, roughness: 0.55, transparent: true });
    const screen = new THREE.MeshBasicMaterial({ transparent: true });
    const rim = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = (geo, material, x, y, z) => place(new THREE.Mesh(geo, material), x, y, z);
    const shape = cell.kind === 'gate' ? 'gate' : cell.kind === 'pause' || cell.kind === 'attached' ? 'pause' : 'claude';
    const rimMesh = mesh(geometry.platform[shape], rim, 0, 0.02, 0);
    rimMesh.scale.set(1.08, 0.5, 1.08);
    const screenMesh = mesh(geometry.screen, screen, 0, 0.32, 0.021);
    const monitor = group(0.33, 0.34, 0.17, mesh(geometry.monitorStand, desk, 0, 0.08, 0), mesh(geometry.monitorBody, desk, 0, 0.32, 0), screenMesh);
    monitor.rotation.y = -0.64;
    const tickShort = mesh(geometry.tickShort, shared.tick, -0.06, -0.02, 0);
    tickShort.rotation.z = 0.75;
    const tickLong = mesh(geometry.tickLong, shared.tick, 0.07, 0.05, 0);
    tickLong.rotation.z = -0.6;
    const tick = group(0.33, 0.98, 0.17, tickShort, tickLong);
    const hit = mesh(geometry.hit, shared.hit, 0, 0.7, 0);
    hit.userData.stageId = cell.id;
    const stationGroup = group(0, 0, 0,
      mesh(geometry.platform[shape], shared.platform, 0, 0.04, 0), rimMesh,
      mesh(geometry.deskTop, desk, 0, 0.32, 0.15), mesh(geometry.deskPanel, desk, 0, 0.19, 0.34),
      mesh(geometry.keyboard, shared.keyboard, -0.05, 0.355, 0.02), monitor, tick, hit);
    const label = document.createElement('div');
    label.append(document.createElement('b'), document.createElement('small'));
    overlay.prepend(label);
    scene.add(stationGroup);
    return { id: cell.id, group: stationGroup, screenMesh, tick, hit, label, materials: { desk, screen, rim }, lift: 0, liftTarget: 0 };
  }

  function paintStation(station, cell) {
    const userSkipped = cell.state === 'skipped' && cell.skippedReason != null;
    const { desk, screen, rim } = station.materials;
    rim.color.copy(userSkipped ? palette.state.stopped : palette.state[cell.state]);
    screen.color.copy(cell.state === 'pending' ? palette.panel : palette.state[cell.state]);
    const opacity = cell.state === 'skipped' ? 0.35 : 1;
    desk.opacity = screen.opacity = opacity;
    rim.opacity = cell.state === 'skipped' || cell.state === 'pending' ? 0.4 : 1;
    station.tick.visible = cell.state === 'done';
    station.label.className = `f3d-label ${cell.state}${userSkipped ? ' user-skipped' : ''}${station.staggered ? ' stagger' : ''}${hovered === station ? ' hover' : ''}`;
    station.label.firstChild.textContent = `${cell.breakpoint ? '📍 ' : ''}${cell.id}`;
    station.label.lastChild.textContent = noteOf(cell);
    station.label.title = [cell.id, noteOf(cell)].filter(Boolean).join(' · ');
  }

  function disposeStations() {
    for (const station of stations.values()) {
      scene.remove(station.group);
      station.label.remove();
      for (const material of Object.values(station.materials)) material.dispose();
    }
    stations = new Map();
    hovered = null;
  }

  function disposeEdges() {
    for (const edge of edges) {
      for (const mesh of edge.meshes) scene.remove(mesh);
      if (edge.kind === 'arc') edge.meshes[0].geometry.dispose();
    }
    edges = [];
  }

  function buildEdges() {
    disposeEdges();
    const lifted = (p) => new THREE.Vector3(p.x, 0.02, p.z);
    layout.lane.slice(1).forEach((cell, i) => {
      const from = layout.lane[i].id;
      const points = walkPath(standSpot(from), standSpot(cell.id), layout.pitch).map(lifted);
      const meshes = points.slice(1).map((end, k) => {
        const start = points[k];
        const ribbon = new THREE.Mesh(geometry.ribbon, edgeMaterial.idle);
        ribbon.position.lerpVectors(start, end, 0.5);
        ribbon.scale.x = start.distanceTo(end) + 0.06;
        ribbon.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
        return ribbon;
      });
      scene.add(...meshes);
      edges.push({ kind: 'main', from, to: cell.id, points, meshes });
    });
    for (const cell of current.cells.filter((c) => c.back && layout.spot.has(c.back))) {
      const a = standSpot(cell.id).setY(0.1);
      const b = standSpot(cell.back).setY(0.1);
      const peak = new THREE.Vector3().lerpVectors(a, b, 0.5).setY(0.8 + a.distanceTo(b) * 0.18);
      const curve = new THREE.QuadraticBezierCurve3(a, peak, b);
      const arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.022, 6), arcMaterial.idle);
      scene.add(arc);
      edges.push({ kind: 'arc', from: cell.id, to: cell.back, points: curve.getPoints(40), meshes: [arc] });
    }
  }

  function paintEdges() {
    for (const edge of edges) {
      const from = cellById.get(edge.from);
      const to = cellById.get(edge.to);
      if (edge.kind === 'arc') {
        edge.meshes[0].material = from.rounds > 1 || (to.side && to.rounds > 0 && from.rounds > 0) ? arcMaterial.used : arcMaterial.idle;
        continue;
      }
      const live = from.state === 'done' && ACTIVE_STATES.includes(to.state);
      const material = live ? edgeMaterial[to.state] : from.state === 'done' && to.state !== 'pending' ? edgeMaterial.done : edgeMaterial.idle;
      for (const mesh of edge.meshes) mesh.material = material;
    }
    const stage = current.stage;
    incomingEdge = !ACTIVE_STATES.includes(stateOf(stage)) || current.status === 'stopped' || current.interrupted ? null
      : edges.find((e) => e.kind === 'main' && e.to === stage && stateOf(e.from) === 'done')
        ?? edges.find((e) => e.kind === 'arc' && e.to === stage && e.from === agent.previousId)
        ?? edges.find((e) => e.kind === 'arc' && e.to === stage)
        ?? null;
    shared.packet.color.copy(palette.state[stateOf(stage)] ?? palette.state.running);
  }

  // Chọn số cột cho trạm to nhất mà nhãn đủ dài không đè; hàng sau chật mà còn khoảng dọc thì so le nhãn
  function relayout() {
    for (const station of stations.values()) station.label.style.maxWidth = '';
    const labelWidth = new Map([...stations].map(([id, s]) => [id, s.label.offsetWidth + LABEL_GAP_PX]));
    const labelPoint = ({ x, z }) => {
      scratch.set(x, 0, z + 0.78).project(camera);
      return { px: ((scratch.x + 1) / 2) * size.width, py: ((1 - scratch.y) / 2) * size.height };
    };
    const pairs = (row, step) => row.slice(step).map((b, i) => ({ a: row[i], b, gap: b.px - row[i].px }));
    const room = (row, step) => Math.min(...pairs(row, step).map(({ a, b, gap }) => (2 * gap) / (labelWidth.get(a.id) + labelWidth.get(b.id))));
    const labelPlan = () => {
      const rows = new Map();
      for (const [id, p] of layout.spot) rows.set(p.z, [...(rows.get(p.z) ?? []), { id, ...labelPoint(p) }]);
      const frontFirst = [...rows].sort(([za], [zb]) => zb - za).map(([, row]) => row.sort((a, b) => a.px - b.px));
      return frontFirst.map((row, i) => {
        const canStagger = i > 0 && frontFirst[i - 1][0].py - row[0].py >= STAGGER_ROW_PX;
        const step = canStagger && room(row, 1) < 1 ? 2 : 1;
        return { row, step, room: room(row, step) };
      });
    };
    const fits = (c) => c.room >= 1;
    const cost = (c) => c.distance * (c.staggered ? STAGGER_COST : 1) * (1 + c.sideDrift * SIDE_DRIFT_COST);
    let best = null;
    for (let cols = current.cells.length; cols >= Math.min(3, current.cells.length); cols--) {
      layout = layoutStations(current.cells, cols, MIN_COL_PITCH);
      const distance = fitCamera();
      const plan = labelPlan();
      const c = { cols, distance, sideDrift: layout.sideDrift, room: Math.min(...plan.map((r) => r.room)), staggered: plan.some((r) => r.step === 2) };
      if (!best || (fits(c) && fits(best) ? cost(c) < cost(best) : fits(c) || (!fits(best) && c.room > best.room))) best = c;
    }
    let pitch = MIN_COL_PITCH;
    while (pitch < MAX_COL_PITCH) {
      layout = layoutStations(current.cells, best.cols, pitch + 0.1);
      if (fitCamera() > best.distance * 1.01) break;
      pitch += 0.1;
    }
    layout = layoutStations(current.cells, best.cols, pitch);
    fitCamera();
    const pxPerUnit = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fit.distance);
    robot.root.scale.setScalar(clamp(ROBOT_MIN_PX / (HEAD_TOP * pxPerUnit), ROBOT_SCALE, ROBOT_MAX_SCALE));
    // Vẫn thiếu chỗ thì chia khe giữa hai nhãn theo tỉ lệ độ dài của chúng
    const share = new Map();
    for (const { row, step } of labelPlan()) {
      row.forEach(({ id }, i) => {
        const station = stations.get(id);
        station.staggered = step === 2 && i % 2 === 1;
        station.label.classList.toggle('stagger', station.staggered);
      });
      for (const { a, b, gap } of pairs(row, step)) {
        const [wa, wb] = [labelWidth.get(a.id), labelWidth.get(b.id)];
        share.set(a.id, Math.min(share.get(a.id) ?? Infinity, (2 * gap * wa) / (wa + wb)));
        share.set(b.id, Math.min(share.get(b.id) ?? Infinity, (2 * gap * wb) / (wa + wb)));
      }
    }
    for (const [id, station] of stations) {
      const { x, z } = layout.spot.get(id);
      station.group.position.set(x, station.lift, z);
      station.label.style.maxWidth = share.get(id) < labelWidth.get(id) ? `${Math.floor(share.get(id) - LABEL_GAP_PX)}px` : '';
    }
    buildEdges();
    paintEdges();
    if (agent.stationId && !agent.walk) agent.position.copy(standSpot(agent.stationId));
  }

  function placeCamera(angles = view) {
    const distance = fit.distance * angles.zoom;
    const flat = Math.cos(angles.elevation) * distance;
    camera.position.set(fit.target.x + Math.sin(angles.azimuth) * flat, fit.target.y + Math.sin(angles.elevation) * distance, fit.target.z + Math.cos(angles.azimuth) * flat);
    camera.lookAt(fit.target);
    camera.updateMatrixWorld();
  }

  function screenExtent(points) {
    const extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const p of points) {
      scratch.copy(p).project(camera);
      extent.minX = Math.min(extent.minX, scratch.x);
      extent.maxX = Math.max(extent.maxX, scratch.x);
      extent.minY = Math.min(extent.minY, scratch.y);
      extent.maxY = Math.max(extent.maxY, scratch.y);
    }
    return extent;
  }

  // Phối cảnh làm khung lệch tâm: tìm khoảng cách bằng chia đôi, dời tâm theo phần lệch rồi tìm lại
  function fitCamera() {
    const points = [...layout.spot.values()].flatMap(({ x, z }) => STATION_BOUNDS.map(([dx, y, dz]) => new THREE.Vector3(x + dx, y, z + dz)));
    const box = new THREE.Box3().setFromPoints(points);
    box.getCenter(fit.target).setY(0.5);
    for (let pass = 0; pass < 2; pass++) {
      let near = 1;
      let far = 200;
      for (let i = 0; i < 24; i++) {
        fit.distance = (near + far) / 2;
        placeCamera(DEFAULT_VIEW);
        const e = screenExtent(points);
        if (Math.max(e.maxX, -e.minX) <= 0.92 && Math.max(e.maxY, -e.minY) <= 0.86) far = fit.distance;
        else near = fit.distance;
      }
      fit.distance = far;
      placeCamera(DEFAULT_VIEW);
      const e = screenExtent(points);
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fit.distance;
      fit.target
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), ((e.minX + e.maxX) / 2) * halfHeight * camera.aspect)
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), ((e.minY + e.maxY) / 2) * halfHeight);
    }
    scene.fog.near = fit.distance * 0.9;
    scene.fog.far = fit.distance * 2.8;
    grid.position.x = Math.round(fit.target.x);
    grid.position.z = Math.round(fit.target.z);
    placeCamera();
    return fit.distance;
  }

  function moveAgent(celebrate) {
    // Run xong thì stage = null: đứng ở bước chạy cuối cùng theo biên nhận
    const lastRan = current.receipts.findLast((r) => cellById.has(r.stage))?.stage;
    const targetId = cellById.has(current.stage) ? current.stage : lastRan ?? current.cells[0].id;
    if (targetId !== agent.stationId) {
      const target = standSpot(targetId);
      if (agent.stationId && !reducedMotion) {
        const points = walkPath(agent.position.clone(), target, layout.pitch);
        const length = pathLength(points);
        agent.walk = { points, length, elapsed: 0, duration: Math.min(MAX_WALK_SECONDS, length / WALK_SPEED) };
      } else {
        agent.position.copy(target);
      }
      agent.previousId = agent.stationId;
      agent.stationId = targetId;
    }
    if (celebrate && !reducedMotion) agent.jumpElapsed = 0;
  }

  function applyRun(run) {
    const { lane, side } = mainLane(run.cells);
    const next = { ...run, cells: [...lane, ...side] };
    const celebrate = next.status === 'done' && (current.status !== 'done' || !agent.stationId);
    current = next;
    cellById = new Map(next.cells.map((c) => [c.id, c]));
    const nextStructure = next.cells.map((c) => `${c.id}>${c.next}<${c.back}${c.side ? '~' : ''}${c.kind}`).join('|');
    const rebuilt = nextStructure !== structure;
    if (rebuilt) {
      structure = nextStructure;
      disposeStations();
      for (const cell of next.cells) stations.set(cell.id, buildStation(cell));
      agent.walk = null;
      agent.stationId = null;
    }
    for (const cell of next.cells) paintStation(stations.get(cell.id), cell);
    if (rebuilt) relayout();
    paintEdges();
    moveAgent(celebrate);
    wake();
  }

  function stepAgent(dt) {
    const faceCamera = () => Math.atan2(camera.position.x - agent.position.x, camera.position.z - agent.position.z);
    robot.body.position.y = 0;
    if (agent.walk) {
      const walk = agent.walk;
      walk.elapsed += dt;
      const before = agent.position.clone();
      pointAlong(walk.points, (Math.min(1, walk.elapsed / walk.duration) || 1) * walk.length, agent.position);
      if (agent.position.distanceToSquared(before) > 1e-8) robot.root.rotation.y = Math.atan2(agent.position.x - before.x, agent.position.z - before.z);
      poseRobot(robot, 'walking', time);
      if (walk.elapsed >= walk.duration) agent.walk = null;
    } else if (agent.jumpElapsed !== null) {
      agent.jumpElapsed += dt;
      const progress = Math.min(1, agent.jumpElapsed / JUMP_SECONDS);
      robot.body.position.y = Math.sin(Math.PI * progress) * JUMP_HEIGHT;
      robot.root.rotation.y = faceCamera();
      poseRobot(robot, progress < 1 ? 'cheer' : 'idle', time);
      if (progress >= 1) agent.jumpElapsed = null;
    } else {
      const mode = robotMode();
      robot.root.rotation.y = mode === 'typing' ? 0 : faceCamera();
      poseRobot(robot, mode, reducedMotion ? 0 : time);
    }
    robot.root.position.set(agent.position.x, 0, agent.position.z);
    const eyeState = current.status === 'done' ? 'done' : stateOf(agent.stationId);
    robot.glow.color.copy(eyeState === 'pending' || eyeState === 'skipped' ? palette.text : palette.state[eyeState]);
  }

  function stepEffects(dt) {
    const typing = !reducedMotion && !agent.walk && robotMode() === 'typing';
    const active = stations.get(agent.stationId);
    if (typing) active.screenMesh.getWorldPosition(scratch);
    particles.forEach((particle, i) => {
      particle.visible = typing;
      if (!typing) return;
      const progress = (time * 0.7 + i / PARTICLE_COUNT) % 1;
      particle.position.set(scratch.x + Math.sin(i * 2.4) * 0.14, scratch.y + 0.1 + progress * 0.6, scratch.z + Math.cos(i * 1.7) * 0.08);
      particle.scale.setScalar(1 - progress);
    });
    packet.visible = !reducedMotion && incomingEdge !== null;
    if (packet.visible) {
      const length = pathLength(incomingEdge.points);
      const speed = stateOf(current.stage) === 'waiting' ? 0.6 : 1.6;
      pointAlong(incomingEdge.points, (time * speed) % length, packet.position);
    }
    for (const station of stations.values()) {
      station.lift = reducedMotion ? station.liftTarget : station.lift + (station.liftTarget - station.lift) * Math.min(1, dt * 12);
      station.group.position.y = station.lift;
      const state = stateOf(station.id);
      if (!reducedMotion && ACTIVE_STATES.includes(state)) station.materials.rim.opacity = 0.55 + 0.45 * Math.abs(Math.sin(time * (state === 'running' ? 3 : 1.6)));
    }
  }

  function placeLabel(element, point) {
    scratch.copy(point).project(camera);
    element.hidden = scratch.z > 1;
    element.style.transform = `translate(${((scratch.x + 1) / 2) * size.width}px, ${((1 - scratch.y) / 2) * size.height}px)`;
  }

  function placeOverlay() {
    for (const station of stations.values()) placeLabel(station.label, new THREE.Vector3(station.group.position.x, 0, station.group.position.z + 0.78));
    const headTop = new THREE.Vector3(agent.position.x, (HEAD_TOP + robot.body.position.y) * robot.root.scale.y, agent.position.z);
    const waving = !agent.walk && robotMode() === 'waving';
    alertMark.classList.toggle('on', waving);
    placeLabel(alertMark, headTop);
    alertMark.hidden ||= !waving;
    bubble.classList.toggle('raised', waving);
    const hasText = bubble.textContent !== '';
    placeLabel(bubble, headTop);
    bubble.hidden ||= !hasText;
  }

  const animating = () => !reducedMotion && (agent.walk !== null || agent.jumpElapsed !== null || ['typing', 'waving'].includes(robotMode()));
  const settling = () => [...stations.values()].some((s) => Math.abs(s.lift - s.liftTarget) > 0.002);

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    time += dt;
    stepAgent(dt);
    stepEffects(dt);
    renderer.render(scene, camera);
    placeOverlay();
    if (animating() || settling()) wake();
  }

  function wake() {
    if (raf || !visible || document.hidden) return;
    if (!lastFrame) lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function sleep() {
    cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  }

  const raycaster = new THREE.Raycaster();
  function stationAt(clientX, clientY) {
    const labelHit = [...stations.values()].find((s) => {
      const r = s.label.getBoundingClientRect();
      return !s.label.hidden && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
    if (labelHit) return labelHit;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects([...stations.values()].map((s) => s.hit))[0];
    return hit ? stations.get(hit.object.userData.stageId) : null;
  }

  function setHovered(station) {
    if (station === hovered) return;
    if (hovered) {
      hovered.liftTarget = 0;
      hovered.label.classList.remove('hover');
    }
    hovered = station;
    if (hovered) {
      hovered.liftTarget = HOVER_LIFT;
      hovered.label.classList.add('hover');
    }
    root.classList.toggle('hovering', Boolean(hovered));
    wake();
  }

  function onPointerDown(e) {
    drag = { x: e.clientX, y: e.clientY, moved: false, from: { ...view } };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag) return setHovered(stationAt(e.clientX, e.clientY));
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    root.classList.add('dragging');
    view.azimuth = clamp(drag.from.azimuth - dx * 0.006, DEFAULT_VIEW.azimuth - LIMITS.azimuth, DEFAULT_VIEW.azimuth + LIMITS.azimuth);
    view.elevation = clamp(drag.from.elevation + dy * 0.005, LIMITS.elevationMin, LIMITS.elevationMax);
    placeCamera();
    wake();
  }

  function onPointerUp(e) {
    const wasClick = drag && !drag.moved;
    drag = null;
    root.classList.remove('dragging');
    if (!wasClick) return;
    const station = stationAt(e.clientX, e.clientY);
    if (station) onNodeClick(station.id, station.label, { x: e.clientX, y: e.clientY });
  }

  // Hết nấc zoom thì nhả cho trang cuộn tiếp
  function onWheel(e) {
    const zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.0012), LIMITS.zoomMin, LIMITS.zoomMax);
    if (zoom === view.zoom) return;
    e.preventDefault();
    view.zoom = zoom;
    placeCamera();
    wake();
  }

  function onDoubleClick() {
    view = { ...DEFAULT_VIEW };
    placeCamera();
    wake();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', () => setHovered(null));
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = root.getBoundingClientRect();
    if (!width || !height) return;
    Object.assign(size, { width, height });
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    relayout();
    wake();
  });
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else sleep();
  });
  const onVisibilityChange = () => (document.hidden ? sleep() : wake());
  document.addEventListener('visibilitychange', onVisibilityChange);

  const box = root.getBoundingClientRect();
  Object.assign(size, { width: box.width || 1, height: box.height || 1 });
  renderer.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  applyRun(run);
  resizeObserver.observe(root);
  intersectionObserver.observe(root);

  return {
    update: applyRun,
    setActivity(text) {
      const activity = (text ?? '').trim();
      bubble.textContent = activity.length > BUBBLE_MAX_CHARS ? `${activity.slice(0, BUBBLE_MAX_CHARS - 1)}…` : activity;
      bubble.title = activity;
      wake();
    },
    destroy() {
      sleep();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disposeEdges();
      disposeStations();
      const { platform, ...otherGeometry } = geometry;
      const disposables = new Set([platform, otherGeometry, shared, edgeMaterial, arcMaterial].flatMap(Object.values));
      scene.traverse((object) => {
        if (object.geometry) disposables.add(object.geometry);
        if (object.material) disposables.add(object.material);
        if (object.material?.map) disposables.add(object.material.map);
      });
      for (const item of disposables) item.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}
