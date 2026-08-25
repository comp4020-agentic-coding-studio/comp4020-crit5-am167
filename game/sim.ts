// The simulation: pure, deterministic, and completely DOM-free.
//
// Nothing in here reads the clock, the system RNG, or the page. `step` takes a
// state and a delta and returns the next state, so a whole playthrough is a
// fold over `step` — which is what lets spec/game.test.ts play the game
// headlessly instead of asserting on pixels. Keep it that way: no Date.now, no
// Math.random, no document.

export type Axis = "ns" | "ew";

/** The edge a car entered from. "n" enters at the top, heading south. */
export type Dir = "n" | "e" | "s" | "w";

export const DIRS: readonly Dir[] = ["n", "e", "s", "w"];

export type Car = {
  readonly id: number;
  readonly from: Dir;
  /** Distance along its approach: 0 at the edge it entered, 1 at the far edge. */
  readonly t: number;
  /** 0..1. Rises only while stopped at the head of a queue; at 1 the driver goes anyway. */
  readonly patience: number;
  /** Past the stop line, or out of patience. A committed car never stops again. */
  readonly committed: boolean;
};

export type Game = {
  readonly time: number;
  readonly green: Axis;
  readonly cars: readonly Car[];
  /** Cars that made it across. The score. */
  readonly passed: number;
  /** Where two cars met, or null while the round is alive. */
  readonly crash: { readonly from: Dir; readonly t: number } | null;
  readonly rng: number;
  readonly nextSpawn: number;
  readonly nextId: number;
};

// --- Geometry -------------------------------------------------------------
// An approach runs 0..1. The intersection box is the slice in the middle: STOP
// is where the painted line is, EXIT is where the car is clear of the box.

export const STOP = 0.46;
export const EXIT = 0.54;

/** Bumper-to-bumper spacing, in the same units as `t`. */
export const CAR_GAP = 0.055;

// --- Tuning ---------------------------------------------------------------
// Numbers to be settled by playing, not by reasoning. See notes/log.md.

export const CAR_SPEED = 0.26;
export const SPAWN_START = 1.5;
export const SPAWN_MIN = 0.42;
export const PATIENCE_START = 7;
export const PATIENCE_MIN = 3.4;
/** Seconds over which the game ramps from its opening pace to its hardest. */
export const RAMP_SECONDS = 150;

export function axisOf(dir: Dir): Axis {
  return dir === "n" || dir === "s" ? "ns" : "ew";
}

// --- Determinism ----------------------------------------------------------
// mulberry32: small, fast and seedable, so a given seed always plays out the
// same way. The tests depend on that, and so does reproducing a bug.

