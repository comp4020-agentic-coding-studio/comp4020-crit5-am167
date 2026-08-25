# Process log

Raw material for `PROCESS.md` --- terse entries after each meaningful chunk of work.

## Junction — sim first, pure and headless

`game/sim.ts` is DOM-free and deterministic (seeded mulberry32, no `Date.now`/`Math.random`).
A playthrough is a fold over `step`, so the tests play the game rather than assert on pixels.

TDD on the three rules: wrote spec/game.test.ts first, confirmed 4 of 5 failed for the right
reason (inert `step` — cars never moved, no collision detection), then implemented until green.
The 1 early pass was the negative same-axis guard, which passes trivially with no collisions.

Two rules carry the design:
- **Commit rule** — past STOP a car never stops again. Without it, flipping the light freezes a
  car mid-box and the crash reads as stolen. The brief names exactly this ("only playing can
  tell you whether the collision feels fair").
- **Impatience** — only the *head* of a queue accrues patience, and only when the light (not the
  car in front) is holding it. So every red-runner is traceable to an approach the player
  starved: the loss is legibly your own fault, which is what makes the retry attractive.

Caught while wiring up: tsconfig `include` was `["*.ts","spec","scripts"]`, so a `game/` dir
would have silently skipped typecheck. Added `"game"`.

## Tuning: three bugs the probe found that reading the code would not have

Wrote a throwaway headless probe (idle / masher / greedy policies × 10 seeds) instead of
guessing at constants. It found three things in order:

1. **Everyone died in 0.6s.** A car resting *on* the stop line counted as being inside the
   intersection, so the opening state was already a collision. The box must be exclusive at
   STOP — which also makes it agree with the commit rule, so "past the line" means one thing.
2. **Mashing died in 1.0s.** The commit rule stops cars freezing mid-box, but creates the
   reverse: a newly-greened car drives into one still clearing. Real intersections use an
   all-red clearance; adding it means switching can never cause a crash. The consequence is the
   good part — **impatience becomes the only way to lose**, so every loss traces to an approach
   the player starved. Mechanic and failure are now the same thing.
3. **A competent player survived forever.** With the ramp clamped, the junction settled into an
   equilibrium just under failure: ~20-car queues, patience peaking at 0.8, never bolting.
   Also found that only the *head* of a queue grew impatient, so a saturated approach generated
   no pressure at all. Fixed both: every stopped car accrues patience, and the ramp decays
   asymptotically instead of plateauing.

After: idle 7–47s, competent 129–175s, masher 196–292s. Always ends, well inside five minutes.

Then opened it in Chrome, which found what the probe could not see: the sim`s stop line and the
painted one were in different places, because `t` is normalised per-axis while the junction is
square in pixels. Cars queued *inside* the intersection. Render now maps t piecewise
(approach / box / exit) so STOP lands on the kerb at any aspect ratio.
