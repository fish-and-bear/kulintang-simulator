import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import {
  Circle,
  Focus,
  Info,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCw,
  Settings2,
  Square,
  SunMoon,
  Trash2,
  Volume2,
  Waves,
  X,
  createIcons,
} from 'lucide';

const app = document.querySelector('#app');
const canvas = document.querySelector('#scene');
const loadState = document.querySelector('#load-state');
const loadLabel = document.querySelector('#load-label');
const gongButtons = [...document.querySelectorAll('.gong-key')];
const settingsPanel = document.querySelector('#settings-panel');
const settingsButton = document.querySelector('#settings-button');
const referencePanel = document.querySelector('#reference-panel');
const referenceButton = document.querySelector('#reference-button');
const referenceSelect = document.querySelector('#reference-select');
const referencePlay = document.querySelector('#reference-play');
const referenceTime = document.querySelector('#reference-time');
const sceneSelect = document.querySelector('#scene-select');
const volumeSlider = document.querySelector('#volume-slider');
const roomSlider = document.querySelector('#room-slider');
const themeButton = document.querySelector('#theme-button');
const aboutDialog = document.querySelector('#about-dialog');
const recordButton = document.querySelector('#record-button');
const playButton = document.querySelector('#play-button');
const stopButton = document.querySelector('#stop-button');
const loopButton = document.querySelector('#loop-button');
const clearButton = document.querySelector('#clear-button');
const transportReadout = document.querySelector('#transport-readout');

const uiIcons = {
  Circle,
  Focus,
  Info,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCw,
  Settings2,
  Square,
  SunMoon,
  Trash2,
  Volume2,
  Waves,
  X,
};

createIcons({ icons: uiIcons });

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const keyMap = new Map([
  ['a', 0], ['s', 1], ['d', 2], ['f', 3],
  ['j', 4], ['k', 5], ['l', 6], [';', 7],
]);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarsePointer ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

function frameMode(width = window.innerWidth, height = window.innerHeight) {
  const aspect = width / height;
  if (width < 600) return 'phone';
  if (aspect < 1) return 'tablet-portrait';
  if (aspect < 1.55) return 'compact';
  return 'wide';
}

function frameFov(mode) {
  return { phone: 78, 'tablet-portrait': 56, compact: 44, wide: 38 }[mode];
}

const scene = new THREE.Scene();
const initialAspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(frameFov(frameMode()), initialAspect, 0.05, 180);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 4.8;
controls.maxDistance = 13.4;
controls.minPolarAngle = 0.32;
controls.maxPolarAngle = Math.PI * 0.485;
controls.rotateSpeed = 0.58;
controls.zoomSpeed = 0.72;
controls.target.set(0, 0.92, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const neutralEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = neutralEnvironment;

const world = new THREE.Group();
const instrument = new THREE.Group();
scene.add(world, instrument);

const interactiveMeshes = [];
const gongStates = [];
const beaterStates = [];
const environmentLights = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let sparkPoints = null;
let nextBeater = 0;
let environment = null;
let activeEnvironmentMap = null;
let environmentRequest = 0;
let activeScene = localStorage.getItem('kulintang-scene') || 'gallery';
let themeMode = localStorage.getItem('kulintang-theme') || 'auto';
let effectiveTheme = 'dark';
let pressedPointer = null;

const clamp = THREE.MathUtils.clamp;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const centerStrike = Object.freeze({ radial: 0, angle: 0 });

function describeStrike(position = centerStrike) {
  const radial = clamp(Number(position.radial) || 0, 0, 1);
  const angle = Number.isFinite(position.angle) ? position.angle : 0;
  const timbre = THREE.MathUtils.smoothstep(radial, 0.2, 0.96);
  const rim = THREE.MathUtils.smoothstep(radial, 0.7, 1);
  const zone = radial <= 0.24 ? 'boss' : radial < 0.78 ? 'shoulder' : 'rim';
  return { radial, angle, timbre, rim, zone };
}

function seededNoise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function canvasTexture(width, height, paint, repeatX = 1, repeatY = 1) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeWoodTexture(dark = false) {
  return canvasTexture(768, 384, (ctx, width, height) => {
    const base = dark ? '#2a140c' : '#5a2d17';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < height; y += 2) {
      const n = seededNoise(y * 0.91);
      ctx.strokeStyle = dark
        ? `rgba(${38 + n * 28}, ${17 + n * 10}, ${9 + n * 8}, ${0.18 + n * 0.18})`
        : `rgba(${122 + n * 40}, ${61 + n * 22}, ${25 + n * 12}, ${0.12 + n * 0.2})`;
      ctx.lineWidth = 0.7 + n * 1.7;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 18) {
        const wave = Math.sin(x * 0.025 + y * 0.08) * (1.5 + n * 3.5);
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 16; i += 1) {
      const x = seededNoise(i * 7.2) * width;
      const y = seededNoise(i * 11.4) * height;
      ctx.strokeStyle = 'rgba(15, 7, 3, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + seededNoise(i) * 34, 3 + seededNoise(i + 2) * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, 2.4, 1.2);
}

function makeBronzeBump() {
  const element = document.createElement('canvas');
  element.width = 512;
  element.height = 512;
  const ctx = element.getContext('2d');
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, 512, 512);
  const image = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = seededNoise(i * 0.0143) * 18 + seededNoise(i * 0.0061) * 8;
    const value = 124 + n;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 110; i += 1) {
    const x = seededNoise(i * 3.13) * 512;
    const y = seededNoise(i * 8.71) * 512;
    const radius = 3 + seededNoise(i * 5.1) * 14;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(190,190,190,.22)');
    gradient.addColorStop(1, 'rgba(80,80,80,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1.5);
  return texture;
}

function makeFloorTexture(kind) {
  if (kind === 'gallery') {
    return canvasTexture(1024, 1024, (ctx, width, height) => {
      ctx.fillStyle = '#6d442b';
      ctx.fillRect(0, 0, width, height);
      const board = width / 8;
      for (let row = 0; row < 16; row += 1) {
        for (let col = -1; col < 9; col += 1) {
          const offset = row % 2 ? board * 0.5 : 0;
          const x = col * board + offset;
          const y = row * (height / 16);
          const n = seededNoise(row * 19 + col * 3);
          ctx.fillStyle = `hsl(${24 + n * 5} 39% ${29 + n * 7}%)`;
          ctx.fillRect(x + 1, y + 1, board - 2, height / 16 - 2);
          ctx.strokeStyle = 'rgba(28,13,7,.24)';
          ctx.strokeRect(x, y, board, height / 16);
          for (let line = 0; line < 4; line += 1) {
            ctx.strokeStyle = `rgba(238,185,128,${0.025 + n * 0.03})`;
            ctx.beginPath();
            ctx.moveTo(x, y + 8 + line * 10 + n * 4);
            ctx.bezierCurveTo(x + board * .3, y + 5 + line * 10, x + board * .7, y + 12 + line * 10, x + board, y + 8 + line * 10);
            ctx.stroke();
          }
        }
      }
    }, 4, 4);
  }
  if (kind === 'courtyard') {
    return canvasTexture(1024, 1024, (ctx, width, height) => {
      ctx.fillStyle = '#9a8363';
      ctx.fillRect(0, 0, width, height);
      const tile = 128;
      for (let y = -tile; y < height + tile; y += tile) {
        for (let x = -tile; x < width + tile; x += tile) {
          const n = seededNoise(x * .17 + y * .31);
          ctx.fillStyle = `hsl(${34 + n * 8} 19% ${48 + n * 9}%)`;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 8);
          ctx.lineTo(x + tile - 7, y + 2);
          ctx.lineTo(x + tile - 2, y + tile - 8);
          ctx.lineTo(x + 8, y + tile - 2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(72,56,40,.28)';
          ctx.lineWidth = 4;
          ctx.stroke();
          for (let p = 0; p < 45; p += 1) {
            const px = x + seededNoise(p + x) * tile;
            const py = y + seededNoise(p * 2 + y) * tile;
            ctx.fillStyle = `rgba(53,44,34,${.02 + seededNoise(p * 4) * .08})`;
            ctx.fillRect(px, py, 1.2, 1.2);
          }
        }
      }
    }, 5, 5);
  }
  return canvasTexture(1024, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#261c16';
    ctx.fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 48) {
      const n = seededNoise(x);
      ctx.fillStyle = `rgba(${62 + n * 25},${39 + n * 15},${25 + n * 8},.55)`;
      ctx.fillRect(x + 1, 0, 46, height);
      ctx.fillStyle = 'rgba(8,5,3,.45)';
      ctx.fillRect(x, 0, 2, height);
      for (let y = 0; y < height; y += 8) {
        ctx.fillStyle = `rgba(190,132,76,${.018 + seededNoise(x + y) * .025})`;
        ctx.fillRect(x + 4, y, 38, 1);
      }
    }
  }, 4, 4);
}

function makeMatTexture() {
  return canvasTexture(1024, 384, (ctx, width, height) => {
    ctx.fillStyle = '#6e5937';
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < height; y += 5) {
      ctx.fillStyle = y % 10 === 0 ? 'rgba(222,190,129,.2)' : 'rgba(26,20,13,.16)';
      ctx.fillRect(0, y, width, 2);
    }
    for (let x = 0; x < width; x += 9) {
      ctx.fillStyle = x % 36 === 0 ? 'rgba(38,68,51,.45)' : 'rgba(241,213,158,.12)';
      ctx.fillRect(x, 0, 2, height);
    }
    ctx.strokeStyle = 'rgba(42,26,16,.55)';
    ctx.lineWidth = 14;
    ctx.strokeRect(9, 9, width - 18, height - 18);
  }, 2, 1);
}

