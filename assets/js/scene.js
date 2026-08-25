/* ============================================================
   SPACE WIZE ENTERPRISE — the tree
   Six scaffolds off one trunk, one per division. Hover a branch and
   it blooms, then hangs its tag off the blossoms. Drag to walk
   around it.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas     = document.getElementById('scene');
const stage      = document.getElementById('main');
const fallback   = document.getElementById('fallback');
const tag        = document.getElementById('tag');
const panel      = document.getElementById('panel');
const panelName  = document.getElementById('panelName');
const panelLine  = document.getElementById('panelLine');
const panelTag   = document.getElementById('panelTag');
const panelBtn   = document.getElementById('panelBtn');
const panelBtnText = document.getElementById('panelBtnText');
const liveRegion = document.getElementById('liveRegion');
const panelWhen  = document.getElementById('panelWhen');
const keys       = document.getElementById('branchKeys');
const hint       = document.getElementById('hint');

/* ---------- the divisions come from the DOM, so the page still
              works with no JS and no WebGL ---------- */
const DIVISIONS = Array.from(
  document.querySelectorAll('#branchData > li')
).map((li) => ({
  id:     li.dataset.id,
  name:   li.dataset.name,
  line:   li.dataset.line,
  url:    li.dataset.url || '',
  live:   li.dataset.live === 'true',
  stage:  li.dataset.stage || 'Planned',
  when:   li.dataset.when || '',
  notify: li.dataset.notify || '',
  /* how far this branch's flowers can open — the tree doubles as the
     progress board, so a division nearer to opening is further out of
     bud even before anyone touches it */
  bloom:  parseFloat(li.dataset.bloom || '0'),
}));

/* derived, not written by hand: the headline count cannot drift out of
   step with the six entries above */
{
  const liveN = DIVISIONS.filter((d) => d.live).length;
  const soon  = DIVISIONS.filter((d) => !d.live && d.when).length;
  const el = document.querySelector('.status');
  if (el) {
    el.innerHTML = '<span class="dot" aria-hidden="true"></span> ' +
      liveN + ' live' + (soon ? ' · ' + soon + ' opening in 2027' : '');
  }
}

/* ---------- bail out cleanly if WebGL is unavailable ---------- */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}
if (!webglAvailable() || !DIVISIONS.length) {
  /* no scene is coming — the static list is the page */
  document.documentElement.removeAttribute('data-js');
  canvas.remove();
  if (hint) hint.remove();
  if (tag) tag.remove();
  throw new Error('WebGL unavailable — static division list retained.');
}

/* ============================================================
   preferences
   ============================================================ */
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let noMotion = motionQuery.matches;
motionQuery.addEventListener('change', (e) => { noMotion = e.matches; });

const canHover = window.matchMedia('(hover: hover)').matches;
const isSmall  = window.matchMedia('(max-width: 820px)').matches;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ============================================================
   renderers, scene, camera
   ============================================================ */
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setClearColor(0x06070f, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

canvas.setAttribute('role', 'img');
canvas.setAttribute(
  'aria-label',
  'A cherry tree with six branches, one for each Space Wize Enterprise division. ' +
  'Drag to turn the tree. Use the division buttons to open each branch.'
);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06070f, 15, 38);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

const FOV = 42;
const HALF_FOV = Math.tan((FOV * Math.PI) / 180 / 2);
const FRAMING = 1.14;

/* Framing is measured off the tree once it exists rather than guessed.
   A procedural tree changes size whenever the growth rules change, and
   hardcoded half-extents silently crop it. */
let fitRadius = 4.8;   // furthest blossom from the trunk axis
let fitTop    = 3.6;   // top of the canopy
let fitBottom = -3.6;  // how far down the trunk to keep in frame

/* ---------- orbit state (spherical, so vertical drag works) ----------
   The moon hangs at one fixed point in the world, so orbiting really
   does carry you away from it until it sits behind you. HOME_THETA is
   only the bearing the page opens on — the one the moon is placed
   against so the tree starts backlit. */
const HOME_THETA = 0.6;

/* Where the moon hangs. The sprite and the key light both read from
   this, so the light always comes from the thing you can see glowing. */
const MOON_DIST = 26;
const MOON_POS = new THREE.Vector3(
  -Math.sin(HOME_THETA) * MOON_DIST,
  2.6,
  -Math.cos(HOME_THETA) * MOON_DIST
);
const orbit = {
  radius: 12.4,
  baseRadius: 12.4,
  theta: 0.6, phi: 1.42,
  targetTheta: 0.6, targetPhi: 1.42,
  velTheta: 0,
};
const LOOK_AT = new THREE.Vector3(0, 1.3, 0);
/* Where the camera rests when nothing is selected. LOOK_AT and
   orbit.radius are then eased away from these toward whichever branch
   is open, which is the whole push-in effect. */
const homeLook = new THREE.Vector3(0, 1.3, 0);
const ZOOM_IN = 0.58;      // fraction of the framing distance when close
let zoom = 1;

/* Size from the canvas box, not the window. A tab that loads while
   hidden reports a zero-size viewport, and a scene that starts at 0x0
   never recovers on its own. */
let sizedW = 0;
let sizedH = 0;
/* declared up here because resize() runs before the tag section */
let tagMetricsDirty = true;
/* assembled further down, once the scene exists to render — resize()
   is called once before that, so it has to tolerate these being null */
let composer = null;
let bloomPass = null;
let moonSprite = null;
let fallenMat = null;
function resize() {
  const w = canvas.clientWidth  || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (!w || !h || (w === sizedW && h === sizedH)) return;
  sizedW = w;
  sizedH = h;
  tagMetricsDirty = true;
  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }

  /* Pull back far enough that the tree fits whatever shape the window
     happens to be. On a phone held upright the tree is wider than the
     screen no matter how far back you stand, so the width fit is
     capped and the outer branches run off the sides rather than
     shrinking the tree to a speck. */
  const halfH = (fitTop - fitBottom) / 2;
  const distH = halfH / HALF_FOV;
  const distW = fitRadius / (HALF_FOV * aspect);
  orbit.baseRadius = Math.max(distH, Math.min(distW, distH * 1.25)) * FRAMING;
  orbit.radius = orbit.baseRadius * zoom;

  /* Portrait puts the copy over the lower half, so aim lower and let
     the canopy sit in the space that is actually free. */
  const portrait = aspect < 0.95;
  homeLook.set(0, (fitTop + fitBottom) / 2 - (portrait ? 1.1 : 0), 0);
  /* aiming lower lifts everything in frame, which would tuck the moon
     up behind the nav bar — so it follows the aim point down */
  if (moonSprite) moonSprite.position.y = portrait ? 0.6 : 2.6;
}
resize();

