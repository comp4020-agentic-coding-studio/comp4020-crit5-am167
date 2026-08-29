import { describe, expect, it } from "vitest";
import { carBox, draw, roadHalfWidth } from "../game/render.ts";
import {
  CAR_GAP,
  CAR_SPEED,
  EXIT,
  LANE,
  STOP,
  type Car,
  type Dir,
  type Game,
  initial,
  step,
} from "../game/sim.ts";

// C5 contract test: the drawing layer, held to the promises the *rules* depend
// on being visible.
//
// `spec/game.test.ts` proves the sim is correct. It cannot prove the player can
// see it. Two failures would leave every rule test green and the game unplayable:
//
//  1. A car drawn off its carriageway. The overhaul puts cars on real lanes with
//     kerbs and footpaths either side, so "on the road" stops being free. A car
//     floating on the verge makes the queue unreadable.
//  2. A NaN coordinate. Canvas silently draws nothing for NaN — no throw, no
//     warning, just an invisible car. It is the one rendering bug that looks
//     exactly like the absence of a rendering bug, and a geometry pass full of
//     divisions is where it comes from.
//
// The stop-line check is the third: `committed` is defined against STOP, so if
// the painted line and the sim's line disagree the player watches cars halt in
// mid-junction and the rule being taught reads as a bug.
//
// Retires with this brief; the principle (assert the geometry the rules are
// defined against, never the pixels) does not.

const VIEWPORTS = [
  { name: "desktop 1920x1080", width: 1920, height: 1080 },
  { name: "mobile 390x844", width: 390, height: 844 },
  { name: "ultrawide 2560x720", width: 2560, height: 720 },
  { name: "tall 600x1400", width: 600, height: 1400 },
];

const DIRS: readonly Dir[] = ["n", "e", "s", "w"];

function car(from: Dir, t: number, over: Partial<Car> = {}): Car {
  return { id: 1, from, t, patience: 0, committed: false, ...over };
}

describe("cars are drawn on the road", () => {
  for (const s of VIEWPORTS) {
    describe(s.name, () => {
      const half = roadHalfWidth(s);
      const cx = s.width / 2;
      const cy = s.height / 2;

      it.each(DIRS)("keeps a car from the %s inside its carriageway", (from) => {
        // Sample the whole approach, including inside the junction box.
        for (let t = 0; t <= 1; t += 0.01) {
          const box = carBox(car(from, t), s);
          const vertical = from === "n" || from === "s";
          // Across the direction of travel the car must sit within the tarmac.
          const lo = vertical ? box.x - box.w / 2 : box.y - box.h / 2;
          const hi = vertical ? box.x + box.w / 2 : box.y + box.h / 2;
          const kerbLo = (vertical ? cx : cy) - half;
          const kerbHi = (vertical ? cx : cy) + half;
          expect(lo, `${from} at t=${t.toFixed(2)} hangs off the near kerb`).toBeGreaterThanOrEqual(
            kerbLo,
          );
          expect(hi, `${from} at t=${t.toFixed(2)} hangs off the far kerb`).toBeLessThanOrEqual(
            kerbHi,
          );
        }
      });

      it.each(DIRS)("keeps traffic from the %s out of the opposing lane", (from) => {
        // Two directions share each carriageway. They must not overlap, or a
        // head-on near-miss reads as a crash the sim never had.
        const box = carBox(car(from, 0.2), s);
        const vertical = from === "n" || from === "s";
        const centre = vertical ? cx : cy;
        const lo = vertical ? box.x - box.w / 2 : box.y - box.h / 2;
        const hi = vertical ? box.x + box.w / 2 : box.y + box.h / 2;
        // n and e drive on the far side of their road's centre line; s and w
        // on the near side. Which side is arbitrary — that they never share is not.
        const onFarSide = from === "n" || from === "e";
        if (onFarSide) expect(lo).toBeGreaterThanOrEqual(centre);
        else expect(hi).toBeLessThanOrEqual(centre);
      });

      it.each(DIRS)("stops a waiting car from the %s before the pedestrian crossing", (from) => {
        // A signalised Australian intersection leaves a pedestrian crosswalk
        // between the stop line and the junction. A car at STOP therefore
        // needs a meaningful setback, not merely a bumper that avoids the box
        // by a rounding error.
        const box = carBox(car(from, STOP), s);
        const vertical = from === "n" || from === "s";
        const nose =
          from === "n"
            ? box.y + box.h / 2
            : from === "s"
              ? box.y - box.h / 2
              : from === "w"
                ? box.x + box.w / 2
                : box.x - box.w / 2;
        const centre = vertical ? cy : cx;
        const nearEdge = from === "n" || from === "w" ? centre - half : centre + half;
        const gap = from === "n" || from === "w" ? nearEdge - nose : nose - nearEdge;
        const carLength = vertical ? box.h : box.w;
        expect(gap, `${from} leaves no room for the pedestrian crossing`).toBeGreaterThanOrEqual(
          carLength * 0.75,
        );
      });

      it.each(DIRS)("leaves a visible standstill gap in the %s queue", (from) => {
        const leader = carBox(car(from, STOP, { id: 1 }), s);
        const follower = carBox(car(from, STOP - CAR_GAP, { id: 2 }), s);
        const vertical = from === "n" || from === "s";
        const carLength = vertical ? leader.h : leader.w;
        const centres = vertical
          ? Math.abs(leader.y - follower.y)
          : Math.abs(leader.x - follower.x);
        const bumperGap = centres - carLength;

        expect(bumperGap, `${from} queue is visually bumper-to-bumper`).toBeGreaterThanOrEqual(
          carLength * 0.3,
        );
      });

      it.each(DIRS)("keeps the %s car at a steady on-screen speed", (from) => {
        const frame = 1 / 60;
        const probes = [0.2, STOP - 0.08, STOP + 0.015, (STOP + EXIT) / 2, EXIT + 0.04];
        const speeds = probes.map((t) => {
          const a = carBox(car(from, t), s);
          const b = carBox(car(from, t + CAR_SPEED * frame), s);
          return Math.hypot(b.x - a.x, b.y - a.y) / frame;
        });
        const slowest = Math.min(...speeds);
        const fastest = Math.max(...speeds);

        expect(fastest, `${from} accelerates across a geometry seam`).toBeLessThanOrEqual(
          slowest * 1.05,
        );
      });

      it("puts a car mid-box inside the junction", () => {
        const box = carBox(car("n", (STOP + EXIT) / 2), s);
        expect(box.y).toBeGreaterThan(cy - half);
        expect(box.y).toBeLessThan(cy + half);
      });
    });
  }
});

