const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const stage = document.getElementById('stage');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const speedEl = document.getElementById('speed');
const startBtn = document.getElementById('start');
const brakeBtn = document.getElementById('brake');
const gasBtn = document.getElementById('gas');
const warningEl = document.getElementById('warning');
const overlayEl = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayReason = document.getElementById('overlay-reason');
const overlayScore = document.getElementById('overlay-score');
const overlayHint = document.getElementById('overlay-hint');

// Logica jocului lucrează în coordonate 2D (pixeli "virtuali"), apoi e mapată în 3D.
const LANES = 7;
const LANE_WIDTH = 100;
const ROAD_W = LANES * LANE_WIDTH;
const CAR_W = 60;
const CAR_H = 100;
const CROSSING_H = 60;
const EDGE = 6;
const PLAYER_Y = 480;
const SPAWN_Y = -900;
const DESPAWN_Y = 800;
const SCROLL_SPAN = 1760;
const S = 1 / 40;
const HALF = (ROAD_W / 2) * S;
const SHORE_X = -(HALF + 8);
const ENEMY_COLORS = [0xe53935, 0xfdd835, 0x8e24aa, 0xfb8c00, 0x00acc1, 0xffffff, 0x6d4c41, 0x546e7a];
const PED_COLORS = [0xff4081, 0x3f51b5, 0xff9800, 0x009688, 0x9c27b0, 0xcddc39];
const UMBRELLA_COLORS = [0xe53935, 0xffeb3b, 0x1e88e5, 0xff7043, 0x8e24aa, 0x43a047];
const POLICE_WAIT = 3000;
const SKID_TIME = 1300;
// Tipuri de vehicule: max = viteză maximă (x viteza de croazieră), inset = cât de îngustă e zona de coliziune.
const VEHICLES = {
  sedan: { name: 'Sedan', max: 1.8, accel: 0.1, brake: 0.3, inset: 6, skid: 1 },
  sport: { name: 'Mașină sport', max: 2.2, accel: 0.14, brake: 0.33, inset: 8, skid: 1.2 },
  suv: { name: 'SUV', max: 1.6, accel: 0.08, brake: 0.26, inset: 3, skid: 0.6 },
  pickup: { name: 'Camionetă', max: 1.7, accel: 0.09, brake: 0.27, inset: 4, skid: 0.8 },
  moto: { name: 'Motocicletă', max: 2.0, accel: 0.15, brake: 0.28, inset: 20, skid: 1.6 },
};
const PLAYER_COLORS = [
  { name: 'Verde', value: '#43a047' }, { name: 'Roșu', value: '#e53935' }, { name: 'Albastru', value: '#1e88e5' },
  { name: 'Galben', value: '#fdd835' }, { name: 'Portocaliu', value: '#fb8c00' }, { name: 'Mov', value: '#8e24aa' },
  { name: 'Negru', value: '#212121' }, { name: 'Alb', value: '#f5f5f5' }, { name: 'Argintiu', value: '#b0bec5' },
  { name: 'Roz', value: '#ec407a' }, { name: 'Turcoaz', value: '#00acc1' }, { name: 'Auriu', value: '#c9a227' },
];
const STAT_DEFS = [
  ['Viteză maximă', v => v.max / 2.2],
  ['Accelerație', v => v.accel / 0.15],
  ['Frânare', v => v.brake / 0.33],
  ['Aderență', v => 0.6 / v.skid],
  ['Agilitate', v => v.inset / 20],
];
const DAY_LENGTH = 60000;
const DAY_FADE = 4000;
const NIGHT_SKY = 0x0b1026;
const TUNNEL_SKY = 0x2b1d12;
// La fiecare ieșire din tunel cerul trece la următoarea temă.
const THEMES = [
  { name: 'Zi senină', sky: 0x7ec8f0, sun: 0xfff3e0 },
  { name: 'Apus de soare', sky: 0xf4a261, sun: 0xff9e5e },
  { name: 'Cer roz', sky: 0xf8bbd0, sun: 0xffe0f0 },
  { name: 'Cer înnorat', sky: 0x90a4ae, sun: 0xcfd8dc },
];

const toX = x => (x - ROAD_W / 2) * S;
const toZ = y => (y - PLAYER_Y) * S;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const laneX = lane => lane * LANE_WIDTH + (LANE_WIDTH - CAR_W) / 2;
// Banda 0 (cea mai din stânga) e cea mai rapidă, banda 6 cea mai lentă.
const laneSpeedFactor = lane => 1.5 - lane * (1.1 / (LANES - 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

let THREE, renderer, scene, camera, sun, hemi, headSpot, sky, stars, moon, sea, playerMesh, dashes, decor;
let envColor, tmpColor;
let player, enemies, crossings, lights, police, roadOffset, score, speed, currentSpeed, braking, accelerating;
let puddles, tunnels, particles, dayClock, themeIndex, tunnelF, distSincePuddle, nextPuddleAt;
let spawnTimer, distSinceObstacle, nextObstacleAt, running, paused, gameOver, gameOverReason, lastTime;
const daytimeEl = document.getElementById('daytime');
const garageEl = document.getElementById('garage');
const helpEl = document.getElementById('help-panel');
let garageOpen = false;
let pausedByGarage = false;
let custom = JSON.parse(localStorage.getItem('carGameCustom') || 'null') || { type: 'sedan', color: '#43a047' };
if (!VEHICLES[custom.type]) custom.type = 'sedan';
const vehicle = () => VEHICLES[custom.type];
let notice = { text: '', until: 0 };
let best = Number(localStorage.getItem('carGameBest')) || 0;
bestEl.textContent = best;

const geo = {};
const mat = {};

function initThree() {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  stage.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ec8f0);
  scene.fog = new THREE.Fog(0x7ec8f0, 22, 48);

  camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 120);

  envColor = new THREE.Color();
  tmpColor = new THREE.Color();
  hemi = new THREE.HemisphereLight(0xffffff, 0xd8c08a, 0.95);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3e0, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -28, near: 1, far: 60 });
  scene.add(sun, sun.target);

  geo.box = new THREE.BoxGeometry(1, 1, 1);
  geo.wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 16).rotateZ(Math.PI / 2);
  geo.head = new THREE.SphereGeometry(0.14, 12, 12);
  geo.pole = new THREE.CylinderGeometry(0.04, 0.04, 2, 8);
  geo.tallPole = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8);
  geo.lamp = new THREE.SphereGeometry(0.13, 12, 12);
  geo.palmTrunk = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7);
  geo.coconut = new THREE.SphereGeometry(0.12, 8, 8);
  geo.umbPole = new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6);
  geo.canopy = new THREE.ConeGeometry(1, 0.45, 12);
  geo.mast = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
  geo.sail = new THREE.ConeGeometry(0.8, 2, 3).scale(1, 1, 0.08);
  geo.motoWheel = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16).rotateZ(Math.PI / 2);
  geo.helmet = new THREE.SphereGeometry(0.18, 14, 14);
  geo.puddle = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  geo.drop = new THREE.SphereGeometry(0.07, 6, 6);
  geo.lampPost = new THREE.CylinderGeometry(0.06, 0.08, 3.8, 8);
  geo.dome = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);

  mat.road = new THREE.MeshStandardMaterial({ color: 0x4f4f4f, roughness: 0.9 });
  mat.sand = new THREE.MeshStandardMaterial({ color: 0xf2d38b, roughness: 1 });
  mat.seaFloor = new THREE.MeshStandardMaterial({ color: 0x0d47a1 });
  mat.sea = new THREE.MeshStandardMaterial({
    color: 0x1e88e5, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92, flatShading: true,
  });
  mat.promenade = new THREE.MeshStandardMaterial({ color: 0xd7ccc8 });
  mat.white = new THREE.MeshStandardMaterial({ color: 0xfafafa });
  mat.yellow = new THREE.MeshStandardMaterial({ color: 0xfbc02d });
  mat.glass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.2 });
  mat.tire = new THREE.MeshStandardMaterial({ color: 0x111111 });
  mat.head = new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xfff59d, emissiveIntensity: 0.8 });
  mat.skin = new THREE.MeshStandardMaterial({ color: 0xffcc80 });
  mat.pants = new THREE.MeshStandardMaterial({ color: 0x263238 });
  mat.palmTrunk = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
  mat.palmLeaf = new THREE.MeshStandardMaterial({ color: 0x388e3c, side: THREE.DoubleSide });
  mat.coconut = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
  mat.pole = new THREE.MeshStandardMaterial({ color: 0x9e9e9e });
  mat.sign = new THREE.MeshStandardMaterial({ color: 0x1565c0 });
  mat.housing = new THREE.MeshStandardMaterial({ color: 0x212121 });
  mat.policeBlue = new THREE.MeshStandardMaterial({ color: 0x0d47a1 });
  mat.puddle = new THREE.MeshStandardMaterial({
    color: 0x5a8fb8, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.8,
  });
  mat.wet = new THREE.MeshStandardMaterial({ color: 0x353535, roughness: 0.4, transparent: true, opacity: 0.7 });
  mat.splash = new THREE.MeshStandardMaterial({ color: 0xbbdefb, transparent: true, opacity: 0.85 });
  mat.bulb = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 0 });
  mat.concrete = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.9 });
  mat.portal = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9 });
  mat.tunnelLamp = new THREE.MeshStandardMaterial({ color: 0xffcc80, emissive: 0xffa726, emissiveIntensity: 2 });
  mat.dune = new THREE.MeshStandardMaterial({ color: 0x9ccc65, roughness: 1 });

  buildWorld();
  buildSky();
  headSpot = new THREE.SpotLight(0xfff2cc, 0, 40, 0.55, 0.5, 1);
  headSpot.position.set(0, 0.8, -1.2);
  headSpot.target.position.set(0, 0, -14);
  rebuildPlayer();
}