function makeOkirTexture() {
  return canvasTexture(2048, 360, (ctx, width, height) => {
    ctx.fillStyle = '#102c29';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#121b1a';
    ctx.fillRect(0, 0, width, 24);
    ctx.fillRect(0, height - 24, width, 24);

    const drawRibbon = (color, offset, flip = 1) => {
      for (let start = -280; start < width + 320; start += 520) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#e8e0ca';
        ctx.lineWidth = 76;
        ctx.beginPath();
        ctx.moveTo(start - 30, 225 - offset);
        ctx.bezierCurveTo(start + 95, 50 + offset, start + 205, 55 + offset, start + 250, 178);
        ctx.bezierCurveTo(start + 305, 318 - offset, start + 435, 292 - offset, start + 495, 145 + offset * flip);
        ctx.stroke();
        ctx.strokeStyle = '#151615';
        ctx.lineWidth = 64;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 50;
        ctx.stroke();
      }
    };

    drawRibbon('#9a2723', 0, 1);
    drawRibbon('#243e67', 76, -1);

    for (let x = 125; x < width; x += 260) {
      ctx.fillStyle = '#e1a62d';
      ctx.strokeStyle = '#e8e0ca';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x, 173);
      ctx.quadraticCurveTo(x + 34, 106, x + 77, 118);
      ctx.quadraticCurveTo(x + 52, 171, x, 173);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const center = width / 2;
    ctx.fillStyle = '#102c29';
    ctx.strokeStyle = '#e8e0ca';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(center, height / 2, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c88e28';
    ctx.beginPath();
    ctx.arc(center, height / 2, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#151615';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.fillStyle = '#982d27';
    ctx.beginPath();
    ctx.moveTo(center, 105);
    ctx.quadraticCurveTo(center + 54, 180, center, 255);
    ctx.quadraticCurveTo(center - 54, 180, center, 105);
    ctx.fill();

    ctx.strokeStyle = '#d7cdb7';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, width - 24, height - 24);
    ctx.globalAlpha = 0.11;
    for (let i = 0; i < 6000; i += 1) {
      const x = seededNoise(i * 4.11) * width;
      const y = seededNoise(i * 9.37) * height;
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  });
}

const textures = {
  frameWood: makeWoodTexture(true),
  beaterWood: makeWoodTexture(false),
  bronzeBump: makeBronzeBump(),
  mat: makeMatTexture(),
  okir: makeOkirTexture(),
};

const materials = {
  bronze: [],
  boss: [],
  frame: new THREE.MeshPhysicalMaterial({
    color: 0x32180d,
    map: textures.frameWood,
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.46,
    clearcoatRoughness: 0.22,
  }),
  endgrain: new THREE.MeshStandardMaterial({ color: 0x1d0d08, roughness: 0.58 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 }),
  ropeHighlight: new THREE.MeshStandardMaterial({ color: 0x806044, roughness: 0.86 }),
  pin: new THREE.MeshStandardMaterial({ color: 0xa56a33, metalness: 0.48, roughness: 0.38 }),
  beater: new THREE.MeshPhysicalMaterial({
    color: 0x8b4b22,
    map: textures.beaterWood,
    roughness: 0.42,
    clearcoat: 0.28,
    clearcoatRoughness: 0.27,
  }),
  mat: new THREE.MeshStandardMaterial({ map: textures.mat, roughness: 0.98, side: THREE.DoubleSide }),
  paintedFrame: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.okir,
    roughness: 0.55,
    clearcoat: 0.24,
    clearcoatRoughness: 0.38,
  }),
  grip: new THREE.MeshStandardMaterial({ color: 0x1d1712, roughness: 0.82 }),
};

function roundedBox(width, height, depth, radius, material) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 5, radius), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinderBetween(a, b, radius, material, radialSegments = 12) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function gongProfile(radius) {
  return [
    new THREE.Vector2(0, 0.06),
    new THREE.Vector2(radius * 0.16, 0.062),
    new THREE.Vector2(radius * 0.25, 0.073),
    new THREE.Vector2(radius * 0.46, 0.075),
    new THREE.Vector2(radius * 0.77, 0.035),
    new THREE.Vector2(radius * 0.91, 0.085),
    new THREE.Vector2(radius, 0.035),
    new THREE.Vector2(radius * 0.985, -0.10),
    new THREE.Vector2(radius * 0.87, -0.37),
    new THREE.Vector2(radius * 0.79, -0.39),
    new THREE.Vector2(radius * 0.81, -0.31),
    new THREE.Vector2(radius * 0.92, -0.09),
    new THREE.Vector2(radius * 0.88, 0.0),
    new THREE.Vector2(radius * 0.75, -0.005),
    new THREE.Vector2(radius * 0.45, 0.03),
    new THREE.Vector2(radius * 0.29, 0.035),
    new THREE.Vector2(radius * 0.18, 0.04),
    new THREE.Vector2(0, 0.042),
  ];
}

function addIncisedBand(group, radius, y) {
  const segments = 28;
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angleA = (i / segments) * Math.PI * 2;
    const angleB = ((i + 0.5) / segments) * Math.PI * 2;
    const angleC = ((i + 1) / segments) * Math.PI * 2;
    const outer = radius * 0.72;
    const inner = radius * 0.66;
    points.push(
      new THREE.Vector3(Math.cos(angleA) * outer, y, Math.sin(angleA) * outer),
      new THREE.Vector3(Math.cos(angleB) * inner, y, Math.sin(angleB) * inner),
      new THREE.Vector3(Math.cos(angleB) * inner, y, Math.sin(angleB) * inner),
      new THREE.Vector3(Math.cos(angleC) * outer, y, Math.sin(angleC) * outer),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x684420, transparent: true, opacity: 0.48 }));
  group.add(line);

  for (const ringRadius of [radius * 0.31, radius * 0.78]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, radius * 0.007, 5, 72),
      new THREE.MeshStandardMaterial({ color: 0x714820, metalness: 0.5, roughness: 0.48 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y - 0.002;
    group.add(ring);
  }
}

