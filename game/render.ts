// Drawing only. Every rule lives in sim.ts; nothing here decides anything
// about the game, it just says what the current state looks like.
//
// The look: a wet junction at 2am, seen from the traffic mast above it.
// Everything built — asphalt, kerbs, footpaths, worn paint — is grey and
// textured. Saturated colour is spent on exactly three things: the signals,
// the cars' own lamps, and a driver's patience running out. That is the whole
// discipline of the palette, and it is a gameplay decision before it is an
// aesthetic one: the only things on screen with colour in them are the things
// the player has to look at.
//
// Light is what makes it read as real rather than as a diagram. Four street
// lamps lay warm pools over the corners, every car throws a headlight cone
// down its own lane, and every light source smears a reflection into the wet
// road under it.

import { EXIT, STOP, type Car, type Dir, type Game, axisOf, flowing } from "./sim.ts";

// --- Palette --------------------------------------------------------------

const NIGHT = "#15181f"; // ground beyond the footpath
const PATH = "#242932"; // concrete footpath
const PATH_EDGE = "#323845";
const KERB_TOP = "#4b5464"; // the lit top face of the kerb
const ASPHALT = "#2b3038";
const ASPHALT_DARK = "#23272e"; // polished wheel tracks
const ASPHALT_BOX = "#2c313a"; // the junction wears differently
const PAINT = "#c2c8d4"; // worn thermoplastic
const BOX_HATCH = "#c9a94a"; // the yellow box junction

const GO = "#3fd66a";
const HALT = "#e8452f";
const WARN = "#f2a63b";
const LAMP = "#ffd9a0"; // sodium-ish street lighting
const HEADLIGHT = "#fff4dc";
const TAILLIGHT = "#ff3b2f";

/** Body colours, muted the way real cars look under street light. */
const BODIES = [
  "#9aa1ac", // silver
  "#3f444d", // graphite
  "#c8ccd3", // white
  "#2e3b57", // navy
  "#6f2f31", // deep red
  "#2f4a3f", // forest
  "#2b2e34", // charcoal
  "#8a7a52", // pale gold
  "#4a5a6b", // slate blue
];

// --- Proportions ----------------------------------------------------------
// All as a fraction of the smaller screen edge, so the junction is the same
// shape on a phone as on a monitor.

/** Half-width of the carriageway: one lane each way. */
const ROAD_HALF = 0.075;
/** Footpath, outside the kerb. */
const PATH_WIDE = 0.038;

// A car has to be shorter than the sim's bumper-to-bumper spacing or a queue
// draws as one long smear. CAR_GAP (0.055 in t) maps to ~0.055 of the smaller
// edge at its tightest, so this is the ceiling, not a taste decision.
const CAR_LEN = 0.046;
const CAR_WIDE = 0.028;

export type Size = { width: number; height: number };

type Geom = {
  min: number;
  /** Half-width of the carriageway, in pixels. */
  half: number;
  /** Distance from the road's centre line to a lane's centre. */
  lane: number;
  path: number;
  cx: number;
  cy: number;
  len: number;
  wide: number;
};

function geom(s: Size): Geom {
  const min = Math.min(s.width, s.height);
  const half = min * ROAD_HALF;
  return {
    min,
    half,
    lane: half / 2,
    path: min * PATH_WIDE,
    cx: s.width / 2,
    cy: s.height / 2,
    len: min * CAR_LEN,
    wide: min * CAR_WIDE,
  };
}

/** Half-width of the carriageway in pixels. Exported so the spec can measure it. */
export function roadHalfWidth(s: Size): number {
  return geom(s).half;
}

// --- Geometry -------------------------------------------------------------

/**
 * Distance in pixels along an approach, for a car nose at `t`.
 *
 * The sim measures `t` from 0 at the entry edge to 1 at the far edge, with the
 * intersection between STOP and EXIT. The junction, though, is a square in
 * pixels, so on a wide screen the same `t` window is a very different fraction
 * of the width than of the height. Mapping `t` straight onto the axis puts the
 * painted stop line and the sim's stop line in different places — cars queue
 * inside the junction, and the rule the player is being taught is invisible.
 *
 * So the map is piecewise: approach, box, exit. STOP lands exactly on the near
 * kerb line and EXIT exactly on the far one, whatever shape the window is.
 *
 * The value is where the car's *nose* is, not its centre. `t` is what the stop
 * line and the collision box are defined against, so the bumper is the honest
 * thing to pin to them: a car waiting at STOP has its nose on the paint and its
 * body behind it, which is both what the sim means and what a car does.
 */
function along(t: number, axisLength: number, g: Geom): number {
  const centre = axisLength / 2;
  const approach = Math.max(0, centre - g.half);
  if (t <= STOP) return (t / STOP) * approach;
  if (t <= EXIT) return approach + ((t - STOP) / (EXIT - STOP)) * g.half * 2;
  // Overshoot by a car length so a car that leaves at t=1 is fully off screen
  // rather than vanishing with its boot still in view.
  return centre + g.half + ((t - EXIT) / (1 - EXIT)) * (approach + g.len);
}

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radians, with the car's nose pointing along its heading. */
  angle: number;
};

