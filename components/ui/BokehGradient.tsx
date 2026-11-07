'use client';

/**
 * Aivory "defocused photograph" gradient.
 *
 * Instead of round blobs, a WebGL shader warps fractal noise into the shapes a
 * blurred photo has: horizons, clouds, light leaks, curtain-like bands and
 * aurora streaks, with real shadow pockets and soft highlights. Each scene
 * maps that field through six colours ordered from shadow to highlight.
 *
 * On top: an optional figure as white hairlines (edge figures after Fibonacci,
 * guilloche, fractal geometry and Chladni plates, drawn huge and cropped by the card
 * edge; or the older Fibonacci circles and leaf lines), and film grain drawn at
 * device-pixel resolution.
 *
 * The colour field renders at a fraction of the element size (it is blurred
 * anyway) and only animates while on screen; prefers-reduced-motion freezes it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

export type BokehMode = 'field' | 'horizon' | 'bands' | 'aurora' | 'tri';

export interface BokehScene {
  /** Six colours: [0] is the shadow tone, [5] the highlight; the mode walks through them in order. */
  colors: [string, string, string, string, string, string];
  mode: BokehMode;
  /** Size of the shapes; higher = smaller, busier shapes. */
  scale?: number;
  seed?: number;
  /** How strongly highlight light leaks and shadow pockets show (0–1). */
  light?: number;
  shadow?: number;
  /** Overall brightness multiplier, to keep white type readable. */
  exposure?: number;
}

/**
 * Aivory's ornament, as white hairlines on the card.
 * - `fibonacci` (the brand ornament): circles with radii 2·3·5·8·13·21… units, all touching one point
 *   on the card's edge, like a nautilus cross-section. Tight at the point, opening out across the card.
 * - `leaf`: one level line of a 1·3 plate, cos(πx)cos(3πy) − cos(3πx)cos(πy); its loops pinch into leaf points at the saddles.
 * - `bent`: a 1·2 plate bent by a slow current, so the loops read organic and asymmetric.
 * Alternates, Chladni lines crossed with leaf outlines.
 * Edge figures (the current brand ornament), drawn far larger than the card so its edge crops them:
 * - `nautilus`: golden spiral of circles, each 1/φ of the last and touching it from inside, faint crosshairs.
 * - `vortex`: guilloche tunnel, shrinking circles sliding along a turning arc into one crescent.
 * - `fractal`: every circle holds three touching circles, a sixth turned per generation; keep `depth` low (3) so only large circles show.
 * - `cymatic`: a round Chladni plate, a few widely spaced level lines clipped to the plate.
 */
export interface LeafFigure {
  kind: 'fibonacci' | 'leaf' | 'bent' | 'nautilus' | 'vortex' | 'fractal' | 'cymatic';
  /** Centre of the figure (fibonacci: the point every circle touches) as a fraction of the card's width and height; it usually sits on or past the right edge. */
  origin: [number, number];
  /** Plate cells per card height (leaf, bent). */
  scale?: number;
  /** Contour level (leaf, bent). */
  level?: number;
  /** Fibonacci: the first radius in card heights (default 0.035) and how many circles (default 6). */
  unit?: number;
  count?: number;
  /** Rotation in radians (fibonacci: the direction the circles open toward; default π, leftward). */
  rot?: number;
  seed?: number;
  /** Edge figures: radius in card heights (~1 big close-up, 2.4+ extreme close-up). */
  size?: number;
  /** Edge figures: the point (in units of `size`) that lands on `origin`; 'eye' = the nautilus' centre. */
  focus?: [number, number] | 'eye';
  /** Nautilus: direction of the first step inward (radians). */
  turn?: number;
  /** Fractal: generations (default 3). */
  depth?: number;
  /** Cymatic: angular mode, radial waves, level lines per bundle. */
  n?: number;
  waves?: number;
  levels?: number;
  opacity?: number;
  /** CSS mask over the figure; by default it lives on the right edge and fades out before the copy. */
  fade?: string;
}

const MODE_INDEX: Record<BokehMode, number> = { field: 0, horizon: 1, bands: 2, aurora: 3, tri: 4 };
const FIELD_SCALE = 0.25; // colour field resolution relative to CSS pixels
const DEFOCUS_PX = 22; // optical blur over the field, so shapes read as an out-of-focus photo
const FRAME_MS = 1000 / 30;
const GRAIN_AMPLITUDE = 78;
const GRAIN_OPACITY = 0.42;
const FIGURE_FADE = 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.85) 30%, transparent 70%)';

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC[6];
uniform float uMode;
uniform float uScale;
uniform float uSeed;
uniform float uLight;
uniform float uShadow;
uniform float uExposure;
uniform vec2 uMouse;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
vec3 pal(float h) {
  h = clamp(h, 0.0, 1.0) * 5.0;
  int k = int(min(floor(h), 4.0));
  return mix(uC[k], uC[k + 1], smoothstep(0.0, 1.0, fract(h)));
}

