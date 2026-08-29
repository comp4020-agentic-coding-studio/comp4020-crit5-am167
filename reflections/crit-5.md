# Crit 5 — Junction

## What was the breakthrough that moved the work forward?

I had a clear mental model of the intersection, so I tuned constants by
reasoning about them instead of testing. The breakthrough was automating
three player behaviours — idle, mashing controls, playing well — and running
each many times instead of reading the code once more. That surfaced a bug no
amount of reading would have: the difficulty ramp settled into a stable
equilibrium just below failure, so a skilled player could survive forever,
and the spec requires the game to be finishable. Nothing about that showed in
a screenshot or a single line of code; it only appeared as a pattern across
repeated runs. It changed what I reach for when I'm confident about a
system's behaviour under load: run it, don't re-read it.

## What did this work change about who I want to be as a software developer?
