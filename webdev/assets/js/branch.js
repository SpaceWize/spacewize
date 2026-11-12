/* The cherry branch behind the web dev page.
   A bough grows down the page as you scroll. Twigs sprout behind its tip, then clusters of
   blossom, buds and young leaves open on them. Everything here is made in code: the shapes,
   the bark, the petal veins, the leaf. No image files, no sound. */
import * as THREE from '../../../assets/vendor/three/build/three.module.js';

const canvas = document.getElementById('scene');
const root = document.documentElement;
const isCalm = () => root.classList.contains('calm');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const FOV = 40, CAMZ = 14, TAN = Math.tan(FOV / 2 * Math.PI / 180), VIEWH = 2 * CAMZ * TAN;
const MAIN = 0, FAR = 1, NEAR = 2;                       /* render layers: in focus, behind, in front */

let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'}); }
catch (e) { canvas.remove(); throw e; }
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 90);
camera.position.set(0, 0, CAMZ);

/* seeded random so the tree is the same on every visit */
let seed = 20261111;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

/* ============================== light ============================== */
function skyLight(){                         /* a soft overcast sky with one bright window, baked into reflections */
  const s = new THREE.Scene(), g = new THREE.SphereGeometry(30, 32, 16), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const sky = ramp([[0, 0xb98f98], [.4, 0xe9d6cf], [.62, 0xfbf1ea], [1, 0xffffff]]);
  for (let i = 0; i < p.count; i++){ const c = sky(p.getY(i) / 60 + .5); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide})));
  const win = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshBasicMaterial({color:new THREE.Color(7, 6.4, 5.6), side:THREE.DoubleSide}));
  win.position.set(-12, 16, 14); win.lookAt(0, 0, 0); s.add(win);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, .035).texture; pm.dispose(); g.dispose();
  return tex;
}
const hemi = new THREE.HemisphereLight(0xfff7f2, 0xe7b3c4, .45);
const sun = new THREE.DirectionalLight(0xffe9d2, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; sun.shadow.radius = 5;
const fill = new THREE.DirectionalLight(0xffd3e2, .55); fill.position.set(8, -3, -6);
[hemi, sun, fill].forEach(l => l.layers.enableAll());
scene.add(hemi, sun, sun.target, fill);
const sunU = {uSunV:{value:V(0, 0, 1)}, uSunC:{value:new THREE.Color(1, .9, .78)}};

/* ============================== geometry toolkit ============================== */
function ramp(stops){                        /* [[t, hex], ...] -> t => colour */
  const cs = stops.map(s => [s[0], new THREE.Color(s[1])]), out = new THREE.Color();
  return t => { t = clamp(t, 0, 1);
    for (let i = 1; i < cs.length; i++) if (t <= cs[i][0]) return out.lerpColors(cs[i - 1][1], cs[i][1], (t - cs[i - 1][0]) / (cs[i][0] - cs[i - 1][0]));
    return out.copy(cs[cs.length - 1][1]); };
}
/* a curved sheet: fn(u, v) gives the point, colFn(u, v) its colour; u runs along, v across (-1..1) */
function sheet(nu, nv, fn, colFn){
  const pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++){
    const u = i / nu, v = j / nv * 2 - 1, p = fn(u, v), c = colFn(u, v);
    pos.push(p.x, p.y, p.z); uv.push(v * .5 + .5, u); col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++){ const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* colour a shape (flat, or by position) and point its texture lookup at a plain patch */
function tint(g, c){
  const p = g.attributes.position, col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2), k = new THREE.Color();
  for (let i = 0; i < p.count; i++){
    typeof c === 'function' ? k.copy(c(p.getX(i), p.getY(i), p.getZ(i))) : k.set(c);
    col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b; uv[i * 2] = .02; uv[i * 2 + 1] = .02;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function along(g, dir, at){                  /* stand a Y-up shape along dir, its middle at `at` */
  g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()), V(1, 1, 1)));
  return g;
}
function bake(parts, names = ['position', 'normal', 'uv', 'color']){
  const size = {position:3, normal:3, uv:2, color:3}, flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; flat.forEach(g => n += g.attributes.position.count);
  const out = new THREE.BufferGeometry();
  names.forEach(name => { const a = new Float32Array(n * size[name]); let o = 0; flat.forEach(g => { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }); out.setAttribute(name, new THREE.BufferAttribute(a, size[name])); });
  return out;
}
/* A limb whose thickness changes along its length and around it; rf(t, angle) is the radius.
   Faces are laid down segment by segment, so a limb can be revealed from its base to its tip.
     o.grow    keep what the growing-tip shader needs
     o.parent  {o, t, R}: the limb this one grows out of. Near the joint its surface is lit as part
               of the parent and darkened a little, so the two read as one piece of wood
     o.tint    t => colour along the limb
     o.u0      where on the bark picture it starts */
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WHITE = new THREE.Color(1, 1, 1), USC = .27;      /* the bark picture: this much of its length per unit of limb */
function tube(curve, segs, radial, rf, o = {}){
  const pos = [], nor = [], uv = [], col = [], idx = [], P = [], tans = [], cen = [], al = [];
  const us = o.usc || USC, Lc = curve.getLength(), N = V(0, 0, 0), B = V(0, 0, 0), n = V(0, 0, 0), m = V(0, 0, 0), q = V(0, 0, 0), ax = V(0, 0, 0), e = .5 / segs;
  for (let i = 0; i <= segs; i++){
    const t = i / segs, c = curve.getPointAt(t), T = curve.getTangentAt(t).normalize(); P.push(c); tans.push(T);
    /* each ring starts and ends at the limb's outline as seen from the front, where the join in the bark picture cannot be seen */
    N.crossVectors(Z, T); if (N.lengthSq() < .01) N.crossVectors(X, T); N.normalize(); B.crossVectors(T, N);
    const t0 = Math.max(0, t - e), t1 = Math.min(1, t + e), k = o.tint ? o.tint(t) : WHITE, vs = Math.PI * rf(t, 0) * us * 4;
    for (let j = 0; j <= radial; j++){
      const a = j / radial * Math.PI * 2, r = rf(t, a), slope = (rf(t1, a) - rf(t0, a)) / ((t1 - t0) * Lc);
      n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      const px = c.x + n.x * r, py = c.y + n.y * r, pz = c.z + n.z * r;
      m.copy(n).addScaledVector(T, -slope).normalize();               /* the way the surface really faces, flare included */
      let shade = 1;
      if (o.parent){
        q.set(px, py, pz).sub(o.parent.o); ax.copy(q).addScaledVector(o.parent.t, -q.dot(o.parent.t));
        const d = ax.length() - o.parent.R, bl = o.parent.R * .9 + .03;
        if (d < bl * 1.2 && ax.lengthSq() > 1e-8){ m.lerp(ax.normalize(), 1 - smooth(0, bl, d)).normalize(); shade = lerp(.74, 1, smooth(-.02, bl * 1.2, d)); }
      }
      pos.push(px, py, pz); nor.push(m.x, m.y, m.z); col.push(k.r * shade, k.g * shade, k.b * shade);
      uv.push((o.u0 || 0) + t * Lc * us, vs * (1 - Math.abs(2 * j / radial - 1)));
      if (o.grow){ cen.push(c.x, c.y, c.z); al.push(i); }
    }
  }
  for (let i = 1; i <= segs; i++) for (let j = 1; j <= radial; j++){
    const a = (radial + 1) * (i - 1) + (j - 1), b = (radial + 1) * i + (j - 1), c = (radial + 1) * i + j, d = (radial + 1) * (i - 1) + j;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (o.grow){ g.setAttribute('aCentre', new THREE.Float32BufferAttribute(cen, 3)); g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1)); }
  g.setIndex(idx);
  return {g, P, tans};
}
/* a facing: +Y along `y`, and the flat side turned as near to `face` as it can be */
function basis(y, face){
  const yy = y.clone().normalize(), zz = face.clone().addScaledVector(yy, -face.dot(yy));
  if (zz.lengthSq() < 1e-4) zz.set(yy.y, -yy.x, .3).addScaledVector(yy, -zz.dot(yy));
  zz.normalize(); const xx = V(0, 0, 0).crossVectors(yy, zz);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
}

