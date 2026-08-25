import { describe, expect, it } from "vitest";
import {
  CAR_SPEED,
  EXIT,
  STOP,
  type Car,
  type Dir,
  type Game,
  axisOf,
  initial,
  step,
  toggle,
} from "../game/sim.ts";

// These test the rules, not the pixels. `game/sim.ts` is pure, so a whole
// playthrough is a fold over `step` and the game can be played headlessly.
//
// Contract tests for C5's published spec. They retire with the brief.

const DT = 1 / 60;

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
  it("two cars in the box on crossing axes end the round", () => {
    const g = staged([
      car("n", STOP + 0.01, { id: 1, committed: true }),
      car("w", STOP + 0.01, { id: 2, committed: true }),
    ]);

    const after = play(g, 1);

    expect(after.crash).not.toBeNull();
    expect(axisOf(after.crash!.from)).toBeTruthy();
  });

  it("two cars on the same axis do not", () => {
    const g = staged([
      car("n", STOP + 0.01, { id: 1, committed: true }),
      car("s", STOP + 0.01, { id: 2, committed: true }),
    ]);

    expect(play(g, 1).crash).toBeNull();
  });
});