function createGong(index, radius, x) {
  const group = new THREE.Group();
  group.position.set(x, 1.23, 0);
  group.userData.index = index;

  const warmth = index / 7;
  const bronzeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(0.078 + warmth * 0.012, 0.5, 0.165 + warmth * 0.014),
    metalness: 0.7,
    roughness: 0.49 + seededNoise(index * 9) * 0.07,
    bumpMap: textures.bronzeBump,
    bumpScale: 0.017,
    clearcoat: 0.18,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.68,
  });
  materials.bronze.push(bronzeMaterial);
  const gong = new THREE.Mesh(new THREE.LatheGeometry(gongProfile(radius), 96), bronzeMaterial);
  gong.castShadow = true;
  gong.receiveShadow = true;
  gong.userData.gongIndex = index;
  group.add(gong);
  interactiveMeshes.push(gong);

  const bossMaterial = bronzeMaterial.clone();
  bossMaterial.color.offsetHSL(0, 0.02, 0.03);
  bossMaterial.roughness = 0.31;
  materials.boss.push(bossMaterial);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.205, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), bossMaterial);
  boss.scale.y = 1.22;
  boss.position.y = 0.067;
  boss.castShadow = true;
  boss.userData.gongIndex = index;
  group.add(boss);
  interactiveMeshes.push(boss);

  addIncisedBand(group, radius, 0.078);
  instrument.add(group);
  gongStates.push({
    group,
    gong,
    boss,
    impulse: 0,
    phase: index * 0.7,
    radius,
    strike: describeStrike(),
  });
}

function createBeater(side) {
  const group = new THREE.Group();
  const shaft = cylinderBetween(
    new THREE.Vector3(0, 0, 0.05),
    new THREE.Vector3(0, 0, 1.62),
    0.042,
    materials.beater,
    20,
  );
  const grip = cylinderBetween(
    new THREE.Vector3(0, 0, 1.22),
    new THREE.Vector3(0, 0, 1.63),
    0.051,
    materials.grip,
    20,
  );
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 12), materials.beater);
  tip.position.z = 0.04;
  const end = new THREE.Mesh(new THREE.SphereGeometry(0.053, 18, 12), materials.grip);
  end.position.z = 1.63;
  group.add(shaft, grip, tip, end);

  const restPosition = new THREE.Vector3(side * 0.68, 1.59, 0.2 + side * 0.05);
  const restRotation = new THREE.Euler(-0.16, side * 0.32, side * 0.055);
  group.position.copy(restPosition);
  group.rotation.copy(restRotation);
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  group.userData.motion = {
    side,
    active: false,
    elapsed: 0,
    duration: 0.32,
    restPosition,
    restRotation,
    fromPosition: restPosition.clone(),
    fromRotation: restRotation.clone(),
    targetPosition: restPosition.clone(),
    targetRotation: restRotation.clone(),
  };
  instrument.add(group);
  beaterStates.push(group);
}

function createSparks() {
  const count = coarsePointer ? 260 : 420;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.PointsMaterial({
    size: coarsePointer ? 0.04 : 0.036,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  sparkPoints = new THREE.Points(geometry, material);
  sparkPoints.frustumCulled = false;
  sparkPoints.userData.pool = Array.from({ length: count }, (_, index) => ({
    index,
    life: 0,
    maxLife: 1,
    position: new THREE.Vector3(0, -20, 0),
    velocity: new THREE.Vector3(),
    color: new THREE.Color(),
  }));
  instrument.add(sparkPoints);
}

function gongStrikePoint(state, strike) {
  const x = Math.cos(strike.angle) * strike.radial * state.radius;
  const z = Math.sin(strike.angle) * strike.radial * state.radius;
  let y = 0.075;
  if (strike.radial <= 0.205) {
    const bossRadius = state.radius * 0.205;
    const normalized = strike.radial / 0.205;
    y = 0.067 + bossRadius * 1.22 * Math.sqrt(Math.max(0, 1 - normalized * normalized));
  } else if (strike.radial > 0.78) {
    y = THREE.MathUtils.lerp(0.075, 0.04, (strike.radial - 0.78) / 0.22);
  }
  return new THREE.Vector3(x, y, z);
}

function animateBeaterHit(state, strike, velocity) {
  const beater = beaterStates[nextBeater];
  nextBeater = (nextBeater + 1) % beaterStates.length;
  if (!beater) return;
  const motion = beater.userData.motion;
  const target = gongStrikePoint(state, strike);
  state.group.localToWorld(target);
  instrument.worldToLocal(target);
  motion.active = true;
  motion.elapsed = 0;
  motion.duration = THREE.MathUtils.lerp(0.36, 0.27, clamp(velocity, 0, 1));
  motion.fromPosition.copy(beater.position);
  motion.fromRotation.copy(beater.rotation);
  motion.targetPosition.copy(target);
  motion.targetPosition.y += 0.015;
  motion.targetRotation.set(
    -0.075,
    motion.side * 0.14 + clamp(-target.x * 0.018, -0.1, 0.1),
    clamp(target.x * -0.012, -0.07, 0.07),
  );
}

function spawnSparks(state, strike, velocity, index) {
  if (!sparkPoints) return;
  const origin = gongStrikePoint(state, strike);
  state.group.localToWorld(origin);
  instrument.worldToLocal(origin);
  const pool = sparkPoints.userData.pool;
  const color = new THREE.Color().setHSL(0.09 + index * 0.004, 0.76, 0.66 + strike.rim * 0.06);
  const count = reducedMotion ? 7 : coarsePointer ? 12 : 18;
  let spawned = 0;
  for (const particle of pool) {
    if (particle.life > 0) continue;
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.24 + Math.random() * 0.52) * clamp(velocity, 0.5, 1.05);
    particle.life = particle.maxLife = 0.42 + Math.random() * 0.38;
    particle.position.set(
      origin.x + (Math.random() - 0.5) * 0.07,
      origin.y + Math.random() * 0.035,
      origin.z + (Math.random() - 0.5) * 0.07,
    );
    particle.velocity.set(
      Math.cos(angle) * speed,
      0.28 + Math.random() * 0.5,
      Math.sin(angle) * speed,
    );
    particle.color.copy(color);
    spawned += 1;
    if (spawned >= count) break;
  }
}

function buildInstrument() {
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 4.15), materials.mat);
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.016, 0.05);
  mat.receiveShadow = true;
  instrument.add(mat);

  const railY = 0.88;
  for (const z of [-0.82, 0.82]) {
    const rail = roundedBox(9.55, 0.2, 0.2, 0.075, materials.frame);
    rail.position.set(0, railY, z);
    instrument.add(rail);

    const lowerRail = roundedBox(8.95, 0.15, 0.16, 0.06, materials.frame);
    lowerRail.position.set(0, 0.36, z);
    instrument.add(lowerRail);
  }

  for (const x of [-4.67, 4.67]) {
    const endRail = roundedBox(0.24, 0.28, 1.78, 0.075, materials.frame);
    endRail.position.set(x, railY + 0.02, 0);
    instrument.add(endRail);

    const endPanel = roundedBox(0.28, 0.75, 1.92, 0.08, materials.frame);
    endPanel.position.set(x, 0.56, 0);
    instrument.add(endPanel);
  }

  for (const x of [-4.28, 4.28]) {
    for (const z of [-0.7, 0.7]) {
      const leg = roundedBox(0.28, 0.76, 0.28, 0.09, materials.frame);
      leg.position.set(x, 0.42, z);
      instrument.add(leg);
    }
    const foot = roundedBox(0.62, 0.18, 2.15, 0.08, materials.frame);
    foot.position.set(x, 0.12, 0);
    instrument.add(foot);
  }

  const centralBrace = roundedBox(8.3, 0.16, 0.16, 0.055, materials.frame);
  centralBrace.position.set(0, 0.31, 0);
  instrument.add(centralBrace);

  const apronMaterials = [
    materials.frame,
    materials.frame,
    materials.frame,
    materials.frame,
    materials.paintedFrame,
    materials.paintedFrame,
  ];
  const frontApron = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.78, 0.13), apronMaterials);
  frontApron.position.set(0, 0.55, 0.93);
  frontApron.castShadow = true;
  frontApron.receiveShadow = true;
  instrument.add(frontApron);

  const backApron = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.52, 0.12), apronMaterials);
  backApron.position.set(0, 0.61, -0.93);
  backApron.rotation.y = Math.PI;
  backApron.castShadow = true;
  instrument.add(backApron);

  for (const z of [-0.38, 0.38]) {
    const rope = cylinderBetween(
      new THREE.Vector3(-4.62, 1.015, z),
      new THREE.Vector3(4.62, 1.015, z),
      0.027,
      materials.rope,
      16,
    );
    instrument.add(rope);
    const highlight = cylinderBetween(
      new THREE.Vector3(-4.61, 1.034, z - 0.006),
      new THREE.Vector3(4.61, 1.034, z - 0.006),
      0.006,
      materials.ropeHighlight,
      8,
    );
    instrument.add(highlight);
  }

  for (const x of [-4.62, 4.62]) {
    for (const z of [-0.38, 0.38]) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 20), materials.pin);
      peg.rotation.z = Math.PI / 2;
      peg.position.set(x + (x < 0 ? -0.04 : 0.04), 1.02, z);
      peg.castShadow = true;
      instrument.add(peg);
    }
  }

  const radii = [0.53, 0.515, 0.5, 0.485, 0.47, 0.455, 0.44, 0.425];
  const positions = [-3.88, -2.78, -1.68, -0.58, 0.51, 1.59, 2.66, 3.71];
  radii.forEach((radius, index) => createGong(index, radius, positions[index]));

  createBeater(-1);
  createBeater(1);
  createSparks();

  instrument.rotation.y = 0;
  instrument.position.y = 0;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