function applyCamera() {
  const { radius, theta, phi } = orbit;
  camera.position.set(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(LOOK_AT);
}
applyCamera();

/* ============================================================
   light
   The moon is the only light source you can actually see, so it has
   to be the one doing the lighting. Keying off it warm and from
   behind is what stops the tree reading as lit by nothing.
   ============================================================ */
scene.add(new THREE.AmbientLight(0x6b5d92, 1.02));

const moonKey = new THREE.DirectionalLight(0xffb98d, 1.5);
moonKey.position.copy(MOON_POS);
scene.add(moonKey);

/* a cool fill from the viewer's side, or the moon behind would leave
   the tree a flat silhouette */
const fill = new THREE.DirectionalLight(0xa6b4ff, 0.66);
fill.position.set(6, 5, 8);
scene.add(fill);

/* without a little light from below, the trunk is dark bark against a
   dark ground and simply disappears */
const uplight = new THREE.DirectionalLight(0x9d86d8, 0.32);
uplight.position.set(0, -7, 4);
scene.add(uplight);

/* one roaming point light rather than six — it follows the open branch */
const glow = new THREE.PointLight(0xe36fa0, 0, 19, 1.7);
scene.add(glow);

/* ============================================================
   the moon — a real bloom source, not a CSS backdrop
   Slicing and the RGB fringe come straight off the Space Wize
   Enterprise logo. It hangs at one fixed point in the world, placed
   behind the tree on the bearing the page opens at — so turning the
   tree far enough genuinely leaves it behind you.
   ============================================================ */
function moonTexture() {
  const size = 512;
  const cx = size / 2, cy = size / 2, r = size * 0.29;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');

  const glow = x.createRadialGradient(cx, cy, r * 0.15, cx, cy, size * 0.62);
  glow.addColorStop(0,   'rgba(232,85,106,0.55)');
  glow.addColorStop(0.5, 'rgba(232,85,106,0.16)');
  glow.addColorStop(1,   'rgba(232,85,106,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, size, size);

  x.save();
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.clip();
  const disc = x.createLinearGradient(0, cy - r, 0, cy + r);
  disc.addColorStop(0,    '#E8556A');
  disc.addColorStop(0.32, '#E8556A');
  disc.addColorStop(0.56, '#EE7160');
  disc.addColorStop(1,    '#F5A65B');
  x.fillStyle = disc;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  /* the CRT slicing, straight off the logo */
  x.globalCompositeOperation = 'destination-out';
  for (let y = cy - r; y < cy + r; y += 5) {
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(cx - r, y, r * 2, 3);
  }
  x.restore();

  /* the edge fringe the logo's channel split has */
  x.globalCompositeOperation = 'source-over';
  x.lineWidth = 2.2;
  x.strokeStyle = 'rgba(232,85,106,0.5)';
  x.beginPath(); x.arc(cx + 2, cy, r, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(79,195,247,0.4)';
  x.beginPath(); x.arc(cx - 2, cy, r, 0, Math.PI * 2); x.stroke();

  /* additive blending amplifies even near-zero alpha into a visible
     bloom, so the gradient's soft fade isn't enough on its own — a
     hard mask guarantees nothing paints outside a circle */
  x.globalCompositeOperation = 'destination-in';
  const mask = x.createRadialGradient(cx, cy, size * 0.26, cx, cy, size * 0.46);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = mask;
  x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const moonMat = new THREE.SpriteMaterial({
  map: moonTexture(),
  transparent: true,
  depthWrite: false,
  fog: false,             // it rides the camera at a fixed distance —
  blending: THREE.AdditiveBlending,
});
/* pushed past 1.0 on purpose: additive colour this hot guarantees the
   bloom pass' threshold catches it, then ACES tonemapping brings it
   back down to a glow instead of a blown-out white disc */
moonMat.color.setRGB(1.5, 0.86, 0.74);
moonSprite = new THREE.Sprite(moonMat);
moonSprite.scale.set(9.6, 9.6, 1);
moonSprite.position.copy(MOON_POS);
scene.add(moonSprite);

/* ============================================================
   post-processing — real bloom, not a fake halo sprite
   ============================================================ */
composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizedW || 1, sizedH || 1),
  0.34,   // strength
  0.45,   // radius
  0.42    // threshold — only the moon, emissive blossoms and halo bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.setSize(sizedW, sizedH);
bloomPass.resolution.set(sizedW, sizedH);
sizedW = 0;                 // rerun resize now the moon can be placed
resize();

/* ============================================================
   shared geometry and materials
   ============================================================ */

/* a sakura petal: rounded, with the notch at the tip */
const petalShape = new THREE.Shape();
petalShape.moveTo(0, 0);
petalShape.bezierCurveTo(0.40, 0.16, 0.40, 0.80, 0.13, 1.00);
petalShape.lineTo(0, 0.86);
petalShape.lineTo(-0.13, 1.00);
petalShape.bezierCurveTo(-0.40, 0.80, -0.40, 0.16, 0, 0);

const petalGeo = new THREE.ShapeGeometry(petalShape, 10);
{
  // cup the petal so it catches light instead of reading as a flat card
  const p = petalGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, -0.17 * y * y);
  }
  p.needsUpdate = true;
  petalGeo.computeVertexNormals();
}
petalGeo.scale(0.30, 0.30, 0.30);

const coreGeo = new THREE.SphereGeometry(0.032, 6, 5);
/* A template. Every branch clones it, because a single shared core
   material cannot follow its branch: with a fixed emissive the flower
   centres stayed dim while the petals blew out around them, leaving a
   dark speck exactly where each flower was. */
const CORE_MAT = new THREE.MeshStandardMaterial({
  color: 0xf6e3a1, emissive: 0xf6c96a, emissiveIntensity: 0.5, roughness: 0.6,
});

/* Cherry bark: fibres running along the limb, and the horizontal
   lenticel dashes that wrap around it. Tube UVs put length on u and
   circumference on v, so the fibres are drawn across the canvas and
   the lenticels down it. */
function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#b9a9cc';
  x.fillRect(0, 0, 512, 128);

  for (let i = 0; i < 460; i++) {
    const y  = Math.random() * 128;
    const sx = Math.random() * 512;
    const w  = 24 + Math.random() * 200;
    const dark = Math.random() < 0.62;
    const a = 0.05 + Math.random() * 0.17;
    x.strokeStyle = dark
      ? `rgba(46,32,64,${a})`
      : `rgba(232,222,244,${a * 0.8})`;
    x.lineWidth = 0.6 + Math.random() * 2.3;
    x.beginPath();
    x.moveTo(sx, y);
    x.bezierCurveTo(
      sx + w * 0.33, y + (Math.random() - 0.5) * 3.5,
      sx + w * 0.66, y + (Math.random() - 0.5) * 3.5,
      sx + w,        y + (Math.random() - 0.5) * 2.5
    );
    x.stroke();
  }

  /* lenticels — the dashes that band a cherry trunk */
  for (let i = 0; i < 34; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 128;
    const h  = 5 + Math.random() * 16;
    x.strokeStyle = `rgba(38,26,54,${0.24 + Math.random() * 0.3})`;
    x.lineWidth = 1.4 + Math.random() * 2.4;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + (Math.random() - 0.5) * 2.5, cy + h);
    x.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.anisotropy = 4;
  return t;
}

const barkTex = barkTexture();
const barkMat = new THREE.MeshStandardMaterial({
  color: 0x5a4269,
  map: barkTex,
  bumpMap: barkTex,
  bumpScale: 0.02,
  roughness: 0.88,
  metalness: 0.0,
});

/* The trunk is many times longer than a twig, so sharing one repeat
   value stretches its grain to mush. It gets its own tiling. */
const trunkTex = barkTexture();
trunkTex.repeat.set(9, 2);
const trunkMat = barkMat.clone();
trunkMat.map = trunkTex;
trunkMat.bumpMap = trunkTex;
trunkMat.bumpScale = 0.035;