// Oklab, so two hues meet through a clean in-between instead of grey.
vec3 toOk(vec3 c) {
  c = pow(c, vec3(2.2));
  float l = pow(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 1.0 / 3.0);
  float m = pow(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 1.0 / 3.0);
  float s = pow(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 fromOk(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                  -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return pow(clamp(lin, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.y = 1.0 - uv.y;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y) * uScale + uSeed;
  float t = uTime * 0.035;
  vec2 mo = (uMouse - 0.5) * 0.35;

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(t, 0.0)));
  vec2 r = vec2(fbm(p + 1.4 * q + vec2(1.7, 9.2) + mo + t * 0.7), fbm(p + 1.4 * q + vec2(8.3, 2.8) - t * 0.5));
  float f = fbm(p + 1.3 * r);
  float fn = (f - 0.25) / 0.42;

  if (uMode > 3.5) {
    // Tri: three colours in 60/30/10. [1] fills the card, [2] is one large
    // soft shape, [3] a glow in the opposite corner; [0] darkens the seam where
    // [1] and [2] meet (a value step, not grey); [4] is a thin sheen on that edge.
    // Measured in the card's short side, so shapes keep their share on tall cards too.
    vec2 ext = vec2(asp, 1.0) / min(asp, 1.0);
    vec2 a = uv * ext;
    vec2 w = (r - 0.5) * 0.5;
    float h1 = fract(sin(uSeed * 12.9898) * 43758.5453);
    float h2 = fract(sin(uSeed * 78.233) * 43758.5453);
    vec2 c2 = vec2(ext.x * (0.15 + 0.45 * h1), 0.18 + 0.22 * h2) + vec2(sin(t * 3.0), cos(t * 2.3)) * 0.05 + mo * 0.25;
    float d2 = length((a - c2 + w) * vec2(1.0, 0.8));
    float s2 = 1.0 - smoothstep(0.42, 0.78, d2);
    vec2 c3 = vec2(ext.x * (0.95 - 0.5 * h1), ext.y + 0.02) + vec2(cos(t * 2.0), sin(t * 2.7)) * 0.05 - mo * 0.2;
    float d3 = length((a - c3 + w * 0.8) * vec2(0.9, 1.25));
    float s3 = pow(1.0 - smoothstep(0.0, 0.75, d3), 1.5);
    vec3 col = toOk(uC[1]);
    col = mix(col, toOk(uC[2]), s2);
    col = mix(col, toOk(uC[0]), 4.0 * s2 * (1.0 - s2) * uShadow);
    col = mix(col, toOk(uC[3]), s3);
    float sheen = smoothstep(0.5, 0.0, abs(d2 - 0.36)) * smoothstep(0.55, 0.75, fbm(p * 1.5 + r + 7.0));
    col = mix(col, toOk(uC[4]), sheen * uLight);
    o = vec4(fromOk(col) * uExposure, 1.0);
    return;
  }

  float h;
  if (uMode < 0.5) {
    h = fn;
  } else if (uMode < 1.5) {
    // Horizon: palette runs top to bottom across a slow wave.
    float wave = 0.09 * sin(uv.x * 3.4 + t * 4.0 + uSeed) + 0.30 * (f - 0.5) + 0.18 * (r.x - 0.5);
    h = smoothstep(0.02, 0.98, uv.y + wave);
  } else if (uMode < 2.5) {
    // Curtain: soft vertical columns, warped like cloth.
    float x = uv.x * asp + 0.20 * (r.y - 0.5) + 0.04 * sin(uv.y * 4.0 + t * 3.0);
    h = 0.5 + 0.5 * sin(x * 7.5 + uSeed + 3.0 * (f - 0.5));
    h = mix(h, fn, 0.3);
  } else {
    // Aurora: dark base with tilted light streaks.
    h = (1.0 - uv.y) * 0.35 + (fn - 0.5) * 0.5 + 0.1;
    float s = uv.x * asp * 1.6 + (r.x - 0.5) * 1.6 + uv.y * 0.45 + t * 1.2;
    float streak = pow(0.5 + 0.5 * sin(s * 3.14159 + uSeed), 7.0);
    h = mix(h, 0.78 + 0.22 * f, streak * 0.85);
  }

  vec3 col = pal(h);
  float hl = smoothstep(0.56, 0.80, fbm(p * 0.7 + r * 1.5 + 31.0 - mo));
  col = mix(col, uC[5], hl * uLight);
  float sh = smoothstep(0.54, 0.78, fbm(p * 0.8 - r * 1.2 + 17.0));
  col = mix(col, uC[0], sh * uShadow);
  o = vec4(col * uExposure, 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

let noiseTile: HTMLCanvasElement | null = null;
function getNoiseTile(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const ctx = tile.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (128 + (Math.random() - 0.5) * 2 * GRAIN_AMPLITUDE) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = tile;
  return tile;
}

/** Marching squares over f on a w × h grid; returns one SVG path of its zero line. */
function contourPath(w: number, h: number, f: (x: number, y: number) => number, step = 2): string {
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const v: number[] = new Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) v[j * (cols + 1) + i] = f(i * step, j * step);
  const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b));
  let d = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = v[j * (cols + 1) + i];
      const b = v[j * (cols + 1) + i + 1];
      const c = v[(j + 1) * (cols + 1) + i + 1];
      const e = v[(j + 1) * (cols + 1) + i];
      const x = i * step;
      const y = j * step;
      const pts: [number, number][] = [];
      if (a > 0 !== b > 0) pts.push([x + lerp(a, b) * step, y]);
      if (b > 0 !== c > 0) pts.push([x + step, y + lerp(b, c) * step]);
      if (e > 0 !== c > 0) pts.push([x + lerp(e, c) * step, y + step]);
      if (a > 0 !== e > 0) pts.push([x, y + lerp(a, e) * step]);
      for (let k = 0; k + 1 < pts.length; k += 2) {
        d += `M${pts[k][0].toFixed(1)} ${pts[k][1].toFixed(1)}L${pts[k + 1][0].toFixed(1)} ${pts[k + 1][1].toFixed(1)}`;
      }
    }
  }
  return d;
}

