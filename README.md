# Junction

A one-intersection traffic game, built for COMP4020 Crit 5. Hold the lights
against four queues for as long as you can.

**There are deliberately no instructions here, and none in the game.** The brief
requires it to teach itself, and a README that explains the mechanic would be
the same failure as a how-to-play modal, just further away. If you want to know
how it works, play it — that is the whole design.

What this file will say is how the code is arranged.

## Layout

| Path | What it is |
| --- | --- |
| `game/sim.ts` | The rules. Pure, deterministic, DOM-free — no `Date.now`, no `Math.random`, no `document`. A playthrough is a fold over `step()`. |
| `game/render.ts` | Drawing only. Decides nothing about the game. |
| `main.ts` | The rAF loop, input, and the canvas. |
| `spec/game.test.ts` | Contract tests for this week's spec. They play the game headlessly rather than asserting on pixels. |
| `spec/teaches-itself.test.ts` | Contract test holding the no-instructions line. |
| `spec/sensors.test.ts` | A sensor, not a contract — carries forward to next week. |
| `spec/invariants.test.ts` | Shipped with the template. Immutable. |

The split between `sim.ts` and everything else is the load-bearing decision: it
is what lets a test play a whole round, which is how the difficulty ramp and the
"a round always ends" guarantee are checked at all.

## Working on it

```sh
pnpm install
pnpm dev              # local dev server
pnpm check            # typecheck + build + all spec tests
pnpm check:evidence    # process evidence gate, before shipping
```

`spec/*.test.ts` files that read `dist/` need a build first; `pnpm check` does
that for you.

## Process

`PROCESS.md` is the reading guide, with commit citations. `notes/log.md` is the
raw running log, and `reflections/crit-5.md` is the reflection.
