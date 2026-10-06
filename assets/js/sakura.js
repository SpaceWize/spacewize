/* ============================================================
   SPACE WIZE ENTERPRISE — what the sakura is made of
   The parts, kept apart from the page logic in scene.js: the bark,
   the limbs, the flower, and the one shader both wood and blossom run
   through. The vertex stage carries the wind, the fragment stage the
   moon's rim light, so neither costs the CPU anything per frame.
   ============================================================ */
import * as THREE from 'three';

/* ============================================================
   uniforms every tree material reads
   Shared by reference, so one write a frame reaches all of them.
   ============================================================ */
export function createTreeUniforms() {
  return {
    uTime:    { value: 0 },
    uWind:    { value: 1 },                       // 0 still, 1 the usual breeze
    uSunView: { value: new THREE.Vector3() },     // the moon, in view space
    uRimPink: { value: new THREE.Color(0xff4f9e) },
    uRimHot:  { value: new THREE.Color(0xff8a5a) },
  };
}

/* ============================================================
   noise
   Ashima Arts' 3D simplex noise (MIT, Ian McEwan / Stefan Gustavson),
   in GLSL for the shaders and ported line for line to JS, so the
   page can ask where the wind has carried a branch and get the same
   answer the GPU drew. The tag card hangs off that answer.
   ============================================================ */