const hash = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;
  return top + (bottom - top) * uy;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = Math.PI * 2;
const EDGE_KINDS = new Set(['nautilus', 'vortex', 'fractal', 'cymatic']);
const circle = (cx: number, cy: number, r: number) =>
  `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;

interface FigurePaths {
  d: string;
  /** Faint construction lines (nautilus). */
  guide?: string;
  /** Plate outline the lines are clipped to, and its centre hole (cymatic). */
  clip?: { cx: number; cy: number; r: number; hole: number };
}

/** Edge figures as SVG paths, in card pixels. Circles the card can't show are skipped. */
function edgePaths(w: number, h: number, fig: LeafFigure): FigurePaths {
  const R = (fig.size ?? 0.8) * h;
  const rc = Math.cos(fig.rot ?? 0);
  const rs = Math.sin(fig.rot ?? 0);
  let fx = 0;
  let fy = 0;
  if (fig.focus === 'eye' && fig.kind === 'nautilus') {
    for (let i = 0, r = 1, a = fig.turn ?? 0; i < 40; i++, a += Math.PI / 2) {
      const nr = r / PHI;
      fx += Math.cos(a) * (r - nr);
      fy += Math.sin(a) * (r - nr);
      r = nr;
    }
  } else if (Array.isArray(fig.focus)) {
    [fx, fy] = fig.focus;
  }
  // origin is where the focus point lands
  const ox = fig.origin[0] * w - (fx * rc - fy * rs) * R;
  const oy = fig.origin[1] * h - (fx * rs + fy * rc) * R;
  const P = (x: number, y: number): [number, number] => [ox + x * rc - y * rs, oy + x * rs + y * rc];
  const pad = 24;
  const half = Math.hypot(w, h) / 2;
  let d = '';
  let guide = '';
  const ring = (x: number, y: number, r: number) => {
    const [cx, cy] = P(x, y);
    const outside = cx + r < -pad || cx - r > w + pad || cy + r < -pad || cy - r > h + pad;
    const enclosing = Math.hypot(cx - w / 2, cy - h / 2) + half < r;
    if (!outside && !enclosing && r > 1.2) d += circle(cx, cy, r);
  };

  if (fig.kind === 'nautilus') {
    for (let i = 0, r = R, x = 0, y = 0, a = fig.turn ?? 0; i < 16; i++, a += Math.PI / 2) {
      ring(x, y, r);
      const [x1, y1] = P(x - r, y);
      const [x2, y2] = P(x + r, y);
      const [x3, y3] = P(x, y - r);
      const [x4, y4] = P(x, y + r);
      guide += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}M${x3.toFixed(1)} ${y3.toFixed(1)}L${x4.toFixed(1)} ${y4.toFixed(1)}`;
      const nr = r / PHI;
      x += Math.cos(a) * (r - nr);
      y += Math.sin(a) * (r - nr);
      r = nr;
    }
    return { d, guide };
  }
  if (fig.kind === 'vortex') {
    const n = 60;
    for (let j = 0; j < n; j++) {
      const t = j / (n - 1);
      const r = R * (0.05 + 0.95 * Math.pow(1 - t, 1.3));
      const an = t * Math.PI * 2.3;
      const m = (R - r) * 0.97;
      ring(Math.cos(an) * m, Math.sin(an) * m, r);
    }
    return { d };
  }
  if (fig.kind === 'fractal') {
    const k = 1 / (1 + 2 / Math.sqrt(3));
    const rec = (x: number, y: number, r: number, depth: number, a: number) => {
      ring(x, y, r);
      if (!depth || r < 3) return;
      const ri = r * k;
      for (let q = 0; q < 3; q++) {
        const t = a + (q * TAU) / 3;
        rec(x + Math.cos(t) * (r - ri), y + Math.sin(t) * (r - ri), ri, depth - 1, a + Math.PI / 3);
      }
    };
    rec(0, 0, R, fig.depth ?? 3, -Math.PI / 2);
    return { d };
  }
  // cymatic: Bessel-like radial waves × an angular mode, as a few widely spaced level lines
  const n = fig.n ?? 6;
  const kr = ((fig.waves ?? 6) * Math.PI) / R;
  const nl = Math.max(2, fig.levels ?? 4);
  const field = (x: number, y: number) => {
    const px = x - ox;
    const py = y - oy;
    const qx = px * rc + py * rs;
    const qy = -px * rs + py * rc;
    const r = Math.hypot(qx, qy);
    const th = Math.atan2(qy, qx);
    const e = Math.min(1, r / (R * 0.35));
    return e * (Math.cos(n * th) * Math.cos(kr * r - (n * Math.PI) / 2 - Math.PI / 4) + 0.5 * Math.cos((n + 3) * th + 1) * Math.cos(kr * 1.55 * r));
  };
  for (let l = 0; l < nl; l++) {
    const lv = (l / (nl - 1) - 0.5) * 0.8;
    d += contourPath(w, h, (x, y) => field(x, y) - lv);
  }
  const [cx, cy] = P(0, 0);
  d += circle(cx, cy, R) + circle(cx, cy, R * 0.13);
  return { d, clip: { cx, cy, r: R + 1, hole: R * 0.13 } };
}