function softSprite(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const haloTex = softSprite('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');

/* ============================================================
   deterministic randomness — the tree is organic but never
   rearranges itself between visits
   ============================================================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260823);
/* Blossoms draw from their own stream. grow() keeps `rnd` to itself,
   so changing how many flowers a twig carries can never reshape the
   branches — otherwise every density tweak silently regrows the tree
   and there is no way to judge the change you actually made. */
const rndBloom = mulberry32(20260824);
/* and one for the fallen drift, for the same reason */
const rndFall = mulberry32(20260825);

/* ============================================================
   tapered tubes — wood thins along its length
   ============================================================ */
function taperedTube(curve, r0, r1, seg, radial) {
  const geo = new THREE.TubeGeometry(curve, seg, r0, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const centre = curve.getPointAt(t);
    const s = 1 + (r1 / r0 - 1) * t;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(centre).multiplyScalar(s).add(centre);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ============================================================
   recursive growth
   Every limb sags a little more than its parent, bends off-axis, and
   splits into two or three thinner ones. Blossoms only appear on the
   finest twigs, which is where a cherry actually flowers.
   ============================================================ */
const MAX_DEPTH = 3;
const UP = new THREE.Vector3(0, 1, 0);
/* how many flower spurs each limb carries, indexed by depth — index 0
   is the finest twig, index 3 the scaffold off the trunk */
const SPUR_COUNT = isSmall ? [2, 2, 2, 2] : [5, 5, 5, 5];

function grow(p0, dir, len, rad, depth, wood, tips, spurs) {
  const end = p0.clone().addScaledVector(dir, len);
  /* thinner wood carries less weight but bends further */
  end.y -= len * (0.06 + 0.13 * (MAX_DEPTH - depth));

  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
  perp.normalize();

  const bend = (rnd() - 0.5) * len * 0.34;
  const m1 = p0.clone().addScaledVector(dir, len * 0.34)
                .addScaledVector(perp, bend * 0.45);
  const m2 = p0.clone().addScaledVector(dir, len * 0.68)
                .addScaledVector(perp, bend);
  m2.y -= len * 0.04;

  const curve = new THREE.CatmullRomCurve3([p0, m1, m2, end]);
  const seg    = depth >= 2 ? 14 : 8;
  const radial = depth >= 2 ? 8 : 5;
  wood.push(taperedTube(curve, rad, rad * 0.58, seg, radial));

  /* A tube is an open sleeve with no end caps, so where a limb meets
     its parent at an angle the two flat ends leave an open wedge — a
     visible hole straight through the branch. A ball at the joint
     closes it, and doubles as the swelling a real fork has. */
  const joint = new THREE.SphereGeometry(rad * 1.04, 9, 7);
  joint.translate(p0.x, p0.y, p0.z);
  wood.push(joint);

  /* Flowers do not only sit at the twig ends. On a real cherry they
     run back down the limb on short spurs, and that is most of what
     makes the canopy read as full rather than as bare sticks with
     pompoms on the end. */
  const n = SPUR_COUNT[depth];
  for (let k = 1; k <= n; k++) {
    /* On the scaffold itself keep the spray to its outer end, so
       flowers do not sprout straight out of the trunk. */
    const u = depth === MAX_DEPTH ? 0.2 + 0.66 * (k / n) : k / (n + 1);
    spurs.push({ pos: curve.getPointAt(u), dir: curve.getTangentAt(u) });
  }

  if (depth === 0) {
    /* and cap the open end of the final twig */
    const cap = new THREE.SphereGeometry(rad * 0.6, 7, 5);
    cap.translate(end.x, end.y, end.z);
    wood.push(cap);
    tips.push({ pos: end, dir: dir.clone() });
    return;
  }

  const kids = depth === MAX_DEPTH ? 3 : (rnd() < 0.35 ? 3 : 2);
  for (let k = 0; k < kids; k++) {
    const spread = 0.40 + rnd() * 0.38;
    const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    const childDir = dir.clone().applyAxisAngle(axis, spread);
    childDir.y += 0.20;                       // twigs reach for light
    childDir.normalize();
    grow(end, childDir, len * (0.60 + rnd() * 0.14), rad * 0.58,
         depth - 1, wood, tips, spurs);
  }
}

/* ============================================================
   build the tree
   ============================================================ */
/* Wind has to pivot at the foot of the trunk, or the whole tree
   slides sideways instead of swaying. treeSway sits at the trunk's
   base and `tree` is lifted back up inside it, so the two cancel out
   and every world position stays exactly where it was. */
const TREE_LIFT  = -0.15;
const TRUNK_FOOT = -5.1;          // matches the first point of trunkCurve

const treeSway = new THREE.Group();
treeSway.position.y = TREE_LIFT + TRUNK_FOOT;
scene.add(treeSway);

const tree = new THREE.Group();
tree.position.y = -TRUNK_FOOT;
treeSway.add(tree);

let wind = 0;                     // 0 still, 1 swaying

/* trunk — leans, kinks, and runs off the bottom of the frame */
const trunkCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, -5.1, 0),
  new THREE.Vector3(0.24, -3.7, 0.15),
  new THREE.Vector3(-0.10, -2.5, -0.12),
  new THREE.Vector3(0.13, -1.5, 0.07),
  new THREE.Vector3(0.02, -0.55, 0),
]);
tree.add(new THREE.Mesh(taperedTube(trunkCurve, 0.30, 0.11, 40, 12), trunkMat));

const branches = [];
const hitTargets = [];
/* One geometry and one material shared by every hover target, rather
   than a fresh pair per twig — there are a few hundred of them. */
const hitGeo = new THREE.SphereGeometry(1, 6, 4);
const hitMat = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthWrite: false,
});
function addHitTarget(group, at, radius, index) {
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.copy(at);
  hit.scale.setScalar(radius);
  hit.userData.index = index;
  group.add(hit);
  hitTargets.push(hit);
}

/* one blossom, facing mostly upward off whatever wood it sits on */
function addBlossom(list, at, along, jitter, scaleMul) {
  const pos = at.clone().add(new THREE.Vector3(
    (rndBloom() - 0.5) * jitter, (rndBloom() - 0.5) * jitter * 0.88, (rndBloom() - 0.5) * jitter
  ));
  const face = new THREE.Vector3(
    along.x * 0.5 + (rndBloom() - 0.5) * 0.75,
    0.75 + rndBloom() * 0.55,
    along.z * 0.5 + (rndBloom() - 0.5) * 0.75
  ).normalize();
  const yaws = [];
  for (let j = 0; j < 5; j++) {
    yaws.push((j / 5) * Math.PI * 2 + (rndBloom() - 0.5) * 0.2);
  }
  list.push({
    pos,
    quat: new THREE.Quaternion().setFromUnitVectors(UP, face),
    base: (0.32 + rndBloom() * 0.22) * scaleMul,
    delay: rndBloom() * 0.5,
    yaws,
  });
}

/* scaffolds leave the trunk at different heights, spiralling round it
   — six limbs from one point reads as a shrub, not a tree */
/* Web Development is the live division, so it takes the leader at the
   top of the trunk rather than the lowest limb. */
const SCAFFOLD_T = [1.0, 0.60, 0.68, 0.76, 0.84, 0.92];