function rebuildPlayer() {
  if (!scene) return;
  if (playerMesh) scene.remove(playerMesh);
  playerMesh = makeVehicle(custom.type, custom.color);
  playerMesh.add(headSpot, headSpot.target);
  scene.add(playerMesh);
}

function buildSky() {
  sky = new THREE.Group();
  const positions = [];
  for (let i = 0; i < 600; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = rand(0.05, 1.3);
    positions.push(Math.sin(phi) * Math.cos(theta) * 85, Math.cos(phi) * 85 + 5, Math.sin(phi) * Math.sin(theta) * 85);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.5, transparent: true, opacity: 0, fog: false,
  }));
  moon = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xfffde7, transparent: true, opacity: 0, fog: false }));
  moon.position.set(-35, 40, -70);
  sky.add(stars, moon);
  scene.add(sky);
}

function makeStreetLamp(side) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(geo.lampPost, mat.pole);
  pole.position.y = 1.9;
  pole.castShadow = true;
  const bulb = box(0.35, 0.12, 0.28, mat.bulb, -side * 0.6, 3.66, 0);
  bulb.castShadow = false;
  g.add(pole, box(0.65, 0.08, 0.08, mat.pole, -side * 0.32, 3.76, 0), bulb);
  g.position.x = side * (HALF + 1.7);
  return g;
}

function makeTunnel(L) {
  const g = new THREE.Group();
  const len = L * S;
  const H = 4.4;
  const outer = HALF + 0.8;
  for (const side of [-1, 1]) g.add(box(0.8, H, len, mat.concrete, side * (HALF + 0.4), H / 2, 0));
  g.add(box(outer * 2, 0.5, len, mat.concrete, 0, H + 0.25, 0));
  for (let z = -len / 2 + 1; z < len / 2; z += 2.5) {
    for (const x of [-HALF * 0.5, HALF * 0.5]) {
      const lamp = box(0.9, 0.08, 0.6, mat.tunnelLamp, x, H - 0.03, z);
      lamp.castShadow = false;
      g.add(lamp);
    }
  }
  for (const end of [-1, 1]) {
    const z = end * len / 2;
    g.add(box(outer * 2 + 8, 2.5, 0.6, mat.portal, 0, H + 1.25, z));
    g.add(box(outer * 2, 0.3, 0.64, mat.yellow, 0, H + 0.12, z));
    for (const side of [-1, 1]) g.add(box(4, H, 0.6, mat.portal, side * (outer + 2), H / 2, z));
  }
  const hill = new THREE.Mesh(geo.dome, mat.dune);
  hill.scale.set(outer + 7, 4, len / 2 - 0.3);
  hill.position.y = H + 0.5;
  hill.castShadow = true;
  g.add(hill);
  return g;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo.box, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addDecor(obj, k, spacing) {
  obj.userData.k = k;
  obj.userData.spacing = spacing;
  decor.push(obj);
  scene.add(obj);
}

function buildWorld() {
  const sandW = 120;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(sandW, 120), mat.sand);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(SHORE_X + sandW / 2, -0.02, -25);
  sand.receiveShadow = true;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 120), mat.seaFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(SHORE_X - 50, -1, -25);

  sea = new THREE.Mesh(new THREE.PlaneGeometry(100, 110, 50, 55).rotateX(-Math.PI / 2), mat.sea);
  sea.position.set(SHORE_X - 49.5, -0.03, -25);
  sea.receiveShadow = true;

  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * S, 100), mat.road);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -25;
  road.receiveShadow = true;
  scene.add(sand, floor, sea, road);

  for (const side of [-1, 1]) {
    scene.add(box(0.12, 0.01, 100, mat.yellow, side * (HALF - 0.1), 0.005, -25));
    scene.add(box(2, 0.2, 100, mat.promenade, side * (HALF + 1), 0.1, -25));
  }

  dashes = [];
  for (let i = 1; i < LANES; i++) {
    for (let k = 0; k < SCROLL_SPAN / 80; k++) {
      const d = box(0.15, 0.01, 1, mat.white, toX(i * LANE_WIDTH), 0.006, 0);
      d.castShadow = false;
      d.userData.k = k;
      dashes.push(d);
      scene.add(d);
    }
  }

  decor = [];
  for (let k = 0; k < SCROLL_SPAN / 160; k++) {
    const left = makePalm();
    left.position.x = -(HALF + rand(2.4, 3));
    addDecor(left, k, 160);
    const right = makePalm();
    right.position.x = HALF + rand(2.6, 5);
    addDecor(right, k + 0.5, 160);
  }
  for (let k = 0; k < SCROLL_SPAN / 220; k++) {
    const left = makeUmbrella();
    left.position.x = -(HALF + rand(4, 6.5));
    addDecor(left, k + 0.3, 220);
    const right = makeUmbrella();
    right.position.x = HALF + rand(6, 11);
    addDecor(right, k + 0.7, 220);
  }
  for (let k = 0; k < SCROLL_SPAN / 220; k++) {
    addDecor(makeStreetLamp(-1), k + 0.1, 220);
    addDecor(makeStreetLamp(1), k + 0.6, 220);
  }
  for (let k = 0; k < SCROLL_SPAN / 440; k++) {
    const boat = makeBoat();
    boat.position.x = SHORE_X - rand(6, 22);
    boat.userData.phase = rand(0, Math.PI * 2);
    addDecor(boat, k + 0.2, 440);
  }
}