/** The figure as one SVG path, in card pixels. Lengths are measured in card heights. */
function leafPath(w: number, h: number, fig: LeafFigure): string {
  const { kind, origin, scale = 1, level = 0, rot = 0, seed = 0 } = fig;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const ox = origin[0] * w;
  const oy = origin[1] * h;
  if (kind === 'fibonacci') {
    const { unit = 0.035, count = 6 } = fig;
    const dir = fig.rot ?? Math.PI;
    const dx = Math.cos(dir);
    const dy = Math.sin(dir);
    let d = '';
    for (let i = 0, a = 2, b = 3; i < count; i++, [a, b] = [b, a + b]) {
      const r = a * unit * h;
      const cx = ox + dx * r;
      const cy = oy + dy * r;
      d += `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
    }
    return d;
  }
  return contourPath(w, h, (x, y) => {
    const px = (x - ox) / h;
    const py = (y - oy) / h;
    let qx = (c * px + s * py) * scale;
    let qy = (-s * px + c * py) * scale;
    if (kind === 'bent') {
      const nx = valueNoise(qx * 0.6 + seed, qy * 0.6 + seed);
      const ny = valueNoise(qx * 0.6 + 9 + seed, qy * 0.6 + 9 + seed);
      qx += (nx - 0.5) * 0.5;
      qy += (ny - 0.5) * 0.5;
      return Math.cos(Math.PI * qx) * Math.cos(2 * Math.PI * qy) + Math.cos(2 * Math.PI * qx) * Math.cos(Math.PI * qy) - level;
    }
    return Math.cos(Math.PI * qx) * Math.cos(3 * Math.PI * qy) - Math.cos(3 * Math.PI * qx) * Math.cos(Math.PI * qy) - level;
  });
}

export function BokehGradient({
  scene,
  figure,
  className = '',
  style,
  children,
}: {
  scene: BokehScene;
  figure?: LeafFigure;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [webgl, setWebgl] = useState(true);
  const fallback = useMemo(() => `linear-gradient(170deg, ${scene.colors.slice(1).join(', ')})`, [scene.colors]);

  // Track size for the grain canvas, the field resolution and the figure.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s && Math.round(s.w) === Math.round(r.width) && Math.round(s.h) === Math.round(r.height) ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grain at device-pixel resolution.
  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.w * dpr));
    canvas.height = Math.max(1, Math.round(size.h * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const pattern = ctx.createPattern(getNoiseTile(), 'repeat');
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [size]);

  // The shader field: renders while visible, follows the cursor softly.
  useEffect(() => {
    const canvas = fieldRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !size) return;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      setWebgl(false);
      return;
    }
    canvas.width = Math.max(16, Math.round(size.w * 1.16 * FIELD_SCALE));
    canvas.height = Math.max(16, Math.round(size.h * 1.16 * FIELD_SCALE));

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('BokehGradient shader:', gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setWebgl(false);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    gl.uniform3fv(u('uC'), new Float32Array(scene.colors.flatMap(hexToRgb)));
    gl.uniform1f(u('uMode'), MODE_INDEX[scene.mode]);
    gl.uniform1f(u('uScale'), scene.scale ?? 0.9);
    gl.uniform1f(u('uSeed'), scene.seed ?? 0);
    gl.uniform1f(u('uLight'), scene.light ?? 0.45);
    gl.uniform1f(u('uShadow'), scene.shadow ?? 0.45);
    gl.uniform1f(u('uExposure'), scene.exposure ?? 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const uTime = u('uTime');
    const uMouse = u('uMouse');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    // Each card starts at a different moment so neighbours never move in step.
    let time = (scene.seed ?? 0) * 13;
    let raf = 0;
    let last = 0;
    let visible = false;

    const draw = () => {
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const tick = (now: number) => {
      raf = 0;
      if (!visible || reduce.matches) return;
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      time += dt;
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      draw();
    };
    const start = () => {
      if (!raf && visible && !reduce.matches) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    draw();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    io.observe(root);
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = (e.clientY - r.top) / r.height;
    };
    const onLeave = () => {
      mouse.tx = mouse.ty = 0.5;
    };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    const onReduce = () => (reduce.matches ? draw() : start());
    reduce.addEventListener('change', onReduce);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      reduce.removeEventListener('change', onReduce);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [size, scene]);

  // The figure is still: drawn once per size.
  const figurePaths = useMemo<FigurePaths>(() => {
    if (!figure || !size) return { d: '' };
    return EDGE_KINDS.has(figure.kind) ? edgePaths(size.w, size.h, figure) : { d: leafPath(size.w, size.h, figure) };
  }, [figure, size]);
  const clipId = React.useId();

  return (
    <div
      ref={rootRef}
      className={`relative isolate overflow-hidden ${className}`}
      style={{ background: webgl ? scene.colors[1] : fallback, ...style }}
    >
      {webgl && (
        // Oversized so the blur never pulls the card's edge colour in.
        <canvas
          ref={fieldRef}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[8%] -z-10 h-[116%] w-[116%] max-w-none"
          style={{ filter: `blur(${DEFOCUS_PX}px)` }}
        />
      )}
      {figure && size && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          style={{
            opacity: figure.opacity ?? 0.55,
            WebkitMaskImage: figure.fade ?? FIGURE_FADE,
            maskImage: figure.fade ?? FIGURE_FADE,
          }}
        >
          {figurePaths.clip && (
            <clipPath id={clipId}>
              <path clipRule="evenodd" d={circle(figurePaths.clip.cx, figurePaths.clip.cy, figurePaths.clip.r) + circle(figurePaths.clip.cx, figurePaths.clip.cy, figurePaths.clip.hole)} />
            </clipPath>
          )}
          <g clipPath={figurePaths.clip ? `url(#${clipId})` : undefined}>
            {figurePaths.guide && (
              <path d={figurePaths.guide} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
            )}
            <path d={figurePaths.d} fill="none" stroke="#fff" strokeWidth={1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      )}
      <canvas
        ref={grainRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full max-w-none mix-blend-overlay"
        style={{ opacity: GRAIN_OPACITY }}
      />
      {children}
    </div>
  );
}

export default BokehGradient;