const SIMPLEX_GLSL = /* glsl */`
vec3 sk_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sk_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sk_permute(vec4 x) { return sk_mod289(((x * 34.0) + 1.0) * x); }
vec4 sk_invSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float sk_noise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sk_mod289(i);
  vec4 p = sk_permute(sk_permute(sk_permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x  = x_ * ns.x + ns.yyyy;
  vec4 y  = y_ * ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 nm = sk_invSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= nm.x; p1 *= nm.y; p2 *= nm.z; p3 *= nm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

function mod289(x) { return x - Math.floor(x / 289) * 289; }
function permute(x) { return mod289((x * 34 + 1) * x); }
const SX = [0, 0, 0], SY = [0, 0, 0], SZ = [0, 0, 0];   // scratch, no garbage

function snoise(vx, vy, vz) {
  const s = (vx + vy + vz) / 3;
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s), iz = Math.floor(vz + s);
  const t = (ix + iy + iz) / 6;
  const x0 = vx - ix + t, y0 = vy - iy + t, z0 = vz - iz + t;
  const gx = x0 >= y0 ? 1 : 0, gy = y0 >= z0 ? 1 : 0, gz = z0 >= x0 ? 1 : 0;
  const lx = 1 - gx, ly = 1 - gy, lz = 1 - gz;
  const i1x = Math.min(gx, lz), i1y = Math.min(gy, lx), i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz), i2y = Math.max(gy, lx), i2z = Math.max(gz, ly);
  SX[0] = i1x; SY[0] = i1y; SZ[0] = i1z;
  SX[1] = i2x; SY[1] = i2y; SZ[1] = i2z;
  ix = mod289(ix); iy = mod289(iy); iz = mod289(iz);

  let n = 0;
  for (let k = 0; k < 4; k++) {
    const cx = k === 0 ? 0 : k === 3 ? 1 : SX[k - 1];
    const cy = k === 0 ? 0 : k === 3 ? 1 : SY[k - 1];
    const cz = k === 0 ? 0 : k === 3 ? 1 : SZ[k - 1];
    const ox = x0 - cx + k / 6, oy = y0 - cy + k / 6, oz = z0 - cz + k / 6;
    let m = 0.6 - (ox * ox + oy * oy + oz * oz);
    if (m <= 0) continue;
    const p = permute(permute(permute(iz + cz) + iy + cy) + ix + cx);
    const j = p - 49 * Math.floor(p / 49);
    const xq = Math.floor(j / 7);
    const yq = Math.floor(j - 7 * xq);
    let gxv = xq * (2 / 7) + (0.5 / 7 - 1);
    let gyv = yq * (2 / 7) + (0.5 / 7 - 1);
    const h = 1 - Math.abs(gxv) - Math.abs(gyv);
    if (h <= 0) {
      gxv -= Math.floor(gxv) * 2 + 1;
      gyv -= Math.floor(gyv) * 2 + 1;
    }
    const nm = 1.79284291400159 - 0.85373472095314 * (gxv * gxv + gyv * gyv + h * h);
    m *= m;
    n += m * m * nm * (gxv * ox + gyv * oy + h * oz);
  }
  return 42 * n;
}

/* ============================================================
   the wind
   Stiff at the foot of the trunk, loose at the twig ends: `flex` is
   how far along the tree a point sits, 0 at the ground and 1 at the
   furthest tip, and the bend goes with its square. A slow swell in
   strength lets the crown breathe instead of jitter, and a finer,
   quicker rustle rides on top only out at the thinnest wood.

   The flowers take only the sway, and flutter on cheap sines of their
   own: there are thousands of them, the noise is the expensive part
   of the vertex stage, and the rustle is far too small to open a gap
   between a flower and its twig.
   ============================================================ */
const WIND_GLSL = /* glsl */`
vec3 sakuraSway(vec3 p, float flex) {
  float t = uTime;
  vec3 q = p * 0.16;
  float n1 = sk_noise(q + vec3(t * 0.21, 0.0, t * 0.05));
  float n2 = sk_noise(q + vec3(31.0, t * 0.17, 57.0 + t * 0.19));
  float gust = 0.65 + 0.35 * sin(t * 0.37 + p.x * 0.21) * sin(t * 0.23 + p.z * 0.17 + 1.3);
  return vec3(n1 + 0.25, n1 * n2 * 0.5, n2) * (gust * flex * flex * 0.085 * uWind);
}
vec3 sakuraWind(vec3 p, float flex) {
  float t = uTime;
  float r = sk_noise(p * 1.25 + vec3(0.0, t * 0.9, t * 0.6));
  return sakuraSway(p, flex) + vec3(r, r * 0.5, -r) * (flex * flex * flex * 0.014 * uWind);
}
`;

export function windAt(p, flex, t, strength, out) {
  if (!strength) return out.set(0, 0, 0);
  const bend = flex * flex;
  const qx = p.x * 0.16, qy = p.y * 0.16, qz = p.z * 0.16;
  const n1 = snoise(qx + t * 0.21, qy, qz + t * 0.05);
  const n2 = snoise(qx + 31, qy + t * 0.17, qz + 57 + t * 0.19);
  const gust = 0.65 + 0.35 * Math.sin(t * 0.37 + p.x * 0.21) * Math.sin(t * 0.23 + p.z * 0.17 + 1.3);
  const k = gust * bend * 0.085;
  const r = snoise(p.x * 1.25, p.y * 1.25 + t * 0.9, p.z * 1.25 + t * 0.6);
  const f = bend * flex * 0.014;
  return out.set(
    ((n1 + 0.25) * k + r * f) * strength,
    (n1 * n2 * 0.5 * k + r * 0.5 * f) * strength,
    (n2 * k - r * f) * strength
  );
}

/* ============================================================
   the rim light
   The moon sits behind the tree, so the tree answers it the way a
   backlit tree does: the edges that face it burn pink running to
   orange right at the silhouette, and the faces turned toward you
   stay dark. `back` is how squarely the moon sits behind this very
   fragment. Turning the tree until the moon is behind you lets the
   glow die away, which is what real backlight does.
   ============================================================ */
const RIM_PARS = /* glsl */`
uniform vec3 uSunView;
uniform vec3 uRimPink;
uniform vec3 uRimHot;
uniform float uRimGain;

/* How much an edge faces the moon across the screen. An edge on the
   moon's side of its object catches the rim; the far edge does not.
   Right over the disc, where the moon sits straight behind, every edge
   does — that is the halo a backlit crown wears. */
