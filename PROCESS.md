# Process overview

## What I built

**Junction** — a one-intersection traffic game. Four approaches feed a single
signalised crossroads seen from the mast above it; drivers queue, lose patience,
and eventually stop waiting. A round ends in a wreck, and the score is the
number of cars that got through before it.

The load-bearing decision is the split: `game/sim.ts` holds the rules and is
pure, deterministic and DOM-free — no clock, no `Math.random`, no `document` —
so a whole playthrough is a fold over `step()`. `game/render.ts` draws and
decides nothing. That is what lets `spec/game.test.ts` play entire rounds
headlessly across ten seeds, which is how the difficulty ramp and the
"a round always ends" guarantee are checked at all.

## Moments that mattered

**The probe, not guesswork, found three real bugs before any tuning.**
[`d369dc1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/d369dc1)
— a throwaway headless script ran three policies (idle / masher / greedy)
across ten seeds instead of guessing at constants. It found, in order: cars
spawning already colliding with the stop line, mashing causing switch-time
collisions, and a competent player reaching an equilibrium the game could
never end from. None of the three would have turned up from reading the code.

**Measuring the complaint disproved it, and the real bug was in the rules.**
[`3427793`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/3427793)
— the crash scene was reported as laggy. Sampling frame times in Chrome said
otherwise: a locked 60 fps in both phases, zero frames over 20 ms across 2,500
samples. The lag was real as an experience and false as a diagnosis, and taking
the measurement first is what stopped me optimising a renderer that was fine.

What was actually wrong was the collision rule. Two cars crashed when both were
anywhere inside `STOP..EXIT` — a window about 4.4 car lengths deep — so a round
ended with the pair three lengths apart and a fireball over bare asphalt. A
freeze-frame of that reads as a hung page, which is exactly what it was
reported as. Cars now collide when their bodies overlap, which meant the
geometry deciding that (`CAR_LEN`, `CAR_WIDE`, `ROAD_HALF`, `STOP_SETBACK`) had
to move out of the renderer and into the sim: how big a car is turns out to be
a rule, not a proportion. A test pins the sim's `footprint()` against the
renderer's `carBox()` at three aspect ratios so the two can never drift again.

The check I value most is the end-to-end one: play ten seeds to a real crash at
three viewports, then assert the two cars named in the wreck have overlapping
drawn bodies and that the blast point lies inside both. That is the original
bug restated as a contract — 40 cases — and it would have failed loudly on the
old rule.
