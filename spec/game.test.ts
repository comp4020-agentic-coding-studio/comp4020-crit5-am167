import { describe, expect, it } from "vitest";
import { carBox } from "../game/render.ts";
import {
  CAR_SPEED,
  EXIT,
  LANE,
  ROAD_HALF,
  STOP,
  type Car,
  type Dir,
  type Game,
  axisOf,
  footprint,
  initial,
  step,
  toggle,
} from "../game/sim.ts";

// These test the rules, not the pixels. `game/sim.ts` is pure, so a whole
// playthrough is a fold over `step` and the game can be played headlessly.
//
// Contract tests for C5's published spec. They retire with the brief.

const DT = 1 / 60;

/**
 * The `t` that puts a car's body centre `offset` from the junction centre,
 * measured along its own approach. Lets a test stage a car exactly on the
 * point where two lanes cross instead of guessing a number.
 */
function tForOffset(offset: number): number {
  const f = footprint({ id: 0, from: "n", t: STOP, patience: 0, committed: false });
  // footprint is linear in t, so one sample plus the slope inverts it.
  const slope =
    footprint({ id: 0, from: "n", t: STOP + 0.01, patience: 0, committed: false }).y - f.y;
  return STOP + ((offset - f.y) / slope) * 0.01;
}

function car(from: Dir, t: number, over: Partial<Car> = {}): Car {
  return { id: 1, from, t, patience: 0, committed: false, ...over };
}

/** A game with exactly the cars given and nothing else arriving. */
function staged(cars: Car[], over: Partial<Game> = {}): Game {
  return {
    ...initial(),
    cars,
    // Push the next spawn out of reach so a staged scenario stays staged.
    nextSpawn: Number.POSITIVE_INFINITY,
    ...over,
  };
}

/** Run the sim forward, with an optional per-frame policy. */
function play(g: Game, seconds: number, policy?: (g: Game) => boolean): Game {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    if (g.crash) break;
    if (policy?.(g)) g = toggle(g);
    g = step(g, DT);
  }
  return g;
}

const find = (g: Game, id: number): Car | undefined => g.cars.find((c) => c.id === id);

describe("a red light stops a car", () => {
  // The focused rule test the spec asks for. Everything else in the game is
  // built on this one being true.
  it("halts at the stop line and never enters the box", () => {
    // North approaches on a red (east-west has the green).
    const g = staged([car("n", 0.1)], { green: "ew" });

    // Long enough that an unimpeded car would have crossed several times over.
    const after = play(g, 1 / CAR_SPEED);
    const north = find(after, 1);

    expect(north, "the car should still be waiting, not gone").toBeDefined();
    expect(north!.t).toBeLessThanOrEqual(STOP);
    expect(north!.t).toBeCloseTo(STOP, 2);
  });

  it("lets the same car go once the light turns", () => {
    const waiting = play(staged([car("n", 0.1)], { green: "ew" }), 2);
    expect(find(waiting, 1)!.t).toBeCloseTo(STOP, 2);

    const going = play(toggle(waiting), 3);
    expect(going.passed, "it should have crossed and cleared").toBe(1);
  });
});

describe("the commit rule", () => {
  // A car already in the box cannot stop. Without this, flipping the light
  // freezes a car mid-intersection and the crash that follows feels stolen.
  it("a car past the stop line finishes crossing even if the light flips", () => {
    const entering = car("n", STOP + 0.01, { committed: true });
    const g = staged([entering], { green: "ns" });

    // Flip the light against it the instant it is inside the box.
    const after = play(toggle(g), 3);

    expect(after.crash).toBeNull();
    expect(find(after, 1), "it should have cleared and been removed").toBeUndefined();
    expect(after.passed).toBe(1);
  });
});

describe("crossing cars collide", () => {
  // A crash is two cars *meeting*, not two cars being loosely near each other.
  // The rule used to be occupancy of the whole controlled area, which spans
  // STOP to the far kerb — about 4.4 car lengths — so it fired while the two
  // cars were still several lengths apart and the wreck drew over empty road.
  // Overlap is the rule now, and these tests pin it from both sides.

  it("two cars whose bodies meet in the junction end the round", () => {
    // n runs down the east lane and w runs along the north lane, so their
    // paths cross at (+LANE, -LANE): n meets it *before* the centre and w
    // *after* it. Staged here at that crossing point, a beat apart.
    const g = staged([
      car("n", tForOffset(-LANE), { id: 1, committed: true }),
      car("w", tForOffset(LANE), { id: 2, committed: true }),
    ]);

    const after = play(g, 0.05);

    expect(after.crash).not.toBeNull();
    expect(axisOf(after.crash!.from)).toBeTruthy();
  });

  it("names both cars and the point their bodies met", () => {
    const g = staged([
      car("n", tForOffset(-LANE), { id: 1, committed: true }),
      car("w", tForOffset(LANE), { id: 2, committed: true }),
    ]);

    const { crash } = play(g, 0.05);

    expect(crash).not.toBeNull();
    expect([...crash!.ids].sort()).toEqual([1, 2]);
    // The contact point is where the two lanes cross, inside the junction.
    expect(crash!.x).toBeCloseTo(LANE, 2);
    expect(crash!.y).toBeCloseTo(-LANE, 2);
    expect(Math.abs(crash!.x)).toBeLessThanOrEqual(ROAD_HALF);
    expect(Math.abs(crash!.y)).toBeLessThanOrEqual(ROAD_HALF);
  });

  it("two cars crossing in lockstep miss each other", () => {
    // The old rule's worst case, and the reason the wreck looked unnatural:
    // these two are in the controlled area together the whole way across, but
    // they are never in the same place — n is still short of the crossing
    // point when w has already passed it. A near miss is a near miss.
    const g = staged([
      car("n", STOP + 0.01, { id: 1, committed: true }),
      car("w", STOP + 0.01, { id: 2, committed: true }),
    ]);

    expect(play(g, 1).crash).toBeNull();
  });

  it("two cars on the same axis do not", () => {
    const g = staged([
      car("n", STOP + 0.01, { id: 1, committed: true }),
      car("s", STOP + 0.01, { id: 2, committed: true }),
    ]);

    expect(play(g, 1).crash).toBeNull();
  });
});