function addEnvironmentMesh(group, geometry, material, position, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position || new THREE.Vector3());
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function buildGallery(group, isLight) {
  const floorTexture = makeFloorTexture('gallery');
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: isLight ? 0xffffff : 0x635a50,
    map: floorTexture,
    roughness: 0.68,
    metalness: 0.02,
  });
  addEnvironmentMesh(group, new THREE.CircleGeometry(15, 96), floorMaterial, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  const wallColor = isLight ? 0xd9d0bf : 0x413b34;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.92, side: THREE.BackSide });
  addEnvironmentMesh(group, new THREE.CylinderGeometry(14.8, 14.8, 7.2, 96, 1, true), wallMaterial, new THREE.Vector3(0, 3.6, 0));
  addEnvironmentMesh(group, new THREE.CircleGeometry(14.8, 96), wallMaterial, new THREE.Vector3(0, 7.18, 0), new THREE.Euler(Math.PI / 2, 0, 0));

  const panelMaterial = new THREE.MeshStandardMaterial({ color: isLight ? 0x765036 : 0x21150f, roughness: 0.55 });
  const insetMaterial = new THREE.MeshStandardMaterial({ color: isLight ? 0xb8c0b5 : 0x28312f, roughness: 0.48, metalness: 0.06 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 14.46;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const panel = roundedBox(3.6, 3.15, 0.16, 0.05, panelMaterial);
    panel.position.set(x, 3.34, z);
    panel.rotation.y = angle;
    panel.castShadow = false;
    group.add(panel);
    const inset = roundedBox(2.88, 2.46, 0.08, 0.035, insetMaterial);
    inset.position.set(Math.sin(angle) * (radius - 0.11), 3.36, Math.cos(angle) * (radius - 0.11));
    inset.rotation.y = angle;
    inset.castShadow = false;
    group.add(inset);
    for (let bar = -2; bar <= 2; bar += 1) {
      const slat = roundedBox(0.045, 2.38, 0.06, 0.012, panelMaterial);
      const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      slat.position.copy(inset.position).addScaledVector(tangent, bar * 0.43);
      slat.position.y = 3.36;
      slat.rotation.y = angle;
      group.add(slat);
    }
  }

  const key = new THREE.DirectionalLight(isLight ? 0xfff3d9 : 0xffddb3, isLight ? 2.0 : 1.05);
  key.position.set(-4.5, 8.5, 5.8);
  key.castShadow = true;
  key.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.00015;
  group.add(key);
  environmentLights.push(key);

  const fill = new THREE.HemisphereLight(isLight ? 0xd8e0df : 0x728487, isLight ? 0x6e4c32 : 0x17100b, isLight ? 1.05 : 0.46);
  group.add(fill);
  environmentLights.push(fill);
}

function buildCourtyard(group, isLight) {
  const floorTexture = makeFloorTexture('courtyard');
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.93 });
  addEnvironmentMesh(group, new THREE.CircleGeometry(18, 112), floorMaterial, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  const skyMaterial = new THREE.MeshBasicMaterial({ color: isLight ? 0x9cb6bf : 0x172838, side: THREE.BackSide });
  addEnvironmentMesh(group, new THREE.SphereGeometry(38, 64, 32), skyMaterial, new THREE.Vector3(0, 2, 0));

  const wallMaterial = new THREE.MeshStandardMaterial({ color: isLight ? 0xb9a786 : 0x544a3d, roughness: 0.9, side: THREE.BackSide });
  addEnvironmentMesh(group, new THREE.CylinderGeometry(15.8, 15.8, 2.15, 96, 1, true), wallMaterial, new THREE.Vector3(0, 1.08, 0));
  const capMaterial = new THREE.MeshStandardMaterial({ color: isLight ? 0x6d4730 : 0x251711, roughness: 0.56 });
  const cap = new THREE.Mesh(new THREE.TorusGeometry(15.78, 0.16, 10, 96), capMaterial);
  cap.rotation.x = Math.PI / 2;
  cap.position.y = 2.12;
  cap.castShadow = true;
  group.add(cap);

  const timber = new THREE.MeshPhysicalMaterial({ color: isLight ? 0x4f2d1d : 0x21140e, roughness: 0.44, clearcoat: 0.18 });
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const radius = 12.5;
    const post = roundedBox(0.28, 4.4, 0.28, 0.06, timber);
    post.position.set(Math.sin(angle) * radius, 2.2, Math.cos(angle) * radius);
    post.rotation.y = angle;
    group.add(post);

    const upperBeam = roundedBox(5.45, 0.25, 0.31, 0.06, timber);
    const tangentAngle = angle + Math.PI / 14;
    upperBeam.position.set(Math.sin(tangentAngle) * 12.18, 4.18, Math.cos(tangentAngle) * 12.18);
    upperBeam.rotation.y = tangentAngle;
    group.add(upperBeam);
  }

  const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0x51321f, roughness: 0.6 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: isLight ? 0xffd898 : 0xffb665, transparent: true, opacity: isLight ? 0.55 : 0.88 });
  for (const angle of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const point = new THREE.Vector3(Math.sin(angle) * 11.9, 3.35, Math.cos(angle) * 11.9);
    const cage = cylinderBetween(point.clone().add(new THREE.Vector3(0, -0.38, 0)), point.clone().add(new THREE.Vector3(0, 0.38, 0)), 0.17, lanternMaterial, 8);
    group.add(cage);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.58, 16), glowMaterial);
    glow.position.copy(point);
    group.add(glow);
  }

  const sun = new THREE.DirectionalLight(isLight ? 0xffe3b0 : 0xa8c8dc, isLight ? 2.7 : 1.3);
  sun.position.set(4.5, 9.5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.bias = -0.00015;
  group.add(sun);
  environmentLights.push(sun);

  const ambient = new THREE.HemisphereLight(isLight ? 0xc9e5ec : 0x4a6b7b, isLight ? 0x7b6346 : 0x21180f, isLight ? 1.55 : 0.88);
  group.add(ambient);
  environmentLights.push(ambient);
}

