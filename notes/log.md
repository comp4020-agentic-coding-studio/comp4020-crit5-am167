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
