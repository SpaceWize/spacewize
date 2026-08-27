/* ============================================================
   SPACE WIZE ENTERPRISE — shared sprites
   The moon and the blossom, drawn once here and used by both the tree
   and the 404. Neither page invents its own: they are the same two
   canvases, so the pages cannot drift apart visually.
   ============================================================ */
import * as THREE from 'three';

export function moonTexture() {
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

export function blossomSprite(blurPx) {
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
