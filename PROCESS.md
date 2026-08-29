# Process overview

## Moments that mattered

**The probe, not guesswork, found three real bugs before any tuning.**
[`d369dc1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/d369dc1)
— a throwaway headless script ran three policies (idle / masher / greedy)
across ten seeds instead of guessing at constants. It found, in order: cars
spawning already colliding with the stop line, mashing causing switch-time
collisions, and a competent player reaching an equilibrium the game could
never end from. None of the three would have turned up from reading the code.

**Constant visual speed, found by profiling rather than eyeballing.**
Chrome profiling — not a test, not a playtest — caught that cars appeared to
speed up crossing the junction: `CAR_SPEED` never changed in the simulation,
but the renderer stretched the narrow STOP→EXIT interval across the crossing
and intersection, producing a 1.53x jump on east-west approaches and 3.12x on
north-south ones. Anchoring `along()` to a single constant world-distance
scale fixed the seam; a render speed-continuity regression across all four
directions and every marked viewport now guards it.