DIVISIONS.forEach((division, i) => {
  const angle = (i / DIVISIONS.length) * Math.PI * 2 + 0.4 + (rnd() - 0.5) * 0.3;
  const start = trunkCurve.getPointAt(SCAFFOLD_T[i]);
  const lift  = division.live ? 1.05 : 0.62 + rnd() * 0.22;
  const dir = new THREE.Vector3(
    Math.cos(angle), lift, Math.sin(angle)
  ).normalize();

  const wood = [];
  const tips = [];
  const spurs = [];
  grow(start, dir, 1.55 + rnd() * 0.35, 0.105, MAX_DEPTH, wood, tips, spurs);

  /* one merged mesh per branch rather than ~28 separate tubes */
  const branchGroup = new THREE.Group();
  branchGroup.add(new THREE.Mesh(mergeGeometries(wood, false), barkMat));
  wood.forEach((g) => g.dispose());

  /* the warmer the petal, the closer the division is to opening */
  const near = division.bloom > 0;
  const petalMat = new THREE.MeshStandardMaterial({
    color:     division.live ? 0xfbd3e0 : (near ? 0xe4cfdd : 0xcfc4e0),
    emissive:  division.live ? 0xe36fa0 : (near ? 0x6b4a63 : 0x4a4266),
    emissiveIntensity: 0.2,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });

  /* blossoms cluster on the twig ends */
  const blossoms = [];
  const anchor = new THREE.Vector3();

  /* dense clusters at the twig ends */
  tips.forEach((tip) => {
    anchor.add(tip.pos);
    const count = isSmall ? 3 + Math.floor(rndBloom() * 3) : 4 + Math.floor(rndBloom() * 3);
    for (let n = 0; n < count; n++) {
      addBlossom(blossoms, tip.pos, tip.dir, 0.34, 1);
    }
    addHitTarget(branchGroup, tip.pos, 0.62, i);
  });

  /* smaller sprays back down the limbs */
  spurs.forEach((spur) => {
    const count = isSmall ? 1 + Math.floor(rndBloom() * 3) : 2 + Math.floor(rndBloom() * 3);
    for (let n = 0; n < count; n++) {
      addBlossom(blossoms, spur.pos, spur.dir, 0.24, 0.84);
    }
    addHitTarget(branchGroup, spur.pos, 0.42, i);
  });

  anchor.divideScalar(Math.max(tips.length, 1));

  /* every petal on this branch in one draw call */
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, blossoms.length * 5);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  petals.frustumCulled = false;
  branchGroup.add(petals);

  const coreMat = CORE_MAT.clone();
  const cores = new THREE.InstancedMesh(coreGeo, coreMat, blossoms.length);
  cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cores.frustumCulled = false;
  branchGroup.add(cores);

  /* One halo on the centroid put all the light in a ball at the middle
     of the crown and left the outer flowers dark. Spreading several
     smaller ones along the branch lights the whole spray instead. */
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    color: division.live ? 0xe36fa0 : (near ? 0xb98aa8 : 0x8e85a3),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const haloSpots = [anchor.clone()];
  const stride = Math.max(1, Math.floor(tips.length / 5));
  for (let k = 0; k < tips.length && haloSpots.length < 6; k += stride) {
    haloSpots.push(tips[k].pos.clone());
  }

  /* how far this branch's flowers reach — the halos are sized off it
     so a long branch gets a long glow rather than a fixed blob */
  let spread = 0;
  for (const bl of blossoms) spread = Math.max(spread, bl.pos.distanceTo(anchor));

  const halos = haloSpots.map((p, k) => {
    const sp = new THREE.Sprite(haloMat);
    sp.position.copy(p);
    /* the centroid one stays widest, the outliers are smaller */
    sp.userData.base = (k === 0 ? 1.5 : 0.85) * Math.max(1.6, spread * 0.9);
    branchGroup.add(sp);
    return sp;
  });

  tree.add(branchGroup);

  /* Every branch rests part-way into its own ceiling, so the tree
     reads as a progress board at a glance rather than one live branch
     and five identical dead ones. */
  const rest = division.live ? 0.45 : division.bloom * 0.55;
  branches.push({
    division, blossoms, petals, cores, petalMat, coreMat, halos, haloMat, anchor,
    rest, t: -1, target: rest,
    pulse: -1,          // seconds since this branch was woken, -1 = idle
  });
});

/* ============================================================
   measure the tree, then centre and frame on what actually grew
   ============================================================ */
{
  let cx = 0, cz = 0, n = 0;
  let top = -Infinity;
  branches.forEach((b) => {
    b.blossoms.forEach((bl) => {
      cx += bl.pos.x; cz += bl.pos.z; n++;
      if (bl.pos.y > top) top = bl.pos.y;
    });
  });
  cx /= n; cz /= n;

  /* orbit around the canopy's own centre — the scaffolds leave the
     trunk at different heights, so the crown does not sit over the
     trunk base */
  tree.position.x = -cx;
  tree.position.z = -cz;

  let maxR = 0;
  branches.forEach((b) => {
    b.blossoms.forEach((bl) => {
      const dx = bl.pos.x - cx;
      const dz = bl.pos.z - cz;
      maxR = Math.max(maxR, Math.hypot(dx, dz));
    });
  });

  fitRadius = maxR + 0.5;
  fitTop    = top + TREE_LIFT + 1.4;
  /* keep the canopy plus a good length of trunk; the rest runs off the
     bottom of the frame on purpose */
  fitBottom = fitTop - (maxR * 1.55 + 2.2);

  sizedW = 0;   // force resize() to recompute with the real numbers
  resize();
  /* anchors get read out of world space during the first frame, before
     the renderer has refreshed any matrices */
  scene.updateMatrixWorld(true);
}

/* the same flower, in the air and on the ground — one texture, drawn
   once. blossomSprite is a hoisted declaration, so this can be built
   here even though the function reads further down. */
/* How big a blossom is, wherever it happens to be. Both the falling
   petals and the ones already down draw from this, because the moment
   they stop matching a flower visibly changes size as it lands. */
const PETAL_MIN  = 0.062;
const PETAL_VARY = 0.088;
const petalSize = (r) => PETAL_MIN + r * PETAL_VARY;

/* Neither of these is sharp. Even at the focus distance a blossom
   stays soft, so the field reads as drifting light first and resolves
   into flowers only once you look at it. The pair still differ enough
   to keep the depth-of-field falloff doing its work. */
const petalSprite = blossomSprite(4);
const petalSpriteSoft = blossomSprite(10);

/* ============================================================
   the fallen drift
   Where the falling blossom ends up. A petal that reaches the ground
   is written into this field at the spot it came down, so the ground
   fills in as you watch rather than being decided up front.

   The buffer is a fixed size and slots are recycled, so a page left
   open all afternoon costs exactly what it costs in the first minute.
   ============================================================ */
const GROUND_Y = TREE_LIFT + TRUNK_FOOT;

let landFlower = null;      // called by the falling petals when they arrive
let updateFallen = null;