/* ============================== drawn surfaces ============================== */
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function petalTextures(){                    /* fine veins fanning from the base; the bottom-left corner stays plain */
  const a = mk(256, 256), b = mk(256, 256), x = a.getContext('2d'), h = b.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); h.fillStyle = '#808080'; h.fillRect(0, 0, 256, 256);
  const base = x.createRadialGradient(128, 256, 4, 128, 256, 116); base.addColorStop(0, 'rgba(165,28,86,.55)'); base.addColorStop(1, 'rgba(165,28,86,0)');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++){
    const ang = (-54 + i / 45 * 108 + (rnd() - .5) * 4) * Math.PI / 180, len = 140 + rnd() * 100, ex = 128 + Math.sin(ang) * len, ey = 252 - Math.cos(ang) * len;
    const mx = 128 + Math.sin(ang) * len * .5 + (rnd() - .5) * 12, my = 252 - Math.cos(ang) * len * .55;
    const g = x.createLinearGradient(128, 252, ex, ey); g.addColorStop(0, 'rgba(190,50,108,.4)'); g.addColorStop(.65, 'rgba(212,92,142,.13)'); g.addColorStop(1, 'rgba(212,92,142,0)');
    x.strokeStyle = g; x.lineWidth = .7 + rnd() * 1.1; x.beginPath(); x.moveTo(128, 252); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
    const k = h.createLinearGradient(128, 252, ex, ey); k.addColorStop(0, 'rgba(60,60,60,.55)'); k.addColorStop(.8, 'rgba(100,100,100,.2)'); k.addColorStop(1, 'rgba(128,128,128,0)');
    h.strokeStyle = k; h.lineWidth = 1 + rnd() * 1.4; h.beginPath(); h.moveTo(128, 252); h.quadraticCurveTo(mx, my, ex, ey); h.stroke();
  }
  for (let i = 0; i < 900; i++){ h.fillStyle = `rgba(${rnd() < .5 ? 90 : 165},${rnd() < .5 ? 90 : 165},${rnd() < .5 ? 90 : 165},.07)`; h.fillRect(20 + rnd() * 236, rnd() * 236, 2 + rnd() * 5, 1 + rnd() * 3); }
  const map = new THREE.CanvasTexture(a), bump = new THREE.CanvasTexture(b);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = bump.anisotropy = 4;
  return {map, bump};
}
function barkTextures(){
  /* Cherry bark, worked out point by point: a satiny red-brown skin whose markings run round the limb,
     pale raised lenticels, a few cracks along it, and greyer weathered patches. Three pictures come out
     of the same data: its colour, its relief, and how shiny each spot is. They tile in both directions. */
  const W = 1024, H = 256, n = 512, lat = () => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const vn = (g, x, y, px, py) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = ((x0 % px) + px) % px, b = (a + 1) % px, c = ((y0 % py) + py) % py, d = (c + 1) % py;
    const top = g[c * n + a] + (g[c * n + b] - g[c * n + a]) * sx, bot = g[d * n + a] + (g[d * n + b] - g[d * n + a]) * sx;
    return top + (bot - top) * sy; };
  const fbm = (g, u, v, fu, fv, oct) => { let s = 0, amp = 1, tot = 0;
    for (let o = 0; o < oct; o++){ const m = 1 << o; s += amp * vn(g, u * fu * m + o * 17, v * fv * m + o * 31, fu * m, fv * m); tot += amp; amp *= .5; }
    return s / tot; };
  const gA = lat(), gB = lat(), gC = lat(), gD = lat();
  const col = new Float32Array(W * H * 3), hgt = new Float32Array(W * H), rgh = new Float32Array(W * H);
  const dark = [43, 31, 32], mid = [94, 65, 62], hi = [128, 96, 91], grey = [126, 118, 116];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){
    const u = i / W, v = j / H, p = j * W + i;
    const mo = fbm(gA, u, v, 12, 3, 4);              /* slow mottling */
    const bd = fbm(gB, u, v, 128, 4, 3);             /* fine bands running round the limb */
    const fn = fbm(gC, u, v, 256, 64, 2);            /* grain */
    const gr = fbm(gD, u, v, 8, 2, 3);               /* weathered patches */
    const t1 = clamp(.5 + (mo - .5) * 1.0 + (bd - .5) * 1.5, 0, 1), t2 = clamp((bd - .58) * 3, 0, 1) * .45, wg = smooth(.55, .7, gr) * .4, f = .88 + .24 * fn;
    for (let c = 0; c < 3; c++){ let x = lerp(dark[c], mid[c], t1); x = lerp(x, hi[c], t2); x = lerp(x, grey[c], wg); col[p * 3 + c] = x * f; }
    hgt[p] = .5 + (bd - .5) * .8 + (mo - .5) * .2 + (fn - .5) * .3;
    rgh[p] = .74 - (bd - .5) * .28 + wg * .2 + (fn - .5) * .12;
  }
  const stamp = (cx, cy, rx, ry, fn) => { const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn((((y % H) + H) % H) * W + (((x % W) + W) % W), x - cx, y - cy); };
  for (let i = 0; i < 250; i++){                    /* lenticels: pale, raised, ragged, each with a darker slit; most short, a few long */
    const r = rnd(), ly = r < .6 ? 5 + rnd() * 8 : r < .92 ? 13 + rnd() * 17 : 32 + rnd() * 34, lx = 1.9 + rnd() * 1.9 + ly * .04;
    const cx = rnd() * W, cy = rnd() * H, tone = .78 + rnd() * .4, tilt = (rnd() - .5) * .16, ph = rnd() * 9;
    stamp(cx, cy, lx * 3, ly * 2.2, (p, dx, dy) => {
      const xx = dx - dy * tilt, rag = 1 + .35 * Math.sin(dy * .9 + ph), d = xx * xx / (lx * lx * rag) + dy * dy / (ly * ly), w = Math.min(1, Math.exp(-d * 1.5) * 1.25);
      if (w < .02) return;
      const slit = Math.exp(-(xx * xx / (lx * lx * .1) + dy * dy / (ly * ly)) * 1.5), a = w * .8;
      col[p * 3] = lerp(col[p * 3], 166 * tone, a); col[p * 3 + 1] = lerp(col[p * 3 + 1], 140 * tone, a); col[p * 3 + 2] = lerp(col[p * 3 + 2], 124 * tone, a);
      hgt[p] += w * .42 - slit * .3; rgh[p] = lerp(rgh[p], .95, w);
    });
  }
  for (let i = 0; i < 26; i++){                     /* a few dark cracks running along the limb */
    let x = rnd() * W, y = rnd() * H; const len = 30 + rnd() * 130, wd = .8 + rnd() * .9;
    for (let s = 0; s < len; s++){ x += 1; y += (rnd() - .5) * 1.1; const fade = Math.sin(Math.PI * s / len);
      stamp(x, y, 2, wd * 2.5, (p, dx, dy) => { const w = Math.exp(-(dx * dx + dy * dy) / (wd * wd)) * fade;
        col[p * 3] *= 1 - .18 * w; col[p * 3 + 1] *= 1 - .18 * w; col[p * 3 + 2] *= 1 - .18 * w; hgt[p] -= .14 * w; rgh[p] = lerp(rgh[p], .98, w * .5); }); }
  }
  const picture = fill => { const c = mk(W, H), x = c.getContext('2d'), im = x.createImageData(W, H); for (let p = 0; p < W * H; p++){ fill(im.data, p, p * 4); im.data[p * 4 + 3] = 255; } x.putImageData(im, 0, 0); return c; };
  const at = (x, y) => hgt[(((y % H) + H) % H) * W + (((x % W) + W) % W)];
  const map = new THREE.CanvasTexture(picture((d, p, o) => { d[o] = col[p * 3]; d[o + 1] = col[p * 3 + 1]; d[o + 2] = col[p * 3 + 2]; }));
  const normal = new THREE.CanvasTexture(picture((d, p, o) => { const x = p % W, y = (p - x) / W, nx = -(at(x + 1, y) - at(x - 1, y)) * 2.4, ny = (at(x, y + 1) - at(x, y - 1)) * 2.4, l = Math.hypot(nx, ny, 1);
    d[o] = (nx / l * .5 + .5) * 255; d[o + 1] = (ny / l * .5 + .5) * 255; d[o + 2] = (1 / l * .5 + .5) * 255; }));
  const rough = new THREE.CanvasTexture(picture((d, p, o) => { const r = clamp(rgh[p], .3, 1) * 255; d[o] = d[o + 1] = d[o + 2] = r; }));
  map.colorSpace = THREE.SRGBColorSpace; [map, normal, rough].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; });
  return {map, normal, rough};
}
function leafTextures(){                     /* a cherry leaf: oval, drawn out to a point, saw-toothed, strongly veined */
  const W = 256, H = 512, a = mk(W, H), b = mk(W, H), x = a.getContext('2d'), k = b.getContext('2d');
  const y0 = 446, y1 = 10, half = t => 108 * Math.pow(Math.sin(Math.PI * Math.pow(t, .6)), .78) * (1 - .62 * Math.pow(t, 2.2)) * (1 + .06 * ((t * 34) % 1)) * Math.min(1, (1 - t) * 14);
  const outline = c => { c.beginPath(); c.moveTo(128, y0);
    for (let i = 1; i <= 240; i++){ const t = i / 240; c.lineTo(128 + half(t), lerp(y0, y1, t)); }
    for (let i = 240; i >= 0; i--){ const t = i / 240; c.lineTo(128 - half(t), lerp(y0, y1, t)); } c.closePath(); };
  k.fillStyle = '#808080'; k.fillRect(0, 0, W, H);
  x.save(); outline(x); x.clip();
  const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#45752f'); g.addColorStop(.5, '#588f3b'); g.addColorStop(1, '#72a54c'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const e = x.createRadialGradient(128, 250, 30, 128, 250, 230); e.addColorStop(0, 'rgba(255,255,220,.1)'); e.addColorStop(1, 'rgba(40,70,20,.28)'); x.fillStyle = e; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++){ x.fillStyle = `rgba(${rnd() < .5 ? '30,60,16' : '190,214,120'},${.04 + rnd() * .06})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, 2 + rnd() * 9, 0, 7); x.fill(); }
  k.save(); outline(k); k.clip();
  const vein = (pts, w0, w1, col, alpha) => { for (const c of [x, k]){
      c.strokeStyle = c === x ? col : `rgba(40,40,40,${alpha})`; c.lineCap = 'round';
      for (let i = 1; i < pts.length; i++){ c.lineWidth = lerp(w0, w1, i / pts.length) * (c === x ? 1 : 1.3); c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); } } };
  for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 10; i++){   /* side veins sweep out and curve toward the tip */
    const t = .06 + i * .086, yb = lerp(y0, y1, t), reach = half(Math.min(.98, t + .13)) * .93, pts = [];
    for (let j = 0; j <= 14; j++){ const q = j / 14; pts.push([128 + s * reach * (1 - Math.pow(1 - q, 1.7)), yb - q * 46 - q * q * 26]); }
    vein(pts, 2.1, .5, 'rgba(196,222,140,.62)', .5);
    for (let j = 3; j < 13; j += 3){ const p = pts[j]; vein([[p[0], p[1]], [p[0] + s * 4, p[1] - 15], [p[0] + s * 2, p[1] - 30]], .8, .3, 'rgba(196,222,140,.3)', .22); }
  }
  const mid = []; for (let j = 0; j <= 24; j++) mid.push([128, lerp(y0, y1 + 6, j / 24)]);
  vein(mid, 4.4, .8, 'rgba(214,232,156,.85)', .7);
  x.restore(); k.restore();
  x.strokeStyle = '#8c4a3c'; x.lineWidth = 6; x.lineCap = 'butt'; x.beginPath(); x.moveTo(128, 512); x.lineTo(128, y0 - 2); x.stroke();   /* the leaf stalk */
  const map = new THREE.CanvasTexture(a), bump = new THREE.CanvasTexture(b);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = bump.anisotropy = 8;
  return {map, bump};
}

