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

## Playtest on the finished build

Two hypotheses about feel, one wrong and one right — and only playing separated them.

**Wrong:** I expected the all-red clearance after a switch to read as the game ignoring the
click, causing players to double-toggle and undo themselves. Measured it across a real 54s
round: longest all-red was 159ms, and only one blackout over 120ms. Not a problem. Assuming it
would have been would have cost a fix nobody needed.

**Right (the spec-line-5 change):** played through to an actual crash and the game-over score is
drawn dead centre — directly on top of the wreck. The crash mark is the only answer the player
gets to "what did I do wrong": it shows *which approach* finally gave up waiting. Hiding it
behind the number turns an earned loss into an arbitrary one. Score now sits above the junction
and the wreck draws last and larger, so both are legible.

This one is invisible from the code. Reading `draw()` it is obvious the number is centred and
obvious the star is centred; nothing says they collide, because nothing says the crash matters
more. You only see it having just lost.

## Calming down, and the guard rail catching me

Looking at 1920x1080 found something the tests could not: a bright red (fully impatient) car near
the *top* of the north lane, nowhere near the junction. Queue-wide patience meant it boiled over
eight cars back, latched `committed`, then got a clear run — so it was pre-committed to running a
red it would not reach for seconds. Crashes could trace to a grievance from half a minute and a
free run ago, which is the unfair-feeling loss the commit rule existed to prevent.

Two one-line fixes: a moving car sheds patience (CALM_RATE), and impatience only cashes in at the
front of the queue within sight of the line.

Then the "a round always ends" test went red across 11 cases — calming had made the game
unlosable again. That test exists precisely because I once shipped an equilibrium I could not
see, and this time it caught the same class of regression before I could. Re-measured rather than
guessed: PATIENCE_MIN 0.7→0.35, SPAWN_MIN 0.2→0.14, CALM_RATE 0.55→0.3, RAMP 55→46.

Now: idle 7–41s, competent 152–266s (all under the 300s the spec implies), masher 189–333s.
Nothing survives.

## Graphics overhaul: a lit junction instead of a diagram

Total rewrite of `game/render.ts`. Sim untouched — every rule, and every test over the rules,
is exactly as it was. Direction: a wet junction at 2am seen from the traffic mast. Everything
built is grey and textured (asphalt grain, polished wheel tracks, kerbs with a lit top face and
a shadow under them, concrete footpaths with paving joints, worn thermoplastic paint, a faint
box-junction hatch). Saturated colour is spent on three things only: the signals, the cars' own
lamps, and patience running out. That is a gameplay decision wearing an aesthetic one's clothes —
the only coloured things on screen are the things the player has to look at.

Cars are drawn properly now: body with a sheen gradient across it, cabin, windscreen and rear
glass, mirrors, tyres, headlights throwing a cone down the lane, brake lights that come on when
stopped. Signal heads got a housing with three lenses. Street lamps run staggered down every
approach. Background and vignette are cached offscreen layers, rebuilt only on resize.

**TDD, and what it did and did not catch.** Wrote `spec/render.test.ts` first against exported
`carBox`/`roadHalfWidth`: cars stay inside their carriageway, never cross into the opposing lane,
and a car waiting at STOP stops *behind* the paint rather than nosing into the box. It failed for
the right reason (helpers didn't exist), then drove the geometry. That found a real latent
problem: `t` was being drawn as the car's centre, so a waiting car overhung the intersection by
half its length. Cars now track their *nose*, which is what STOP and the collision box are
actually defined against.

**Where the tests were not enough.** First run in a real browser: the game froze on frame one.
`mix()` returned `rgb(...)`, `shade()` read it as hex, and the result was
`fillStyle = "rgb(NaN,NaN,3)"` — which canvas *throws* on, which killed the frame callback, which
ended the rAF chain. 70 green tests, dead game. My strict-context stub only checked numeric
arguments, and this NaN was inside a string; worse, the gradient stub's `addColorStop` was
checking the offset and ignoring the colour, which is precisely where the bad value landed.
Fixed the renderer (every colour helper returns hex so they compose; `parse` reads both forms),
then fixed the sensor to reject `NaN|undefined|Infinity` inside strings *and* to check every
`addColorStop` argument. Verified the sensor has teeth by reintroducing the original bug: 14
failures naming `rgb(NaN,NaN,3)` exactly. That is the lesson worth keeping — a test that cannot
fail is not backpressure, and I only knew it could fail because I made it.

**Where looking at it was not optional.** Three defects no test would ever have raised, all
found by opening the page:

- Vignette at 0.62 plus a near-black ground swallowed the far ends of both roads. Cars queueing
  out there were invisible — and a patience bar you cannot see until the car reaches the middle
  is a warning that arrives after the thing it was warning about. Down to 0.3, palette lifted.
- I had shrunk the road to get a realistic lane-to-car width ratio and made the game unreadable:
  a tiny cross in a huge black field. Realism lost to legibility; ROAD_HALF back to 0.075.
- The kerbs were drawn straight through the junction and then the box was painted back over the
  top to erase them — which also erased the box's grain and wheel tracks. The junction came out a
  flat pale square, the brightest thing on screen, pulling the eye to the one place nothing was
  happening. Rewrote it to draw kerbs as explicit segments that stop at the box.

Also moved the street lamps off the junction's corners (where they crowded the signals and lit
the brightest part of the scene) out along the approaches, where the queues and their patience
bars actually are. And replaced the crash's hard ring — it read as a crosshair, the one thing on
screen that looked like interface rather than world — with a soft blast halo.

Verified at both marked viewports by device emulation with `innerWidth`/`innerHeight` asserted
(1920x1080 and 390x844), plus a crash frame. Frame budget under a live junction: 8.3ms median,
9.3ms worst, against 16.7ms.