float skToward(vec3 n, vec3 L) {
  float l = length(L.xy);
  float toward = dot(normalize(n.xy + vec2(1e-5)), L.xy / max(l, 1e-4));
  return mix(1.0, smoothstep(-0.25, 0.85, toward), smoothstep(0.06, 0.3, l));
}
`;

/* ============================================================
   bark
   Cherry bark is smooth and a little glossy, banded with the
   horizontal lenticel dashes that wrap round the trunk and with rings
   where the outer skin peels. Tube UVs run u along the limb and v
   around it, so dashes are drawn down the canvas and rings across it.
   One height field feeds both the colour and a proper normal map, so
   the relief catches the rim light rather than being painted on.
   ============================================================ */
export const BARK_ALONG  = 1.0;    // world units one tile covers along a limb
export const BARK_AROUND = 0.5;    // and around it

export function barkMaps(rng) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, W, H);

  /* everything is drawn at its wrapped copies too, so the tile repeats
     round the limb and along it without a seam */
  const wrapped = (draw) => {
    for (let dx = -W; dx <= W; dx += W) {
      for (let dy = -H; dy <= H; dy += H) draw(dx, dy);
    }
  };

  /* broad, soft unevenness first */
  for (let i = 0; i < 70; i++) {
    const cx = rng() * W, cy = rng() * H, r = 20 + rng() * 70;
    const v = rng() < 0.5 ? 0 : 255;
    const a = 0.04 + rng() * 0.06;
    wrapped((dx, dy) => {
      const g = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r);
      g.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g;
      x.fillRect(cx + dx - r, cy + dy - r, r * 2, r * 2);
    });
  }

  /* fine fibre running along the limb */
  for (let i = 0; i < 520; i++) {
    const y = rng() * H, sx = rng() * W, w = 30 + rng() * 180;
    const v = rng() < 0.6 ? 70 : 190;
    const a = 0.05 + rng() * 0.12;
    const lw = 0.6 + rng() * 1.6;
    const j1 = (rng() - 0.5) * 3, j2 = (rng() - 0.5) * 3;
    wrapped((dx, dy) => {
      x.strokeStyle = `rgba(${v},${v},${v},${a})`;
      x.lineWidth = lw;
      x.beginPath();
      x.moveTo(sx + dx, y + dy);
      x.bezierCurveTo(sx + dx + w * 0.33, y + dy + j1, sx + dx + w * 0.66, y + dy + j2, sx + dx + w, y + dy);
      x.stroke();
    });
  }

  /* peeling rings — a raised lip with a shadow under it, all the way round */
  for (let i = 0; i < 9; i++) {
    const rx = rng() * W, bw = 2 + rng() * 5, wob = rng() * 6;
    wrapped((dx) => {
      x.lineCap = 'butt';
      for (let pass = 0; pass < 2; pass++) {
        x.strokeStyle = pass ? 'rgba(215,215,215,0.55)' : 'rgba(40,40,40,0.5)';
        x.lineWidth = pass ? bw * 0.6 : bw;
        x.beginPath();
        for (let yy = 0; yy <= H; yy += 16) {
          const xx = rx + dx + (pass ? -bw * 0.5 : 0) + Math.sin(yy * 0.05 + wob) * 1.5;
          if (yy === 0) x.moveTo(xx, yy); else x.lineTo(xx, yy);
        }
        x.stroke();
      }
    });
  }

  /* lenticels — the dashes that band a cherry, stretched round the limb */
  for (let i = 0; i < 260; i++) {
    const cx = rng() * W, cy = rng() * H;
    const len = 6 + rng() * 22, lw = 1.6 + rng() * 2.6;
    wrapped((dx, dy) => {
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(215,215,215,0.45)';          // the lip
      x.lineWidth = lw + 1.6;
      x.beginPath(); x.moveTo(cx + dx + 0.8, cy + dy); x.lineTo(cx + dx + 0.8, cy + dy + len); x.stroke();
      x.strokeStyle = 'rgba(18,18,18,0.8)';              // the slot
      x.lineWidth = lw;
      x.beginPath(); x.moveTo(cx + dx, cy + dy); x.lineTo(cx + dx, cy + dy + len); x.stroke();
    });
  }

  const height = x.getImageData(0, 0, W, H).data;
  const hAt = (px, py) => height[(((py + H) % H) * W + ((px + W) % W)) * 4] / 255;

  /* colour: plum-brown in the hollows, a cool mauve on the raised skin */
  const albedo = x.createImageData(W, H);
  const normal = x.createImageData(W, H);
  const STRENGTH = 3.2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const h = hAt(px, py);
      const i = (py * W + px) * 4;
      const k = Math.min(1, Math.max(0, (h - 0.2) / 0.7));
      albedo.data[i]     = 30 + k * 104;
      albedo.data[i + 1] = 18 + k * 76;
      albedo.data[i + 2] = 32 + k * 94;
      albedo.data[i + 3] = 255;

      const sx = (hAt(px + 1, py - 1) + 2 * hAt(px + 1, py) + hAt(px + 1, py + 1))
               - (hAt(px - 1, py - 1) + 2 * hAt(px - 1, py) + hAt(px - 1, py + 1));
      const sy = (hAt(px - 1, py + 1) + 2 * hAt(px, py + 1) + hAt(px + 1, py + 1))
               - (hAt(px - 1, py - 1) + 2 * hAt(px, py - 1) + hAt(px + 1, py - 1));
      let nx = -sx * STRENGTH, ny = sy * STRENGTH, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      normal.data[i]     = (nx * 0.5 + 0.5) * 255;
      normal.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      normal.data[i + 3] = 255;
    }
  }

  const toTexture = (img, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: toTexture(albedo, true), normalMap: toTexture(normal, false) };
}

/* ============================================================
   a limb
   One closed sleeve along a smooth curve. The radius falls away
   exponentially, so a trunk keeps its weight and a twig runs out to
   nothing; the far end rounds shut instead of leaving an open tube.
   A limb that leaves another starts inside it and swells at the base
   the way a real branch collar does, so a fork reads as grown rather
   than as two pipes pushed together.
   ============================================================ */
export function limbRadius(o, t) {
  const s = t * o.len;
  let r = o.r0 * Math.pow(o.r1 / o.r0, t);
  if (o.collar) r *= 1 + o.collar * Math.exp(-s / (o.r0 * 3));
  const tip = Math.min(0.3, (o.r1 * 1.4) / o.len);
  if (t > 1 - tip) {
    const k = (t - (1 - tip)) / tip;
    r *= Math.sqrt(Math.max(0, 1 - k * k));
  }
  return r;
}

export function limbGeometry(curve, o) {
  const { seg, radial } = o;
  const frames = curve.computeFrenetFrames(seg, false);
  const count = (seg + 1) * (radial + 1);
  const pos  = new Float32Array(count * 3);
  const nor  = new Float32Array(count * 3);
  const uv   = new Float32Array(count * 2);
  const flex = new Float32Array(count);
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  const vRepeat = Math.max(1, Math.round((Math.PI * 2 * o.r0) / BARK_AROUND));
  const dt = 0.5 / seg;

  let v = 0;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const N = frames.normals[i], B = frames.binormals[i], T = frames.tangents[i];
    const s = t * o.len;
    const r = limbRadius(o, t);
    const slope = (limbRadius(o, Math.min(1, t + dt)) - limbRadius(o, Math.max(0, t - dt)))
                / ((Math.min(1, t + dt) - Math.max(0, t - dt)) * o.len);
    for (let j = 0; j <= radial; j++, v++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      let rr = r;
      if (o.gnarl) {
        rr *= 1 + o.gnarl * (0.6 * Math.sin(2 * a + t * 6 + o.seed)
                           + 0.4 * Math.sin(3 * a - t * 11 + o.seed * 2));
      }
      if (o.flare) {
        rr *= 1 + o.flare * Math.exp(-s * 2.4) * (0.7 + 0.3 * Math.sin(5 * a + o.seed));
      }
      D.set(N.x * ca + B.x * sa, N.y * ca + B.y * sa, N.z * ca + B.z * sa);
      pos[v * 3]     = P.x + D.x * rr;
      pos[v * 3 + 1] = P.y + D.y * rr;
      pos[v * 3 + 2] = P.z + D.z * rr;
      D.addScaledVector(T, -slope).normalize();
      nor[v * 3]     = D.x;
      nor[v * 3 + 1] = D.y;
      nor[v * 3 + 2] = D.z;
      uv[v * 2]     = (o.uStart + s) / BARK_ALONG;
      uv[v * 2 + 1] = (j / radial) * vRepeat;
      flex[v] = o.flex0 + s;
    }
  }

  const index = [];
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aFlex',    new THREE.BufferAttribute(flex, 1));
  g.setIndex(index);
  return g;
}

/* ============================================================
   the flower
   Five cupped petals with the notch at the tip, a heart, and a short
   stalk back to the twig — one small mesh, instanced thousands of
   times. The petal is a soft, rounded oval with no notch - the notch's
   two lobes read as sharp points at this size - drawn narrow enough
   that the five still read apart instead of merging into a disc, and
   curled up at its edges as well as its tip. The petals are stored flat and opened in the vertex shader,
   so a branch coming into bloom costs one uniform, not a rewrite of
   every instance.
   ============================================================ */
export const PETAL_LEN = 0.145;
const PETAL_WIDTH = 0.82;    // of the old outline's width
export const STALK_LEN = 0.085;

export function flowerGeometry() {
  /* one petal: rounded sides running into a rounded tip, no corners */
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.42, 0.18, 0.40, 1.00, 0, 1.00);
  shape.bezierCurveTo(-0.40, 1.00, -0.42, 0.18, 0, 0);
  const petal = new THREE.ShapeGeometry(shape, 5);   // few points per curve: at this size more is invisible

  /* across, along, and the cup — the tip curls back toward the heart
     and the sides lift, so the petal holds light like a spoon */
  const sp = petal.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    const u = x / 0.4;
    sp.setXYZ(i, x * PETAL_WIDTH * PETAL_LEN, y * PETAL_LEN,
              (0.17 * y * y + 0.11 * u * u) * PETAL_LEN);
  }
  petal.computeVertexNormals();
  const pp = sp.array;
  const pn = petal.attributes.normal.array;
  const pi = petal.index.array;

  const position = [];
  const normal = [];
  const kind = [];       // yaw, then 0 petal / 1 heart / 2 stalk
  const index = [];
  const PETALS = 5;
  const perPetal = pp.length / 3;

  for (let k = 0; k < PETALS; k++) {
    const base = position.length / 3;
    const yaw = (k / PETALS) * Math.PI * 2;
    for (let i = 0; i < perPetal; i++) {
      position.push(pp[i * 3], pp[i * 3 + 1], pp[i * 3 + 2]);
      normal.push(pn[i * 3], pn[i * 3 + 1], pn[i * 3 + 2]);
      kind.push(yaw, 0);
    }
    for (let i = 0; i < pi.length; i++) index.push(base + pi[i]);
  }

  /* the heart: a low dome the stamens would stand on */
  {
    const base = position.length / 3;
    position.push(0, 0.03, 0);
    normal.push(0, 1, 0);
    kind.push(0, 1);
    const R = 5;
    for (let i = 0; i < R; i++) {
      const a = (i / R) * Math.PI * 2;
      position.push(Math.cos(a) * 0.026, 0.01, -Math.sin(a) * 0.026);
      normal.push(Math.cos(a) * 0.5, 0.87, -Math.sin(a) * 0.5);
      kind.push(0, 1);
    }
    for (let i = 0; i < R; i++) index.push(base, base + 1 + i, base + 1 + ((i + 1) % R));
  }

  /* the stalk: one ribbon — at this size it is a line either way */
  {
    const w0 = 0.0055, w1 = 0.004;
    for (let q = 0; q < 1; q++) {
      const base = position.length / 3;
      const ax = q === 0 ? 1 : 0, az = q === 0 ? 0 : 1;
      position.push(-ax * w0, -0.004, -az * w0,  ax * w0, -0.004, az * w0,
                    -ax * w1, -STALK_LEN, -az * w1, ax * w1, -STALK_LEN, az * w1);
      for (let i = 0; i < 4; i++) { normal.push(az, 0, ax); kind.push(0, 2); }
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('aPetal',   new THREE.Float32BufferAttribute(kind, 2));
  g.setIndex(index);
  return g;
}

/* ============================================================
   materials
   Both are MeshStandardMaterial underneath, so the moon's key light,
   the fill, the roaming glow and the fog all still reach them. The
   shader is patched rather than replaced: wind in the vertex stage,
   rim light added to the emissive term so the bloom pass picks it
   up and bleeds it past the edges.
   ============================================================ */
function patch(mat, key, uniforms, edit) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    edit(shader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function makeWoodMaterial(shared, maps) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4c2d6,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.74,
    metalness: 0,
  });
  const uniforms = { ...shared, uRimGain: { value: 1.25 } };
  mat.userData.uniforms = uniforms;
  return patch(mat, 'sakura-wood', uniforms, (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uWind;
attribute float aFlex;
varying float vFlex;
${SIMPLEX_GLSL}
${WIND_GLSL}`)
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4(transformed, 1.0);
mvPosition.xyz += sakuraWind(transformed, aFlex);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
vFlex = aFlex;`);

    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
${RIM_PARS}
varying float vFlex;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
/* the new wood out at the tips is redder than the old grey trunk */
diffuseColor.rgb *= mix(vec3(1.0), vec3(1.25, 0.82, 0.92), smoothstep(0.55, 1.0, vFlex));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(uSunView + vViewPosition);
  float back = smoothstep(-0.3, 0.85, dot(-V, L));
  float fres = pow(1.0 - saturate(dot(normal, V)), 3.0);
  float rim = fres * skToward(normal, L) * mix(0.12, 1.0, back);
  totalEmissiveRadiance += mix(uRimPink, uRimHot, fres) * rim * uRimGain;
}`);
  });
}

