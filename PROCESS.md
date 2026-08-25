# Process overview

## What I built

**Junction** is a one-intersection traffic game. East–west or north–south has
the green; any click, tap, Space or Enter swaps which. Cars queue at the red,
and a car that has waited too long stops waiting — it runs the red regardless
of the light, and if something is crossing when it does, the round ends. The
score is the number of cars you got through. There are no instructions
anywhere: a red light and a stopped car are two of the few genuinely universal
affordances, and the game leans entirely on that.

## The idea, and the hole in it

The first version of the idea was "cars arrive faster over time." I pushed back
on my own premise before building anything: *more cars, faster* is volume
scaling, not depth. The player makes the same decision more often, so at thirty
seconds and at three minutes they are thinking exactly the same thought. Five
minutes of attention needs something under the surface, and a reflex tax isn't
it.

The fix was **impatience**. Starving an approach to serve the busy one now costs
something, so every switch is a genuine trade-off and the skill that sharpens is
reading four queues against each other rather than clicking faster.

## Where the real design happened

Nearly all of it happened in the gap between what I believed and what I
measured, and each step is a commit.

[`a1ff545`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/a1ff545)
— the simulation, built pure and DOM-free on purpose, with the three rules
driven out by tests first. `game/sim.ts` never touches `Date.now`,
`Math.random` or the document, so a whole playthrough is a fold over `step()`.
That one decision is what made everything after it possible: the tests *play the
game* instead of asserting on pixels. The rule tests were written first and
failed for the right reason — an inert `step()` where cars never moved.

[`d369dc1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/d369dc1)
— rather than guess at constants, I wrote a throwaway headless probe running
three policies (do nothing / mash / play well) across ten seeds. It found three
things in order, none of which I would have found by reading:

1. **Everyone died in 0.6s.** A car resting *on* the stop line counted as being
   inside the intersection, so the opening state was already a collision.
2. **Mashing died in 1.0s.** My commit rule stopped cars freezing mid-junction,
   but created the reverse problem — a newly-greened car drove into one still
   clearing. Adding an all-red clearance fixed it, and the *consequence* is the
   best thing in the game: once switching can never cause a crash, impatience
   becomes the only way to lose. Every loss now traces to an approach the
   player starved. The mechanic and the failure became the same thing.
3. **A competent player survived forever.** With a ramp that levelled off, the
   junction settled into an equilibrium just under failure: twenty-car queues,
   patience peaking at 0.8, nobody ever bolting. Nothing looked broken; it just
   could not be finished, which is the one thing the spec forbids.

Then I opened it in Chrome, which found what the probe structurally could not
see: the simulation's stop line and the *painted* one were in different places,
because `t` is normalised per-axis while the junction is square in pixels. Cars
were queueing inside the intersection. The probe had no opinion about this,
because the probe has no eyes.

[`8933c0a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/8933c0a)
— the change that came from playing the finished build rather than reading it.
Played through to an actual crash and the game-over score sits dead centre,
directly on top of the wreck. The wreck is the only answer the player gets to
"what did I do wrong" — it names the approach that finally gave up waiting — so
hiding it behind the number turns an earned loss into an arbitrary one. Reading
`draw()` this is invisible: it is obvious the number is centred and obvious the
star is centred, and nothing in the code says the wreck matters more.

The same commit records a hypothesis that playing **disproved**. I was
confident the all-red clearance would read as the game ignoring your click, and
was ready to fix it. Measured across a real round: longest all-red was 159ms,
one blackout over 120ms in 54 seconds. Not a problem. I would have spent the
fix anyway.

## What the tests do, and what they refuse to do

The suite splits along the line `spec/README.md` draws.

**Contract tests** answer this week's brief and retire with it.
`spec/game.test.ts` puts the rules under test — a red stops a car, a committed
car finishes crossing, crossing cars collide — and then answers two spec lines
directly by playing the game headlessly: *it can be lost* (a player who does
nothing always crashes) and *a round always ends* (pinned against a
deliberately **competent** policy across ten seeds, because a game that ends for
someone playing well certainly ends for someone meeting it cold). That second
test exists because of failure 3 above; it is the guard rail on the ramp.
`spec/teaches-itself.test.ts` holds the no-instructions line, checking
attributes too so a tooltip can't smuggle a tutorial in the side door.

**A sensor** — `spec/sensors.test.ts` — is harness, not contract, and travels
to next week's repo. The shipped invariants check a description *exists*, not
that it says anything, so template placeholder text passes every check in the
repo while being the first thing a marker or a link preview sees. It is
invisible precisely because it is well-formed. Catching it once is cheaper than
remembering to look every week.

What the tests deliberately don't do is judge the game. A test can prove a
collision ends the round; only four people at a keyboard can say whether the
opening screen makes the first move obvious. `spec/teaches-itself.test.ts` says
so in its own header rather than pretending otherwise.

## How I directed and corrected the work

The pattern that actually worked was **refusing to trust my own reasoning about
dynamics**. Three times I had a confident mental model — the opening is fine,
switching is safe, the ramp is hard enough — and three times measurement said
otherwise. The probe was twenty lines and threw away; it changed the design more
than any amount of re-reading would have.

The corrections that mattered ran in both directions: the probe caught what the
browser couldn't (equilibrium invisible in a screenshot), and the browser caught
what the probe couldn't (geometry invisible to a number). Neither on its own
would have shipped this. I also killed one fix I was about to make, which I
count as the same skill.

The one piece of harness I added to `CLAUDE.md`'s toolkit this week is the
boilerplate sensor, for the reason above: it closes a failure mode that is
silent by construction.