function random(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Seconds between spawns, easing from the opening pace to the hardest. */
export function spawnInterval(time: number): number {
  const p = Math.min(1, time / RAMP_SECONDS);
  return SPAWN_START + (SPAWN_MIN - SPAWN_START) * p;
}

/** How long a driver waits before running the red. Shortens as the game ramps. */
export function patienceSeconds(time: number): number {
  const p = Math.min(1, time / RAMP_SECONDS);
  return PATIENCE_START + (PATIENCE_MIN - PATIENCE_START) * p;
}

// --- The opening frame ----------------------------------------------------
// This is the entire tutorial, so it is designed rather than defaulted. The
// game does not open empty and it does not open flowing: it opens mid-problem.
// East-west has the green and is moving; north is stopped at the red with a
// queue behind it and a patience bar already filling. The only two things
// moving are the cars on the green and that bar, so the eye goes to the bar,
// and the first click resolves it. Cause and effect, no words.

export function initial(seed = 1): Game {
  return {
    time: 0,
    green: "ew",
    cars: [
      // Stopped at the red, already waiting, with two behind it.
      { id: 1, from: "n", t: STOP, patience: 0.12, committed: false },
      { id: 2, from: "n", t: STOP - CAR_GAP, patience: 0, committed: false },
      { id: 3, from: "n", t: STOP - CAR_GAP * 2, patience: 0, committed: false },
      // Moving on the green, so "green means go" is on screen from frame one.
      { id: 4, from: "w", t: 0.16, patience: 0, committed: false },
      { id: 5, from: "e", t: 0.32, patience: 0, committed: false },
    ],
    passed: 0,
    crash: null,
    rng: seed,
    nextSpawn: SPAWN_START,
    nextId: 6,
  };
}

export function toggle(g: Game): Game {
  if (g.crash) return g;
  return { ...g, green: g.green === "ns" ? "ew" : "ns" };
}

export function step(g: Game, dt: number): Game {
  if (g.crash) return g;

  const time = g.time + dt;
  let rng = g.rng;
  let nextSpawn = g.nextSpawn;
  let nextId = g.nextId;
  let cars = [...g.cars];

  // --- Spawn ---
  // A spawn onto a full approach is dropped rather than stacked; overlapping
  // cars would read as a bug, and the queue's own head running the red is
  // already the pressure valve for a starved approach.
  if (time >= nextSpawn) {
    const pick = random(rng);
    rng = pick.state;
    const from = DIRS[Math.floor(pick.value * DIRS.length) % DIRS.length]!;

    const room = cars
      .filter((c) => c.from === from)
      .every((c) => c.t >= CAR_GAP);
    if (room) {
      cars.push({ id: nextId++, from, t: 0, patience: 0, committed: false });
    }

    const jitter = random(rng);
    rng = jitter.state;
    nextSpawn = time + spawnInterval(time) * (0.65 + 0.7 * jitter.value);
  }

  // --- Move ---
  // Each approach is resolved leader-first, so a car only ever has to look at
  // the one in front of it.
  const patienceRate = dt / patienceSeconds(time);
  const moved: Car[] = [];

  for (const from of DIRS) {
    const queue = cars
      .filter((c) => c.from === from)
      .sort((a, b) => b.t - a.t);

    let aheadT: number | null = null;

    for (const c of queue) {
      const red = axisOf(c.from) !== g.green;
      let limit = aheadT === null ? Number.POSITIVE_INFINITY : aheadT - CAR_GAP;
      // The commit rule: only an uncommitted car can be held by the light.
      if (!c.committed && red) limit = Math.min(limit, STOP);

      const t = Math.max(c.t, Math.min(c.t + CAR_SPEED * dt, limit));
      const stopped = t - c.t < 1e-9;

      // Only the head of a queue gets impatient, and only when the light —
      // not the car in front — is what is holding it. Losing to a red-runner
      // is therefore always traceable to an approach the player starved.
      const held = stopped && red && !c.committed && aheadT === null;
      const patience = held ? Math.min(1, c.patience + patienceRate) : c.patience;

      moved.push({
        ...c,
        t,
        patience,
        // Past the line, or out of patience: either way it is going now.
        committed: c.committed || t > STOP || patience >= 1,
      });
      aheadT = t;
    }
  }

  cars = moved;

  // --- Collide ---
  // Only cars sharing the box on crossing axes. Same-axis cars cannot meet;
  // CAR_GAP guarantees it.
  const inBox = cars.filter((c) => c.t >= STOP && c.t <= EXIT);
  for (let i = 0; i < inBox.length; i++) {
    for (let j = i + 1; j < inBox.length; j++) {
      const a = inBox[i]!;
      const b = inBox[j]!;
      if (axisOf(a.from) !== axisOf(b.from)) {
        return {
          ...g,
          time,
          rng,
          nextSpawn,
          nextId,
          cars,
          crash: { from: a.from, t: a.t },
        };
      }
    }
  }

  // --- Clear ---
  const remaining = cars.filter((c) => c.t < 1);
  return {
    ...g,
    time,
    rng,
    nextSpawn,
    nextId,
    cars: remaining,
    passed: g.passed + (cars.length - remaining.length),
  };
}