export function makeBlossomMaterial(shared, color, emissive) {
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 0.2,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const uniforms = {
    ...shared,
    uBloomT:   { value: 0 },    // how far this branch has been asked to open
    uCeiling:  { value: 0 },    // how far it is allowed to
    uRimGain:  { value: 0.8 },
    uHeart:    { value: new THREE.Color(0xffd98a) },
    uStalk:    { value: new THREE.Color(0x5a2c44) },
  };
  mat.userData.uniforms = uniforms;
  return patch(mat, 'sakura-blossom', uniforms, (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uWind;
uniform float uBloomT;
uniform float uCeiling;
attribute vec2 aPetal;   // yaw, kind: 0 petal, 1 heart, 2 stalk
attribute vec4 aInst;    // opening delay, flex, how exposed, seed
attribute vec3 aOut;     // which way is out of the crown from here
varying float vKind;
varying float vAlong;
varying float vShade;
varying float vOpen;
varying vec3 vOut;
${SIMPLEX_GLSL}
${WIND_GLSL}`)
      /* the petals open here: each hinges up from its base, from a
         closed bud cupped round the heart to a flat, open flower */
      .replace('#include <beginnormal_vertex>', `
float skK = clamp((uBloomT - aInst.x) / (1.0 - aInst.x), 0.0, 1.0);
float skOpen = skK * skK * (3.0 - 2.0 * skK) * uCeiling;
vOpen = skOpen;
vKind = aPetal.y;
vShade = aInst.z;
vAlong = aPetal.y < 0.5 ? position.y / ${PETAL_LEN.toFixed(4)} : 0.0;
vec3 skPos = position;
vec3 objectNormal = normal;
if (aPetal.y < 0.5) {
  float e = mix(1.3, 0.22, skOpen);
  float ce = cos(e), se = sin(e);
  float cy = cos(aPetal.x), sy = sin(aPetal.x);
  /* along the petal -> out from the heart, its cup -> up the flower */
  vec3 p = vec3(position.y + 0.012, position.z, position.x);
  vec3 n = vec3(normal.y, normal.z, normal.x);
  p = vec3(p.x * ce - p.y * se, p.x * se + p.y * ce, p.z);
  n = vec3(n.x * ce - n.y * se, n.x * se + n.y * ce, n.z);
  skPos = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) * (0.74 + skOpen * 0.34);
  objectNormal = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
} else if (aPetal.y < 1.5) {
  skPos *= 0.55 + skOpen * 0.55;
}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = skPos;')
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4(transformed, 1.0);
vec3 skHead = vec3(0.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  skHead = instanceMatrix[3].xyz;
#endif
/* each flower rocks a little on its stalk, then goes where its twig goes */
float skFl = (sin(uTime * 2.1 + aInst.w * 40.0 + skHead.x * 1.7) * 0.6
            + sin(uTime * 3.3 + aInst.w * 23.0 + skHead.z * 1.3) * 0.4) * aInst.y * uWind;
mvPosition.xyz += cross(vec3(0.62, 0.0, 0.78), mvPosition.xyz - skHead) * (skFl * 0.22);
mvPosition.xyz += sakuraSway(skHead, aInst.y);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
vOut = normalize(normalMatrix * aOut);`);

    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
${RIM_PARS}
uniform vec3 uHeart;
uniform vec3 uStalk;
varying float vKind;
varying float vAlong;
varying float vShade;
varying float vOpen;
varying vec3 vOut;`)
      /* flushed at the base, paler toward the notch, deeper again
         while still in bud — the way a real sakura colours */
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 base = diffuseColor.rgb;
  vec3 petal = mix(base * vec3(0.98, 0.76, 0.86), base * 1.08, smoothstep(0.0, 0.8, vAlong));
  petal = mix(base * vec3(0.94, 0.62, 0.78), petal, 0.35 + 0.65 * vOpen);
  diffuseColor.rgb = vKind < 0.5 ? petal : (vKind < 1.5 ? uHeart : uStalk);
  /* deep in the crown there is less light to go round - but not so
     little that the pink sinks to burgundy */
  diffuseColor.rgb *= mix(0.42, 0.88, vShade);
}`)
      /* A petal is thin and deeply pigmented, so what light it gives
         back is its own pink — pale petals under the warm moon would
         otherwise bleach to cream. */
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directDiffuse *= vKind < 0.5 ? vec3(1.0, 0.7, 0.88) : vec3(1.0);
/* and a petal is velvet, not lacquer: with the moon behind, every one
   sits at a grazing angle, and a full specular there turns the crown
   white. What sheen it has is its own pink. */
reflectedLight.directSpecular *= vec3(0.3, 0.1, 0.18);`)
      /* light the crown as a volume rather than as thousands of cards */
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 skOut = normalize(vOut);
normal = normalize(mix(normal, skOut, 0.55));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(uSunView + vViewPosition);
  float along = dot(-V, L);
  float back = smoothstep(-0.3, 0.85, along);
  /* the silhouette of the crown, not of each petal */
  float fres = pow(1.0 - saturate(dot(skOut, V)), 3.0);
  float rim = fres * skToward(skOut, L) * mix(0.12, 1.0, back);
  /* a petal is thin: with the moon right behind it the light comes
     straight through */
  float thru = pow(saturate(along), 14.0) + 0.1 * pow(saturate(along), 4.0);
  float part = vKind < 0.5 ? 1.0 : (vKind < 1.5 ? 0.6 : 0.3);
  /* pink through most of the edge, running hot only right at it —
     kept low enough that tone mapping leaves it saturated rather than
     bleaching it toward cream */
  vec3 glow = mix(uRimPink, uRimHot, fres * fres * fres) * rim * 0.95
            + mix(uRimPink, uRimHot, 0.2) * thru * 0.25 * (0.4 + 0.6 * vOpen);
  totalEmissiveRadiance *= vKind > 0.5 && vKind < 1.5 ? 1.2 : 1.0;
  totalEmissiveRadiance += glow * vShade * part * uRimGain;
}`);
  });
}
