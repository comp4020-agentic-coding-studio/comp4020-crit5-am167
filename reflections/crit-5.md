# Crit 5 — Junction

## What was the breakthrough that moved the work forward?

Writing a twenty-line throwaway probe instead of tuning constants by reasoning
about them.

I had a clear mental model of how the intersection behaved, and it was wrong
three separate times. The opening state was already a collision. Switching the
light could cause a crash, which meant the game punished you for doing the only
thing it asks. And a competent player survived indefinitely, because the
difficulty ramp levelled off into a stable equilibrium just below failure —
queues holding at twenty cars, patience peaking at 0.8, nobody ever bolting.
That last one is the frightening kind of bug: nothing looks broken. The game
runs, the cars move, the score climbs. It simply cannot be finished, and the
spec requires that it can.

The breakthrough wasn't the probe itself so much as noticing that the probe and
the browser fail in *opposite* directions. The probe found an equilibrium no
screenshot could show. The browser then found that my stop line and my *painted*
stop line were in different places — cars were queueing inside the junction —
which the probe structurally could not see, because it has no eyes. Neither tool
alone would have shipped this. Deciding which question goes to which instrument
turned out to be most of the skill.

The other half of it was the fix I *didn't* make. I was sure the all-red
clearance after a switch would read as the game ignoring your click, and I was
ready to change it. I measured first: 159ms at worst, once, in a full round. I
would have spent a real fix on a problem that did not exist.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who treats a confident mental model as a
hypothesis with a cost attached, rather than as knowledge.

What struck me is that all three of my errors were errors about *dynamics* —
about what a system does over time under load — and none of them were visible in
the code. Every line was individually defensible. Reading harder would not have
helped; I did read harder, and found nothing. The only thing that worked was
making the system run and watching what it actually did.

That has changed what I reach for first. My instinct used to be to re-read code
until I understood it. I now think that instinct is close to useless for
anything with feedback in it, and I would rather spend twenty lines on something
disposable that answers the question empirically. I also want to keep the habit
of writing down disproved hypotheses, not just fixed bugs — the clearance
non-problem is the entry I'm most likely to need again, because next time I will
be equally sure, and equally wrong.