function buildBlackbox(group, isLight) {
  const floorTexture = makeFloorTexture('blackbox');
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.6 });
  addEnvironmentMesh(group, new THREE.CircleGeometry(15.5, 96), floorMaterial, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  const wallMaterial = new THREE.MeshStandardMaterial({ color: isLight ? 0x393735 : 0x0c0c0d, roughness: 0.94, side: THREE.BackSide });
  addEnvironmentMesh(group, new THREE.CylinderGeometry(15, 15, 8.5, 64, 1, true), wallMaterial, new THREE.Vector3(0, 4.25, 0));
  addEnvironmentMesh(group, new THREE.CircleGeometry(15, 64), wallMaterial, new THREE.Vector3(0, 8.45, 0), new THREE.Euler(Math.PI / 2, 0, 0));

  const panelA = new THREE.MeshStandardMaterial({ color: isLight ? 0x49443f : 0x171515, roughness: 0.95 });
  const panelB = new THREE.MeshStandardMaterial({ color: isLight ? 0x302d2b : 0x11100f, roughness: 0.95 });
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    const panel = roundedBox(2.85, 5.4, 0.21, 0.025, i % 2 ? panelA : panelB);
    panel.position.set(Math.sin(angle) * 14.72, 3.45, Math.cos(angle) * 14.72);
    panel.rotation.y = angle;
    panel.castShadow = false;
    group.add(panel);
  }

  const rigMaterial = new THREE.MeshStandardMaterial({ color: 0x171719, metalness: 0.72, roughness: 0.38 });
  const rig = new THREE.Mesh(new THREE.TorusGeometry(7.8, 0.09, 8, 80), rigMaterial);
  rig.rotation.x = Math.PI / 2;
  rig.position.y = 6.5;
  group.add(rig);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.55, 18), rigMaterial);
    fixture.position.set(Math.sin(angle) * 7.8, 6.22, Math.cos(angle) * 7.8);
    group.add(fixture);
  }

  const spot = new THREE.SpotLight(isLight ? 0xffe4be : 0xffc887, isLight ? 3.7 : 4.8, 18, Math.PI * 0.22, 0.7, 1.4);
  spot.position.set(-3.8, 7.4, 4.8);
  spot.target.position.set(0, 0.55, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
  group.add(spot, spot.target);
  environmentLights.push(spot);

  const rim = new THREE.SpotLight(0x7da4b8, isLight ? 1.8 : 2.6, 18, Math.PI * 0.2, 0.8, 1.5);
  rim.position.set(4.7, 5.8, -4.5);
  rim.target.position.set(0, 0.9, 0);
  group.add(rim, rim.target);
  environmentLights.push(rim);

  const ambient = new THREE.HemisphereLight(isLight ? 0xb5bdc2 : 0x2e3d48, 0x110d0a, isLight ? 0.72 : 0.4);
  group.add(ambient);
  environmentLights.push(ambient);
}

const hdriLoader = new HDRLoader();
const textureLoader = new THREE.TextureLoader();
const hdriCache = new Map();
const backdropCache = new Map();
const hdriScenes = {
  gallery: {
    id: 'lapa',
    rotation: Math.PI * 0.46,
    groundHeight: 6.6,
    groundRadius: 48,
    backgroundLight: 0.82,
    backgroundDark: 0.34,
    fallback: 0x46382e,
  },
  courtyard: {
    id: 'epping_forest_01',
    rotation: Math.PI * 0.82,
    groundHeight: 7.2,
    groundRadius: 52,
    backgroundLight: 1.08,
    backgroundDark: 0.38,
    fallback: 0x29362a,
  },
  blackbox: {
    id: 'park_music_stage',
    rotation: Math.PI * 0.5,
    groundHeight: 8.3,
    groundRadius: 54,
    backgroundLight: 1.04,
    backgroundDark: 0.32,
    fallback: 0x201b18,
  },
};

async function loadHDRI(config) {
  const resolution = coarsePointer || window.innerWidth < 700 ? '1k' : '2k';
  const file = `${config.id}_${resolution}.hdr`;
  if (!hdriCache.has(file)) {
    hdriCache.set(file, hdriLoader.loadAsync(`/environments/${file}`).then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }));
  }
  return hdriCache.get(file);
}

async function loadBackdrop(config) {
  const renderedWidth = window.innerWidth * Math.min(window.devicePixelRatio, 2);
  const supports6k = renderer.capabilities.maxTextureSize >= 8192;
  const tier = coarsePointer || window.innerWidth < 700
    ? 'mobile'
    : supports6k && renderedWidth >= 1500 ? '6k' : '4k';
  const file = `${config.id}-${tier}.webp`;
  if (!backdropCache.has(file)) {
    backdropCache.set(file, textureLoader.loadAsync(`/environments/backgrounds/${file}`).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    }));
  }
  return { texture: await backdropCache.get(file), file };
}

function pruneBackdropCache(activeFile) {
  for (const [file, texturePromise] of backdropCache) {
    if (file === activeFile) continue;
    texturePromise.then((texture) => texture.dispose());
    backdropCache.delete(file);
  }
}

function buildPhotographicScene(group, name, isLight, requestId) {
  const config = hdriScenes[name];
  const floorMaterial = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: isLight ? 0.2 : 0.28,
    transparent: true,
    depthWrite: false,
  });
  const floorGeometry = new THREE.CircleGeometry(11, 96);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  floor.renderOrder = -2;
  group.add(floor);

  const keyColors = {
    gallery: 0xffe2ba,
    courtyard: 0xffe6bc,
    blackbox: 0xffcc91,
  };
  const key = new THREE.DirectionalLight(keyColors[name], isLight ? 1.5 : 1.28);
  key.position.set(name === 'courtyard' ? 5 : -4, 8.5, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(coarsePointer ? 1024 : 2048, coarsePointer ? 1024 : 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.00015;
  group.add(key);
  environmentLights.push(key);

  const fill = new THREE.HemisphereLight(
    name === 'courtyard' ? 0xbad8df : 0xb7c1ca,
    name === 'blackbox' ? 0x160e09 : 0x4b3522,
    isLight ? 0.66 : 0.44,
  );
  group.add(fill);
  environmentLights.push(fill);

  scene.background = new THREE.Color(config.fallback);
  scene.backgroundIntensity = 1;
  scene.fog = null;
  scene.environment = neutralEnvironment;

  Promise.all([loadBackdrop(config), loadHDRI(config)]).then(([backdrop, lightingTexture]) => {
    if (requestId !== environmentRequest || group !== environment) return;
    const intensity = isLight ? config.backgroundLight : config.backgroundDark;
    scene.background = backdrop.texture;
    scene.backgroundRotation.y = config.rotation;
    scene.backgroundIntensity = intensity;
    scene.backgroundBlurriness = 0;

    const grounded = new GroundedSkybox(
      backdrop.texture,
      config.groundHeight,
      config.groundRadius,
      coarsePointer ? 96 : 144,
    );
    grounded.position.y = config.groundHeight - 0.025;
    grounded.rotation.y = config.rotation;
    grounded.material.color.setScalar(intensity);
    grounded.material.depthWrite = false;
    grounded.renderOrder = -20;
    grounded.frustumCulled = false;
    group.add(grounded);

    if (activeEnvironmentMap && activeEnvironmentMap !== neutralEnvironment) activeEnvironmentMap.dispose();
    activeEnvironmentMap = pmrem.fromEquirectangular(lightingTexture).texture;
    scene.environment = activeEnvironmentMap;
    scene.environmentRotation.y = config.rotation;
    scene.environmentIntensity = isLight ? 0.72 : 0.42;
    pruneBackdropCache(backdrop.file);
  }).catch((error) => {
    console.error(`Could not load ${name} environment`, error);
  });
}

function setEnvironment(name) {
  activeScene = ['gallery', 'courtyard', 'blackbox'].includes(name) ? name : 'gallery';
  localStorage.setItem('kulintang-scene', activeScene);
  sceneSelect.value = activeScene;

  if (environment) {
    world.remove(environment);
    disposeObject(environment);
  }
  environmentLights.length = 0;
  environment = new THREE.Group();
  world.add(environment);
  const isLight = effectiveTheme === 'light';
  environmentRequest += 1;
  buildPhotographicScene(environment, activeScene, isLight, environmentRequest);
}

function resolveTheme() {
  const nextTheme = themeMode === 'auto' ? (prefersDark.matches ? 'dark' : 'light') : themeMode;
  if (effectiveTheme === nextTheme && environment) return;
  effectiveTheme = nextTheme;
  app.dataset.theme = effectiveTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveTheme === 'dark' ? '#16130f' : '#ded7c9');
  renderer.toneMappingExposure = effectiveTheme === 'dark' ? 0.72 : 0.88;
  materials.bronze.forEach((material) => {
    material.envMapIntensity = effectiveTheme === 'dark' ? 0.68 : 0.4;
  });
  materials.boss.forEach((material) => {
    material.envMapIntensity = effectiveTheme === 'dark' ? 0.74 : 0.44;
  });
  materials.mat.color.set(effectiveTheme === 'dark' ? 0xc4ae82 : 0xffffff);
  themeButton.dataset.tooltip = `Theme: ${themeMode}`;
  themeButton.setAttribute('aria-label', `Theme: ${themeMode}`);
  setEnvironment(activeScene);
}