function makePalm() {
  const g = new THREE.Group();
  const lean = rand(-0.18, 0.18);
  const trunk = new THREE.Mesh(geo.palmTrunk, mat.palmTrunk);
  trunk.position.set(-Math.sin(lean) * 1.6, 1.6, 0);
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  const top = new THREE.Group();
  top.position.set(-Math.sin(lean) * 3.2, 3.15, 0);
  for (let i = 0; i < 7; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.set(0, (i / 7) * Math.PI * 2, -0.5);
    const leaf = box(1.9, 0.04, 0.45, mat.palmLeaf, 0.95, 0, 0);
    pivot.add(leaf);
    top.add(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(geo.coconut, mat.coconut);
    c.position.set(Math.cos(i * 2.1) * 0.15, -0.15, Math.sin(i * 2.1) * 0.15);
    top.add(c);
  }
  g.add(top);
  g.scale.setScalar(rand(0.85, 1.2));
  return g;
}

function makeUmbrella() {
  const g = new THREE.Group();
  const color = pick(UMBRELLA_COLORS);
  const pole = new THREE.Mesh(geo.umbPole, mat.white);
  pole.position.y = 0.85;
  const canopy = new THREE.Mesh(geo.canopy, new THREE.MeshStandardMaterial({ color }));
  canopy.position.y = 1.75;
  pole.castShadow = canopy.castShadow = true;
  const towel = box(0.8, 0.02, 1.6, new THREE.MeshStandardMaterial({ color: pick(UMBRELLA_COLORS) }), 0.9, 0.01, 0.2);
  towel.castShadow = false;
  g.add(pole, canopy, towel);
  return g;
}

function makeBoat() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.4, 2.2, mat.white, 0, 0.15, 0));
  const mast = new THREE.Mesh(geo.mast, mat.palmTrunk);
  mast.position.y = 1.5;
  const sail = new THREE.Mesh(geo.sail, new THREE.MeshStandardMaterial({ color: pick([0xffffff, 0xff7043, 0xffeb3b]) }));
  sail.position.set(0, 1.5, 0.35);
  sail.rotation.y = Math.PI / 2;
  g.add(mast, sail);
  return g;
}

function scrollY(k, spacing) {
  return SPAWN_Y - 80 + ((k * spacing + roadOffset) % SCROLL_SPAN);
}

function scrollZ(k, spacing) {
  return toZ(scrollY(k, spacing));
}

function vehicleBase(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xd50000, emissive: 0xff1744, emissiveIntensity: 0.3 });
  g.userData.tail = tail;
  return { g, paint, tail };
}

function addWheels(g, halfW, halfL, scale = 1, wheelGeo = geo.wheel) {
  for (const x of halfW ? [-halfW, halfW] : [0]) {
    for (const z of [-halfL, halfL]) {
      const w = new THREE.Mesh(wheelGeo, mat.tire);
      w.scale.setScalar(scale);
      w.position.set(x, 0.3 * scale, z);
      w.castShadow = true;
      g.add(w);
    }
  }
}

function addLights(g, halfW, y, halfL, tail, size = 0.3) {
  for (const x of halfW ? [-halfW, halfW] : [0]) {
    g.add(box(size, 0.15, 0.05, mat.head, x, y, -halfL - 0.01));
    g.add(box(size, 0.15, 0.05, tail, x, y, halfL + 0.01));
  }
}

function makeCar(color) {
  const { g, paint, tail } = vehicleBase(color);
  g.add(box(1.4, 0.5, 2.4, paint, 0, 0.45, 0));
  g.add(box(1.15, 0.45, 1.2, mat.glass, 0, 0.92, 0.15));
  addWheels(g, 0.7, 0.8);
  addLights(g, 0.455, 0.5, 1.2, tail);
  return g;
}

function makeSport(color) {
  const { g, paint, tail } = vehicleBase(color);
  g.add(box(1.5, 0.38, 2.6, paint, 0, 0.38, 0));
  g.add(box(1.1, 0.32, 1.0, mat.glass, 0, 0.73, 0.25));
  g.add(box(0.22, 0.01, 1.1, mat.white, -0.22, 0.575, -0.7), box(0.22, 0.01, 1.1, mat.white, 0.22, 0.575, -0.7));
  g.add(box(0.06, 0.3, 0.06, mat.housing, -0.5, 0.7, 1.15), box(0.06, 0.3, 0.06, mat.housing, 0.5, 0.7, 1.15));
  g.add(box(1.5, 0.06, 0.35, paint, 0, 0.86, 1.15));
  addWheels(g, 0.72, 0.85, 0.95);
  addLights(g, 0.5, 0.42, 1.3, tail);
  return g;
}

function makeSuv(color) {
  const { g, paint, tail } = vehicleBase(color);
  g.add(box(1.55, 0.75, 2.5, paint, 0, 0.72, 0));
  g.add(box(1.45, 0.55, 1.75, mat.glass, 0, 1.37, 0.2));
  g.add(box(1.3, 0.06, 1.4, mat.housing, 0, 1.68, 0.2));
  const spare = new THREE.Mesh(geo.wheel, mat.tire);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, 0.85, 1.32);
  g.add(spare);
  addWheels(g, 0.72, 0.85, 1.2);
  addLights(g, 0.5, 0.8, 1.25, tail);
  return g;
}