describe("the footprint is the body the renderer draws", () => {
  // The collision rule reads `footprint`; the player sees `carBox`. If those
  // two ever disagree the game kills you for a hit you cannot see, which is
  // the exact failure this whole change was made to remove. `carBox` is in
  // pixels about the screen centre and `footprint` is in fractions of the
  // short edge about the junction centre, so one scale factor relates them —
  // at every aspect ratio, because both axes are scaled by the short edge.
  const VIEWPORTS = [
    { name: "desktop 1920x1080", width: 1920, height: 1080 },
    { name: "mobile 390x844", width: 390, height: 844 },
    { name: "ultrawide 2560x720", width: 2560, height: 720 },
  ];

  for (const s of VIEWPORTS) {
    it.each(["n", "e", "s", "w"] as const)(`agrees for ${s.name}, from %s`, (from) => {
      for (const t of [0.2, STOP, 0.5, EXIT, 0.8]) {
        const c = car(from, t);
        const min = Math.min(s.width, s.height);
        const f = footprint(c);
        const box = carBox(c, s);
        expect(box.x - s.width / 2).toBeCloseTo(f.x * min, 6);
        expect(box.y - s.height / 2).toBeCloseTo(f.y * min, 6);
        expect(box.w).toBeCloseTo(f.w * min, 6);
        expect(box.h).toBeCloseTo(f.h * min, 6);
      }
    });
  }
});

// --- The spec's own lines, as tests ---------------------------------------

const SEEDS = [1, 7, 13, 29, 101, 997, 31337, 5, 88, 424242];

/** Play a whole round headlessly under a policy, up to a cap. */
function round(seed: number, policy: (g: Game) => boolean, capSeconds = 900): Game {
  let g = initial(seed);
  const frames = Math.round(capSeconds / DT);
  for (let i = 0; i < frames; i++) {
    if (g.crash) break;
    if (policy(g)) g = toggle(g);
    g = step(g, DT);
  }
  return g;
}

/** A player who never touches anything. */
const idle = (): boolean => false;

/**
 * A player who is actually good at this: always switch toward whoever has
 * waited longest. Deliberately better than a stranger, so "the game ends" is
 * proven against the strongest reasonable play rather than the weakest.
 */
function competent(g: Game): boolean {
  let worst = { axis: g.green, patience: -1 };
  for (const c of g.cars) {
    if (c.patience > worst.patience) worst = { axis: axisOf(c.from), patience: c.patience };
  }
  return worst.axis !== g.green && worst.patience > 0.3;
}

describe("it can be lost", () => {
  // The spec line: a wrong move is possible, and play ends somewhere. Doing
  // nothing is the wrong move, and it has to cost you.
  it.each(SEEDS)("a player who does nothing crashes (seed %i)", (seed) => {
    const g = round(seed, idle, 120);
    expect(g.crash).not.toBeNull();
    expect(g.time).toBeLessThan(120);
  });
});

describe("a round always ends", () => {
  // The spec line: a stranger reaches an ending within five minutes. Pinned
  // against a *competent* policy, because a game that ends for someone playing
  // well certainly ends for someone meeting it cold.
  //
  // This is the test guarding the difficulty ramp, and it exists because an
  // earlier ramp that levelled off let this player survive indefinitely:
  // queues stabilised around twenty cars, patience peaked at 0.8, and nobody
  // ever bolted. Nothing about the game looked broken. It just could not be
  // finished, which is the one thing the spec does not allow.
  it.each(SEEDS)("ends inside five minutes under good play (seed %i)", (seed) => {
    const g = round(seed, competent);
    expect(g.crash, "the ramp has to outrun the player").not.toBeNull();
    expect(g.time).toBeLessThan(300);
  });

  it("rewards good play with a longer round than doing nothing", () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const lazy = avg(SEEDS.map((s) => round(s, idle, 300).time));
    const good = avg(SEEDS.map((s) => round(s, competent).time));
    expect(good).toBeGreaterThan(lazy * 2);
  });
});

describe("switching is never what kills you", () => {
  // The point of the all-red clearance. If a switch could cause a crash, the
  // player would be punished for doing the only thing the game asks of them,
  // and every loss would feel stolen instead of earned.
  it("a player who switches constantly still only dies to impatience", () => {
    let flips = 0;
    const g = round(29, () => ++flips % 20 === 0, 900);

    expect(g.crash).not.toBeNull();
    // Whoever caused it had run out of patience, not been caught by a light.
    expect(g.cars.filter((c) => c.patience >= 1).length).toBeGreaterThan(0);
  });
});