function cycleTheme() {
  const modes = ['auto', 'light', 'dark'];
  themeMode = modes[(modes.indexOf(themeMode) + 1) % modes.length];
  localStorage.setItem('kulintang-theme', themeMode);
  effectiveTheme = '';
  resolveTheme();
}

function homeCamera(immediate = false) {
  const mode = frameMode();
  const positions = {
    phone: new THREE.Vector3(0, 7.8, 10.7),
    'tablet-portrait': new THREE.Vector3(0, 4.9, 11.65),
    compact: new THREE.Vector3(0, 4.4, 9.8),
    wide: new THREE.Vector3(0, 4, 8.25),
  };
  const destination = positions[mode];
  const target = new THREE.Vector3(0, mode === 'phone' ? 0.35 : 0.55, 0);
  if (immediate || reducedMotion) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    return;
  }
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const started = performance.now();
  const animateHome = (time) => {
    const progress = clamp((time - started) / 600, 0, 1);
    const eased = easeOutCubic(progress);
    camera.position.lerpVectors(startPosition, destination, eased);
    controls.target.lerpVectors(startTarget, target, eased);
    if (progress < 1) requestAnimationFrame(animateHome);
  };
  requestAnimationFrame(animateHome);
}

buildInstrument();
homeCamera(true);
resolveTheme();

// Audio is fetched immediately. The suspended Web Audio context is resumed by the first key or tap.
let audioContext = null;
let masterGain = null;
let dryGain = null;
let wetGain = null;
let convolver = null;
let compressor = null;
const audioBuffers = Array.from({ length: 8 }, () => []);
const variantCounts = [7, 5, 6, 9, 5, 5, 5, 6];
const lastVariant = new Array(8).fill(-1);
const pendingHits = [];
let loadedCount = 0;
const IOS_MEDIA_POOL_SIZE = 4;
const iosMediaRoundRobin = new Array(8).fill(0);
const iosMediaPools = IS_IOS
  ? variantCounts.map((_, index) => Array.from({ length: IOS_MEDIA_POOL_SIZE }, () => {
      const player = new Audio(`/audio/gong-${index + 1}-a.mp3`);
      player.preload = 'auto';
      player.playsInline = true;
      player.setAttribute('playsinline', '');
      player.setAttribute('webkit-playsinline', '');
      try { player.load(); } catch { /* Safari can defer loading until the first gesture. */ }
      return player;
    }))
  : [];

function createRoomImpulse(context, duration = 1.45, decay = 2.8) {
  const sampleRate = context.sampleRate;
  const impulse = context.createBuffer(2, sampleRate * duration, sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const envelope = Math.pow(1 - i / data.length, decay);
      const early = i < sampleRate * 0.07 ? Math.sin(i * 0.031) * 0.12 : 0;
      data[i] = ((Math.random() * 2 - 1) * envelope + early) * 0.62;
    }
  }
  return impulse;
}

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass({ latencyHint: 'interactive' });
  masterGain = audioContext.createGain();
  dryGain = audioContext.createGain();
  wetGain = audioContext.createGain();
  convolver = audioContext.createConvolver();
  compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;
  convolver.buffer = createRoomImpulse(audioContext);
  dryGain.gain.value = 0.96;
  wetGain.gain.value = Number(roomSlider.value);
  masterGain.gain.value = Number(volumeSlider.value);
  dryGain.connect(compressor);
  convolver.connect(wetGain).connect(compressor);
  compressor.connect(masterGain).connect(audioContext.destination);
  return audioContext;
}