function makePickup(color) {
  const { g, paint, tail } = vehicleBase(color);
  g.add(box(1.5, 0.55, 2.7, paint, 0, 0.55, 0));
  g.add(box(1.4, 0.6, 1.0, paint, 0, 1.12, -0.45));
  g.add(box(1.42, 0.32, 0.8, mat.glass, 0, 1.2, -0.45), box(1.2, 0.35, 0.04, mat.glass, 0, 1.18, -0.96));
  g.add(box(1.3, 0.02, 1.3, mat.housing, 0, 0.83, 0.6));
  for (const side of [-1, 1]) g.add(box(0.08, 0.3, 1.4, paint, side * 0.71, 0.97, 0.6));
  g.add(box(1.5, 0.3, 0.08, paint, 0, 0.97, 1.31));
  addWheels(g, 0.72, 0.9, 1.1);
  addLights(g, 0.5, 0.6, 1.35, tail);
  return g;
}

function makeMoto(color) {
  const { g, paint, tail } = vehicleBase(color);
  const jacket = new THREE.MeshStandardMaterial({ color: 0x263238 });
  addWheels(g, 0, 0.7, 1.05, geo.motoWheel);
  g.add(box(0.3, 0.3, 0.9, paint, 0, 0.62, -0.05));
  g.add(box(0.28, 0.1, 0.6, mat.housing, 0, 0.82, 0.35));
  const fork = box(0.08, 0.6, 0.08, mat.pole, 0, 0.62, -0.62);
  fork.rotation.x = -0.35;
  g.add(fork, box(0.7, 0.05, 0.05, mat.housing, 0, 1.0, -0.55));
  addLights(g, 0, 0.85, 0.75, tail, 0.18);
  const torso = box(0.38, 0.55, 0.25, jacket, 0, 1.15, 0.15);
  torso.rotation.x = -0.4;
  const helmet = new THREE.Mesh(geo.helmet, paint);
  helmet.position.set(0, 1.55, -0.05);
  helmet.castShadow = true;
  g.add(torso, helmet, box(0.22, 0.08, 0.05, mat.glass, 0, 1.56, -0.22));
  for (const side of [-1, 1]) {
    g.add(box(0.08, 0.08, 0.55, jacket, side * 0.22, 1.12, -0.3));
    g.add(box(0.1, 0.45, 0.12, mat.pants, side * 0.18, 0.75, 0.25));
  }
  g.userData.lean = true;
  return g;
}

function makeVehicle(type, color) {
  const builders = { sedan: makeCar, sport: makeSport, suv: makeSuv, pickup: makePickup, moto: makeMoto };
  return (builders[type] || makeCar)(color);
}

function makePoliceCar() {
  const g = makeCar(0xf5f5f5);
  g.add(box(1.42, 0.14, 1.7, mat.policeBlue, 0, 0.5, 0));
  const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1744, emissiveIntensity: 0 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x000040, emissive: 0x2979ff, emissiveIntensity: 0 });
  g.add(box(0.4, 0.14, 0.3, red, -0.22, 1.22, 0.15), box(0.4, 0.14, 0.3, blue, 0.22, 1.22, 0.15));
  g.userData.siren = [red, blue];
  return g;
}

function makeCrossing() {
  const g = new THREE.Group();
  for (let x = EDGE + 8; x < ROAD_W - EDGE - 10; x += 36) {
    const s = box(20 * S, 0.02, CROSSING_H * S, mat.white, toX(x + 10), 0.01, 0);
    s.castShadow = false;
    g.add(s);
  }
  const stopLine = box((ROAD_W - EDGE * 2) * S, 0.02, 0.12, mat.white, 0, 0.01, (CROSSING_H / 2 + 16) * S);
  stopLine.castShadow = false;
  g.add(stopLine);
  for (const side of [-1, 1]) {
    const x = side * (HALF + 0.6);
    const pole = new THREE.Mesh(geo.pole, mat.pole);
    pole.position.set(x, 1.2, 0.9);
    pole.castShadow = true;
    g.add(pole, box(0.6, 0.6, 0.05, mat.sign, x, 2.2, 0.9));
    g.add(box(0.15, 0.3, 0.06, mat.white, x, 2.2, 0.9));
  }
  return g;
}

function makePedestrian(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color });
  const legs = [-0.09, 0.09].map(x => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.45, 0);
    pivot.add(box(0.12, 0.45, 0.12, mat.pants, 0, -0.22, 0));
    g.add(pivot);
    return pivot;
  });
  g.add(box(0.36, 0.5, 0.22, shirt, 0, 0.7, 0));
  const head = new THREE.Mesh(geo.head, mat.skin);
  head.position.y = 1.1;
  head.castShadow = true;
  g.add(head);
  g.userData.legs = legs;
  return g;
}

const LAMP_COLORS = { red: 0xff1744, yellow: 0xffc400, green: 0x00e676 };

function makeLight() {
  const g = new THREE.Group();
  const line = box((ROAD_W - EDGE * 2) * S, 0.02, 0.15, mat.white, 0, 0.01, 0);
  line.castShadow = false;
  g.add(line);
  const lamps = {};
  for (const key of Object.keys(LAMP_COLORS)) {
    lamps[key] = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: LAMP_COLORS[key], emissiveIntensity: 0 });
  }
  for (const side of [-1, 1]) {
    const x = side * (HALF + 0.6);
    const pole = new THREE.Mesh(geo.tallPole, mat.pole);
    pole.position.set(x, 1.3, -0.3);
    pole.castShadow = true;
    g.add(pole, box(0.4, 1.1, 0.3, mat.housing, x, 3.05, -0.3));
    ['red', 'yellow', 'green'].forEach((key, i) => {
      const lamp = new THREE.Mesh(geo.lamp, lamps[key]);
      lamp.position.set(x, 3.4 - i * 0.35, -0.12);
      g.add(lamp);
    });
  }
  g.userData.lamps = lamps;
  return g;
}

function clearScene() {
  [enemies, crossings, lights, puddles, tunnels, particles].forEach(list => list?.forEach(o => scene.remove(o.mesh)));
  if (police) scene.remove(police.mesh);
}

function reset() {
  clearScene();
  player = { lane: 3, x: laneX(3), y: PLAYER_Y, skid: null, inset: vehicle().inset };
  enemies = [];
  crossings = [];
  lights = [];
  puddles = [];
  tunnels = [];
  particles = [];
  dayClock = 0;
  themeIndex = 0;
  tunnelF = 0;
  distSincePuddle = 0;
  nextPuddleAt = rand(500, 900);
  police = null;
  roadOffset = 0;
  score = 0;
  speed = 4;
  currentSpeed = speed;
  braking = false;
  accelerating = false;
  spawnTimer = 0;
  distSinceObstacle = 0;
  nextObstacleAt = rand(600, 1000);
  paused = false;
  gameOver = false;
  gameOverReason = '';
  notice = { text: '', until: 0 };
}

function showNotice(text, ms = 2500) {
  notice = { text, until: performance.now() + ms };
}

function pedOnRoad(p) {
  return p.started && p.x > EDGE && p.x < ROAD_W - EDGE;
}

function crossingActive(c) {
  return c.peds.some(pedOnRoad);
}