/**
 * Where a car is drawn: centre, size and heading.
 *
 * Exported because this — not the pixels — is what the spec can hold to
 * account. A car has to sit on its own side of its own carriageway and stop
 * behind the line, and those are the two things a geometry change breaks.
 */
export function carBox(car: Car, s: Size): Box {
  const g = geom(s);
  const vertical = axisOf(car.from) === "ns";
  // Pull back from the nose to the centre of the body.
  const d = along(car.t, vertical ? s.height : s.width, g) - g.len / 2;
  const w = vertical ? g.wide : g.len;
  const h = vertical ? g.len : g.wide;
  switch (car.from) {
    case "n":
      return { x: g.cx + g.lane, y: d, w, h, angle: 0 };
    case "s":
      return { x: g.cx - g.lane, y: s.height - d, w, h, angle: Math.PI };
    case "w":
      return { x: d, y: g.cy - g.lane, w, h, angle: -Math.PI / 2 };
    case "e":
      return { x: s.width - d, y: g.cy + g.lane, w, h, angle: Math.PI / 2 };
  }
}

/** Where a point at `t` on an approach lands, ignoring car length. */
function place(from: Dir, t: number, s: Size): { x: number; y: number } {
  const g = geom(s);
  const vertical = axisOf(from) === "ns";
  const d = along(t, vertical ? s.height : s.width, g);
  switch (from) {
    case "n":
      return { x: g.cx + g.lane, y: d };
    case "s":
      return { x: g.cx - g.lane, y: s.height - d };
    case "w":
      return { x: d, y: g.cy - g.lane };
    case "e":
      return { x: s.width - d, y: g.cy + g.lane };
  }
}

// --- Colour ---------------------------------------------------------------

type RGB = [number, number, number];

/**
 * Read a colour back to components.
 *
 * Every helper here returns hex so that its output can be fed into the next
 * one — `shade(mix(a, b, k), 0.9)` is the common shape, and an earlier version
 * returned `rgb(...)` from `mix`, which `shade` then read as hex and turned
 * into `rgb(NaN,NaN,3)`. Canvas throws on that, the throw killed the frame
 * loop, and the game froze on its first frame. Composability is the fix;
 * tolerating both forms here is the belt to its braces.
 */
function parse(colour: string): RGB {
  if (colour.startsWith("#")) {
    return [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16)) as RGB;
  }
  const parts = colour.match(/-?\d+(\.\d+)?/g);
  if (parts && parts.length >= 3) {
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])] as RGB;
  }
  return [0, 0, 0];
}

function clamp255(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, k: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const t = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0;
  return toHex(pa.map((v, i) => v + (pb[i]! - v) * t) as RGB);
}

function shade(colour: string, k: number): string {
  const f = Number.isFinite(k) ? Math.max(0, k) : 1;
  return toHex(parse(colour).map((v) => v * f) as RGB);
}

function alpha(colour: string, a: number): string {
  const [r, g, b] = parse(colour).map(clamp255);
  const k = Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0;
  return `rgba(${r},${g},${b},${k})`;
}

/** A stable body colour per car, so a car keeps its identity down the road. */
function bodyColour(id: number): string {
  // A cheap integer hash: consecutive ids must not give consecutive colours,
  // or a queue arrives looking like a paint chart.
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return BODIES[Math.abs(h) % BODIES.length]!;
}

// --- Deterministic noise --------------------------------------------------
// render.ts stays as free of surprises as sim.ts: no Math.random, so the
// asphalt grain and the crash debris are the same every time.

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Offscreen layers -----------------------------------------------------
// The road never changes, so it is drawn once and blitted. Without this the
// grain, the paint, the kerbs and four lamp gradients would be rebuilt sixty
// times a second to produce an identical image.

type Layer = { canvas: HTMLCanvasElement; key: string };

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let scenery: Layer | null = null;
let vignette: Layer | null = null;
let grain: HTMLCanvasElement | null = null;

/** A small tile of asphalt grain, tiled with a pattern rather than per-pixel. */
function grainTile(): HTMLCanvasElement | null {
  if (grain) return grain;
  const c = makeCanvas(96, 96);
  if (!c) return null;
  const g = c.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(96, 96);
  const next = rand(20260825);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = next();
    // Mostly invisible, with the occasional lighter chip of aggregate.
    const lift = v > 0.985 ? 70 : v > 0.9 ? 26 : 0;
    const level = Math.round(lift + v * 16);
    image.data[i] = level;
    image.data[i + 1] = level;
    image.data[i + 2] = level;
    image.data[i + 3] = v > 0.55 ? 26 : 12;
  }
  g.putImageData(image, 0, 0);
  grain = c;
  return c;
}

// --- The static scene -----------------------------------------------------