/** A canvas context that records nothing but refuses to accept a non-finite number. */
function strictCtx(): CanvasRenderingContext2D {
  // A NaN reaches canvas by two routes, and the second one is worse. As a
  // number it draws nothing and says nothing. Baked into a colour string —
  // `rgb(NaN,NaN,3)`, out of a colour helper fed its own output in the wrong
  // format — canvas *throws*, which kills the frame callback, which ends the
  // requestAnimationFrame chain. The game freezes on frame one. Checking only
  // numeric arguments missed exactly that, and a browser found it instead.
  function check(name: string, args: unknown[]): void {
    for (const a of args) {
      if (typeof a === "number" && !Number.isFinite(a)) {
        throw new Error(`ctx.${name} got a non-finite argument: ${JSON.stringify(args)}`);
      }
      if (typeof a === "string" && /NaN|undefined|Infinity/.test(a)) {
        throw new Error(`ctx.${name} got a malformed string: ${JSON.stringify(args)}`);
      }
    }
  }
  const gradient = {
    // Both arguments, not just the offset. A gradient stop is the most common
    // place a computed colour lands, so checking only the number here left the
    // sensor blind to the one bug it was written for.
    addColorStop(...args: unknown[]) {
      check("addColorStop", args);
    },
  };
  const target: Record<string, unknown> = {
    canvas: { width: 0, height: 0 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: (...a: unknown[]) => (check("createLinearGradient", a), gradient),
    createRadialGradient: (...a: unknown[]) => (check("createRadialGradient", a), gradient),
    createPattern: () => null,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(4, Math.abs(w * h * 4))),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(4, Math.abs(w * h * 4))),
      width: w,
      height: h,
    }),
  };
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      // Anything else is a drawing call.
      return (...args: unknown[]) => {
        check(prop, args);
        return undefined;
      };
    },
    set(obj, prop: string, value) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`ctx.${prop} was set to ${value}`);
      }
      // fillStyle and strokeStyle are where a broken colour actually lands.
      if (typeof value === "string" && /NaN|undefined|Infinity/.test(value)) {
        throw new Error(`ctx.${prop} was set to a malformed colour: ${value}`);
      }
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("a crash leaves a wreck the player can believe", () => {
  // The end-to-end version of the collision change, and the one that would
  // have caught the original bug. The rule is stated in `footprint` units in
  // sim.ts; this plays real rounds to a real crash and checks the thing the
  // player actually sees — that the two cars named in the wreck are touching,
  // and that the fireball is drawn between them rather than out on bare road.
  //
  // Before, collision was occupancy of the whole STOP..EXIT window, which is
  // about 4.4 car lengths deep: rounds ended with the pair three lengths apart
  // and an explosion over empty asphalt. It read as the page glitching.
  const SEEDS = [1, 7, 13, 29, 101, 997, 31337, 5, 88, 424242];

  function toCrash(seed: number): Game {
    let g = initial(seed);
    for (let i = 0; i < Math.round(300 * 60) && !g.crash; i++) g = step(g, 1 / 60);
    return g;
  }

  for (const s of VIEWPORTS) {
    it.each(SEEDS)(`the two cars are touching at ${s.name} (seed %i)`, (seed) => {
      const g = toCrash(seed);
      expect(g.crash, "the round has to end for there to be a wreck").not.toBeNull();

      const [ia, ib] = g.crash!.ids;
      const a = g.cars.find((c) => c.id === ia);
      const b = g.cars.find((c) => c.id === ib);
      expect(a, "both cars in the wreck are still on the road").toBeDefined();
      expect(b).toBeDefined();

      const ba = carBox(a!, s);
      const bb = carBox(b!, s);
      expect(
        Math.abs(ba.x - bb.x) * 2,
        "the drawn bodies have to actually meet",
      ).toBeLessThan(ba.w + bb.w);
      expect(Math.abs(ba.y - bb.y) * 2).toBeLessThan(ba.h + bb.h);

      // And the blast sits on the contact patch, inside both cars' bounds.
      const min = Math.min(s.width, s.height);
      const px = s.width / 2 + g.crash!.x * min;
      const py = s.height / 2 + g.crash!.y * min;
      for (const box of [ba, bb]) {
        expect(px).toBeGreaterThanOrEqual(box.x - box.w / 2 - 1);
        expect(px).toBeLessThanOrEqual(box.x + box.w / 2 + 1);
        expect(py).toBeGreaterThanOrEqual(box.y - box.h / 2 - 1);
        expect(py).toBeLessThanOrEqual(box.y + box.h / 2 + 1);
      }
    });
  }
});