function spawnCrossing() {
  const c = { type: 'crossing', y: SPAWN_Y - 50, peds: [], scored: false, violated: false, mesh: makeCrossing() };
  if (Math.random() < 0.8) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const fromLeft = Math.random() < 0.5;
      const p = {
        x: fromLeft ? -20 - i * 16 : ROAD_W + 20 + i * 16,
        dir: fromLeft ? 1 : -1,
        speed: rand(2.5, 3.5),
        lineOffset: rand(12, CROSSING_H - 12),
        delay: rand(0, 900),
        started: false,
        cancelled: false,
        step: 0,
        mesh: makePedestrian(pick(PED_COLORS)),
      };
      p.mesh.rotation.y = -p.dir * Math.PI / 2;
      c.mesh.add(p.mesh);
      c.peds.push(p);
    }
  }
  scene.add(c.mesh);
  crossings.push(c);
}

// Mașinile mai rapide decât jucătorul apar din spate și îl depășesc; cele mai lente apar în față.
function spawnEnemy() {
  const lane = Math.floor(Math.random() * LANES);
  const cruise = speed * laneSpeedFactor(lane) * rand(0.92, 1.08);
  const fromBehind = cruise > currentSpeed + 0.3;
  const y = fromBehind ? DESPAWN_Y - 10 : SPAWN_Y;
  const blocked = enemies.some(e => e.lane === lane && Math.abs(e.y - y) < CAR_H * 2.5) ||
    (fromBehind && police && Math.abs(police.x - laneX(lane)) < CAR_W);
  if (blocked) return;
  const e = { lane, x: laneX(lane), y, cruise, v: cruise, overtaken: !fromBehind, mesh: makeVehicle(pick(['sedan', 'sedan', 'sport', 'suv', 'pickup']), pick(ENEMY_COLORS)) };
  scene.add(e.mesh);
  enemies.push(e);
}

const LIGHT_NEXT = { green: 'yellow', yellow: 'red', red: 'green' };
const LIGHT_TIME = { green: () => rand(3000, 5000), yellow: () => 1400, red: () => rand(3000, 4500) };

function spawnLight() {
  const state = pick(['green', 'green', 'red']);
  const l = { type: 'light', y: SPAWN_Y - 50, state, timer: LIGHT_TIME[state](), passed: false, mesh: makeLight() };
  scene.add(l.mesh);
  lights.push(l);
}

function updateLights(dt, f) {
  for (const l of lights) {
    l.y += currentSpeed * f;
    l.timer -= dt;
    if (l.timer <= 0) {
      l.state = LIGHT_NEXT[l.state];
      l.timer = LIGHT_TIME[l.state]();
    }
    if (!l.passed && l.y >= player.y) {
      l.passed = true;
      if (l.state === 'red') startPolice('Ai trecut pe roșu!');
      else score += 15;
    }
  }
  lights = lights.filter(l => {
    if (l.y < DESPAWN_Y) return true;
    scene.remove(l.mesh);
    return false;
  });
}

function startPolice(reason) {
  if (police) return;
  police = { x: player.x, y: DESPAWN_Y + 40, reason, phase: 'chase', timer: 0, leaveX: 0, mesh: makePoliceCar() };
  scene.add(police.mesh);
  showNotice(`ÎNCĂLCARE: ${reason}`);
}

// Poliția vine din spate; dacă oprești complet primești amendă, altfel jocul se termină.
function updatePolice(dt, f) {
  if (!police) return null;
  const p = police;
  if (p.phase === 'chase') {
    p.x += (player.x - p.x) * Math.min(1, 0.12 * f);
    const targetY = player.y + CAR_H + 25;
    p.y = Math.max(targetY, p.y - 7 * f);
    if (p.y <= targetY) {
      p.timer += dt;
      if (currentSpeed < 0.2) {
        score = Math.max(0, score - 100);
        showNotice('AMENDĂ: -100 puncte. Drum bun!', 3000);
        p.phase = 'leave';
        p.leaveX = laneX(player.lane > 0 ? player.lane - 1 : player.lane + 1);
      } else if (p.timer > POLICE_WAIT) {
        return `Prins de poliție! ${p.reason}`;
      }
    }
  } else {
    p.x += (p.leaveX - p.x) * Math.min(1, 0.1 * f);
    if (Math.abs(p.leaveX - p.x) < 8) p.y -= 9 * f;
    if (p.y < SPAWN_Y - 200) {
      scene.remove(p.mesh);
      police = null;
    }
  }
  return null;
}

function tunnelSpans(y, margin = 0) {
  return tunnels.some(t => y >= t.y - margin && y <= t.y + t.L + margin);
}

function spawnPuddle() {
  if (tunnelSpans(SPAWN_Y, 120)) return;
  const lane = Math.floor(Math.random() * LANES);
  const p = { x: laneX(lane) + CAR_W / 2 + rand(-12, 12), y: SPAWN_Y, w: rand(70, 95), h: rand(60, 90), hit: false };
  p.mesh = new THREE.Group();
  const wet = new THREE.Mesh(geo.puddle, mat.wet);
  wet.scale.set(p.w * S * 0.62, 1, p.h * S * 0.62);
  wet.position.y = 0.008;
  const water = new THREE.Mesh(geo.puddle, mat.puddle);
  water.scale.set(p.w * S / 2, 1, p.h * S / 2);
  water.position.y = 0.014;
  wet.receiveShadow = water.receiveShadow = true;
  p.mesh.add(wet, water);
  scene.add(p.mesh);
  puddles.push(p);
}

function splash() {
  const cx = toX(player.x + CAR_W / 2);
  const cz = toZ(player.y + CAR_H / 2);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(geo.drop, mat.splash);
    m.position.set(cx + rand(-0.8, 0.8), 0.2, cz + rand(-1, 1));
    scene.add(m);
    particles.push({ mesh: m, vx: rand(-0.09, 0.09), vy: rand(0.08, 0.2), vz: rand(-0.05, 0.05), life: 900 });
  }
}

function startSkid() {
  const dir = player.lane === 0 ? 1 : player.lane === LANES - 1 ? -1 : pick([-1, 1]);
  const duration = SKID_TIME * vehicle().skid;
  player.skid = { time: duration, duration, dir, t: 0 };
  currentSpeed *= 0.85;
  splash();
  showNotice('DERAPAJ! Ai intrat în băltoacă!', 1500);
}