function drawGround(ctx: CanvasRenderingContext2D, s: Size, g: Geom): void {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, s.width, s.height);

  // Footpath: one cross, wider than the road, so the four corners come out
  // right without drawing them separately.
  const ph = g.half + g.path;
  ctx.fillStyle = PATH;
  ctx.fillRect(0, g.cy - ph, s.width, ph * 2);
  ctx.fillRect(g.cx - ph, 0, ph * 2, s.height);

  // A lighter seam where the paving meets the dirt.
  ctx.strokeStyle = PATH_EDGE;
  ctx.lineWidth = Math.max(1, g.min * 0.0018);
  for (const y of [g.cy - ph, g.cy + ph]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s.width, y);
    ctx.stroke();
  }
  for (const x of [g.cx - ph, g.cx + ph]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s.height);
    ctx.stroke();
  }

  // Paving joints, so the footpath has a scale to it.
  ctx.strokeStyle = alpha("#000000", 0.35);
  ctx.lineWidth = 1;
  const slab = Math.max(8, g.min * 0.03);
  for (let x = g.cx % slab; x < s.width; x += slab) {
    ctx.beginPath();
    ctx.moveTo(x, g.cy - ph);
    ctx.lineTo(x, g.cy + ph);
    ctx.stroke();
  }
  for (let y = g.cy % slab; y < s.height; y += slab) {
    ctx.beginPath();
    ctx.moveTo(g.cx - ph, y);
    ctx.lineTo(g.cx + ph, y);
    ctx.stroke();
  }
}

function drawAsphalt(ctx: CanvasRenderingContext2D, s: Size, g: Geom): void {
  const kerb = Math.max(1.5, g.min * 0.0035);
  const shadow = kerb * 1.6;
  const L = g.cx - g.half;
  const R = g.cx + g.half;
  const T = g.cy - g.half;
  const B = g.cy + g.half;

  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, T, s.width, g.half * 2);
  ctx.fillRect(L, 0, g.half * 2, s.height);

  // The junction wears differently from the roads feeding it — but only just.
  // A bigger step than this and the box reads as a lit panel rather than as
  // the same asphalt with more traffic over it.
  ctx.fillStyle = ASPHALT_BOX;
  ctx.fillRect(L, T, g.half * 2, g.half * 2);

  // Wheel tracks: two polished bands per lane, where the tyres actually go.
  ctx.fillStyle = alpha(ASPHALT_DARK, 0.7);
  const trackW = Math.max(1, g.wide * 0.34);
  const trackOff = g.wide * 0.32;
  for (const laneSign of [-1, 1]) {
    const c = g.lane * laneSign;
    for (const off of [-trackOff, trackOff]) {
      ctx.fillRect(0, g.cy + c + off - trackW / 2, s.width, trackW);
      ctx.fillRect(g.cx + c + off - trackW / 2, 0, trackW, s.height);
    }
  }

  // Kerbs, as explicit segments that stop at the junction.
  //
  // The first version drew them straight through and then painted the box back
  // over the top to erase them. That also erased the box's grain and its wheel
  // tracks, and the junction came out a flat pale square in the middle of a
  // textured road — the brightest thing on screen, pulling the eye to the one
  // place nothing was happening. Draw only what should be there.
  ctx.fillStyle = KERB_TOP;
  for (const y of [T - kerb, B]) {
    ctx.fillRect(0, y, L, kerb);
    ctx.fillRect(R, y, s.width - R, kerb);
  }
  for (const x of [L - kerb, R]) {
    ctx.fillRect(x, 0, kerb, T);
    ctx.fillRect(x, B, kerb, s.height - B);
  }

  // The shadow the kerb casts down onto the road surface below it.
  ctx.fillStyle = alpha("#000000", 0.4);
  for (const y of [T, B - shadow]) {
    ctx.fillRect(0, y, L, shadow);
    ctx.fillRect(R, y, s.width - R, shadow);
  }
  for (const x of [L, R - shadow]) {
    ctx.fillRect(x, 0, shadow, T);
    ctx.fillRect(x, B, shadow, s.height - B);
  }

  // Grain last, so every part of the carriageway including the box gets it.
  const tile = grainTile();
  if (tile) {
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, T, s.width, g.half * 2);
      ctx.fillRect(L, 0, g.half * 2, s.height);
    }
  }
}