{
  const CAP  = isSmall ? 1100 : 3600;   // hard ceiling on the field
  const SEED = isSmall ?  520 : 1400;   // already on the ground at load
  const REACH = 20;

  const FADE_SEC  = 10;   // how long a retiring flower takes to go
  const CYCLE_SEC = 60;   // the minute

  const fpos  = new Float32Array(CAP * 3);
  const fsize = new Float32Array(CAP);
  const frot  = new Float32Array(CAP);
  const ftint = new Float32Array(CAP);
  const ffade = new Float32Array(CAP);   // 0 = empty slot, 1 = fully there

  const free = [];                 // slot indices ready for reuse
  const alive = [];                // slot indices, oldest first
  const fading = [];               // { idx, left } retiring gently
  for (let i = CAP - 1; i >= 0; i--) free.push(i);

  function write(idx, x, z, tint, size) {
    fpos[idx * 3]     = x;
    fpos[idx * 3 + 1] = GROUND_Y + rndFall() * 0.12;
    fpos[idx * 3 + 2] = z;
    /* the size it was in the air, not a new one — see the shader */
    fsize[idx] = size;
    frot[idx]  = rndFall() * Math.PI * 2;
    ftint[idx] = tint;
    ffade[idx] = 1;
  }

  /* what is already lying there when the page opens */
  for (let i = 0; i < SEED; i++) {
    const r = REACH * Math.sqrt(rndFall());
    const a = rndFall() * Math.PI * 2;
    const idx = free.pop();
    /* seeded from the same range the falling petals use, so what is
       already lying there matches what lands later */
    write(idx, Math.cos(a) * r, Math.sin(a) * r, rndFall(),
          petalSize(rndFall()));
    alive.push(idx);
  }

  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('aSize',    new THREE.BufferAttribute(fsize, 1));
  fgeo.setAttribute('aRot',     new THREE.BufferAttribute(frot, 1));
  fgeo.setAttribute('aTint',    new THREE.BufferAttribute(ftint, 1));
  fgeo.setAttribute('aFade',    new THREE.BufferAttribute(ffade, 1));

  fallenMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap:     { value: petalSprite },
      /* the same pair the airborne petals use, so a flower is exactly
         as sharp on the ground as it was the instant before it got
         there */
      uMapSoft: { value: petalSpriteSoft },
      uScale:   { value: 600 },
      uFocus:   { value: 12 },
      uPale:    { value: new THREE.Color(0xf3e2ea) },
      uPink:    { value: new THREE.Color(0xdcb2c8) },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aRot;
      attribute float aTint;
      attribute float aFade;
      uniform float uScale;
      uniform float uFocus;
      varying float vRot;
      varying float vTint;
      varying float vFade;
      varying float vCoc;
      void main(){
        vRot = aRot;
        vTint = aTint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        /* Identical to the falling petals, down to the cap. They carry
           a depth-of-field inflation of up to 1.7x; without the same
           term here a petal visibly jumped size the moment it landed. */
        vCoc = clamp(abs(d - uFocus) / 7.0, 0.0, 1.0);
        float size = aSize * uScale / max(d, 0.001);
        gl_PointSize = min(size * (1.0 + vCoc * 0.7), 40.0);
        /* an empty slot is drawn at zero size rather than skipped, so
           the field never has to be rebuilt or re-ranged */
        if (aFade <= 0.0) gl_PointSize = 0.0;
        vFade = aFade * (1.0 - smoothstep(15.0, 32.0, d));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform sampler2D uMapSoft;
      uniform vec3 uPale;
      uniform vec3 uPink;
      varying float vRot;
      varying float vTint;
      varying float vFade;
      varying float vCoc;
      void main(){
        if (vFade <= 0.001) discard;
        vec2 uv = gl_PointCoord - 0.5;
        float s = sin(vRot), c = cos(vRot);
        uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
        /* blurred by exactly as much as it was on the way down */
        float a = mix(texture2D(uMap, uv).a, texture2D(uMapSoft, uv).a, vCoc);
        if (a < 0.015) discard;
        gl_FragColor = vec4(mix(uPale, uPink, vTint), a * vFade * 0.58);
      }
    `,
  });

  const fallen = new THREE.Points(fgeo, fallenMat);
  fallen.frustumCulled = false;
  scene.add(fallen);

  let cycleStart = 0;
  let landedThisCycle = 0;
  let posDirty = false;

  landFlower = function (x, z, tint, size, time) {
    /* Full is full: the petal simply does not stick. Overwriting the
       oldest instead would pop a flower out of existence in plain
       sight, and the retirement below frees slots soon enough. */
    if (!free.length) return;
    const idx = free.pop();
    write(idx, x, z, tint, size);
    alive.push(idx);
    posDirty = true;
    landedThisCycle++;
  };

  updateFallen = function (time, dt) {
    if (!cycleStart) cycleStart = time;

    /* Once a minute, retire as many as arrived during it — oldest
       first, so the ground turns over rather than thinning at random.
       Matching the count to the whole minute rather than half of it is
       what makes the field settle instead of creeping up to its cap. */
    if (time - cycleStart >= CYCLE_SEC) {
      const n = Math.min(landedThisCycle, alive.length);
      for (let i = 0; i < n; i++) fading.push({ idx: alive.shift(), left: FADE_SEC });
      cycleStart = time;
      landedThisCycle = 0;
    }

    if (fading.length) {
      for (let i = fading.length - 1; i >= 0; i--) {
        const f = fading[i];
        f.left -= dt;
        if (f.left <= 0) {
          ffade[f.idx] = 0;
          free.push(f.idx);
          fading.splice(i, 1);
        } else {
          ffade[f.idx] = f.left / FADE_SEC;
        }
      }
      fgeo.attributes.aFade.needsUpdate = true;
    }

    if (posDirty) {
      fgeo.attributes.position.needsUpdate = true;
      fgeo.attributes.aSize.needsUpdate = true;
      fgeo.attributes.aRot.needsUpdate = true;
      fgeo.attributes.aTint.needsUpdate = true;
      fgeo.attributes.aFade.needsUpdate = true;
      posDirty = false;
    }
  };
}

/* ============================================================
   ground mist
   Banks of soft haze at the foot of the frame. Pinned to the measured
   bottom rather than a fixed height, so they sit on the horizon of
   whatever the camera actually ends up framing — and they give the
   trunk somewhere to disappear into instead of stopping dead.
   ============================================================ */
const mistTex = softSprite('rgba(222,212,246,0.92)', 'rgba(222,212,246,0)');
const mist = [];
const MIST_BANKS = isSmall ? 5 : 9;

for (let i = 0; i < MIST_BANKS; i++) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mistTex,
    color: 0x9a8dc6,
    transparent: true,
    opacity: 0.15 + rnd() * 0.12,
    depthWrite: false,
    fog: false,
  }));
  const w = 8 + rnd() * 9;
  sprite.scale.set(w, w * (0.24 + rnd() * 0.12), 1);
  sprite.position.set(
    (rnd() - 0.5) * 10,
    fitBottom - 0.35 + rnd() * 1.6,
    (rnd() - 0.5) * 8
  );
  scene.add(sprite);
  mist.push({
    sprite,
    homeX: sprite.position.x,
    drift: 0.9 + rnd() * 1.5,
    speed: 0.04 + rnd() * 0.06,
    phase: rnd() * Math.PI * 2,
  });
}

/* ============================================================
   blossom opening, written straight into the instance matrices
   ============================================================ */
const _m  = new THREE.Matrix4();
const _q  = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _s  = new THREE.Vector3();
const AXIS_X = new THREE.Vector3(1, 0, 0);

function writeBranchMatrices(b) {
  /* How far this branch opens is its progress. Live goes all the way;
     a dated division sits part-open; one with no date stays in bud. */
  const ceiling = b.division.bloom;
  let p = 0;
  for (let i = 0; i < b.blossoms.length; i++) {
    const bl = b.blossoms[i];
    const span = 1 - bl.delay;
    const k = clamp((b.t - bl.delay) / span, 0, 1);
    const open = k * k * (3 - 2 * k) * ceiling;

    const tilt = 0.16 + open * 1.02;
    const sc = bl.base * (0.74 + open * 0.34);
    _s.setScalar(sc);
    _qx.setFromAxisAngle(AXIS_X, tilt);

    for (let j = 0; j < 5; j++) {
      _qy.setFromAxisAngle(UP, bl.yaws[j]);
      _q.copy(bl.quat).multiply(_qy).multiply(_qx);
      _m.compose(bl.pos, _q, _s);
      b.petals.setMatrixAt(p++, _m);
    }

    _s.setScalar(sc * 0.9);
    _m.compose(bl.pos, bl.quat, _s);
    b.cores.setMatrixAt(i, _m);
  }
  b.petals.instanceMatrix.needsUpdate = true;
  b.cores.instanceMatrix.needsUpdate = true;
}

/* ============================================================
   the standby pulse
   A dormant branch breathes rather than flashes — one very slow, dim
   cycle for as long as its card is open. It reads as something idling,
   not as something broken.
   ============================================================ */
const PULSE_PERIOD = 6.5;   // seconds for one full breath
const PULSE_LOW    = 0.08;
const PULSE_HIGH   = 0.26;
const PULSE_WAKE   = 1.6;   // eases up from dark rather than snapping on

function pulseLevel(t) {
  if (t < 0) return 0;
  const wake = Math.min(1, t / PULSE_WAKE);
  const wave = 0.5 - 0.5 * Math.cos((t / PULSE_PERIOD) * Math.PI * 2);
  return wake * (PULSE_LOW + (PULSE_HIGH - PULSE_LOW) * wave);
}

/* ============================================================
   the hanging tag — a flat overlay pinned to the branch
   Projected to screen space rather than living in the scene, so the
   type is always square to the reader and always crisp.
   ============================================================ */
let tagFade = 0;
let swing = 0;
let swingVel = 0;
let swingPrev = null;
let tagW = 0;
let tagH = 0;
/* where the open branch projects to, in screen pixels */
let activeScreenX = 0;
let activeScreenY = 0;

const _tagProject = new THREE.Vector3();

function measureTag() {
  const w = tag.offsetWidth;
  const h = tag.offsetHeight;
  if (!w || !h) return false;
  tagW = w;
  tagH = h;
  tagMetricsDirty = false;
  return true;
}

function updateTag(dt, time) {
  const open = active !== null;
  if (open && (tagMetricsDirty || !tagW)) measureTag();

  const goal = open ? 1 : 0;
  tagFade += (goal - tagFade) * Math.min(1, dt * (noMotion ? 60 : 9));

  if (!open) {
    swingPrev = null;
    swing = 0;
    swingVel = 0;
    tag.style.opacity = String(tagFade * 0.35);
    tag.style.visibility = tagFade < 0.02 ? 'hidden' : 'visible';
    return;
  }

  /* hang the card off the branch's blossoms, in screen space */
  const b = branches[active];
  _tagProject.copy(b.anchor);
  tree.localToWorld(_tagProject);
  _tagProject.project(camera);

  const px = (_tagProject.x * 0.5 + 0.5) * sizedW;
  const py = (-_tagProject.y * 0.5 + 0.5) * sizedH;
  /* the hover test needs this: see keepRadius() */
  activeScreenX = px;
  activeScreenY = py;

  /* keep it on screen — a 2D card can clamp itself, which is most of
     why this reads better than the version that lived in the scene */
  const x = clamp(px, tagW * 0.5 + 14, sizedW - tagW * 0.5 - 14);
  const y = clamp(py + 18, 74, Math.max(74, sizedH - tagH - 16));

  /* the tree turning under it gives the card a shove, and a spring
     pulls it back to plumb */
  if (noMotion) {
    swing = 0;
  } else {
    if (swingPrev === null) swingPrev = x;
    const dx = x - swingPrev;
    swingPrev = x;
    swingVel += -dx * 1.7;
    swingVel += (-90 * swing - 6 * swingVel) * dt;
    swingVel = clamp(swingVel, -260, 260);
    swing += swingVel * dt;
    swing = clamp(swing, -18, 18);
  }
  const sway = noMotion ? 0 : Math.sin(time * 0.8) * 1.3;

  tag.style.transform =
    `translate3d(${Math.round(x - tagW / 2)}px, ${Math.round(y)}px, 0) ` +
    `rotate(${(swing + sway).toFixed(2)}deg)`;
  tag.style.opacity = String(tagFade);
  tag.style.visibility = tagFade < 0.02 ? 'hidden' : 'visible';
}

/* ============================================================
   selection
   ============================================================ */
let active = null;
let locked = false;
let hinted = false;

function dismissHint() {
  if (hinted || !hint) return;
  hinted = true;
  hint.dataset.hidden = 'true';
}

function select(index) {
  if (active === index) return;
  active = index;
  branches.forEach((b, i) => {
    const on = i === index;
    b.target = on ? 1 : b.rest;
    if (!b.division.live) b.pulse = on ? 0 : -1;
  });

  if (index === null) {
    tag.dataset.open = 'false';
    document.body.dataset.panel = 'closed';
    return;
  }

  const d = DIVISIONS[index];
  tag.dataset.open = 'true';
  tag.dataset.live = String(d.live);
  document.body.dataset.panel = 'open';
  panelName.textContent = d.name;
  panelLine.textContent = d.line;
  panelTag.textContent  = d.stage;

  /* only the ones with a date carry one; a soft date on the far ones
     would be worse than saying nothing */
  panelWhen.textContent = d.when;
  panelWhen.hidden = !d.when;

  if (d.live) {
    panelBtn.setAttribute('href', d.url);
    panelBtn.classList.add('btn-live');
    panelBtnText.textContent = 'Enter site';
  } else {
    /* A disabled button is a dead end. A mailto is a real action, needs
       no backend, and matches how the web-design site already takes
       enquiries. */
    panelBtn.setAttribute('href', d.notify);
    panelBtn.classList.remove('btn-live');
    panelBtnText.textContent = 'Tell me when this opens';
  }
  panelBtn.removeAttribute('aria-disabled');

  liveRegion.textContent = d.live
    ? `${d.name}. Live site.`
    : `${d.name}. ${d.stage}${d.when ? '. ' + d.when : ''}.`;
  tagMetricsDirty = true;
  dismissHint();
}

function activate(index) {
  const d = DIVISIONS[index];
  if (d.live && d.url) {
    window.location.href = d.url;
  } else {
    select(index);
    locked = true;
  }
}

/* ---------- keyboard route to every branch ---------- */
DIVISIONS.forEach((d, i) => {
  const el = document.createElement(d.live ? 'a' : 'button');
  if (d.live) {
    el.href = d.url;
  } else {
    el.type = 'button';
  }
  el.textContent = d.live ? d.name : `${d.name} (${d.stage.toLowerCase()})`;
  el.addEventListener('focus', () => { select(i); locked = true; });
  el.addEventListener('mouseenter', () => select(i));
  if (!d.live) {
    el.addEventListener('click', () => { select(i); locked = true; });
  }
  keys.appendChild(el);
});

/* ============================================================
   pointer — drag to orbit, hover to bloom
   ============================================================ */
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();
let overCard = false;   // pointer is over the card, so keep it open

/* Closing is deferred rather than immediate. Pushing the camera in
   moves the branch and the card under a stationary cursor, which fires
   spurious leave events — and without a delay that becomes a loop:
   deselect, camera pulls back, branch slides under the cursor again,
   reselect. The dwell absorbs it. */
const CLEAR_DELAY = 220;

/* Pushing the camera toward a branch moves that branch away from the
   cursor that picked it — so an exact hit test cannot hold a
   selection open. Once a branch is chosen it stays chosen while the
   pointer is anywhere near it, and only a decisive move away, or a
   different branch, closes it. */
function nearActive(px, py) {
  if (active === null) return false;
  const r = clamp(Math.min(sizedW, sizedH) * 0.34, 170, 420);
  const dx = px - activeScreenX;
  const dy = py - activeScreenY;
  return dx * dx + dy * dy < r * r;
}

let clearAtMs = 0;
function scheduleClear() {
  if (!clearAtMs) clearAtMs = performance.now() + CLEAR_DELAY;
}
function cancelClear() { clearAtMs = 0; }
let dragging = false;
let dragDistance = 0;
let last = { x: 0, y: 0 };

function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(hitTargets, false);
  return hits.length ? hits[0].object.userData.index : null;
}

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragDistance = 0;
  last = { x: e.clientX, y: e.clientY };
  canvas.dataset.grabbing = 'true';
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (dragging) {
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    orbit.targetTheta -= dx * 0.005;
    orbit.targetPhi = clamp(orbit.targetPhi - dy * 0.004, 0.72, 1.78);
    orbit.velTheta = -dx * 0.005;
    last = { x: e.clientX, y: e.clientY };
    if (dragDistance > 24) dismissHint();
    return;
  }
  if (!canHover) return;
  const r = canvas.getBoundingClientRect();
  const index = pick(e.clientX, e.clientY);
  canvas.dataset.over = index !== null ? 'true' : 'false';
  if (index !== null) {
    cancelClear();
    select(index);
    locked = false;
  } else if (nearActive(e.clientX - r.left, e.clientY - r.top)) {
    cancelClear();                       // still hovering its neighbourhood
  } else if (!overCard && !keys.matches(':focus-within')) {
    /* off the branch and off the card — let it go, but not instantly */
    scheduleClear();
  }
});

/* The card sits above the canvas, so moving onto it stops the canvas
   getting pointermove at all. Listen on the panel — the wrapper is
   pointer-events:none — or reaching for the button would dismiss the
   very thing you were reaching for. */
panel.addEventListener('pointerenter', () => {
  overCard = true;
  cancelClear();
});
panel.addEventListener('pointerleave', () => {
  overCard = false;
  if (canHover) scheduleClear();
});

canvas.addEventListener('pointerleave', () => {
  canvas.dataset.over = 'false';
  if (canHover && !overCard && !keys.matches(':focus-within')) scheduleClear();
});

function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  canvas.dataset.grabbing = 'false';
  if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

  if (dragDistance < 8) {
    const index = pick(e.clientX, e.clientY);
    if (index === null) {
      locked = false;
      select(null);
    } else if (canHover) {
      activate(index);
    } else if (active === index && locked) {
      activate(index);        // second tap on an open branch follows it
    } else {
      select(index);
      locked = true;
    }
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ============================================================
   drifting blossoms
   Each mote is a five-petal flower rather than a round dot, tumbled
   per-particle in the shader and split into colour channels the way
   the logo is.
   ============================================================ */
function blossomSprite(blurPx) {
  /* The flower itself reaches ~27px from centre. A blur needs roughly
     3x its radius of clear margin to actually fade to zero rather than
     being cut off by the canvas edge — and a canvas simply stops, it
     does not fade, so whatever alpha the blur still has at the border
     reads as a hard square. The canvas grows to give it that room; the
     flower is always drawn at the same size, so this only adds empty
     space around it, never changes how big it looks. */
  const pad = blurPx * 3;
  const size = 64 + pad * 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (blurPx) x.filter = `blur(${blurPx}px)`;
  x.translate(size / 2, size / 2);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    x.save();
    x.rotate((i / 5) * Math.PI * 2);
    x.beginPath();
    x.moveTo(0, -2);
    x.bezierCurveTo(10, -7, 13, -21, 4, -27);
    x.lineTo(0, -23);                            // the sakura notch
    x.lineTo(-4, -27);
    x.bezierCurveTo(-13, -21, -10, -7, 0, -2);
    x.fill();
    x.restore();
  }
  x.beginPath();
  x.arc(0, 0, 4.5, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PETALS = isSmall ? 170 : 430;
const driftGeo  = new THREE.BufferGeometry();
const driftPos  = new Float32Array(PETALS * 3);
const driftVel  = new Float32Array(PETALS * 2);
const driftSize = new Float32Array(PETALS);
const driftRot  = new Float32Array(PETALS);
const driftSpin = new Float32Array(PETALS);
const driftTint = new Float32Array(PETALS);

for (let i = 0; i < PETALS; i++) {
  const r = 2 + Math.random() * 7;
  const a = Math.random() * Math.PI * 2;
  driftPos[i * 3]     = Math.cos(a) * r;
  driftPos[i * 3 + 1] = -5 + Math.random() * 12;
  driftPos[i * 3 + 2] = Math.sin(a) * r;
  driftVel[i * 2]     = 0.25 + Math.random() * 0.45;
  driftVel[i * 2 + 1] = Math.random() * Math.PI * 2;
  driftSize[i] = petalSize(Math.random());
  driftRot[i]  = Math.random() * Math.PI * 2;
  driftSpin[i] = (Math.random() - 0.5) * 1.4;
  driftTint[i] = Math.random() < 0.16 ? 1 : 0;
}
driftGeo.setAttribute('position', new THREE.BufferAttribute(driftPos, 3));
driftGeo.setAttribute('aSize',    new THREE.BufferAttribute(driftSize, 1));
driftGeo.setAttribute('aRot',     new THREE.BufferAttribute(driftRot, 1));
driftGeo.setAttribute('aSpin',    new THREE.BufferAttribute(driftSpin, 1));
driftGeo.setAttribute('aTint',    new THREE.BufferAttribute(driftTint, 1));

const driftMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uMap:     { value: petalSprite },
    uMapSoft: { value: petalSpriteSoft },    // pre-blurred, for bokeh
    uTime:    { value: 0 },
    uScale:   { value: 600 },
    uSplit:   { value: 0.035 },
    uFocus:   { value: 12 },   // the camera's distance to the tree
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
      /* circle of confusion: how far this petal sits from the tree's
         depth, the way the reference site's foreground/background
         petals blur while the gate itself stays sharp */
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

      /* three offset samples — the logo's channel split, per petal —
         blended between the sharp and pre-blurred sprite by how far
         out of focus this petal is */
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
      if (a < 0.012) discard;

      vec3 base = mix(uSakura, uCyan, vTint);
      vec3 col  = base * g
                + vec3(1.0, 0.22, 0.42) * r * 0.55
                + vec3(0.28, 0.82, 1.0) * b * 0.55;
      col /= 1.5;
      gl_FragColor = vec4(col, a * (0.5 - vCoc * 0.16));
    }
  `,
});