function updatePuddles(f) {
  for (const p of puddles) {
    p.y += currentSpeed * f;
    const hit = overlaps(player.x + 10, player.y + 10, CAR_W - 20, CAR_H - 20, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    if (hit && !p.hit && !player.skid) {
      p.hit = true;
      startSkid();
    }
  }
  puddles = puddles.filter(p => {
    if (p.y < DESPAWN_Y) return true;
    scene.remove(p.mesh);
    return false;
  });
}

function updateParticles(dt, f) {
  for (const p of particles) {
    p.vy -= 0.012 * f;
    p.mesh.position.x += p.vx * f;
    p.mesh.position.y += p.vy * f;
    p.mesh.position.z += (p.vz + currentSpeed * S) * f;
    p.life -= dt;
  }
  particles = particles.filter(p => {
    if (p.life > 0 && p.mesh.position.y > 0) return true;
    scene.remove(p.mesh);
    return false;
  });
}

function spawnTunnel() {
  const L = rand(500, 800);
  const t = { y: SPAWN_Y - 50 - L, L, entered: false, exited: false, mesh: makeTunnel(L) };
  scene.add(t.mesh);
  tunnels.push(t);
  return L;
}

function updateTunnels(f) {
  let inside = false;
  for (const t of tunnels) {
    t.y += currentSpeed * f;
    if (t.y + t.L >= player.y && t.y <= player.y + CAR_H) {
      inside = true;
      t.entered = true;
    }
    if (t.entered && !t.exited && t.y > player.y + CAR_H) {
      t.exited = true;
      themeIndex = (themeIndex + 1) % THEMES.length;
      showNotice(`Ai ieșit din tunel: ${THEMES[themeIndex].name}`, 2500);
    }
  }
  tunnelF = lerp(tunnelF, inside ? 1 : 0, Math.min(1, 0.08 * f));
  tunnels = tunnels.filter(t => {
    if (t.y < DESPAWN_Y + 150) return true;
    scene.remove(t.mesh);
    return false;
  });
}

function nightFactor() {
  const k = Math.floor(dayClock / DAY_LENGTH);
  if (k === 0) return 0;
  const s = Math.min(1, (dayClock - k * DAY_LENGTH) / DAY_FADE);
  return k % 2 ? s : 1 - s;
}

function updateEnvironment() {
  const n = nightFactor();
  const theme = THEMES[themeIndex];
  envColor.set(theme.sky).lerp(tmpColor.set(NIGHT_SKY), n).lerp(tmpColor.set(TUNNEL_SKY), tunnelF);
  scene.background.copy(envColor);
  scene.fog.color.copy(envColor);
  scene.fog.near = lerp(lerp(22, 14, n), 5, tunnelF);
  scene.fog.far = lerp(lerp(48, 40, n), 28, tunnelF);
  sun.color.set(theme.sun).lerp(tmpColor.set(0x8fa8ff), n);
  sun.intensity = lerp(1.4, 0.15, n) * (1 - 0.8 * tunnelF);
  hemi.color.set(0xffffff).lerp(tmpColor.set(0x5566aa), n).lerp(tmpColor.set(0xffa040), tunnelF);
  hemi.intensity = lerp(lerp(0.95, 0.25, n), 0.8, tunnelF);
  const dark = Math.max(n, tunnelF);
  mat.head.emissiveIntensity = 0.8 + 2.5 * dark;
  headSpot.intensity = 18 * dark;
  mat.bulb.emissiveIntensity = 3 * n;
  stars.material.opacity = moon.material.opacity = n * (1 - tunnelF);
  sky.position.x = camera.position.x;

  const local = dayClock % DAY_LENGTH;
  const isNight = Math.floor(dayClock / DAY_LENGTH) % 2 === 1;
  daytimeEl.textContent = `${isNight ? 'Noapte' : 'Zi'} (${Math.ceil((DAY_LENGTH - local) / 1000)}s)`;
}

function stopLineY(o) {
  return o.type === 'light' ? o.y : o.y + CROSSING_H + 16;
}

function blocksEnemy(o, e, d) {
  if (o.type === 'crossing') return crossingActive(o);
  return o.state === 'red' || (o.state === 'yellow' && (d > 40 || e.v < 1.5));
}

// Mașinile din trafic au viteză proprie: respectă semafoarele, trecerile și distanța față de mașina din față.
function updateEnemies(f) {
  enemies.sort((a, b) => a.y - b.y);
  const obstacles = [...crossings, ...lights];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    let target = e.cruise;
    let stopAt = null;
    for (const o of obstacles) {
      const stopY = stopLineY(o);
      const d = e.y - stopY;
      if (d >= -5 && blocksEnemy(o, e, d)) {
        target = Math.min(target, Math.sqrt(0.6 * Math.max(0, d - 4)));
        stopAt = Math.max(stopAt ?? stopY, stopY);
      }
    }

    let lead = null;
    let leadV = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (enemies[j].lane === e.lane) { lead = enemies[j]; leadV = lead.v; break; }
    }
    const behindPlayer = e.y >= player.y + CAR_H && Math.abs(player.x - e.x) < CAR_W;
    if (behindPlayer && (!lead || player.y > lead.y)) { lead = player; leadV = currentSpeed; }
    if (lead) {
      const gap = e.y - (lead.y + CAR_H) - 12;
      target = Math.min(target, leadV + Math.sqrt(0.6 * Math.max(0, gap)));
    }

    e.v = target < e.v ? Math.max(target, e.v - 0.5 * f) : Math.min(target, e.v + 0.06 * f);
    e.y += (currentSpeed - e.v) * f;
    if (stopAt !== null) e.y = Math.max(e.y, stopAt);
    if (lead) e.y = Math.max(e.y, lead.y + CAR_H + 4);
    if (e.y + CAR_H < player.y) e.overtaken = true;

    if (collides(player, e)) return 'Ai lovit o mașină!';
  }

  enemies = enemies.filter(e => {
    if (e.y < DESPAWN_Y + 20 && e.y > SPAWN_Y - 300) return true;
    scene.remove(e.mesh);
    if (e.y >= DESPAWN_Y && e.overtaken) score += 10;
    return false;
  });
  return null;
}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collides(a, b) {
  const ma = a.inset ?? 6;
  const mb = b.inset ?? 6;
  return overlaps(a.x + ma, a.y + 6, CAR_W - 2 * ma, CAR_H - 12, b.x + mb, b.y + 6, CAR_W - 2 * mb, CAR_H - 12);
}

function updateCrossings(dt, f) {
  for (const c of crossings) {
    c.y += currentSpeed * f;
    for (const p of c.peds) {
      if (p.cancelled) continue;
      if (!p.started) {
        if (c.y > 150) { p.cancelled = true; continue; }
        if (c.y >= -600) p.delay -= dt;
        if (p.delay <= 0) p.started = true;
        continue;
      }
      const nx = p.x + p.dir * p.speed * f;
      const py = c.y + p.lineOffset;
      const carInWay = [...enemies, player].some(e => overlaps(nx - 12, py - 12, 24, 24, e.x, e.y, CAR_W, CAR_H));
      if (!carInWay) {
        p.x = nx;
        p.step += 0.25 * f;
      }
    }
    c.peds = c.peds.filter(p => {
      const keep = p.cancelled || (p.dir > 0 ? p.x < ROAD_W + 40 : p.x > -40);
      if (!keep) c.mesh.remove(p.mesh);
      return keep;
    });

    for (const p of c.peds) {
      if (pedOnRoad(p) && overlaps(player.x, player.y, CAR_W, CAR_H, p.x - 7, c.y + p.lineOffset - 10, 14, 20)) {
        return 'Ai lovit un pieton!';
      }
    }

    const onCrossing = overlaps(player.x, player.y, CAR_W, CAR_H, 0, c.y, ROAD_W, CROSSING_H);
    if (onCrossing && crossingActive(c) && !c.violated) {
      c.violated = true;
      startPolice('Nu ai oprit la trecerea de pietoni!');
    }

    if (!c.scored && !c.violated && c.y > player.y + CAR_H && c.peds.some(p => p.started)) {
      c.scored = true;
      score += 25;
    }
  }
  crossings = crossings.filter(c => {
    if (c.y < DESPAWN_Y) return true;
    scene.remove(c.mesh);
    return false;
  });
  return null;
}