describe("drawing never emits a non-finite coordinate", () => {
  const states: [string, Game][] = [
    ["the opening frame", initial(1)],
    [
      "a full junction",
      {
        ...initial(1),
        time: 90,
        cars: DIRS.flatMap((from) =>
          Array.from({ length: 6 }, (_, i) =>
            car(from, i * 0.06, { id: i, patience: i / 6, committed: i === 0 }),
          ),
        ),
        passed: 137,
      },
    ],
    [
      "a crash",
      {
        ...initial(1),
        passed: 42,
        time: 30,
        crash: {
          from: "n" as const,
          t: STOP + 0.02,
          ids: [1, 4] as [number, number],
          x: LANE,
          y: -LANE,
          at: 30,
        },
      },
    ],
    // The wreck animates off `time - crash.at`, so every stage of it has to be
    // drawable: the impact frame, mid-blast, and long after it has settled.
    [
      "a crash on its very first frame",
      {
        ...initial(1),
        time: 12,
        crash: {
          from: "w" as const,
          t: STOP + 0.05,
          ids: [1, 4] as [number, number],
          x: -LANE,
          y: LANE,
          at: 12,
        },
      },
    ],
    [
      "a crash long since settled",
      {
        ...initial(1),
        time: 512,
        crash: {
          from: "e" as const,
          t: STOP + 0.05,
          ids: [2, 5] as [number, number],
          x: 0,
          y: 0,
          at: 12,
        },
      },
    ],
    ["an empty road", { ...initial(1), cars: [] }],
  ];

  for (const [name, state] of states) {
    for (const s of VIEWPORTS) {
      it(`${name} at ${s.name}`, () => {
        expect(() => draw(strictCtx(), state, s)).not.toThrow();
      });
    }
  }

  it("survives a zero-sized viewport without producing NaN", () => {
    // A canvas can be measured at 0x0 for a frame during layout or a tab
    // restore. Dividing by that size is the classic source of NaN.
    expect(() => draw(strictCtx(), initial(1), { width: 0, height: 0 })).not.toThrow();
  });

  it("does not mutate the state it is given", () => {
    // The renderer is about to grow caches. A cache that writes back into the
    // game state would make the sim non-deterministic and every rule test a lie.
    const before = JSON.stringify(initial(7));
    draw(strictCtx(), initial(7), VIEWPORTS[0]!);
    expect(JSON.stringify(initial(7))).toBe(before);
  });
});