function drawMarkings(ctx: CanvasRenderingContext2D, s: Size, g: Geom): void {
  const thin = Math.max(1.5, g.min * 0.0035);
  const stopThick = Math.max(2, g.min * 0.005);

  // Dashed centre line, stopping short of the junction.
  ctx.strokeStyle = alpha(PAINT, 0.5);
  ctx.lineWidth = thin;
  const dash = g.min * 0.05;
  ctx.setLineDash([dash, dash * 0.9]);
  ctx.beginPath();
  ctx.moveTo(0, g.cy);
  ctx.lineTo(g.cx - g.half, g.cy);
  ctx.moveTo(g.cx + g.half, g.cy);
  ctx.lineTo(s.width, g.cy);
  ctx.moveTo(g.cx, 0);
  ctx.lineTo(g.cx, g.cy - g.half);
  ctx.moveTo(g.cx, g.cy + g.half);
  ctx.lineTo(g.cx, s.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Solid edge lines against the kerb.
  ctx.strokeStyle = alpha(PAINT, 0.28);
  ctx.lineWidth = Math.max(1, thin * 0.7);
  const inset = g.half * 0.86;
  ctx.beginPath();
  for (const sgn of [-1, 1]) {
    ctx.moveTo(0, g.cy + sgn * inset);
    ctx.lineTo(g.cx - g.half, g.cy + sgn * inset);
    ctx.moveTo(g.cx + g.half, g.cy + sgn * inset);
    ctx.lineTo(s.width, g.cy + sgn * inset);
    ctx.moveTo(g.cx + sgn * inset, 0);
    ctx.lineTo(g.cx + sgn * inset, g.cy - g.half);
    ctx.moveTo(g.cx + sgn * inset, g.cy + g.half);
    ctx.lineTo(g.cx + sgn * inset, s.height);
  }
  ctx.stroke();

  // The box junction. Thematically it is the game's own rule painted on the
  // road — do not enter unless your exit is clear — and it is the only warm
  // colour in the built world.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.cx - g.half, g.cy - g.half, g.half * 2, g.half * 2);
  ctx.clip();
  ctx.strokeStyle = alpha(BOX_HATCH, 0.038);
  ctx.lineWidth = Math.max(1, g.min * 0.0025);
  const step = g.half * 0.62;
  ctx.beginPath();
  for (let d = -g.half * 2; d < g.half * 2; d += step) {
    ctx.moveTo(g.cx - g.half + d, g.cy - g.half);
    ctx.lineTo(g.cx + g.half + d, g.cy + g.half);
    ctx.moveTo(g.cx - g.half + d, g.cy + g.half);
    ctx.lineTo(g.cx + g.half + d, g.cy - g.half);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = alpha(BOX_HATCH, 0.16);
  ctx.lineWidth = Math.max(1, g.min * 0.003);
  ctx.strokeRect(g.cx - g.half, g.cy - g.half, g.half * 2, g.half * 2);

  // Stop lines, on the kerb line of the box, across the approaching lane only.
  // Drawn because the commit rule is defined against them: past this line a
  // car is going, whatever the player does.
  ctx.fillStyle = alpha(PAINT, 0.68);
  ctx.fillRect(g.cx, g.cy - g.half - stopThick, g.half, stopThick);
  ctx.fillRect(g.cx - g.half, g.cy + g.half, g.half, stopThick);
  ctx.fillRect(g.cx - g.half - stopThick, g.cy - g.half, stopThick, g.half);
  ctx.fillRect(g.cx + g.half, g.cy, stopThick, g.half);
}

/**
 * Street lighting: a staggered run of mast-arm lamps down every approach.
 *
 * They started as four lamps on the junction's own corners, which was wrong
 * twice over. They crowded the signal heads, so the one colour that means
 * something competed with a colour that means nothing; and they lit the middle,
 * which is the part of the road that is already the brightest thing on screen.
 * The queues form *out* along the approaches, and a queue is where the patience
 * bars live — so that is where the light needs to fall.
 *
 * Staggering the sides is what real streets do, and the scalloped pools it
 * makes give the road a rhythm and a sense of distance that flat lighting does
 * not.
 */
function drawStreetLight(ctx: CanvasRenderingContext2D, s: Size, g: Geom): void {
  const ph = g.half + g.path;
  const spacing = Math.max(1, g.min * 0.36);
  const reach = spacing * 0.78;
  const armLen = g.path * 0.85;

  type Lamp = { mast: [number, number]; head: [number, number] };
  const lamps: Lamp[] = [];

  // `axis` walks out from the junction along one road; `side` picks a kerb.
  const run = (vertical: boolean): void => {
    const length = vertical ? s.height : s.width;
    let i = 0;
    for (const away of [-1, 1]) {
      for (let d = ph + spacing * 0.5; d < length / 2 + spacing; d += spacing) {
        const side = i++ % 2 === 0 ? -1 : 1;
        const alongAxis = (vertical ? g.cy : g.cx) + away * d;
        if (alongAxis < -ph || alongAxis > length + ph) break;
        const mastOff = side * ph;
        const headOff = side * (g.half - armLen * 0.15);
        lamps.push(
          vertical
            ? { mast: [g.cx + mastOff, alongAxis], head: [g.cx + headOff, alongAxis] }
            : { mast: [alongAxis, g.cy + mastOff], head: [alongAxis, g.cy + headOff] },
        );
      }
    }
  };
  run(false);
  run(true);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const { head } of lamps) {
    const [hx, hy] = head;
    const pool = ctx.createRadialGradient(hx, hy, 0, hx, hy, reach);
    pool.addColorStop(0, alpha(LAMP, 0.1));
    pool.addColorStop(0.4, alpha(LAMP, 0.035));
    pool.addColorStop(1, alpha(LAMP, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(hx, hy, reach, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // The lamps themselves: a base on the footpath, an arm over the kerb, and a
  // hot head at the end of it.
  for (const { mast, head } of lamps) {
    const [mx, my] = mast;
    const [hx, hy] = head;

    ctx.strokeStyle = alpha("#000000", 0.45);
    ctx.lineWidth = Math.max(1.5, g.min * 0.004);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    ctx.fillStyle = "#333a46";
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(1.5, g.min * 0.006), 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const r = Math.max(1, g.min * 0.018);
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
    glow.addColorStop(0, alpha(LAMP, 0.8));
    glow.addColorStop(0.3, alpha(LAMP, 0.25));
    glow.addColorStop(1, alpha(LAMP, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** A broad soft sheen, so the asphalt reads as wet rather than as flat grey. */
function drawSheen(ctx: CanvasRenderingContext2D, s: Size, g: Geom): void {
  const r = Math.max(1, g.min * 0.7);
  const sheen = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, r);
  sheen.addColorStop(0, alpha("#8fa7c8", 0.035));
  sheen.addColorStop(1, alpha("#8fa7c8", 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, s.width, s.height);
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, s: Size): void {
  const g = geom(s);
  drawGround(ctx, s, g);
  drawAsphalt(ctx, s, g);
  drawMarkings(ctx, s, g);
  drawSheen(ctx, s, g);
  drawStreetLight(ctx, s, g);
}

// --- Cars -----------------------------------------------------------------

/** The cone a car's headlights throw down the road in front of it. */
function drawBeam(ctx: CanvasRenderingContext2D, box: Box, g: Geom, bright: number): void {
  const reach = g.len * 4.2;
  const spread = g.wide * 1.9;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);
  ctx.globalCompositeOperation = "lighter";
  const beam = ctx.createLinearGradient(0, g.len / 2, 0, g.len / 2 + reach);
  beam.addColorStop(0, alpha(HEADLIGHT, 0.17 * bright));
  beam.addColorStop(0.35, alpha(HEADLIGHT, 0.07 * bright));
  beam.addColorStop(1, alpha(HEADLIGHT, 0));
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-g.wide * 0.36, g.len / 2);
  ctx.lineTo(g.wide * 0.36, g.len / 2);
  ctx.lineTo(spread, g.len / 2 + reach);
  ctx.lineTo(-spread, g.len / 2 + reach);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, s: Size, time: number): void {
  const g = geom(s);
  const box = carBox(car, s);
  const L = g.len;
  const W = g.wide;

  // The car about to hurt you is the one that has to look different, and the
  // warning has to arrive before the event — so the paint heats toward red as
  // the driver's patience burns, rather than flipping at the end. Under a
  // realistic palette this is the one place a car is allowed to lie about its
  // own colour, and it earns it: it is the single most important thing on
  // screen.
  const heat = Math.pow(car.patience, 1.4);
  const paint = mix(bodyColour(car.id), HALT, heat * 0.85);
  const boiling = car.patience >= 1;
  // A deterministic pulse: the sim's own clock, so no wall clock creeps in.
  const pulse = boiling ? 0.5 + 0.5 * Math.sin(time * 9) : 0;

  drawBeam(ctx, box, g, boiling ? 1.35 : 1);

  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);

  // Contact shadow. A blurred offset shape rather than shadowBlur on every
  // car, which is the expensive way to get the same few pixels.
  ctx.fillStyle = alpha("#000000", 0.5);
  ctx.beginPath();
  ctx.roundRect(-W / 2 + L * 0.04, -L / 2 + L * 0.05, W, L, W * 0.3);
  ctx.fill();

  // Tyres, just proud of the body on each side.
  ctx.fillStyle = "#15171b";
  const tyreL = L * 0.2;
  const tyreW = Math.max(1, W * 0.11);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.fillRect(sx * (W / 2) - (sx > 0 ? 0 : tyreW), sy * (L * 0.28) - tyreL / 2, tyreW, tyreL);
    }
  }

  // Body, with a sheen across it so the roof reads as curved metal.
  const shell = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  shell.addColorStop(0, shade(paint, 0.55));
  shell.addColorStop(0.32, shade(paint, 1.12));
  shell.addColorStop(0.62, shade(paint, 0.92));
  shell.addColorStop(1, shade(paint, 0.5));
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.roundRect(-W / 2, -L / 2, W, L, W * 0.3);
  ctx.fill();

  // Cabin and glass. The windscreen is at the nose end, which is what tells
  // the eye which way a stationary car is facing.
  const cabinL = L * 0.44;
  const cabinW = W * 0.78;
  ctx.fillStyle = alpha("#0d1016", 0.85);
  ctx.beginPath();
  ctx.roundRect(-cabinW / 2, -cabinL / 2 + L * 0.02, cabinW, cabinL, W * 0.16);
  ctx.fill();

  const glass = ctx.createLinearGradient(0, -cabinL / 2, 0, cabinL / 2);
  glass.addColorStop(0, alpha("#3d4a5e", 0.9));
  glass.addColorStop(1, alpha("#1b222d", 0.9));
  ctx.fillStyle = glass;
  // Windscreen (forward) and rear window, as trapezoids narrowing to the roof.
  ctx.beginPath();
  ctx.moveTo(-cabinW / 2, cabinL * 0.5 + L * 0.02);
  ctx.lineTo(cabinW / 2, cabinL * 0.5 + L * 0.02);
  ctx.lineTo(cabinW * 0.36, cabinL * 0.18 + L * 0.02);
  ctx.lineTo(-cabinW * 0.36, cabinL * 0.18 + L * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-cabinW * 0.42, -cabinL * 0.5 + L * 0.02);
  ctx.lineTo(cabinW * 0.42, -cabinL * 0.5 + L * 0.02);
  ctx.lineTo(cabinW * 0.32, -cabinL * 0.18 + L * 0.02);
  ctx.lineTo(-cabinW * 0.32, -cabinL * 0.18 + L * 0.02);
  ctx.closePath();
  ctx.fill();

  // Roof highlight: one thin line, and the metal stops looking flat.
  ctx.fillStyle = alpha("#ffffff", 0.1);
  ctx.fillRect(-cabinW * 0.3, -cabinL * 0.12, cabinW * 0.12, cabinL * 0.28);

  // Mirrors.
  ctx.fillStyle = shade(paint, 0.7);
  const mirrorY = cabinL * 0.42;
  const mirrorW = Math.max(1, W * 0.1);
  ctx.fillRect(-W / 2 - mirrorW, mirrorY, mirrorW, Math.max(1, L * 0.05));
  ctx.fillRect(W / 2, mirrorY, mirrorW, Math.max(1, L * 0.05));

  // Lamps. Headlights at the nose, brake lights at the tail — and the brakes
  // come on when the car is not moving, which is a second, quieter reading of
  // the same thing the patience bar shouts.
  const lampW = W * 0.2;
  const lampH = Math.max(1, L * 0.05);
  ctx.fillStyle = HEADLIGHT;
  ctx.fillRect(-W * 0.4, L / 2 - lampH, lampW, lampH);
  ctx.fillRect(W * 0.4 - lampW, L / 2 - lampH, lampW, lampH);

  const braking = car.patience > 0 || boiling;
  ctx.fillStyle = braking ? TAILLIGHT : alpha(TAILLIGHT, 0.55);
  ctx.shadowColor = TAILLIGHT;
  ctx.shadowBlur = braking ? W * 0.7 : 0;
  ctx.fillRect(-W * 0.42, -L / 2, lampW, lampH);
  ctx.fillRect(W * 0.42 - lampW, -L / 2, lampW, lampH);
  ctx.shadowBlur = 0;

  // A driver out of patience is about to run the light. Give the car a halo so
  // it is findable anywhere on screen, not only where the player is looking.
  if (boiling) {
    ctx.strokeStyle = alpha(HALT, 0.5 + 0.4 * pulse);
    ctx.lineWidth = Math.max(1.5, W * 0.12);
    ctx.beginPath();
    ctx.roundRect(-W / 2, -L / 2, W, L, W * 0.3);
    ctx.stroke();
  }

  // The patience bar: the only thing on screen that explains anything, and it
  // is not text. A bar that fills, and a car that then bolts, teaches the whole
  // mechanic by happening once.
  //
  // It runs alongside the car on the kerb side — local +x is always the kerb,
  // whichever way the car faces — so it never lands under the car behind it in
  // a queue, and never sits in the road ahead where the player is watching.
  if (car.patience > 0 && car.patience < 1) {
    const thick = Math.max(2.5, g.min * 0.0085);
    const gap = W * 0.42;
    ctx.fillStyle = alpha("#000000", 0.55);
    ctx.beginPath();
    ctx.roundRect(W / 2 + gap, -L / 2, thick, L, thick / 2);
    ctx.fill();
    ctx.fillStyle = mix(WARN, HALT, car.patience);
    ctx.shadowColor = mix(WARN, HALT, car.patience);
    ctx.shadowBlur = thick * 2.4;
    ctx.beginPath();
    ctx.roundRect(W / 2 + gap, L / 2 - L * car.patience, thick, L * car.patience, thick / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

// --- Signals --------------------------------------------------------------

function drawLight(ctx: CanvasRenderingContext2D, from: Dir, green: boolean, s: Size): void {
  const g = geom(s);
  // Each head stands on the footpath at its own approach's near corner, so the
  // driver it is talking to is the one looking straight at it.
  const out = g.half + g.path * 0.52;
  const back = g.half + g.path * 0.18;
  let x = 0;
  let y = 0;
  let angle = 0;
  if (from === "n") [x, y, angle] = [g.cx + out, g.cy - back, Math.PI];
  if (from === "s") [x, y, angle] = [g.cx - out, g.cy + back, 0];
  if (from === "w") [x, y, angle] = [g.cx - back, g.cy - out, Math.PI / 2];
  if (from === "e") [x, y, angle] = [g.cx + back, g.cy + out, -Math.PI / 2];

  const unit = Math.max(2, g.min * 0.0085);
  const lit = green ? GO : HALT;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Seen from directly above, a signal is a short wide box, not the tall
  // three-stack you picture from the driver's seat. Drawn stacked along the
  // approach it read as a bar lying across the carriageway — and worse, at a
  // glance, as a car. So the lamps sit in a row *across* the approach, which
  // is both what the shape looks like from a mast and unmistakably not traffic.
  const bw = unit * 5.2;
  const bh = unit * 2.1;
  ctx.fillStyle = alpha("#000000", 0.5);
  ctx.beginPath();
  ctx.roundRect(-bw / 2 + unit * 0.25, -bh / 2 + unit * 0.3, bw, bh, unit * 0.55);
  ctx.fill();
  ctx.fillStyle = "#171b21";
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, unit * 0.55);
  ctx.fill();
  ctx.strokeStyle = alpha("#69748a", 0.6);
  ctx.lineWidth = Math.max(1, unit * 0.18);
  ctx.stroke();

  // Red, amber, green — the amber is never lit, because the sim has no amber
  // phase. Drawing it dark is honest: it says what this junction can do.
  const lamps: [number, string][] = [
    [-unit * 1.55, HALT],
    [0, WARN],
    [unit * 1.55, GO],
  ];
  for (const [lx, colour] of lamps) {
    const on = colour === (green ? GO : HALT);
    ctx.beginPath();
    ctx.arc(lx, 0, unit * 0.66, 0, Math.PI * 2);
    ctx.fillStyle = on ? colour : shade(colour, 0.18);
    ctx.fill();
    if (on) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = unit * 2.6;
      ctx.fill();
      ctx.fill();
      ctx.shadowBlur = 0;
      // A hot centre, so the lens reads as emitting rather than painted.
      ctx.fillStyle = alpha("#ffffff", 0.75);
      ctx.beginPath();
      ctx.arc(lx, 0, unit * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Bloom, and the reflection the wet road throws back up the approach. This
  // is what makes a green read as "go" from the far edge of the screen without
  // the player having to find the lamp itself.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bloom = ctx.createRadialGradient(x, y, 0, x, y, unit * 6);
  bloom.addColorStop(0, alpha(lit, 0.22));
  bloom.addColorStop(0.35, alpha(lit, 0.07));
  bloom.addColorStop(1, alpha(lit, 0));
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(x, y, unit * 6, 0, Math.PI * 2);
  ctx.fill();

  // Smear it down the carriageway it governs, the way a wet road holds a light.
  const vertical = axisOf(from) === "ns";
  const rx = vertical ? unit * 2.4 : g.half * 1.15;
  const ry = vertical ? g.half * 1.15 : unit * 2.4;
  const outer = Math.max(rx, ry, 1);
  const wet = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
  wet.addColorStop(0, alpha(lit, 0.13));
  wet.addColorStop(1, alpha(lit, 0));
  ctx.translate(x, y);
  ctx.scale(rx / outer, ry / outer);
  ctx.fillStyle = wet;
  ctx.beginPath();
  ctx.arc(0, 0, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- The wreck ------------------------------------------------------------

function drawCrash(ctx: CanvasRenderingContext2D, state: Game, s: Size): void {
  const g = geom(s);
  const crash = state.crash;
  if (!crash) return;
  const { x, y } = place(crash.from, crash.t, s);
  const r = g.min * 0.1;

  // Scorch first, under everything.
  ctx.save();
  const scorch = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
  scorch.addColorStop(0, alpha("#000000", 0.75));
  scorch.addColorStop(0.6, alpha("#000000", 0.4));
  scorch.addColorStop(1, alpha("#000000", 0));
  ctx.fillStyle = scorch;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Debris, thrown deterministically so the same crash always looks the same.
  const next = rand(Math.round(crash.t * 10000) + crash.from.charCodeAt(0));
  ctx.fillStyle = "#2b2f36";
  for (let i = 0; i < 22; i++) {
    const a = next() * Math.PI * 2;
    const d = r * (0.5 + next() * 1.5);
    const sz = g.min * (0.003 + next() * 0.007);
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.rotate(a);
    ctx.fillRect(-sz, -sz * 0.4, sz * 2, sz * 0.8);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Fireball.
  const fire = ctx.createRadialGradient(x, y, 0, x, y, r);
  fire.addColorStop(0, alpha("#ffffff", 0.95));
  fire.addColorStop(0.18, alpha("#ffd27a", 0.85));
  fire.addColorStop(0.45, alpha("#ff7a2f", 0.55));
  fire.addColorStop(0.75, alpha(HALT, 0.3));
  fire.addColorStop(1, alpha(HALT, 0));
  ctx.fillStyle = fire;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // A blast halo rather than the crisp ring this started as. A hard circle
  // outline at a fixed radius did not read as a shockwave; it read as a
  // crosshair drawn over the game — the one thing on screen that looked like
  // interface instead of world.
  const halo = ctx.createRadialGradient(x, y, r * 0.95, x, y, r * 1.85);
  halo.addColorStop(0, alpha("#ffb37a", 0.16));
  halo.addColorStop(0.5, alpha("#ff8a4a", 0.07));
  halo.addColorStop(1, alpha("#ff8a4a", 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Shards of the two cars, big enough to read as wreckage rather than dust.
  ctx.fillStyle = alpha("#e9edf3", 0.75);
  for (let i = 0; i < 7; i++) {
    const a = next() * Math.PI * 2;
    const d = r * (0.15 + next() * 0.55);
    const sz = g.min * (0.006 + next() * 0.01);
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.rotate(a * 2);
    ctx.beginPath();
    ctx.moveTo(-sz, 0);
    ctx.lineTo(0, -sz * 0.7);
    ctx.lineTo(sz, sz * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// --- Overlay --------------------------------------------------------------

function drawVignette(ctx: CanvasRenderingContext2D, s: Size): void {
  const r = Math.max(1, Math.hypot(s.width, s.height) / 2);
  // Restrained on purpose. A vignette this scene can afford is one that frames
  // the junction; the first attempt at 0.62 swallowed the far ends of both
  // roads, and a car whose patience bar is invisible until it reaches the
  // middle is a warning that arrives after the event it was warning about.
  const v = ctx.createRadialGradient(
    s.width / 2,
    s.height / 2,
    r * 0.55,
    s.width / 2,
    s.height / 2,
    r,
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, s.width, s.height);
}

// --- Layer plumbing -------------------------------------------------------

function devicePixels(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const a = t && typeof t.a === "number" ? t.a : 1;
  return Number.isFinite(a) && a > 0 ? Math.min(a, 3) : 1;
}

/**
 * Blit a cached layer, rebuilding it when the window changed shape.
 *
 * Returns false when no offscreen canvas is available — under test, or in any
 * environment without a DOM — and the caller draws straight to the context
 * instead. The picture is the same either way; only the cost differs.
 */
function layer(
  ctx: CanvasRenderingContext2D,
  s: Size,
  cache: Layer | null,
  paint: (c: CanvasRenderingContext2D, s: Size) => void,
  keep: (l: Layer | null) => void,
): boolean {
  const dpr = devicePixels(ctx);
  const key = `${Math.round(s.width)}x${Math.round(s.height)}@${dpr}`;
  if (s.width < 1 || s.height < 1) return false;
  let live = cache;
  if (!live || live.key !== key) {
    const canvas = makeCanvas(s.width * dpr, s.height * dpr);
    if (!canvas) return false;
    const c = canvas.getContext("2d");
    if (!c) return false;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(c, s);
    live = { canvas, key };
    keep(live);
  }
  ctx.drawImage(live.canvas, 0, 0, s.width, s.height);
  return true;
}

// --- The frame ------------------------------------------------------------

export function draw(ctx: CanvasRenderingContext2D, state: Game, s: Size): void {
  const { width: w, height: h } = s;
  const g = geom(s);

  if (
    !layer(
      ctx,
      s,
      scenery,
      (c, size) => drawScene(c, size),
      (l) => {
        scenery = l;
      },
    )
  ) {
    drawScene(ctx, s);
  }

  // A light is green only when its axis can actually move. During the
  // clearance after a switch every light is red — which is true, and is also
  // the reason nothing moved when the player expected it to.
  for (const dir of ["n", "e", "s", "w"] as const) {
    drawLight(ctx, dir, flowing(state, axisOf(dir)), s);
  }

  for (const car of state.cars) drawCar(ctx, car, s, state.time);

  if (
    !layer(
      ctx,
      s,
      vignette,
      (c, size) => drawVignette(c, size),
      (l) => {
        vignette = l;
      },
    )
  ) {
    drawVignette(ctx, s);
  }

  // The score. Digits only: the number goes up when a car gets through, and
  // that is the whole of what it means.
  //
  // In play it lives in the top-right, clear of both carriageways — over the
  // north lane it collided with the very cars it was counting.
  const size = Math.round(g.min * (state.crash ? 0.15 : 0.05));
  ctx.save();
  ctx.font = `600 ${Math.max(1, size)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = state.crash ? "center" : "right";
  ctx.textBaseline = state.crash ? "middle" : "top";
  const sx = state.crash ? w / 2 : w - g.min * 0.06;
  const sy = state.crash
    ? Math.max(g.min * 0.17, g.cy - g.half - g.min * 0.2)
    : Math.max(g.min * 0.05, 0);
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = state.crash ? "#f2f5fa" : alpha("#aeb6c6", 0.75);
  ctx.fillText(String(state.passed), sx, sy);
  ctx.restore();

  // Drawn last, and drawn big, so it sits on top of everything including the
  // score. The wreck is the only answer the player gets to "what did I do
  // wrong" — it says which approach finally gave up waiting — so it cannot be
  // the thing hidden behind the number.
  drawCrash(ctx, state, s);
}