function update(dt) {
  const f = dt / 16.67;
  const v = vehicle();
  const maxSpeed = speed * v.max;

  const skid = player.skid;
  dayClock += dt;

  if (braking) currentSpeed = Math.max(0, currentSpeed - (skid ? v.brake / 3 : v.brake) * f);
  else if (accelerating && !skid) currentSpeed = Math.min(maxSpeed, currentSpeed + v.accel * f);
  else if (currentSpeed > speed) currentSpeed = Math.max(speed, currentSpeed - 0.03 * f);
  else if (!skid) currentSpeed = Math.min(speed, currentSpeed + 0.08 * f);

  const moved = currentSpeed * f;
  roadOffset += moved;
  if (skid) {
    skid.time -= dt;
    skid.t += dt;
    player.x = clamp(player.x + skid.dir * 2.6 * Math.max(0, skid.time / skid.duration) * f, 0, ROAD_W - CAR_W);
    if (skid.time <= 0) {
      player.lane = clamp(Math.round((player.x - (LANE_WIDTH - CAR_W) / 2) / LANE_WIDTH), 0, LANES - 1);
      player.skid = null;
    }
  } else {
    player.x += (laneX(player.lane) - player.x) * Math.min(1, 0.3 * f);
  }

  distSincePuddle += moved;
  if (distSincePuddle >= nextPuddleAt) {
    spawnPuddle();
    distSincePuddle = 0;
    nextPuddleAt = rand(900, 1700);
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(220, 650 - speed * 30) * rand(0.7, 1.3);
  }

  distSinceObstacle += moved;
  if (distSinceObstacle >= nextObstacleAt) {
    const r = Math.random();
    distSinceObstacle = 0;
    nextObstacleAt = rand(1400, 2400);
    if (r < 0.4) spawnCrossing();
    else if (r < 0.8) spawnLight();
    else nextObstacleAt += spawnTunnel();
  }

  updateLights(dt, f);
  updatePuddles(f);
  updateTunnels(f);
  updateParticles(dt, f);
  const fail = updateCrossings(dt, f) || updateEnemies(f) || updatePolice(dt, f);
  if (fail) return endGame(fail);

  score += 0.05 * f * (currentSpeed / speed);
  speed = Math.min(8, 4 + Math.floor(score / 150) * 0.4);

  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.round(currentSpeed * 15) + ' km/h';
}

function updateSea(time) {
  const pos = sea.geometry.attributes.position;
  const t = time / 1000;
  const scroll = roadOffset * S;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - scroll;
    pos.setY(i, Math.sin(x * 0.45 + t * 1.6) * 0.12 + Math.sin(z * 0.6 + t * 1.1) * 0.1);
  }
  pos.needsUpdate = true;
  sea.geometry.computeVertexNormals();
}

function syncScene(time) {
  const px = toX(player.x + CAR_W / 2);
  playerMesh.position.set(px, 0, toZ(PLAYER_Y + CAR_H / 2));
  if (player.skid) {
    const k = Math.max(0, player.skid.time / player.skid.duration);
    playerMesh.rotation.y = (Math.sin(player.skid.t / 90) * 0.5 - player.skid.dir * 0.4) * k;
  } else {
    playerMesh.rotation.y = clamp(-(laneX(player.lane) - player.x) * 0.006, -0.35, 0.35);
  }
  playerMesh.rotation.z = playerMesh.userData.lean ? playerMesh.rotation.y * 1.4 : 0;
  playerMesh.userData.tail.emissiveIntensity = braking ? 2.5 : 0.3;

  for (const e of enemies) e.mesh.position.set(toX(e.x + CAR_W / 2), 0, toZ(e.y + CAR_H / 2));

  if (police) {
    police.mesh.position.set(toX(police.x + CAR_W / 2), 0, toZ(police.y + CAR_H / 2));
    const flash = Math.floor(time / 150) % 2;
    police.mesh.userData.siren[0].emissiveIntensity = flash ? 3 : 0.2;
    police.mesh.userData.siren[1].emissiveIntensity = flash ? 0.2 : 3;
  }

  for (const c of crossings) {
    c.mesh.position.z = toZ(c.y + CROSSING_H / 2);
    for (const p of c.peds) {
      p.mesh.position.set(toX(p.x), 0, (p.lineOffset - CROSSING_H / 2) * S);
      const swing = p.started && !p.cancelled ? Math.sin(p.step) * 0.6 : 0;
      p.mesh.userData.legs[0].rotation.x = swing;
      p.mesh.userData.legs[1].rotation.x = -swing;
    }
  }

  for (const l of lights) {
    l.mesh.position.z = toZ(l.y);
    for (const [key, m] of Object.entries(l.mesh.userData.lamps)) m.emissiveIntensity = key === l.state ? 2.5 : 0;
  }

  for (const p of puddles) p.mesh.position.set(toX(p.x), 0, toZ(p.y));
  for (const t of tunnels) t.mesh.position.z = toZ(t.y + t.L / 2);

  dashes.forEach(d => { d.position.z = scrollZ(d.userData.k, 80) + 0.5; });
  decor.forEach(o => {
    const y = scrollY(o.userData.k, o.userData.spacing);
    o.position.z = toZ(y);
    o.visible = Math.abs(o.position.x) > HALF + 9 || !tunnelSpans(y, 80);
    if (o.userData.phase !== undefined) {
      o.position.y = -0.05 + Math.sin(time / 600 + o.userData.phase) * 0.08;
      o.rotation.z = Math.sin(time / 800 + o.userData.phase) * 0.06;
    }
  });
  updateSea(time);

  if (garageOpen) {
    const a = time / 2500;
    const cz = toZ(PLAYER_Y + CAR_H / 2);
    camera.position.set(px + Math.sin(a) * 5.5, 2.4, cz + Math.cos(a) * 5.5);
    camera.lookAt(px, 0.7, cz);
  } else {
    camera.position.set(px * 0.85, 5, 9);
    camera.lookAt(px * 0.8, 0.5, -10);
  }
  sun.position.set(px - 8, 16, 6);
  sun.target.position.set(px, 0, -8);
  updateEnvironment();

  let warning = '';
  if (running && !paused) {
    const ahead = o => o.y < player.y && o.y > -700;
    const light = lights.find(l => ahead(l) && l.state !== 'green');
    if (police?.phase === 'chase') {
      const left = police.timer > 0 ? ` ${Math.ceil((POLICE_WAIT - police.timer) / 1000)}s` : '';
      warning = `POLIȚIA! OPREȘTE COMPLET (↓)${left}`;
    } else if (time < notice.until) warning = notice.text;
    else if (crossings.some(c => ahead(c) && crossingActive(c))) warning = 'PIETONI! FRÂNEAZĂ! (↓)';
    else if (light) warning = light.state === 'red' ? 'SEMAFOR ROȘU! OPREȘTE! (↓)' : 'GALBEN! ATENȚIE!';
  }
  warningEl.textContent = warning;
  warningEl.classList.toggle('hidden', !warning);
}