async function resumeAudio() {
  const context = ensureAudio();
  if (!context) return false;
  if (context.state !== 'running') {
    try {
      await Promise.race([
        context.resume(),
        new Promise((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } catch { return false; }
  }
  return context.state === 'running';
}

function playIosGong(index, velocity = 0.82) {
  const pool = iosMediaPools[index];
  if (!pool?.length) return null;
  const cursor = iosMediaRoundRobin[index];
  const player = pool[cursor % pool.length];
  iosMediaRoundRobin[index] = cursor + 1;

  try {
    player.pause();
    player.currentTime = 0;
  } catch { /* The element may not have loaded metadata yet. */ }

  player.muted = false;
  player.defaultMuted = false;
  try {
    player.volume = clamp(Number(volumeSlider.value) * clamp(velocity, 0.2, 1.05), 0, 1);
  } catch { /* iOS may reserve volume control for the device buttons. */ }

  try {
    return Promise.resolve(player.play()).then(() => true);
  } catch (error) {
    return Promise.reject(error);
  }
}

async function preloadAudio() {
  const context = ensureAudio();
  if (!context) {
    loadLabel.textContent = 'Audio unavailable';
    return;
  }
  const loadSample = async (index, variant) => {
    try {
      const suffix = String.fromCharCode(97 + variant);
      const response = await fetch(`/audio/gong-${index + 1}-${suffix}.mp3`, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      audioBuffers[index][variant] = await context.decodeAudioData(bytes);
      if (variant === 0) {
        loadedCount += 1;
        loadLabel.textContent = `Preparing sound ${loadedCount}/8`;
      }
    } catch (error) {
      console.error(`Could not load gong ${index + 1}, take ${variant + 1}`, error);
    }
  };

  await Promise.all(new Array(8).fill(null).map((_, index) => loadSample(index, 0)));
  if (loadedCount === 8) {
    loadLabel.textContent = 'Sound ready';
    loadState.classList.add('ready');
    window.setTimeout(() => { loadState.hidden = true; }, 220);
    const queued = pendingHits.splice(0);
    queued.forEach(({ index, velocity, position }) => soundGong(index, velocity, position));
    if (!IS_IOS) {
      const loadAlternates = () => {
        for (let index = 0; index < 8; index += 1) {
          for (let variant = 1; variant < variantCounts[index]; variant += 1) loadSample(index, variant);
        }
      };
      if ('requestIdleCallback' in window) window.requestIdleCallback(loadAlternates, { timeout: 1800 });
      else window.setTimeout(loadAlternates, 500);
    }
  } else {
    loadLabel.textContent = `${loadedCount}/8 sounds ready`;
  }
}

function soundGong(index, velocity = 0.82, position = centerStrike) {
  const available = audioBuffers[index].filter(Boolean);
  if (!available.length || !audioContext || audioContext.state !== 'running') {
    if (!available.length && pendingHits.length < 12) pendingHits.push({ index, velocity, position });
    return;
  }
  const strike = describeStrike(position);
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const panner = audioContext.createStereoPanner();
  let variant = Math.floor(Math.random() * available.length);
  if (available.length > 1 && variant === lastVariant[index]) variant = (variant + 1) % available.length;
  lastVariant[index] = variant;
  source.buffer = available[variant];
  const localPan = Math.cos(strike.angle) * strike.radial * 0.045;
  panner.pan.value = clamp(THREE.MathUtils.mapLinear(index, 0, 7, -0.62, 0.62) + localPan, -0.68, 0.68);
  const now = audioContext.currentTime;
  const level = clamp(velocity * (1 - strike.rim * 0.05), 0.2, 1.05);
  const naturalRelease = Math.max(0.48, source.buffer.duration + 0.12);
  const release = Math.max(0.34, naturalRelease * (1 - strike.timbre * 0.26 - strike.rim * 0.16));
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  source.connect(gain);
  if (strike.timbre > 0.001) {
    // Position changes modal balance, not tuning. These filters model the missing
    // shoulder and rim articulations while leaving a boss strike untouched.
    const bodyFrequency = 350 * Math.pow(1.12, index);
    const body = audioContext.createBiquadFilter();
    const upperMode = audioContext.createBiquadFilter();
    const brightness = audioContext.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = bodyFrequency;
    body.Q.value = 0.72;
    body.gain.value = -5.2 * strike.timbre - 1.4 * strike.rim;
    upperMode.type = 'peaking';
    upperMode.frequency.value = bodyFrequency * 2.55;
    upperMode.Q.value = 0.86;
    upperMode.gain.value = 2.3 * strike.timbre + 1.1 * strike.rim;
    brightness.type = 'highshelf';
    brightness.frequency.value = Math.min(4200, bodyFrequency * 3.5);
    brightness.gain.value = 2.1 * strike.timbre + 2.5 * strike.rim;
    gain.connect(body).connect(upperMode).connect(brightness).connect(panner);
  } else {
    gain.connect(panner);
  }
  panner.connect(dryGain);
  panner.connect(convolver);
  source.start(now);
  source.stop(now + Math.max(0.5, Math.min(source.buffer.duration + 0.2, release + 0.12)));
}

preloadAudio();

const referenceAudio = new Audio();
referenceAudio.preload = 'metadata';
referenceAudio.playsInline = true;
let referencePlaying = false;

function referenceSource() {
  return `/audio/reference-${referenceSelect.value}.mp3`;
}

function setReferenceIcon(name) {
  referencePlay.innerHTML = `<i data-lucide="${name}"></i>`;
  createIcons({ icons: uiIcons });
}

function stopReference(reset = false) {
  referenceAudio.pause();
  referencePlaying = false;
  if (reset) referenceAudio.currentTime = 0;
  setReferenceIcon('play');
  referencePlay.setAttribute('aria-label', 'Play reference recording');
}

async function toggleReference() {
  if (referencePlaying) {
    stopReference();
    return;
  }
  const expectedSource = new URL(referenceSource(), window.location.href).href;
  if (referenceAudio.src !== expectedSource) referenceAudio.src = referenceSource();
  try {
    await referenceAudio.play();
    referencePlaying = true;
    setReferenceIcon('pause');
    referencePlay.setAttribute('aria-label', 'Pause reference recording');
  } catch (error) {
    console.error('Could not play reference recording', error);
  }
}

referenceAudio.addEventListener('timeupdate', () => {
  const elapsed = Number.isFinite(referenceAudio.currentTime) ? referenceAudio.currentTime * 1000 : 0;
  const duration = Number.isFinite(referenceAudio.duration) ? referenceAudio.duration * 1000 : 0;
  referenceTime.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
});
referenceAudio.addEventListener('ended', () => stopReference(true));
referenceAudio.addEventListener('error', () => {
  referenceTime.textContent = 'Unavailable';
  stopReference();
});

let recording = false;
let recordOrigin = 0;
let recordedEvents = [];
let recordedDuration = 0;
let playbackTimers = [];
let playbackStarted = 0;
let playing = false;
let loopEnabled = false;
let readoutFrame = 0;

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateTransport() {
  playButton.disabled = recordedEvents.length === 0 || recording || playing;
  stopButton.disabled = !recording && !playing;
  clearButton.disabled = recordedEvents.length === 0 || recording || playing;
  recordButton.classList.toggle('recording', recording);
  recordButton.setAttribute('aria-label', recording ? 'Finish recording' : 'Record');
  recordButton.dataset.tooltip = recording ? 'Finish recording' : 'Record';
}

function startRecording() {
  stopPlayback();
  recordedEvents = [];
  recordedDuration = 0;
  recordOrigin = 0;
  recording = true;
  transportReadout.textContent = 'Ready';
  updateTransport();
}

function finishRecording() {
  if (!recording) return;
  recording = false;
  if (recordedEvents.length) {
    const last = recordedEvents.at(-1).time;
    recordedDuration = Math.max(1200, last + 850);
    transportReadout.textContent = formatTime(recordedDuration);
  } else {
    transportReadout.textContent = '0:00';
  }
  updateTransport();
}

function cancelPlaybackTimers() {
  playbackTimers.forEach((timer) => window.clearTimeout(timer));
  playbackTimers = [];
  cancelAnimationFrame(readoutFrame);
}

function playRecording() {
  if (!recordedEvents.length || playing) return;
  finishRecording();
  playing = true;
  playbackStarted = performance.now();
  updateTransport();
  recordedEvents.forEach((event) => {
    const timer = window.setTimeout(() => strikeGong(event.index, event.velocity, {
      record: false,
      position: event.position,
    }), event.time);
    playbackTimers.push(timer);
  });
  const endTimer = window.setTimeout(() => {
    playing = false;
    if (loopEnabled) playRecording();
    else {
      transportReadout.textContent = formatTime(recordedDuration);
      updateTransport();
    }
  }, recordedDuration);
  playbackTimers.push(endTimer);
  const updateReadout = () => {
    if (!playing) return;
    transportReadout.textContent = formatTime(performance.now() - playbackStarted);
    readoutFrame = requestAnimationFrame(updateReadout);
  };
  readoutFrame = requestAnimationFrame(updateReadout);
}

function stopPlayback() {
  cancelPlaybackTimers();
  const wasActive = playing || recording;
  playing = false;
  if (recording) finishRecording();
  if (wasActive) transportReadout.textContent = recordedEvents.length ? formatTime(recordedDuration) : '0:00';
  updateTransport();
}

function clearRecording() {
  stopPlayback();
  recordedEvents = [];
  recordedDuration = 0;
  transportReadout.textContent = '0:00';
  updateTransport();
}

async function strikeGong(index, velocity = 0.82, options = {}) {
  if (index < 0 || index > 7) return;
  const strike = describeStrike(options.position);
  if (IS_IOS) {
    const mediaPlayback = playIosGong(index, velocity);
    if (mediaPlayback) {
      mediaPlayback.catch(async (error) => {
        console.warn('iPhone media playback failed, falling back to Web Audio', error);
        if (await resumeAudio()) soundGong(index, velocity, strike);
      });
    } else if (await resumeAudio()) {
      soundGong(index, velocity, strike);
    }
  } else {
    await resumeAudio();
    soundGong(index, velocity, strike);
  }
  const state = gongStates[index];
  state.strike = strike;
  animateBeaterHit(state, strike, velocity);
  spawnSparks(state, strike, velocity, index);
  state.impulse = Math.min(1.25, state.impulse + velocity * 0.94);
  materials.bronze[index].emissive?.set(0x2a1404);
  materials.boss[index].emissive?.set(0x2a1404);
  materials.bronze[index].emissiveIntensity = 0.18 * strike.timbre;
  materials.boss[index].emissiveIntensity = 0.28 * (1 - strike.timbre * 0.82);
  const button = gongButtons[index];
  button.classList.add('active');
  window.setTimeout(() => button.classList.remove('active'), 130);

  if (recording && options.record !== false) {
    const now = performance.now();
    if (!recordOrigin) {
      recordOrigin = now;
      transportReadout.textContent = '0:00';
    }
    recordedEvents.push({
      index,
      time: now - recordOrigin,
      velocity,
      position: { radial: strike.radial, angle: strike.angle },
    });
  }
}

function pointerCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function gongHitAtPointer(event) {
  pointerCoordinates(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
  if (!hit) return null;
  const index = hit.object.userData.gongIndex;
  const state = gongStates[index];
  const point = state.group.worldToLocal(hit.point.clone());
  const radial = clamp(Math.hypot(point.x, point.z) / state.radius, 0, 1);
  return {
    index,
    position: describeStrike({ radial, angle: Math.atan2(point.z, point.x) }),
  };
}

canvas.addEventListener('pointerdown', (event) => {
  pressedPointer = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
  resumeAudio();
});

canvas.addEventListener('pointerup', (event) => {
  if (!pressedPointer || pressedPointer.id !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pressedPointer.x, event.clientY - pressedPointer.y);
  const duration = performance.now() - pressedPointer.time;
  pressedPointer = null;
  if (distance > 9 || duration > 520) return;
  const hit = gongHitAtPointer(event);
  if (hit) {
    strikeGong(hit.index, clamp(0.62 + (1 - duration / 520) * 0.35, 0.58, 1), {
      position: hit.position,
    });
  }
});

canvas.addEventListener('pointercancel', () => { pressedPointer = null; });
canvas.addEventListener('pointermove', (event) => {
  if (coarsePointer || pressedPointer) return;
  const hit = gongHitAtPointer(event);
  canvas.style.cursor = hit ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => {
  canvas.style.cursor = 'grab';
});

gongButtons.forEach((button, index) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    strikeGong(index, 0.86);
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0) strikeGong(index, 0.86);
  });
});

const downKeys = new Set();
window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (!keyMap.has(key)) return;
  event.preventDefault();
  downKeys.add(key);
  strikeGong(keyMap.get(key), 0.9);
});
window.addEventListener('keyup', (event) => downKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => downKeys.clear());

document.querySelector('#reset-camera').addEventListener('click', () => homeCamera());
document.querySelector('#about-button').addEventListener('click', () => aboutDialog.showModal());
document.querySelector('#about-close').addEventListener('click', () => aboutDialog.close());
aboutDialog.addEventListener('click', (event) => {
  const rect = aboutDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) aboutDialog.close();
});
themeButton.addEventListener('click', cycleTheme);
prefersDark.addEventListener('change', () => { if (themeMode === 'auto') { effectiveTheme = ''; resolveTheme(); } });