const drift = new THREE.Points(driftGeo, driftMat);
drift.frustumCulled = false;
scene.add(drift);

/* ============================================================
   loop
   ============================================================ */
const clock = new THREE.Clock();
const anchorWorld = new THREE.Vector3();
const _aim = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  resize();                       // no-op unless the box actually changed
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  /* Slow: the moon is a fixed landmark now, so a brisk idle spin would
     quietly carry the opening composition off-screen while nobody is
     touching it. This is a drift, not a turntable. */
  if (!noMotion && !dragging && active === null) {
    orbit.targetTheta += dt * 0.012;
  }
  if (!dragging && Math.abs(orbit.velTheta) > 0.0001) {
    orbit.targetTheta += orbit.velTheta;
    orbit.velTheta *= 0.92;
  }

  const ease = noMotion ? 1 : Math.min(1, dt * 5.5);
  orbit.theta += (orbit.targetTheta - orbit.theta) * ease;
  orbit.phi   += (orbit.targetPhi   - orbit.phi)   * ease;

  /* ---- cinematic push-in toward whichever branch is open ---- */
  const closing = active !== null;
  const zoomGoal = closing ? ZOOM_IN : 1;
  const windGoal = closing ? 1 : 0;
  const settle = noMotion ? 1 : Math.min(1, dt * 1.9);

  zoom += (zoomGoal - zoom) * settle;
  wind += (windGoal - wind) * Math.min(1, dt * 1.2);
  orbit.radius = orbit.baseRadius * zoom;

  if (closing) {
    /* aim between the framing centre and the branch itself, so the
       canopy stays in shot rather than filling it entirely */
    anchorWorld.copy(branches[active].anchor);
    tree.localToWorld(anchorWorld);
    _aim.lerpVectors(homeLook, anchorWorld, 0.72);
  } else {
    _aim.copy(homeLook);
  }
  LOOK_AT.lerp(_aim, settle);
  applyCamera();

  /* ---- wind, pivoting at the foot of the trunk ---- */
  if (!noMotion) {
    const a = wind * 0.019;
    treeSway.rotation.z =
      Math.sin(time * 0.62) * a + Math.sin(time * 1.43 + 1.3) * a * 0.38;
    treeSway.rotation.x =
      Math.sin(time * 0.51 + 2.1) * a * 0.55;
  } else {
    treeSway.rotation.set(0, 0, 0);
  }
  /* anchors are read out of world space further down this same frame,
     and matrixWorld is otherwise not refreshed until render */
  treeSway.updateMatrixWorld(true);

  /* bloom on the live branch, flicker on the dormant ones */
  let glowBranch = null;
  let glowLum = 0;
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    let lum;

    /* Whether a branch opens is its progress, not whether it is live —
       the two divisions with dates sit part-open, which is the whole
       point of the tree doubling as the progress board. */
    if (b.division.bloom > 0) {
      const before = b.t;
      if (noMotion || b.t < 0) {
        b.t = b.target;
      } else {
        b.t += (b.target - b.t) * Math.min(1, dt * 4.2);
      }
      /* only rewrite instance matrices for branches actually moving */
      if (Math.abs(b.t - before) > 0.0004) writeBranchMatrices(b);
    } else if (b.t < 0) {
      /* never opens, so the shut matrices are written once and left */
      b.t = 0;
      writeBranchMatrices(b);
    }

    /* How brightly it burns is a separate question from how far it is
       open: only the live one glows on its own, the rest answer with
       the standby pulse. */
    if (b.division.live) {
      lum = b.t;
      /* softened: with real bloom in the pipeline the old values blew
         the whole crown out into a flat white disc */
      b.petalMat.emissiveIntensity = 0.16 + lum * 0.4;
    } else {
      if (b.pulse >= 0 && !noMotion) b.pulse += dt;
      lum = noMotion
        ? (b.pulse >= 0 ? PULSE_LOW : 0)
        : pulseLevel(b.pulse);
      b.petalMat.emissiveIntensity = 0.12 + lum * 0.5;
    }
    /* the centre of a flower must never sit darker than its petals */
    b.coreMat.emissiveIntensity = b.petalMat.emissiveIntensity * 1.2;

    /* several overlapping additive sprites stack, so each is fainter
       than the single halo was — the total reads about the same */
    b.haloMat.opacity = lum * (b.division.live ? 0.17 : 0.2);
    const haloGrow = 1 + lum * 0.3;
    for (let h = 0; h < b.halos.length; h++) {
      b.halos[h].scale.setScalar(b.halos[h].userData.base * haloGrow);
    }

    if (lum > 0.02 && lum > glowLum) { glowBranch = b; glowLum = lum; }
  }

  if (glowBranch) {
    anchorWorld.copy(glowBranch.anchor);
    tree.localToWorld(anchorWorld);
    glow.position.copy(anchorWorld);
    glow.color.set(glowBranch.division.live ? 0xe36fa0 : 0x9c8fd0);
    glow.intensity = glowLum * (glowBranch.division.live ? 8 : 11);
  } else {
    glow.intensity = 0;
  }

  /* falling blossoms */
  const pointScale = renderer.domElement.height / (2 * HALF_FOV);
  driftMat.uniforms.uScale.value = pointScale;
  if (fallenMat) fallenMat.uniforms.uScale.value = pointScale;
  driftMat.uniforms.uFocus.value = orbit.radius;
  if (fallenMat) fallenMat.uniforms.uFocus.value = orbit.radius;
  if (!noMotion) {
    driftMat.uniforms.uTime.value = time;
    const pos = driftGeo.attributes.position.array;
    for (let i = 0; i < PETALS; i++) {
      const y = i * 3 + 1;
      pos[y] -= driftVel[i * 2] * dt;
      pos[i * 3] += Math.sin(time * 0.6 + driftVel[i * 2 + 1]) * dt * 0.22;
      if (pos[y] < GROUND_Y + 0.1) {
        /* it came down here, so leave it here — then send the sprite
           back up to fall again as a different petal */
        landFlower(pos[i * 3], pos[i * 3 + 2], driftTint[i], driftSize[i], time);
        pos[y] = 7;
        const r = 2 + Math.random() * 7;
        const a = Math.random() * Math.PI * 2;
        pos[i * 3]     = Math.cos(a) * r;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
    }
    driftGeo.attributes.position.needsUpdate = true;
  }

  /* mist slides sideways, never settling */
  if (!noMotion) {
    for (let i = 0; i < mist.length; i++) {
      const m = mist[i];
      m.sprite.position.x = m.homeX + Math.sin(time * m.speed + m.phase) * m.drift;
    }
  }

  updateFallen(time, dt);

  if (clearAtMs && performance.now() >= clearAtMs) {
    clearAtMs = 0;
    locked = false;
    select(null);
  }

  updateTag(dt, time);
  composer.render();
}

/* the static list has done its job — hand over to the canvas */
fallback.hidden = true;
keys.hidden = false;
document.body.dataset.scene = 'on';
document.body.dataset.panel = 'closed';
measureTag();
animate();
