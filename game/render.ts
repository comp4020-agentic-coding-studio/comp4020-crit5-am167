// Drawing only. Every rule lives in sim.ts; nothing here decides anything
// about the game, it just says what the current state looks like.

import {
  CAR_GAP,
  EXIT,
  STOP,
  type Car,
  type Dir,
  type Game,
  axisOf,
} from "./sim.ts";

const ROAD = "#2a2d34";
const ASPHALT_EDGE = "#1b1d22";
const GRASS = "#12141a";
const PAINT = "#5b6070";
const GO = "#39d353";
const STOPPED = "#f2544b";
const WAIT = "#f5a623";

/** Half-width of the carriageway, as a fraction of the smaller screen edge. */
const ROAD_HALF = 0.085;
const CAR_LEN = 0.042;
const CAR_WIDE = 0.030;

export type Size = { width: number; height: number };

/**
 * Where a car sits, in pixels. `t` runs from the edge it entered (0) to the
 * far edge (1), so the intersection is always at t = 0.5 whatever the shape
 * of the viewport.
 */
function place(from: Dir, t: number, s: Size): { x: number; y: number } {
  const { width: w, height: h } = s;
  const lane = Math.min(w, h) * ROAD_HALF * 0.5;
  switch (from) {
    case "n":
      return { x: w / 2 + lane, y: t * h };
    case "s":
      return { x: w / 2 - lane, y: (1 - t) * h };
    case "w":
      return { x: t * w, y: h / 2 - lane };
    case "e":
      return { x: (1 - t) * w, y: h / 2 + lane };
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fill();
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, s: Size): void {
  const min = Math.min(s.width, s.height);
  const { x, y } = place(car.from, car.t, s);
  const vertical = axisOf(car.from) === "ns";
  const len = min * CAR_LEN;
  const wide = min * CAR_WIDE;

  // A car that has run out of patience is the one about to hurt you, so it is
  // the one that has to look different. The colour ramps with the wait rather
  // than flipping at the end — the warning has to arrive before the event.
  ctx.fillStyle =
    car.patience >= 1 ? STOPPED : car.patience > 0 ? mix(WAIT, "#cfd3dc", 1 - car.patience) : "#cfd3dc";

  roundRect(ctx, x, y, vertical ? wide : len, vertical ? len : wide, min * 0.008);

  if (car.patience > 0 && car.patience < 1) {
    // The patience bar. This is the only "instruction" on the screen, and it
    // is not text: a bar that fills toward a car that then bolts teaches the
    // whole mechanic by happening once.
    const barLen = (vertical ? wide : len) * car.patience;
    ctx.fillStyle = WAIT;
    if (vertical) {
      ctx.fillRect(x - wide / 2, y - len / 2 - min * 0.012, barLen, min * 0.006);
    } else {
      ctx.fillRect(x - len / 2, y - wide / 2 - min * 0.012, barLen, min * 0.006);
    }
  }
}

function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawLight(
  ctx: CanvasRenderingContext2D,
  from: Dir,
  green: boolean,
  s: Size,
): void {
  const min = Math.min(s.width, s.height);
  const { x, y } = place(from, STOP - CAR_GAP * 0.55, s);
  const off = min * ROAD_HALF * 0.72;
  const vertical = axisOf(from) === "ns";
  // Sit the light beside its own stop line, on the kerb.
  const cx = x + (vertical ? (from === "n" ? off : -off) : 0);
  const cy = y + (vertical ? 0 : from === "w" ? -off : off);

  ctx.beginPath();
  ctx.arc(cx, cy, min * 0.014, 0, Math.PI * 2);
  ctx.fillStyle = green ? GO : STOPPED;
  ctx.shadowColor = green ? GO : STOPPED;
  ctx.shadowBlur = min * 0.03;
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, s: Size): void {
  const { width: w, height: h } = s;
  const min = Math.min(w, h);
  const half = min * ROAD_HALF;

  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, w, h);

  // Roads
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, h / 2 - half, w, half * 2);
  ctx.fillRect(w / 2 - half, 0, half * 2, h);
  ctx.strokeStyle = ASPHALT_EDGE;
  ctx.lineWidth = Math.max(1, min * 0.004);
  ctx.strokeRect(0, h / 2 - half, w, half * 2);
  ctx.strokeRect(w / 2 - half, 0, half * 2, h);

  // Stop lines. Drawn because the commit rule is defined against them: past
  // this line a car is going, whatever you do. The player needs to see it.
  ctx.fillStyle = PAINT;
  const thick = Math.max(2, min * 0.006);
  const boxHalf = min * ROAD_HALF;
  ctx.fillRect(w / 2 - boxHalf, h / 2 - boxHalf - thick, boxHalf, thick);
  ctx.fillRect(w / 2, h / 2 + boxHalf, boxHalf, thick);
  ctx.fillRect(w / 2 - boxHalf - thick, h / 2, thick, boxHalf);
  ctx.fillRect(w / 2 + boxHalf, h / 2 - boxHalf, thick, boxHalf);

  for (const dir of ["n", "e", "s", "w"] as const) {
    drawLight(ctx, dir, axisOf(dir) === g.green, s);
  }

  for (const car of g.cars) drawCar(ctx, car, s);

  if (g.crash) {
    const { x, y } = place(g.crash.from, g.crash.t, s);
    ctx.fillStyle = STOPPED;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = min * (i % 2 ? 0.022 : 0.055);
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  // The score. Digits only — the number goes up when a car gets through, and
  // that is the whole of what it means.
  ctx.fillStyle = g.crash ? "#e8eaf0" : "#6b7080";
  ctx.font = `600 ${Math.round(min * (g.crash ? 0.13 : 0.05))}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(g.passed), w / 2, g.crash ? h / 2 : min * 0.075);
}

export { EXIT, STOP };
