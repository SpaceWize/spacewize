/* ============================================================
   SPACE WIZE ENTERPRISE — 404
   The moon and the falling blossom, with nothing between them. Same
   two sprites the tree uses, imported rather than redrawn, so this
   page cannot drift away from the look of the real one.

   No tree, no branches, no interaction — the absence is the point.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { moonTexture, blossomSprite } from './sprites.js';

const canvas = document.getElementById('scene');
if (!canvas) throw new Error('no canvas');

/* Same bail-out as the tree: without WebGL the page is still a page,
   just a quiet one. */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}
if (!webglAvailable()) {
  canvas.remove();
  throw new Error('WebGL unavailable — the copy carries the page.');
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let noMotion = motionQuery.matches;
motionQuery.addEventListener('change', (e) => { noMotion = e.matches; });

const isSmall = window.matchMedia('(max-width: 820px)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setClearColor(0x06070f, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label',
  'A moon over drifting cherry blossom, with no tree beneath it.');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06070f, 15, 38);

const FOV = 42;
const HALF_FOV = Math.tan((FOV * Math.PI) / 180 / 2);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
camera.position.set(0, 0.6, 13);
camera.lookAt(0, 0.4, 0);

/* ---- the moon, off to one side and alone ---- */
const moonMat = new THREE.SpriteMaterial({
  map: moonTexture(),
  transparent: true,
  depthWrite: false,
  fog: false,
  blending: THREE.AdditiveBlending,
});
/* pushed past 1.0 so the bloom threshold catches it, exactly as the
   tree does — tonemapping brings it back to a glow */
moonMat.color.setRGB(1.5, 0.86, 0.74);
const moon = new THREE.Sprite(moonMat);
moon.scale.set(8.4, 8.4, 1);
/* Centred, sitting high enough that the copy clears it underneath —
   there is no tree here to block it, so the text has to be somewhere
   the glow is not. */
moon.position.set(0, 4.8, -20);
scene.add(moon);

/* ---- the blossom, still falling past nothing ---- */
const PETALS = isSmall ? 190 : 460;
/* A touch larger than the tree's, deliberately: with nothing else in
   frame the blossom carries the whole page, so it can afford to read
   more clearly. */
const PETAL_MIN = 0.078;
const PETAL_VARY = 0.108;

const pos  = new Float32Array(PETALS * 3);
const vel  = new Float32Array(PETALS * 2);
const size = new Float32Array(PETALS);
const rot  = new Float32Array(PETALS);
const spin = new Float32Array(PETALS);
const tint = new Float32Array(PETALS);