/* ============================== materials ============================== */
/* petals and leaves let light through: a face turned away from the sun still glows a little */
function translucent(m, amount){
  m.onBeforeCompile = sh => { sh.uniforms.uSunV = sunU.uSunV; sh.uniforms.uSunC = sunU.uSunC;
    sh.fragmentShader = 'uniform vec3 uSunV;\nuniform vec3 uSunC;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uSunC * (${amount.toFixed(2)} * clamp(dot(-normal, uSunV), 0., 1.));`); };
  m.customProgramCacheKey = () => 'thru' + amount;
  return m;
}
const env = skyLight(); scene.environment = env;
const pt = petalTextures();
const petalMat = translucent(new THREE.MeshPhysicalMaterial({map:pt.map, bumpMap:pt.bump, bumpScale:.5, vertexColors:true, side:THREE.DoubleSide, shadowSide:THREE.DoubleSide,
  roughness:.58, metalness:0, sheen:.5, sheenRoughness:.4, sheenColor:new THREE.Color(0xffc8da), envMapIntensity:.75}), .62);
const lt = leafTextures();
const leafMat = translucent(new THREE.MeshStandardMaterial({map:lt.map, bumpMap:lt.bump, bumpScale:1.6, alphaTest:.5, side:THREE.DoubleSide, shadowSide:THREE.DoubleSide,
  roughness:.5, metalness:0, envMapIntensity:.45}), .3);
const leafDepth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map:lt.map, alphaTest:.5});
const bk = barkTextures();
const skin = {map:bk.map, normalMap:bk.normal, normalScale:new THREE.Vector2(1.1, 1.1), roughnessMap:bk.rough, roughness:1, metalness:0, envMapIntensity:.32, vertexColors:true};
const grow = {uGrow:{value:0}, uTipLen:{value:20}};
const growing = sh => {                      /* the last stretch behind the growing tip narrows to a point, like a young shoot */
  sh.uniforms.uGrow = grow.uGrow; sh.uniforms.uTipLen = grow.uTipLen;
  sh.vertexShader = 'attribute vec3 aCentre;\nattribute float aAlong;\nuniform float uGrow;\nuniform float uTipLen;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n\tfloat gk = clamp((uGrow - aAlong) / uTipLen, 0., 1.);\n\tgk = mix(gk, sqrt(gk), .5);\n\ttransformed = mix(aCentre, position, gk);');
};
const barkMat = new THREE.MeshStandardMaterial(skin);
barkMat.onBeforeCompile = growing;
const barkDepth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}); barkDepth.onBeforeCompile = growing;
const twigMat = new THREE.MeshStandardMaterial(skin);      /* twigs wear the same bark as the bough */
const partMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.7, metalness:0, envMapIntensity:.7});

/* ============================== the flower ============================== */
const petalCol = ramp([[0, 0xae2360], [.15, 0xdb548e], [.4, 0xf28cb2], [.7, 0xf8b8cf], [1, 0xfcd8e5]]);
function petal(nu, nv, j, cup){                 /* broad, cupped, softly notched; j = a little individuality */
  return sheet(nu, nv, (u, v) => {
    const hw = .47 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(u, .9995), 1.3)), .52);
    const x = v * hw, notch = 1 - .08 * Math.exp(-v * v * 9) * Math.pow(u, 6);
    const z = cup * .3 * x * x * (1.2 - u * .4) + cup * .13 * u * u + .024 * Math.sin(v * 4 + u * 5 + j * 9) * u * u + .012 * Math.sin(u * 9 + j * 5) * v * v;
    return V(x, u * notch, z);
  }, (u, v) => petalCol(u * (.9 + .1 * (1 - v * v)) + j * .05));
}
const STALK = 1.15;                          /* how far the flower sits out on its own stalk */
function blossom(tilt, cup, lo){             /* built pointing along +Z, its stalk starting at the origin */
  const parts = [], z0 = lo ? 0 : STALK;
  for (let k = 0; k < 5; k++){
    const g = petal(lo ? 5 : 10, lo ? 4 : 7, rnd(), cup);
    g.scale(.92 + rnd() * .16, .94 + rnd() * .12, 1);
    g.rotateX(tilt + rnd() * .14); g.rotateZ(k * Math.PI * 2 / 5 + (rnd() - .5) * .16); g.translate(0, 0, z0 + (k % 2) * .02);
    parts.push(g);
  }
  const heart = tint(new THREE.SphereGeometry(lo ? .12 : .085, 10, 6), lo ? 0xc0396a : 0xa3265a); heart.scale(1, 1, .55); heart.translate(0, 0, z0 + .03); parts.push(heart);
  if (lo) return bake(parts);
  parts.push(along(tint(new THREE.CylinderGeometry(.008, .012, .38, 4, 1, true), 0xdfe6a4), Z, V(0, 0, z0 + .2)));        /* pistil */
  const anther = ramp([[0, 0xe39a28], [1, 0xf7d653]]);
  for (let s = 0; s < 14; s++){                                                                                               /* stamens */
    const a = rnd() * Math.PI * 2, t = .16 + rnd() * .8, len = .26 + rnd() * .2;
    const d = V(Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t));
    parts.push(along(tint(new THREE.CylinderGeometry(.0055, .009, len, 3, 1, true), 0xf8bccf), d, d.clone().multiplyScalar(len / 2).add(V(0, 0, z0 + .03))));
    const top = tint(new THREE.OctahedronGeometry(.027), anther(rnd()).getHex()); top.scale(1, 1.5, 1);
    parts.push(along(top, d, d.clone().multiplyScalar(len).add(V(0, 0, z0 + .03))));
  }
  const cupCol = ramp([[0, 0x7f8f44], [1, 0x9a4250]]);
  parts.push(along(tint(new THREE.CylinderGeometry(.09, .045, .26, 8, 1, true), (x, y) => cupCol((y + .13) / .26)), Z, V(0, 0, z0 - .13)));   /* the cup under the petals */
  for (let k = 0; k < 5; k++){                                                                                                /* sepals, turned back */
    const a = k * Math.PI * 2 / 5 + .6, d = V(Math.cos(a), Math.sin(a), -.35);
    parts.push(along(tint(new THREE.ConeGeometry(.05, .24, 4), 0x93434d), d, d.clone().normalize().multiplyScalar(.14).add(V(Math.cos(a) * .06, Math.sin(a) * .06, z0 - .03))));
  }
  const bow = (rnd() - .5) * .3, sc = new THREE.CatmullRomCurve3([V(0, 0, 0), V(bow, bow * .6, z0 * .5), V(0, 0, z0 - .24)]), stalkCol = ramp([[0, 0x7d4a36], [.3, 0x7f8f44], [1, 0x8d9a4c]]);
  const st = tube(sc, 7, 5, t => .021 - .005 * t).g; tint(st, (x, y, z) => stalkCol(z / z0)); parts.push(st);
  return bake(parts);
}
function bud(){                               /* a closed bud on its stalk, standing along +Y from the origin */
  const skin = ramp([[0, 0xa2215a], [.4, 0xd24c86], [.8, 0xee92b6], [1, 0xf7bcd1]]), parts = [], h = .78;
  const body = tint(new THREE.SphereGeometry(.15, 14, 12), (x, y, z) => skin((y + .15) / .3 + Math.sin(Math.atan2(z, x) * 5 + y * 9) * .07)); body.scale(1, 1.55, 1); body.translate(0, h + .2, 0); parts.push(body);
  const cupCol = ramp([[0, 0x7f8f44], [1, 0x9a4250]]);
  parts.push(tint(new THREE.CylinderGeometry(.1, .05, .2, 8, 1, true), (x, y) => cupCol((y + .1) / .2)).translate(0, h, 0));
  for (let k = 0; k < 5; k++){ const a = k * Math.PI * 2 / 5, d = V(Math.cos(a) * .3, 1, Math.sin(a) * .3);
    parts.push(along(tint(new THREE.ConeGeometry(.055, .26, 4), 0x93434d), d, V(Math.cos(a) * .1, h + .17, Math.sin(a) * .1))); }
  const bow = (rnd() - .5) * .25, sc = new THREE.CatmullRomCurve3([V(0, 0, 0), V(bow, h * .5, bow * .5), V(0, h - .08, 0)]), stalkCol = ramp([[0, 0x7d4a36], [.3, 0x7f8f44], [1, 0x8d9a4c]]);
  const st = tube(sc, 7, 5, t => .021 - .005 * t).g; tint(st, (x, y) => stalkCol(y / h)); parts.push(st);
  return bake(parts);
}
function leaf(){                              /* the blade is a drawn texture on a sheet: folded along the midrib, arching, wavy at the edge */
  const white = new THREE.Color(1, 1, 1);
  return bake([sheet(14, 6, (u, v) => {
    const blade = clamp((u - .13) / .2, 0, 1), x = v * .25;
    return V(x, u, -Math.abs(v) * .085 * blade - .3 * Math.pow(Math.max(0, u - .12), 2) + .014 * Math.sin(u * 19) * v * v * blade);
  }, () => white)]);
}
function spur(){                              /* the knobbly little shoot a cluster grows from, with its brown bud scales */
  const parts = [tint(new THREE.CylinderGeometry(.05, .065, .16, 7), 0x4b2a22).translate(0, .06, 0)];
  for (let k = 0; k < 7; k++){ const a = k / 7 * Math.PI * 2 + rnd(), d = V(Math.cos(a) * .7, 1, Math.sin(a) * .7);
    parts.push(along(tint(new THREE.ConeGeometry(.045, .17, 4), k % 2 ? 0x6d3a2c : 0x8a5a3a), d, V(Math.cos(a) * .05, .12, Math.sin(a) * .05))); }
  return bake(parts);
}
const GEO = {b0:blossom(.16, 1, false), b1:blossom(.36, 1.25, false), b2:blossom(.74, 1.6, false), lo:blossom(.26, 1.1, true), bud:bud(), leaf:leaf(), spur:spur(), loose:bake([petal(6, 4, .3, 1)])};
const KIND = {
  b0:{geo:GEO.b0, mat:petalMat, pop:true}, b1:{geo:GEO.b1, mat:petalMat, pop:true}, b2:{geo:GEO.b2, mat:petalMat, pop:true},
  bud:{geo:GEO.bud, mat:petalMat}, leaf:{geo:GEO.leaf, mat:leafMat, depth:leafDepth}, spur:{geo:GEO.spur, mat:partMat}, lo:{geo:GEO.lo, mat:petalMat},
};