settingsButton.addEventListener('click', () => {
  const open = settingsPanel.hidden;
  settingsPanel.hidden = !open;
  settingsButton.setAttribute('aria-expanded', String(open));
});
referenceButton.addEventListener('click', () => {
  const open = referencePanel.hidden;
  referencePanel.hidden = !open;
  referenceButton.setAttribute('aria-expanded', String(open));
  if (!open) stopReference();
});
referencePlay.addEventListener('click', toggleReference);
referenceSelect.addEventListener('change', () => {
  stopReference(true);
  referenceAudio.removeAttribute('src');
  referenceAudio.load();
  referenceTime.textContent = '0:00';
});
document.addEventListener('pointerdown', (event) => {
  if (settingsPanel.hidden || settingsPanel.contains(event.target) || settingsButton.contains(event.target)) return;
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
});
document.addEventListener('pointerdown', (event) => {
  if (referencePanel.hidden || referencePanel.contains(event.target) || referenceButton.contains(event.target)) return;
  referencePanel.hidden = true;
  referenceButton.setAttribute('aria-expanded', 'false');
  stopReference();
});
sceneSelect.addEventListener('change', () => setEnvironment(sceneSelect.value));
volumeSlider.addEventListener('input', () => {
  ensureAudio();
  masterGain.gain.setTargetAtTime(Number(volumeSlider.value), audioContext.currentTime, 0.015);
});
roomSlider.addEventListener('input', () => {
  ensureAudio();
  wetGain.gain.setTargetAtTime(Number(roomSlider.value), audioContext.currentTime, 0.02);
});

recordButton.addEventListener('click', () => recording ? finishRecording() : startRecording());
playButton.addEventListener('click', playRecording);
stopButton.addEventListener('click', stopPlayback);
clearButton.addEventListener('click', clearRecording);
loopButton.addEventListener('click', () => {
  loopEnabled = !loopEnabled;
  loopButton.setAttribute('aria-pressed', String(loopEnabled));
});

let usedFrameMode = frameMode();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  const nextFrameMode = frameMode(width, height);
  camera.fov = frameFov(nextFrameMode);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarsePointer ? 1.6 : 2));
  renderer.setSize(width, height, false);
  if (nextFrameMode !== usedFrameMode) {
    usedFrameMode = nextFrameMode;
    requestAnimationFrame(() => homeCamera(true));
  }
}
window.addEventListener('resize', resize);

let lastAnimationTime = performance.now();
let animationElapsed = 0;

function updateBeaters(delta) {
  for (const beater of beaterStates) {
    const motion = beater.userData.motion;
    if (!motion.active) continue;
    motion.elapsed += delta;
    const progress = clamp(motion.elapsed / motion.duration, 0, 1);
    if (progress < 0.54) {
      const phase = progress / 0.54;
      const travel = THREE.MathUtils.smoothstep(phase, 0, 1);
      const lift = Math.sin(phase * Math.PI) * 0.22;
      beater.position.lerpVectors(motion.fromPosition, motion.targetPosition, travel);
      beater.position.y += lift;
      beater.rotation.set(
        THREE.MathUtils.lerp(motion.fromRotation.x, motion.targetRotation.x, travel) - lift * 0.18,
        THREE.MathUtils.lerp(motion.fromRotation.y, motion.targetRotation.y, travel),
        THREE.MathUtils.lerp(motion.fromRotation.z, motion.targetRotation.z, travel),
      );
    } else {
      const phase = (progress - 0.54) / 0.46;
      const travel = THREE.MathUtils.smoothstep(phase, 0, 1);
      const rebound = Math.sin(phase * Math.PI) * 0.12;
      beater.position.lerpVectors(motion.targetPosition, motion.restPosition, travel);
      beater.position.y += rebound;
      beater.rotation.set(
        THREE.MathUtils.lerp(motion.targetRotation.x, motion.restRotation.x, travel) - rebound * 0.12,
        THREE.MathUtils.lerp(motion.targetRotation.y, motion.restRotation.y, travel),
        THREE.MathUtils.lerp(motion.targetRotation.z, motion.restRotation.z, travel),
      );
    }
    if (progress >= 1) {
      motion.active = false;
      beater.position.copy(motion.restPosition);
      beater.rotation.copy(motion.restRotation);
    }
  }
}

function updateSparks(delta) {
  if (!sparkPoints) return;
  const positions = sparkPoints.geometry.attributes.position.array;
  const colors = sparkPoints.geometry.attributes.color.array;
  for (const particle of sparkPoints.userData.pool) {
    const offset = particle.index * 3;
    if (particle.life > 0) {
      particle.life -= delta;
      particle.velocity.y -= delta * 1.65;
      particle.position.addScaledVector(particle.velocity, delta);
      const alpha = Math.max(0, particle.life / particle.maxLife);
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      colors[offset] = particle.color.r * alpha;
      colors[offset + 1] = particle.color.g * alpha;
      colors[offset + 2] = particle.color.b * alpha;
    } else {
      positions[offset] = 0;
      positions[offset + 1] = -20;
      positions[offset + 2] = 0;
      colors[offset] = 0;
      colors[offset + 1] = 0;
      colors[offset + 2] = 0;
    }
  }
  sparkPoints.geometry.attributes.position.needsUpdate = true;
  sparkPoints.geometry.attributes.color.needsUpdate = true;
}

function animate(time = performance.now()) {
  requestAnimationFrame(animate);
  const delta = Math.min(Math.max((time - lastAnimationTime) / 1000, 0), 0.035);
  lastAnimationTime = time;
  animationElapsed += delta;
  updateBeaters(delta);
  updateSparks(delta);
  gongStates.forEach((state, index) => {
    if (state.impulse > 0.002) {
      state.impulse *= Math.pow(0.055, delta);
      const oscillation = Math.sin(animationElapsed * (25 + index * 0.8) + state.phase) * state.impulse;
      const strikeX = Math.cos(state.strike.angle) * state.strike.radial;
      const strikeZ = Math.sin(state.strike.angle) * state.strike.radial;
      state.group.rotation.x = oscillation * (0.01 + strikeZ * 0.006);
      state.group.rotation.z = oscillation * (0.006 - strikeX * 0.006);
      state.group.position.y = 1.23 + Math.abs(oscillation) * 0.006;
      materials.bronze[index].emissiveIntensity = Math.max(0, state.impulse * 0.1 * state.strike.timbre);
      materials.boss[index].emissiveIntensity = Math.max(0, state.impulse * 0.16 * (1 - state.strike.timbre * 0.82));
    } else {
      state.impulse = 0;
      state.group.rotation.x *= 0.82;
      state.group.rotation.z *= 0.82;
      state.group.position.y += (1.23 - state.group.position.y) * 0.2;
      materials.bronze[index].emissiveIntensity = 0;
      materials.boss[index].emissiveIntensity = 0;
    }
  });
  controls.update();
  renderer.render(scene, camera);
}

updateTransport();
animate();
