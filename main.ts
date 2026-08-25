// Wiring only: the loop, the input, the canvas. The rules are in game/sim.ts
// and the drawing is in game/render.ts.

import { draw } from "./game/render.ts";
import { type Game, initial, step, toggle } from "./game/sim.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

let game: Game = initial(Math.floor(performance.now()) || 1);
let last = performance.now();
/** When the round ended, so the click that killed you can't also restart it. */
let endedAt = 0;
const RESTART_LOCKOUT = 600;

let size = { width: 0, height: 0 };

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = { width: window.innerWidth, height: window.innerHeight };
  canvas.width = Math.round(size.width * dpr);
  canvas.height = Math.round(size.height * dpr);
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Any input at all does the only thing there is to do. A player who flails
// discovers the mechanic; there is no wrong target to miss.
function input(): void {
  if (game.crash) {
    if (performance.now() - endedAt > RESTART_LOCKOUT) {
      game = initial(Math.floor(performance.now()) || 1);
    }
    return;
  }
  game = toggle(game);
}

function frame(now: number): void {
  // Clamp: a backgrounded tab returns a huge delta, and the sim should not
  // teleport cars through each other because the player changed windows.
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  const wasAlive = !game.crash;
  game = step(game, dt);
  if (wasAlive && game.crash) endedAt = now;

  draw(ctx, game, size);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("pointerdown", input);
window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    input();
  }
});

resize();
requestAnimationFrame(frame);

// Exposed so the state can be measured directly during verification. Reading
// this beats screenshotting a running animation loop, which can hang capture.
declare global {
  interface Window {
    __junction: { state: () => Game };
  }
}
window.__junction = { state: () => game };