/* ============================== soft focus for what is behind and in front ============================== */
const quadGeo = new THREE.PlaneGeometry(2, 2), quadScene = new THREE.Scene(), quadCam = new THREE.Camera();
const quad = new THREE.Mesh(quadGeo, null); quad.frustumCulled = false; quadScene.add(quad);
const DISC = `vec4 disc(sampler2D t, vec2 uv, vec2 px, float r){ vec4 acc = vec4(0.);
  for (int i = 0; i < 26; i++){ float a = float(i) * 2.39996323, d = sqrt((float(i) + .5) / 26.) * r; acc += texture2D(t, uv + vec2(cos(a), sin(a)) * d * px); }
  return acc / 26.; }`;
const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const blurMat = new THREE.ShaderMaterial({uniforms:{tMap:{value:null}, uPx:{value:new THREE.Vector2()}, uR:{value:8}}, vertexShader:quadVert, depthTest:false, depthWrite:false, blending:THREE.NoBlending, toneMapped:false,
  fragmentShader:`uniform sampler2D tMap; uniform vec2 uPx; uniform float uR; varying vec2 vUv;\n${DISC}\nvoid main(){ gl_FragColor = disc(tMap, vUv, uPx, uR); }`});
const layMat = new THREE.ShaderMaterial({uniforms:{tMap:{value:null}, uPx:{value:new THREE.Vector2()}, uR:{value:3}, uFade:{value:1}}, vertexShader:quadVert, depthTest:false, depthWrite:false, transparent:true, premultipliedAlpha:true,
  fragmentShader:`uniform sampler2D tMap; uniform vec2 uPx; uniform float uR; uniform float uFade; varying vec2 vUv;\n${DISC}\nvoid main(){ vec4 c = disc(tMap, vUv, uPx, uR);
    gl_FragColor = vec4(c.a > .0001 ? c.rgb / c.a : vec3(0.), c.a * uFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a; }`});
let rt = null;
const Q = {dof:true, shadows:true, dpr:Math.min(devicePixelRatio, 2)};
function targets(w, h){
  if (rt) Object.values(rt).forEach(t => t.dispose());
  const mkrt = () => new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), {type:THREE.HalfFloatType, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:true});
  rt = {far:mkrt(), farB:mkrt(), near:mkrt(), nearB:mkrt()};
}

/* ============================== the tree, rebuilt whenever the page length changes ============================== */
const tree = new THREE.Group(); scene.add(tree);
const dummy = new THREE.Object3D(), qSway = new THREE.Quaternion(), tmpC = new THREE.Color();
const RADIAL = 16, BAND = 5;                           /* flowers are kept in bands down the page; only bands near the screen are drawn */
let T = null, builtFor = '';

function instanced(kind, list, layer, live){
  const k = KIND[kind], m = new THREE.InstancedMesh(k.geo, k.mat, Math.max(1, list.length));
  m.layers.set(layer); m.castShadow = m.receiveShadow = layer === MAIN; if (k.depth) m.customDepthMaterial = k.depth;
  dummy.position.set(0, 0, 0); dummy.quaternion.identity(); dummy.scale.setScalar(0); dummy.updateMatrix(); m.setMatrixAt(0, dummy.matrix);
  list.forEach((o, i) => {
    dummy.position.copy(o.pos); dummy.quaternion.copy(o.q); dummy.scale.setScalar(live ? 0 : o.size); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    m.setColorAt(i, o.tint || tmpC.setRGB(1, 1, 1));
  });
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  tree.add(m); return m;
}