function updateOverlay() {
  const show = (paused || gameOver || !running) && !garageOpen;
  overlayEl.classList.toggle('hidden', !show);
  if (!show) return;
  overlayTitle.textContent = gameOver ? 'GAME OVER' : paused ? 'PAUZĂ' : 'Mașinuțe 3D - Plajă';
  overlayReason.textContent = gameOver ? gameOverReason : '';
  overlayScore.textContent = gameOver ? `Scor: ${Math.floor(score)}` : '';
  overlayHint.textContent = paused ? 'Apasă Space pentru a continua' : 'Apasă Start sau Enter';
}

function endGame(reason) {
  gameOver = true;
  gameOverReason = reason;
  running = false;
  braking = false;
  accelerating = false;
  if (score > best) {
    best = Math.floor(score);
    localStorage.setItem('carGameBest', best);
    bestEl.textContent = best;
  }
  startBtn.textContent = 'Din nou';
  updateOverlay();
}

function loop(time) {
  const dt = Math.min(50, time - lastTime);
  lastTime = time;
  if (running && !paused) update(dt);
  syncScene(time);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function startGame() {
  if (!renderer) return;
  openPanel('');
  reset();
  running = true;
  startBtn.textContent = 'Restart';
  updateOverlay();
}

function move(dir) {
  if (!running || paused || player.skid) return;
  player.lane = Math.max(0, Math.min(LANES - 1, player.lane + dir));
}

const BRAKE_KEYS = ['ArrowDown', 's', 'S'];
const GAS_KEYS = ['ArrowUp', 'w', 'W'];

document.addEventListener('keydown', e => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) move(-1);
  else if (['ArrowRight', 'd', 'D'].includes(e.key)) move(1);
  else if (BRAKE_KEYS.includes(e.key)) {
    e.preventDefault();
    braking = running;
  } else if (GAS_KEYS.includes(e.key)) {
    e.preventDefault();
    accelerating = running;
  } else if (e.key === ' ') {
    e.preventDefault();
    if (running && !garageOpen) paused = !paused;
    updateOverlay();
  } else if (e.key === 'Enter' && !running) startGame();
});

document.addEventListener('keyup', e => {
  if (BRAKE_KEYS.includes(e.key)) braking = false;
  if (GAS_KEYS.includes(e.key)) accelerating = false;
});

document.getElementById('left').addEventListener('click', () => move(-1));
document.getElementById('right').addEventListener('click', () => move(1));
startBtn.addEventListener('click', e => { startGame(); e.target.blur(); });

function holdButton(btn, onChange) {
  ['mousedown', 'touchstart'].forEach(evt => btn.addEventListener(evt, e => {
    e.preventDefault();
    onChange(running);
  }));
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => btn.addEventListener(evt, () => onChange(false)));
}

holdButton(brakeBtn, v => { braking = v; });
holdButton(gasBtn, v => { accelerating = v; });

// ---------- Meniuri de personalizare (generate din VEHICLES și PLAYER_COLORS) ----------
function menuLink(text, data, swatch) {
  const a = document.createElement('a');
  a.href = '#';
  Object.assign(a.dataset, data);
  if (swatch) {
    const s = document.createElement('span');
    s.className = 'swatch';
    s.style.background = swatch;
    a.append(s);
  }
  a.append(text);
  return a;
}

function buildMenus() {
  const vehicleMenus = [document.getElementById('vehicle-dropdown'), document.getElementById('garage-types')];
  const colorMenus = [document.getElementById('color-dropdown'), document.getElementById('garage-colors')];
  for (const [key, v] of Object.entries(VEHICLES)) {
    vehicleMenus.forEach(m => m.append(menuLink(v.name, { vehicle: key })));
  }
  for (const c of PLAYER_COLORS) {
    colorMenus.forEach(m => m.append(menuLink(c.name, { color: c.value }, c.value)));
  }
  refreshMenus();
}

function refreshMenus() {
  document.querySelectorAll('[data-vehicle]').forEach(a => a.classList.toggle('active', a.dataset.vehicle === custom.type));
  document.querySelectorAll('[data-color]').forEach(a => a.classList.toggle('active', a.dataset.color === custom.color));
  document.getElementById('custom-color').value = custom.color;
  document.getElementById('garage-name').textContent = vehicle().name;
  document.getElementById('garage-stats').innerHTML = STAT_DEFS.map(([label, fn]) =>
    `<div class="stat">${label}<div class="bar"><span style="width:${Math.round(Math.min(1, fn(vehicle())) * 100)}%"></span></div></div>`
  ).join('');
}

function applyCustomization(change) {
  Object.assign(custom, change);
  localStorage.setItem('carGameCustom', JSON.stringify(custom));
  if (player) player.inset = vehicle().inset;
  rebuildPlayer();
  refreshMenus();
}

function openPanel(name) {
  const wasGarage = garageOpen;
  garageOpen = name === 'garage';
  garageEl.classList.toggle('hidden', !garageOpen);
  helpEl.classList.toggle('hidden', name !== 'help');
  document.querySelectorAll('#game-nav > a[data-panel]').forEach(a => a.classList.toggle('active', a.dataset.panel === name));
  if (garageOpen && !wasGarage && running && !paused) {
    paused = true;
    pausedByGarage = true;
  } else if (!garageOpen && wasGarage && pausedByGarage) {
    paused = false;
    pausedByGarage = false;
  }
  updateOverlay();
}

document.addEventListener('click', e => {
  const link = e.target.closest('a[href="#"], a[data-panel]');
  if (!link) return;
  e.preventDefault();
  if (link.dataset.vehicle) applyCustomization({ type: link.dataset.vehicle });
  else if (link.dataset.color) applyCustomization({ color: link.dataset.color });
  else if (link.dataset.panel !== undefined) {
    const panel = link.dataset.panel;
    const current = garageOpen ? 'garage' : helpEl.classList.contains('hidden') ? '' : 'help';
    openPanel(panel === current ? '' : panel);
  }
  link.blur();
});

document.getElementById('custom-color').addEventListener('input', e => applyCustomization({ color: e.target.value }));
document.getElementById('garage-close').addEventListener('click', () => openPanel(''));
buildMenus();

import(THREE_URL)
  .then(module => {
    THREE = module;
    initThree();
    reset();
    updateOverlay();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  })
  .catch(err => {
    console.error(err);
    overlayTitle.textContent = 'Eroare';
    overlayReason.textContent = 'Nu s-a putut încărca Three.js (este nevoie de conexiune la internet).';
  });