for (let i = 0; i < PETALS; i++) {
  pos[i * 3]     = (Math.random() - 0.5) * 22;
  pos[i * 3 + 1] = -7 + Math.random() * 16;
  pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
  vel[i * 2]     = 0.25 + Math.random() * 0.45;
  vel[i * 2 + 1] = Math.random() * Math.PI * 2;
  size[i] = PETAL_MIN + Math.random() * PETAL_VARY;
  rot[i]  = Math.random() * Math.PI * 2;
  spin[i] = (Math.random() - 0.5) * 1.4;
  tint[i] = Math.random() < 0.16 ? 1 : 0;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aSize',    new THREE.BufferAttribute(size, 1));
geo.setAttribute('aRot',     new THREE.BufferAttribute(rot, 1));
geo.setAttribute('aSpin',    new THREE.BufferAttribute(spin, 1));
geo.setAttribute('aTint',    new THREE.BufferAttribute(tint, 1));

const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uMap:     { value: blossomSprite(4) },
    uMapSoft: { value: blossomSprite(10) },
    uTime:    { value: 0 },
    uScale:   { value: 600 },
    uSplit:   { value: 0.035 },
    uFocus:   { value: 13 },
    uSakura:  { value: new THREE.Color(0xfbd3e0) },
    uCyan:    { value: new THREE.Color(0x4fc3f7) },
  },
  vertexShader: `
    attribute float aSize;
    attribute float aRot;
    attribute float aSpin;
    attribute float aTint;
    uniform float uTime;
    uniform float uScale;
    uniform float uFocus;
    varying float vRot;
    varying float vTint;
    varying float vCoc;
    void main(){
      vRot  = aRot + uTime * aSpin;
      vTint = aTint;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dist = -mv.z;
      vCoc = clamp(abs(dist - uFocus) / 7.0, 0.0, 1.0);
      float size = aSize * uScale / max(dist, 0.001);
      gl_PointSize = min(size * (1.0 + vCoc * 0.7), 40.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform sampler2D uMap;
    uniform sampler2D uMapSoft;
    uniform float uSplit;
    uniform vec3 uSakura;
    uniform vec3 uCyan;
    varying float vRot;
    varying float vTint;
    varying float vCoc;
    void main(){
      vec2 uv = gl_PointCoord - 0.5;
      float s = sin(vRot), c = cos(vRot);
      uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
      float rSharp = texture2D(uMap, uv + vec2(uSplit, 0.0)).a;
      float gSharp = texture2D(uMap, uv).a;
      float bSharp = texture2D(uMap, uv - vec2(uSplit, 0.0)).a;
      float rSoft = texture2D(uMapSoft, uv + vec2(uSplit, 0.0)).a;
      float gSoft = texture2D(uMapSoft, uv).a;
      float bSoft = texture2D(uMapSoft, uv - vec2(uSplit, 0.0)).a;
      float r = mix(rSharp, rSoft, vCoc);
      float g = mix(gSharp, gSoft, vCoc);
      float b = mix(bSharp, bSoft, vCoc);
      float a = max(r, max(g, b));
      if (a < 0.02) discard;
      vec3 base = mix(uSakura, uCyan, vTint);
      vec3 col  = base * g
                + vec3(1.0, 0.22, 0.42) * r * 0.55
                + vec3(0.28, 0.82, 1.0) * b * 0.55;
      col /= 1.5;
      gl_FragColor = vec4(col, a * (0.5 - vCoc * 0.16));
    }
  `,
});

const drift = new THREE.Points(geo, mat);
drift.frustumCulled = false;
scene.add(drift);

/* ---- post ---- */
let composer = null;
let bloomPass = null;
let sizedW = 0;
let sizedH = 0;

function resize() {
  const w = canvas.clientWidth  || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (!w || !h || (w === sizedW && h === sizedH)) return;
  sizedW = w; sizedH = h;
  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  /* centred on both, so nothing to adjust per shape */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }
}
resize();

composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizedW || 1, sizedH || 1), 0.34, 0.45, 0.42);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.setSize(sizedW, sizedH);
bloomPass.resolution.set(sizedW, sizedH);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  resize();
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  mat.uniforms.uScale.value = renderer.domElement.height / (2 * HALF_FOV);

  if (!noMotion) {
    mat.uniforms.uTime.value = time;
    const p = geo.attributes.position.array;
    for (let i = 0; i < PETALS; i++) {
      const y = i * 3 + 1;
      p[y] -= vel[i * 2] * dt;
      p[i * 3] += Math.sin(time * 0.6 + vel[i * 2 + 1]) * dt * 0.22;
      /* nothing to land on here — they fall out of frame and start again */
      if (p[y] < -8) {
        p[y] = 9;
        p[i * 3]     = (Math.random() - 0.5) * 22;
        p[i * 3 + 2] = (Math.random() - 0.5) * 14;
      }
    }
    geo.attributes.position.needsUpdate = true;

    /* the faintest drift, so the frame is never quite still */
    camera.position.x = Math.sin(time * 0.06) * 0.5;
    camera.lookAt(0, 0.4, 0);
  }

  composer.render();
}

document.body.dataset.scene = 'on';
animate();