function build(){
  const W = innerWidth, H = innerHeight, docH = document.documentElement.scrollHeight;
  builtFor = W + 'x' + H + 'x' + Math.round(docH / 40);
  seed = 20261111;
  if (T) T.owned.forEach(g => g.dispose());
  tree.children.forEach(c => { if (c.isInstancedMesh) c.dispose(); });
  tree.clear();
  const owned = [];

  const aspect = W / H, xs = clamp(aspect / 1.6, .34, 1), unit = VIEWH / H, L = docH * unit, small = W < 760, k = small ? .72 : 1;
  Q.dof = !small; Q.shadows = !small; Q.dpr = Math.min(devicePixelRatio, small ? 2 : 1.75);
  renderer.setPixelRatio(Q.dpr); renderer.setSize(W, H, false); camera.aspect = aspect; camera.updateProjectionMatrix();
  if (Q.dof) targets(Math.round(W * Q.dpr), Math.round(H * Q.dpr));
  const spanX = VIEWH * aspect * .5 + 2, sc = sun.shadow.camera;
  sc.left = -spanX - 2; sc.right = spanX + 2; sc.top = VIEWH; sc.bottom = -VIEWH; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
  sun.castShadow = Q.shadows;

  /* ---- the bough: enters top right, wanders down the page, thick at its base and fine at its end.
     It keeps to the right, clear of the left-aligned text, and only swings across behind the pinned
     portfolio, where the screen and the project card are solid. ---- */
  const top = VIEWH / 2, pts = [V(9.6 * xs + 3.6, top + 4.6, -1.6), V(7.5 * xs + 1.3, top + 1.7, -.7)];
  const pinEl = document.getElementById('pin'), pr = pinEl ? pinEl.getBoundingClientRect() : null;
  const pinA = pr ? pr.top + scrollY : -2, pinB = pr ? pinA + pr.height : -1, base = (small ? 6.9 : 5.3) * xs;
  for (let y = top - 1.2; y > top - L + 1.5; y -= 2.1){
    const px = (top - y) / unit, u = clamp((px - pinA) / (pinB - pinA), 0, 1);
    const swing = 6.6 * xs * Math.pow(Math.sin(Math.PI * u), 2) * (.5 - .5 * Math.cos(u * Math.PI * 6));
    pts.push(V(base - swing + Math.sin(y * .62) * .75 * xs, y, Math.sin(y * .33 + 1) * 1.05));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .5);
  const segs = Math.min(2600, Math.ceil(L * 6)); curve.arcLengthDivisions = segs * 2;
  const rTop = small ? .16 : .25, rEnd = small ? .06 : .085, girth = t => lerp(rTop, rEnd, Math.pow(t, .8));
  /* where the twigs will sprout is settled first, so the bough can swell a little at each of those nodes */
  const nodes = []; for (let i = 10; i < segs - 8; i += (small ? 9 : 5) + Math.floor(rnd() * 3)) nodes.push(i);
  const swell = new Float32Array(segs + 2); nodes.forEach(i => { for (let d = -7; d <= 7; d++){ const s = i + d; if (s >= 0 && s <= segs) swell[s] += .12 * Math.exp(-d * d / 7); } });
  const boughR = (t, a) => { const s = t * segs, i0 = Math.min(segs, Math.floor(s));
    return girth(t) * (1 + lerp(swell[i0], swell[i0 + 1], s - i0) + .06 * Math.sin(t * L * 1.3) + .04 * Math.sin(t * L * 3.7 + 1) + .025 * Math.sin(t * L * 9.1)
      + .05 * Math.sin(a * 2 + t * L * .7) + .03 * Math.sin(a * 3 + t * L * 2.9) + .02 * Math.sin(a * 5 + t * L * 5.3)); };
  const bt = tube(curve, segs, RADIAL, boughR, {grow:true});
  owned.push(bt.g);
  const bough = new THREE.Mesh(bt.g, barkMat); bough.customDepthMaterial = barkDepth; bough.frustumCulled = false; bough.castShadow = bough.receiveShadow = true; tree.add(bough);
  const P = bt.P;
  const tuft = new THREE.Group(); tree.add(tuft);
  for (let j = 0; j < 3; j++){ const a = j * 2.1 + rnd(), m = new THREE.Mesh(GEO.leaf, leafMat); m.customDepthMaterial = leafDepth; m.castShadow = true;
    m.quaternion.copy(basis(V(Math.cos(a) * .55, 1, Math.sin(a) * .55), V(Math.cos(a), -.2, Math.sin(a) + .6))); m.scale.setScalar((.34 + rnd() * .22) * k); tuft.add(m); }
  const tb = new THREE.Mesh(GEO.bud, petalMat); tb.scale.setScalar(.2 * k); tb.position.y = -.1 * k; tuft.add(tb);

  /* ---- twigs and what grows on them. Each thing remembers where along the bough it is born. ---- */
  const nb = Math.ceil(L / BAND) + 1, bands = [];
  for (let b = 0; b < nb; b++) bands.push({b0:[], b1:[], b2:[], bud:[], leaf:[], spur:[]});
  const put = (kind, o) => bands[clamp(Math.floor((top - o.pos.y) / BAND), 0, nb - 1)][kind].push(o);
  const rv = () => V(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(2);
  const bloomTint = () => new THREE.Color(1, .92 + rnd() * .12, .94 + rnd() * .1).multiplyScalar(.94 + rnd() * .1);
  const leafTint = () => rnd() < .5 ? new THREE.Color(1.5 + rnd() * .3, .52 + rnd() * .1, .44 + rnd() * .16) : new THREE.Color(.8 + rnd() * .16, 1 + rnd() * .12, .74 + rnd() * .26);   /* coppery young leaves, and fresh green ones */
  const cluster = (pos, axis, at, tw, terminal) => {                        /* a spur with its flowers, buds and leaves */
    put('spur', {pos, q:new THREE.Quaternion().setFromUnitVectors(Y, axis), size:(.75 + rnd() * .4) * k, at, tw, p:0, ph:0});
    const nf = 2 + Math.floor(rnd() * 3), nbud = Math.floor(rnd() * 2.4), nl = terminal ? 2 + Math.floor(rnd() * 2) : (rnd() < .3 ? 1 : 0);
    for (let j = 0; j < nf; j++){
      const d = axis.clone().multiplyScalar(.3).add(rv().multiplyScalar(.85)).add(V(0, -.12, .62 + rnd() * .5)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(Z, d).multiply(new THREE.Quaternion().setFromAxisAngle(Z, rnd() * 6.28)), r = rnd();
      put(r < .56 ? 'b0' : r < .86 ? 'b1' : 'b2', {pos, q, size:(.3 + rnd() * .13) * k, at:at + 1 + j * 1.6, tw, p:0, ph:rnd() * 6.28, tint:bloomTint()});
    }
    for (let j = 0; j < nbud; j++){
      const d = axis.clone().multiplyScalar(.5).add(rv().multiplyScalar(.8)).add(V(0, .1, .35)).normalize();
      put('bud', {pos, q:new THREE.Quaternion().setFromUnitVectors(Y, d), size:(.3 + rnd() * .16) * k, at:at + 1 + j, tw, p:0, ph:rnd() * 6.28, tint:bloomTint()});
    }
    for (let j = 0; j < nl; j++){
      const d = axis.clone().multiplyScalar(.9).add(rv().multiplyScalar(.7)).add(V(0, .15, .1)).normalize();
      put('leaf', {pos, q:basis(d, V(rnd() - .5, .2 + rnd() * .5, 1)), size:(.5 + rnd() * .5) * k, at:at + 2 + j, tw, p:0, ph:rnd() * 6.28, tint:leafTint()});
    }
  };
  const twigs = [];
  let count = 0;
  const young = new THREE.Color(), youngWood = (a, b) => t => young.setRGB(lerp(1, 1.16, lerp(a, b, t)), lerp(1, .97, lerp(a, b, t)), lerp(1, .9, lerp(a, b, t)));   /* younger wood is redder */
  /* limbs keep out of each other's way: a new twig may not run back into the bough, or through an earlier twig */
  const taken = [];
  const clearOfBough = (p, pad) => { for (let j = 0; j <= segs; j += 2){ const dy = p.y - P[j].y; if (dy > 3 || dy < -3) continue; if (p.distanceTo(P[j]) < boughR(j / segs, 0) + pad) return false; } return true; };
  const clearOfTwigs = p => { for (let j = 0; j < taken.length; j++) if (p.distanceToSquared(taken[j]) < .03) return false; return true; };
  const sample = (c, origin, from) => { const out = []; for (let t = from; t < 1.05; t += .1) out.push(c.getPoint(Math.min(1, t)).add(origin)); return out; };
  const fits = pts => pts.every(p => clearOfBough(p, .07) && clearOfTwigs(p));
  for (const i of nodes){
    const origin = P[i], tan = bt.tans[i], R = boughR(i / segs, 0), across = V(0, 0, 0).crossVectors(Z, tan).normalize();   /* straight out from the bough, across the picture */
    if (across.x > 0) across.negate();                                                                                  /* so that "in" is toward the page */
    let tc = null, th = 0, len = 0, mine = null;
    for (let tries = 0; tries < 6 && !tc; tries++){
      const side = rnd() < (small ? .9 : (count++ % 3 ? .82 : .3)) ? 1 : -1, lift = .1 + rnd() * .5;
      th = (36 + rnd() * 30) * Math.PI / 180; len = (2 + rnd() * 1.9) * (small ? .55 : 1) * (.62 + .38 * R / rTop) * (1 - tries * .08);
      const dir = tan.clone().multiplyScalar(Math.cos(th)).addScaledVector(across, side * Math.sin(th)).add(V(0, .05, (rnd() - .35) * .38)).normalize(), jit = () => rv().multiplyScalar(.09 * len);
      const c = new THREE.CatmullRomCurve3([V(0, 0, 0), dir.clone().multiplyScalar(len * .33).add(jit()), dir.clone().multiplyScalar(len * .67).add(jit()).add(V(0, .1 * len * lift, 0)), dir.clone().multiplyScalar(len).add(V(0, .26 * len * lift, 0))]);
      const pts = sample(c, origin, clamp((R / Math.max(.4, Math.sin(th)) + .25) / len, .3, .8));
      if (fits(pts)){ tc = c; mine = pts; }
    }
    if (!tc) continue;                                                         /* no room here: leave the node bare */
    const tw = {mesh:null, at:i + 8, i, p:0, s:0}, spots = [], knuckles = [];
    const ns = 2 + Math.floor(len * (.8 + rnd() * .5));
    for (let s = 0; s < ns; s++){ const t = Math.min(1, .3 + (s + .3 + rnd() * .5) / ns * .72); knuckles.push(t); spots.push([tc.getPoint(t), tc.getTangent(t), false]); }
    spots.push([tc.getPoint(1), tc.getTangent(1), true]);
    /* a twig is nearly even along its length and fine at the tip. Where it leaves the bough it flares into a collar,
       and it thickens to a knuckle wherever a cluster grows. */
    const rb = Math.min(.085, R * .44) * (.8 + rnd() * .35), exit = R / Math.max(.4, Math.sin(th)), lam = R * .5 + .03;
    const rf = t => { let r = rb * lerp(1, .42, Math.pow(t, .85)) * (1 - .78 * smooth(.84, 1, t)) * (1 + .75 * Math.exp(-Math.max(0, t * len - exit) / lam));
      for (const ts of knuckles) r += rb * .2 * Math.exp(-Math.pow((t - ts) / .022, 2));
      return r; };
    const parts = [tube(tc, 26, 8, rf, {parent:{o:V(0, 0, 0), t:tan, R}, u0:rnd() * 7, tint:youngWood(0, .7)}).g];
    const shoots = len > 2.2 ? 1 + Math.floor(rnd() * 2) : (rnd() < .5 ? 1 : 0);
    for (let s = 0; s < shoots; s++){                                         /* side shoots off the twig, joined the same way */
      const ts = .28 + rnd() * .45, b0 = tc.getPoint(ts), t0 = tc.getTangent(ts).normalize(), pr2 = rf(ts), r2 = pr2 * .6;
      let c2 = null, sl = 0;
      for (let tries = 0; tries < 4 && !c2; tries++){
        const sd = t0.clone().add(rv().multiplyScalar(.75)).add(V(0, .25, .15)).normalize(); sl = len * (.22 + rnd() * .22);
        const c = new THREE.CatmullRomCurve3([b0, b0.clone().addScaledVector(sd, sl * .5).add(rv().multiplyScalar(.05 * sl)), b0.clone().addScaledVector(sd, sl).add(V(0, .12 * sl, 0))]), pts = sample(c, origin, .5);
        if (fits(pts)){ c2 = c; mine.push(...pts); }
      }
      if (!c2) continue;
      const sl2 = sl;
      parts.push(tube(c2, 12, 6, t => r2 * lerp(1, .45, t) * (1 - .75 * smooth(.8, 1, t)) * (1 + .6 * Math.exp(-Math.max(0, t * sl2 - pr2 * 1.4) / (pr2 * .6 + .015))), {parent:{o:b0, t:t0, R:pr2}, u0:rnd() * 7, tint:youngWood(.5, 1)}).g);
      if (rnd() < .6) spots.push([c2.getPoint(.55), c2.getTangent(.55), false]);
      spots.push([c2.getPoint(1), c2.getTangent(1), true]);
    }
    taken.push(...mine);
    const geo = bake(parts); owned.push(geo); parts.forEach(g => g.dispose());
    tw.mesh = new THREE.Mesh(geo, twigMat); tw.mesh.position.copy(origin); tw.mesh.scale.setScalar(0); tw.mesh.castShadow = tw.mesh.receiveShadow = true; tree.add(tw.mesh);
    twigs.push(tw);
    spots.forEach(([p, t, term], n) => cluster(p.add(origin), t.normalize(), i + 16 + n * 1.4, tw, term));
  }
  const live = [];
  bands.forEach((band, b) => { const set = {};
    for (const kind in band){ if (!band[kind].length) continue;
      const m = instanced(kind, band[kind], MAIN, true);
      m.frustumCulled = false; m.visible = false;
      set[kind] = {list:band[kind], mesh:m, pop:!!KIND[kind].pop};
    }
    live.push({set, mid:top - (b + .5) * BAND}); });

  /* ---- other branches of the same tree: far behind and close in front, both out of focus ---- */
  const still = {[FAR]:{lo:[], leaf:[]}, [NEAR]:{lo:[], leaf:[]}};
  const spray = (layer, origin, dir, len, r, n, size) => {
    const c = new THREE.CatmullRomCurve3([origin, origin.clone().addScaledVector(dir, len * .5).add(rv().multiplyScalar(len * .07)), origin.clone().addScaledVector(dir, len).add(V(0, len * .1, 0))]);
    const g = tube(c, 14, 6, t => r * (.25 + .75 * (1 - t)), {u0:rnd() * 7}).g; owned.push(g);
    const m = new THREE.Mesh(g, twigMat); m.layers.set(layer); tree.add(m);
    for (let j = 0; j < n; j++){
      const pos = c.getPoint(.15 + rnd() * .85).add(rv().multiplyScalar(size * 1.1)), d = rv().add(V(0, 0, 1.4)).normalize();
      still[layer].lo.push({pos, q:new THREE.Quaternion().setFromUnitVectors(Z, d).multiply(new THREE.Quaternion().setFromAxisAngle(Z, rnd() * 6.28)), size:size * (.8 + rnd() * .5), tint:bloomTint()});
      if (rnd() < .22) still[layer].leaf.push({pos:pos.clone(), q:basis(rv().add(dir), V(0, .3, 1)), size:size * (1.4 + rnd()), tint:leafTint()});
    }
  };
  if (Q.dof){
    const travel = L - VIEWH;
    for (let y = 5; y > -travel - 5; y -= 5.5 + rnd() * 4.5){
      const z = -7 - rnd() * 8, hw = (CAMZ - z) * TAN * aspect;
      spray(FAR, V(hw * (.6 + rnd() * .5), y, z), V(-1, -.55 + rnd() * .9, (rnd() - .5) * .3).normalize(), 4 + rnd() * 3.5, .07 + rnd() * .05, 9 + Math.floor(rnd() * 8), .55 + rnd() * .2);
    }
    for (let y = -VIEWH * .9; y > -travel; y -= VIEWH * (1.3 + rnd() * 1.1)){
      const z = 5.5 + rnd() * 2.5, hw = (CAMZ - z) * TAN * aspect;
      spray(NEAR, V(hw * 1.12, y, z), V(-1, rnd() - .5, 0).normalize(), 1.3 + rnd() * .9, .04, 4 + Math.floor(rnd() * 3), .3 + rnd() * .08);
    }
    for (const layer of [FAR, NEAR]) for (const kind in still[layer]) if (still[layer][kind].length) instanced(kind, still[layer][kind], layer, false).frustumCulled = false;
  }

  /* ---- a few loose petals, well apart, drifting down ---- */
  const N = small ? 6 : 12, loose = [];
  const looseMesh = new THREE.InstancedMesh(GEO.loose, petalMat, N); looseMesh.frustumCulled = false; tree.add(looseMesh);
  for (let i = 0; i < N; i++) loose.push({x:(rnd() * 2 - 1) * spanX, y:(rnd() * 2 - 1) * VIEWH * .9, z:-4 + rnd() * 8, v:.28 + rnd() * .4, ph:rnd() * 6.28, s:.2 + rnd() * .16, rx:rnd() * 6, ry:rnd() * 6, w:.25 + rnd() * .6});

  /* where the Click Me marker sits: on the bough, just below where it comes into the page */
  let pinAt = P[0]; for (let i = 0; i <= segs; i++) if (P[i].y < top - (small ? 1.6 : 1.6)){ pinAt = P[i]; break; }
  T = {pinAt, unit, L, top, segs, P, bough:bt.g, tuft, tans:bt.tans, twigs, live, loose, looseMesh, spanX, owned, grow:0, intro:0, settled:false};
}

/* ============================== the hanging scroll: the portfolio as an object in the tree ==============================
   A paper scroll hangs by a cord from a blossoming twig, where the page's own picture frame would be. One project
   is painted on it at a time. Scrolling rolls it up onto its wooden roller, the picture changes, and it unrolls
   again with a small burst of petals; it sways a little as it settles. It also unrolls as it first comes into view.
   The pictures are shown unlit, so each client's colours stay true; shade from the twig is laid over them. */
function makeFolio(){
  const host = document.getElementById('browser'), pinEl = document.getElementById('pin'), work = window.__work;
  if (!host || !pinEl || !work || !work.length) return null;
  const SW = 1.6, SH = 1, SIDE = .05, TOPB = .1, BOTB = .12, PW = SW + SIDE * 2, HS = TOPB + SH + BOTB, HANG = .24, LMIN = .13, R0 = .028, ROWS = 72,
    ZF = 3, fz = (CAMZ - ZF) / CAMZ, lite = innerWidth < 760;
  const group = new THREE.Group(), spray = new THREE.Group(), fx = new THREE.Group(); group.visible = spray.visible = fx.visible = false; scene.add(group, spray, fx);

  /* a soft shadow on the page behind it */
  const dc = mk(256, 192), dx = dc.getContext('2d'); dx.shadowColor = 'rgba(40,18,26,1)'; dx.shadowBlur = 22; dx.shadowOffsetX = 400; dx.fillStyle = '#000'; dx.fillRect(40 - 400, 32, 176, 128);
  const drop = new THREE.Mesh(new THREE.PlaneGeometry(PW * 256 / 176, 192 / 128), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(dc), transparent:true, opacity:.42, depthWrite:false, toneMapped:false}));
  drop.renderOrder = -1; group.add(drop);

  /* one painting per project: washi paper, a band of pink cloth above and below, the site between them,
     and its address and a seal along the bottom */
  const CW = 1700, CH = Math.round(HS * 1000), px = SIDE * 1000, py = TOPB * 1000, IMG = window.__workImg || '';
  const paper = mk(CW, CH), pc = paper.getContext('2d');
  pc.fillStyle = '#f5eee3'; pc.fillRect(0, 0, CW, CH);
  for (let k = 0; k < 2600; k++){ pc.fillStyle = 'rgba(' + (rnd() < .5 ? '120,92,70' : '255,255,255') + ',' + (.04 + rnd() * .09) + ')'; pc.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 9, 1); }
  const band = (y, h) => { pc.fillStyle = '#eec3d0'; pc.fillRect(0, y, CW, h);
    pc.fillStyle = 'rgba(255,255,255,.5)'; pc.font = '22px serif'; pc.textAlign = 'center'; pc.textBaseline = 'middle';
    for (let r = 0, ny = Math.max(1, Math.round(h / 34)); r < ny; r++) for (let x = (r % 2) * 24 + 16; x < CW; x += 48) pc.fillText('✿', x, y + (r + .5) * h / ny);
    pc.fillStyle = '#b98a5c'; pc.fillRect(0, y, CW, 3); pc.fillRect(0, y + h - 3, CW, 3); };
  band(22, py - 34); band(py + 1000 + 12, 58);
  const print = w => { const c = mk(CW, CH), x = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const paint = im => { x.drawImage(paper, 0, 0);
      x.fillStyle = '#e9dfd2'; x.fillRect(px, py, 1600, 1000);
      if (im){ const s = 1600 / im.naturalWidth, sh = Math.min(im.naturalHeight, 1000 / s), dh = sh * s; x.drawImage(im, 0, 0, im.naturalWidth, sh, px, py, 1600, dh);
        if (dh < 999) x.drawImage(im, 0, im.naturalHeight - 2, im.naturalWidth, 1, px, py + dh - 1, 1600, 1001 - dh); }   /* a wide, short picture: its last line runs on down to the band */
      x.strokeStyle = 'rgba(70,40,30,.35)'; x.lineWidth = 2; x.strokeRect(px - 1, py - 1, 1602, 1002);
      const by = py + 1000 + 41;
      x.fillStyle = '#fbf3ea'; x.font = '600 27px ui-monospace, Consolas, monospace'; x.textBaseline = 'middle'; x.textAlign = 'center';
      const tw = x.measureText(w.u).width + 44; x.fillRect(CW / 2 - tw / 2, by - 21, tw, 42); x.fillStyle = '#4a2c26'; x.fillText(w.u, CW / 2, by + 1);
      x.fillStyle = '#c2413f'; x.fillRect(CW - px - 54, by - 22, 44, 44); x.fillStyle = '#fff4ee'; x.font = '32px serif'; x.fillText('✿', CW - px - 32, by + 2);
      tex.needsUpdate = true; };
    paint(null); const im = new Image(); im.onload = () => paint(im); im.src = IMG + w.img; return tex; };
  const prints = work.map(print);
  const bc = mk(256, 256), bx = bc.getContext('2d'); bx.fillStyle = '#efe4d4'; bx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 500; k++){ bx.fillStyle = 'rgba(130,100,76,' + (.05 + rnd() * .1) + ')'; bx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 14, 1); }
  const backTex = new THREE.CanvasTexture(bc); backTex.colorSpace = THREE.SRGBColorSpace;
  const backMat = new THREE.MeshStandardMaterial({map:backTex, side:THREE.BackSide, roughness:.95, metalness:0, envMapIntensity:.45});

  /* the sheet: rows from the top rod down. What has not been unrolled is wound round the roller. */
  const geo = new THREE.BufferGeometry(), nv = (ROWS + 1) * 2, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), idx = [];
  for (let r = 0; r <= ROWS; r++){ const s = r / ROWS; pos[r * 6] = -PW / 2; pos[r * 6 + 3] = PW / 2; uvs[r * 4] = 0; uvs[r * 4 + 2] = 1; uvs[r * 4 + 1] = uvs[r * 4 + 3] = 1 - s;
    if (r < ROWS){ const a = r * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setIndex(idx);
  const img = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({toneMapped:false})); img.castShadow = true;
  const back = new THREE.Mesh(geo, backMat); back.receiveShadow = true;
  const shade = new THREE.Mesh(geo, new THREE.ShadowMaterial({opacity:.3, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1})); shade.receiveShadow = true; shade.renderOrder = 1;
  [img, back, shade].forEach(m => { m.frustumCulled = false; group.add(m); });

  /* wood: the rod it hangs from and the roller that weights it, with a knob at each end */
  const wood = new THREE.MeshStandardMaterial({color:0x4b2b25, roughness:.5, metalness:0, envMapIntensity:.6}), knobMat = new THREE.MeshStandardMaterial({color:0x2a1716, roughness:.35, metalness:0, envMapIntensity:.8});
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, PW + .03, 10), wood); rod.rotation.z = Math.PI / 2; rod.position.set(0, -HANG, .006); rod.castShadow = true; group.add(rod);
  const roller = new THREE.Group(); group.add(roller);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, PW - .004, 14), wood); core.rotation.z = Math.PI / 2; core.castShadow = true; roller.add(core);
  [-1, 1].forEach(sd => { const k = new THREE.Mesh(new THREE.CylinderGeometry(.021, .024, .075, 14), knobMat); k.rotation.z = Math.PI / 2; k.position.x = sd * (PW / 2 + .035); k.castShadow = true; roller.add(k); });

  /* the cord: up from the rod to a loop over the twig */
  const cordMat = new THREE.MeshStandardMaterial({color:0xb24a68, roughness:.8, metalness:0, envMapIntensity:.4});
  [-1, 1].forEach(sd => { const a = V(sd * .5, -HANG + .012, .006), b = V(0, -.02, .004), c = new THREE.Mesh(new THREE.CylinderGeometry(.0045, .0045, a.distanceTo(b), 6), cordMat);
    c.position.copy(a).add(b).multiplyScalar(.5); c.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize()); c.castShadow = true; group.add(c); });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(.026, .0055, 8, 20), cordMat); loop.rotation.y = Math.PI / 2; loop.castShadow = true; group.add(loop);

  let lastLen = -1;
  const unroll = len => {                         /* len: how much of the sheet hangs free */
    if (len === lastLen) return; lastLen = len;
    const R = R0 + .024 * (1 - len / HS), ds = HS / ROWS;
    for (let r = 0; r <= ROWS; r++){
      const d = r * ds, o = r * 6; let y, z, ny = 0, nz = 1;
      if (d <= len){ y = -d; z = 0; }
      else { const turn = (d - len) / R, rr = R - .0035 * turn / 6.283, th = turn; y = -len - rr * Math.sin(th); z = R - rr * Math.cos(th); ny = Math.sin(th); nz = Math.cos(th); }
      pos[o + 1] = pos[o + 4] = y - HANG; pos[o + 2] = pos[o + 5] = z; nor[o + 1] = nor[o + 4] = ny; nor[o + 2] = nor[o + 5] = nz;
    }
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = true;
    roller.position.set(0, -HANG - len, R); core.scale.set(R - .006, 1, R - .006); roller.rotation.x = -len / R0;
    drop.scale.y = (len + .1) / HS; drop.position.set(.05, -HANG - len / 2 - .07, -.14);
  };

  /* the twig it hangs from, with blossom either side of the cord */
  const rvec = () => V(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(2), pink = () => new THREE.Color(1, .92 + rnd() * .12, .94 + rnd() * .1).multiplyScalar(.94 + rnd() * .1);
  const tc = new THREE.CatmullRomCurve3([V(-2.7, .4, .2), V(-1.6, .17, .1), V(-.6, .035, .02), V(0, 0, 0), V(.56, -.015, .07), V(1.02, .06, .16)]);
  const tm = new THREE.Mesh(tube(tc, 40, 7, t => .034 * lerp(1, .26, Math.pow(t, .8)) * (1 - .7 * smooth(.9, 1, t)), {u0:3.3, usc:USC * 3.4}).g, twigMat); tm.castShadow = tm.receiveShadow = true; spray.add(tm);
  const lists = {b0:[], b1:[], bud:[], leaf:[], spur:[]}, sz = .1;
  [[.33, false], [.86, false], [1, true]].forEach(([t, term]) => {
    const p = tc.getPoint(t), axis = tc.getTangent(t).normalize();
    lists.spur.push({pos:p, q:new THREE.Quaternion().setFromUnitVectors(Y, axis), size:sz * 2.4});
    for (let j = 0, nf = term ? 4 : 2 + Math.floor(rnd() * 2); j < nf; j++){
      const d = axis.clone().multiplyScalar(.3).add(rvec().multiplyScalar(.8)).add(V(0, -.05, .7 + rnd() * .5)).normalize();
      lists[rnd() < .6 ? 'b0' : 'b1'].push({pos:p, q:new THREE.Quaternion().setFromUnitVectors(Z, d).multiply(new THREE.Quaternion().setFromAxisAngle(Z, rnd() * 6.28)), size:sz * (.95 + rnd() * .35), tint:pink()});
    }
    lists.bud.push({pos:p, q:new THREE.Quaternion().setFromUnitVectors(Y, axis.clone().multiplyScalar(.5).add(rvec().multiplyScalar(.8)).add(V(0, .3, .35)).normalize()), size:sz * (.9 + rnd() * .4), tint:pink()});
    if (term) for (let j = 0; j < 2; j++) lists.leaf.push({pos:p, q:basis(axis.clone().multiplyScalar(.9).add(rvec().multiplyScalar(.6)).add(V(0, .35, .1)).normalize(), V(rnd() - .5, .3, 1)), size:sz * (1.8 + rnd()), tint:new THREE.Color(.85, 1.05, .85)});
  });
  for (const kind in lists) if (lists[kind].length){ const m = instanced(kind, lists[kind], MAIN, false); m.frustumCulled = false; spray.add(m); }

  /* the burst: petals thrown out from the roller as the scroll comes down, then left to fall */
  const NB = lite ? 14 : 30, parts = [], burstMesh = new THREE.InstancedMesh(GEO.loose, petalMat, NB); burstMesh.frustumCulled = false; fx.add(burstMesh);
  for (let i = 0; i < NB; i++){ parts.push({p:V(0, 0, 0), v:V(0, 0, 0), age:9, life:1, s:0, rx:0, ry:0, w:0, ph:0}); dummy.scale.setScalar(0); dummy.updateMatrix(); burstMesh.setMatrixAt(i, dummy.matrix); }
  let alive = false;
  const burst = len => { alive = true;
    parts.forEach(q => { const side = Math.random() * 2 - 1;
      q.p.set(side * PW * .5, -HANG - len + (Math.random() - .5) * .05, .08 + Math.random() * .06);
      q.v.set(side * .5 + (Math.random() - .5) * .7, .25 + Math.random() * .75, .15 + Math.random() * .5);
      q.age = -Math.random() * .22; q.life = 1.7 + Math.random() * 1.5; q.s = .055 + Math.random() * .045; q.rx = Math.random() * 6; q.ry = Math.random() * 6; q.w = 1.5 + Math.random() * 3; q.ph = Math.random() * 6.28; }); };
  const fall = dt => { if (!alive) return; alive = false;
    parts.forEach((q, i) => { q.age += dt; let s = 0;
      if (q.age > 0 && q.age < q.life){ alive = true;
        q.v.y -= .85 * dt; q.v.multiplyScalar(Math.exp(-dt * 1.5)); q.v.x += Math.sin(q.age * 3 + q.ph) * .5 * dt; q.p.addScaledVector(q.v, dt);
        s = q.s * Math.min(1, q.age / .12) * (1 - smooth(.6, 1, q.age / q.life));
        dummy.position.copy(q.p); dummy.rotation.set(q.rx + q.age * q.w, q.ry + q.age * q.w * .7, q.ph); }
      else if (q.age <= 0) alive = true;
      dummy.scale.setScalar(s); dummy.updateMatrix(); burstMesh.setMatrixAt(i, dummy.matrix); });
    burstMesh.instanceMatrix.needsUpdate = true; };

  let shown = -1, kick = 0, kt = 0, wasOpen = 0;
  const ease = t => t * t * (3 - 2 * t);
  return {
    update(calm, dt = 0){
      if (!T || calm){ group.visible = spray.visible = fx.visible = false; return; }
      const r = host.getBoundingClientRect();
      if (r.bottom < -600 || r.top > innerHeight + 600 || r.width < 10){ group.visible = spray.visible = fx.visible = false; shown = -1; wasOpen = 0; return; }
      group.visible = spray.visible = fx.visible = true;
      /* how far through the pinned stretch we are, and how far the scroll has come down on the way in */
      const rc = pinEl.getBoundingClientRect(), span = rc.height - innerHeight, p = span > 0 ? clamp((60 - rc.top) / span, 0, 1) : 0;
      const open = clamp((innerHeight - rc.top) / (innerHeight * .9), 0, 1), e = ease(clamp((open - .25) / .75, 0, 1));
      /* hang it where the page has left room for it */
      const u = T.unit, S = Math.min(r.width / (PW + .16), r.height / (HS + .04)) * u * fz, wx = (r.left + r.width / 2 - innerWidth / 2) * u * fz,
        wy = -scrollY * u + (innerHeight / 2 - (r.top + r.height / 2)) * u * fz + (HANG + (HS + .03) / 2) * S;
      /* which project is up, and how far the scroll is down: each one rests, then the scroll rolls up, changes and comes down again */
      const n = work.length, seg = clamp(p, 0, .9999) * n, i = Math.floor(seg), t = i < n - 1 ? clamp((seg - i - .55) / .45, 0, 1) : 0;
      const idx = t < .5 ? i : i + 1, f = t < .5 ? 1 - ease(t * 2) : ease(t * 2 - 1), len = LMIN + (HS - LMIN) * Math.min(e, f);
      if (idx !== shown){ if (shown >= 0){ burst(len); kick = .03; kt = 0; } shown = idx; img.material.map = prints[idx]; img.material.needsUpdate = true; }
      if (wasOpen < .3 && open >= .3){ burst(len); kick = .024; kt = 0; }
      wasOpen = open;
      unroll(len);
      kt += dt; kick *= Math.exp(-dt * 1.3);
      const sway = Math.sin(time * .9) * .008 + kick * Math.sin(kt * 4.2);
      group.position.set(wx, wy, ZF); group.scale.setScalar(S); group.rotation.set(Math.sin(time * .7 + 1) * .012 + kick * .8 * Math.sin(kt * 3.1 + 1) + cy * .05, cx * .1, sway);
      spray.position.set(wx, wy, ZF); spray.scale.setScalar(S); spray.rotation.z = Math.sin(time * .7) * .01;
      fx.position.set(wx, wy, ZF); fx.scale.setScalar(S);
      fall(dt);
    }
  };
}
const folio = makeFolio();

