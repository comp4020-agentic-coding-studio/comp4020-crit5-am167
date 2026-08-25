// Drawing only. Every rule lives in sim.ts; nothing here decides anything
// about the game, it just says what the current state looks like.

import { EXIT, STOP, type Car, type Dir, type Game, axisOf, flowing } from "./sim.ts";

const GRASS = "#12141a";
const ROAD = "#2a2d34";
const KERB = "#1b1d22";
const PAINT = "#818799";
const GO = "#39d353";
const STOPPED = "#f2544b";
const WAIT = "#f5a623";
const CALM = "#cfd3dc";

/** Half-width of the carriageway, as a fraction of the smaller screen edge. */
const ROAD_HALF = 0.075;
const CAR_LEN = 0.040;
const CAR_WIDE = 0.026;

export type Size = { width: number; height: number };

type Geom = {
  min: number;
  half: number;
  lane: number;
  cx: number;
  cy: number;
};

function geom(s: Size): Geom {
  const min = Math.min(s.width, s.height);
  const half = min * ROAD_HALF;
  return { min, half, lane: half / 2, cx: s.width / 2, cy: s.height / 2 };
}

/**
 * Distance in pixels along an approach, for a car at `t`.
 *
 * The sim measures `t` from 0 at the entry edge to 1 at the far edge, with the
 * intersection between STOP and EXIT. The junction, though, is a square in
 * pixels, so on a wide screen the same `t` window is a very different fraction
 * of the width than of the height. Mapping `t` straight onto the axis puts the
 * painted stop line and the sim's stop line in different places — cars queue
 * inside the junction, and the rule the player is being taught is invisible.
 *
 * So the map is piecewise: approach, box, exit. STOP lands exactly on the kerb
 * line and EXIT exactly on the far one, whatever shape the window is.
 */
function along(t: number, axisLength: number, half: number): number {
  const centre = axisLength / 2;
  const approach = centre - half;
  if (t <= STOP) return (t / STOP) * approach;
  if (t <= EXIT) return approach + ((t - STOP) / (EXIT - STOP)) * half * 2;
  return centre + half + ((t - EXIT) / (1 - EXIT)) * (centre - half);
}

function place(from: Dir, t: number, s: Size): { x: number; y: number } {
  const g = geom(s);
  const vertical = axisOf(from) === "ns";
  const d = along(t, vertical ? s.height : s.width, g.half);
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

function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, s: Size): void {
  const g = geom(s);
  const { x, y } = place(car.from, car.t, s);
  const vertical = axisOf(car.from) === "ns";
  const len = g.min * CAR_LEN;
  const wide = g.min * CAR_WIDE;
  const w = vertical ? wide : len;
  const h = vertical ? len : wide;

  // The car about to hurt you is the one that has to look different, and the
  // warning has to arrive before the event — so the colour ramps with the wait
  // instead of flipping at the end.
  ctx.fillStyle =
    car.patience >= 1 ? STOPPED : car.patience > 0 ? mix(WAIT, CALM, 1 - car.patience) : CALM;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, g.min * 0.007);
  ctx.fill();

  // The patience bar: the only thing on screen that explains anything, and it
  // is not text. A bar that fills, and a car that then bolts, teaches the whole
  // mechanic by happening once.
  if (car.patience > 0 && car.patience < 1) {
    // Always the long dimension: on a vertical car the width is too short to
    // read as a bar at all, and this is the one thing the player must notice.
    const thick = Math.max(2, g.min * 0.007);
    const barW = len;
    ctx.fillStyle = mix(WAIT, STOPPED, car.patience);
    ctx.fillRect(x - barW / 2, y - h / 2 - thick * 2, barW * car.patience, thick);
  }
}

function drawLight(ctx: CanvasRenderingContext2D, from: Dir, green: boolean, s: Size): void {
  const g = geom(s);
  const vertical = axisOf(from) === "ns";
  // Sit each light just outside its own stop line, on the kerb.
  const back = g.half * 0.45;
  const out = g.half * 1.45;
  let x = 0;
  let y = 0;
  if (from === "n") [x, y] = [g.cx + out, g.cy - g.half - back];
  if (from === "s") [x, y] = [g.cx - out, g.cy + g.half + back];
  if (from === "w") [x, y] = [g.cx - g.half - back, g.cy - out];
  if (from === "e") [x, y] = [g.cx + g.half + back, g.cy + out];
  void vertical;

  ctx.beginPath();
  ctx.arc(x, y, g.min * 0.013, 0, Math.PI * 2);
  ctx.fillStyle = green ? GO : STOPPED;
  ctx.shadowColor = green ? GO : STOPPED;
  ctx.shadowBlur = g.min * 0.035;
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function draw(ctx: CanvasRenderingContext2D, state: Game, s: Size): void {
  const { width: w, height: h } = s;
  const g = geom(s);

  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = ROAD;
  ctx.fillRect(0, g.cy - g.half, w, g.half * 2);
  ctx.fillRect(g.cx - g.half, 0, g.half * 2, h);

  ctx.strokeStyle = KERB;
  ctx.lineWidth = Math.max(1, g.min * 0.003);
  ctx.strokeRect(0, g.cy - g.half, w, g.half * 2);
  ctx.strokeRect(g.cx - g.half, 0, g.half * 2, h);

  // Stop lines, on the kerb line of the box. Drawn because the commit rule is
  // defined against them: past this line a car is going, whatever you do.
  ctx.fillStyle = PAINT;
  const thick = Math.max(2, g.min * 0.005);
  ctx.fillRect(g.cx, g.cy - g.half - thick, g.half, thick);
  ctx.fillRect(g.cx - g.half, g.cy + g.half, g.half, thick);
  ctx.fillRect(g.cx - g.half - thick, g.cy - g.half, thick, g.half);
  ctx.fillRect(g.cx + g.half, g.cy, thick, g.half);

  // A light is green only when its axis can actually move. During the clearance
  // after a switch every light is red — which is true, and is also the reason
  // nothing moved when the player expected it to.
  for (const dir of ["n", "e", "s", "w"] as const) {
    drawLight(ctx, dir, flowing(state, axisOf(dir)), s);
  }

  for (const car of state.cars) drawCar(ctx, car, s);

  // The score. Digits only: the number goes up when a car gets through, and
  // that is the whole of what it means.
  //
  // In play it lives in the top-right, clear of both carriageways — over the
  // north lane it collided with the very cars it was counting.
  ctx.fillStyle = state.crash ? "#e8eaf0" : "#6b7080";
  ctx.font = `600 ${Math.round(g.min * (state.crash ? 0.14 : 0.05))}px ui-monospace, monospace`;
  ctx.textAlign = state.crash ? "center" : "right";
  ctx.textBaseline = state.crash ? "middle" : "top";
  ctx.fillText(
    String(state.passed),
    state.crash ? w / 2 : w - g.min * 0.06,
    state.crash ? Math.max(g.min * 0.16, g.cy - g.half - g.min * 0.16) : g.min * 0.05,
  );

  // Drawn last, and drawn big, so it sits on top of everything including the
  // score. The wreck is the only answer the player gets to "what did I do
  // wrong" — it says which approach finally gave up waiting — so it cannot be
  // the thing hidden behind the number.
  if (state.crash) {
    const { x, y } = place(state.crash.from, state.crash.t, s);
    ctx.fillStyle = STOPPED;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = g.min * (i % 2 ? 0.035 : 0.085);
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}