/* ============================== every frame ============================== */
const easeOutBack = t => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
let mx = 0, my = 0, cx = 0, cy = 0, time = 0;
const linkPin = document.getElementById('branchPin'), pv = V(0, 0, 0); let pinX = -1e4, pinY = -1e4;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, {passive:true});

function settle(o, s, mesh, i, calm){
  dummy.position.copy(o.pos); dummy.quaternion.copy(o.q);
  if (!calm){ qSway.setFromAxisAngle(X, Math.sin(time * 1.1 + o.ph) * .045); dummy.quaternion.multiply(qSway); }
  dummy.scale.setScalar(o.size * s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
}
function step(dt){
  if (!T) return;
  const calm = isCalm(); time += dt;
  const camY = -scrollY * T.unit;
  cx += (mx - cx) * Math.min(1, dt * 3); cy += (my - cy) * Math.min(1, dt * 3);
  camera.position.set(calm ? 0 : cx * .9, camY - (calm ? 0 : cy * .5), CAMZ);
  camera.rotation.set(calm ? 0 : cy * .02, calm ? 0 : -cx * .03, 0);
  const D = window.__look; if (D){ camera.position.x += D.x || 0; camera.position.y += D.y || 0; camera.position.z = D.z || CAMZ; }
  camera.updateMatrixWorld();
  if (linkPin){                                             /* keep the marker on the branch as the view moves */
    pv.copy(T.pinAt).project(camera); const half = linkPin.offsetWidth / 2 + 8;
    const lx = clamp((pv.x * .5 + .5) * innerWidth, half, innerWidth - half), ly = (-pv.y * .5 + .5) * innerHeight;
    if (Math.abs(lx - pinX) > .25 || Math.abs(ly - pinY) > .25){ pinX = lx; pinY = ly; linkPin.style.left = lx.toFixed(1) + 'px'; linkPin.style.top = ly.toFixed(1) + 'px'; }
  }
  sun.position.set(-7, camY + 10, 12); sun.target.position.set(0, camY, 0); sun.target.updateMatrixWorld();
  sunU.uSunV.value.set(-7, 10, 12).normalize().transformDirection(camera.matrixWorldInverse);

  /* how far the bough has grown: its tip sits about three quarters down the screen */
  T.intro = calm ? 1 : Math.min(1, T.intro + dt / 2.8);
  const reach = .8 * (1 - Math.pow(1 - T.intro, 3)), tipY = camY + VIEWH / 2 - VIEWH * reach;
  let lo = 0, hi = T.segs; while (lo < hi){ const m = lo + hi >> 1; T.P[m].y > tipY ? lo = m + 1 : hi = m; }
  T.grow += ((calm ? T.segs + 40 : lo) - T.grow) * (calm ? 1 : Math.min(1, dt * 6));
  const g = T.grow; grow.uGrow.value = g;
  T.bough.setDrawRange(0, clamp(Math.ceil(g), 0, T.segs) * RADIAL * 6);
  const gi = clamp(Math.floor(g), 0, T.segs - 1);
  T.tuft.position.lerpVectors(T.P[gi], T.P[gi + 1], clamp(g - gi, 0, 1)); T.tuft.quaternion.setFromUnitVectors(Y, T.tans[gi]);
  T.tuft.scale.setScalar(1 - Math.pow(1 - T.intro, 3));

  for (const t of T.twigs){
    const want = g > t.at ? 1 : 0;
    if (t.p !== want) t.p = calm ? want : clamp(t.p + (want ? dt * 1.5 : -dt * 4), 0, 1);
    let thick = clamp((g - t.i) / grow.uTipLen.value, 0, 1); thick = lerp(thick, Math.sqrt(thick), .5);   /* how far the bough has filled out where this twig sits */
    const sc = (1 - Math.pow(1 - t.p, 3)) * Math.min(1, thick * 1.2);
    if (sc !== t.s){ t.s = sc; t.mesh.scale.setScalar(sc); }
  }
  const all = calm && !T.settled, window_ = VIEWH / 2 + BAND / 2 + 2.5;
  T.live.forEach(({set, mid}) => {
    const shown = Math.abs(mid - camY) < window_;
    for (const kind in set) set[kind].mesh.visible = shown;
    if (!all && !shown) return;
    for (const kind in set){ const {list, mesh, pop} = set[kind]; let dirty = false;
      for (let i = 0; i < list.length; i++){
        const o = list[i], want = (calm || (o.tw.s > .92 && g > o.at)) ? 1 : 0, moving = o.p !== want;
        if (moving) o.p = calm ? want : clamp(o.p + (want ? dt * (pop ? 1.5 : 2.2) : -dt * 5), 0, 1);
        if (!moving && (calm || o.p === 0)) continue;
        settle(o, Math.max(0, pop ? easeOutBack(o.p) : 1 - Math.pow(1 - o.p, 3)), mesh, i, calm); dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
  });
  T.settled = calm;

  T.looseMesh.visible = !calm;
  if (!calm){
    const hh = VIEWH * .9;
    T.loose.forEach((p, i) => {
      p.y -= p.v * dt; p.x += (Math.sin(time * .5 + p.ph) * .35 + cx * .8) * dt;
      const ry = camY + (((p.y - camY + hh) % (2 * hh) + 2 * hh) % (2 * hh) - hh);
      if (p.x > T.spanX) p.x -= 2 * T.spanX; else if (p.x < -T.spanX) p.x += 2 * T.spanX;
      dummy.position.set(p.x, ry, p.z); dummy.rotation.set(p.rx + time * p.w, p.ry + time * p.w * .7, p.ph); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      T.looseMesh.setMatrixAt(i, dummy.matrix);
    });
    T.looseMesh.instanceMatrix.needsUpdate = true;
  }
  if (folio) folio.update(calm, dt);
  draw();
}
function pass(mat, src, dst, r, fade){
  mat.uniforms.tMap.value = src.texture; mat.uniforms.uPx.value.set(1 / src.width, 1 / src.height); mat.uniforms.uR.value = r;
  if (fade !== undefined) mat.uniforms.uFade.value = fade;
  quad.material = mat; renderer.setRenderTarget(dst); if (dst) renderer.clear(); renderer.render(quadScene, quadCam);
}
function draw(){
  if (Q.dof && rt){
    const s = rt.far.height / 450;                       /* blur radius follows the picture size */
    camera.layers.set(FAR); renderer.setRenderTarget(rt.far); renderer.clear(); renderer.render(scene, camera); pass(blurMat, rt.far, rt.farB, 11 * s);
    camera.layers.set(NEAR); renderer.setRenderTarget(rt.near); renderer.clear(); renderer.render(scene, camera); pass(blurMat, rt.near, rt.nearB, 20 * s);
    renderer.setRenderTarget(null); renderer.clear();
    pass(layMat, rt.farB, null, 4 * s, .8);
    camera.layers.set(MAIN); renderer.render(scene, camera);
    pass(layMat, rt.nearB, null, 7 * s, 1);
  } else {
    renderer.setRenderTarget(null); renderer.clear(); camera.layers.set(MAIN); renderer.render(scene, camera);
  }
}

/* if the machine can't keep up, give things up one at a time: soft focus first, then shadows, then sharpness */
let slow = 0, fast = 0;
function pace(dt){
  if (!T || T.intro < 1) return;
  dt > .034 ? slow++ : fast++;
  if (slow + fast < 120) return;
  if (slow > 70){
    if (Q.dof){ Q.dof = false; }
    else if (sun.castShadow){ sun.castShadow = false; }
    else if (Q.dpr > 1){ Q.dpr = 1; renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false); }
  }
  slow = fast = 0;
}
let prev = performance.now();
function loop(now){
  const raw = (now - prev) / 1000, dt = Math.min(.05, raw); prev = now;
  if (!document.hidden){ step(dt); pace(raw); }
  requestAnimationFrame(loop);
}
function maybeRebuild(){
  const key = innerWidth + 'x' + innerHeight + 'x' + Math.round(document.documentElement.scrollHeight / 40);
  if (key !== builtFor){ const keep = T ? T.intro : 0; build(); T.intro = keep; }
}
build(); requestAnimationFrame(loop);
root.classList.add('has3d');                              /* tells the page its 3D stand-ins are live */
let timer; const later = () => { clearTimeout(timer); timer = setTimeout(maybeRebuild, 250); };
addEventListener('resize', later); addEventListener('load', later);
new ResizeObserver(later).observe(document.body);
new MutationObserver(later).observe(root, {attributes:true, attributeFilter:['class']});
window.__branch = {step, build, camera, renderer, Q, get state(){ return T; }};
