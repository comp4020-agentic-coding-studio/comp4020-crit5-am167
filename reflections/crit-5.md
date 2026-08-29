# Crit 5 — Junction

## What was the breakthrough that moved the work forward?

I had a clear idea of how the intersection should behave, so at first I was adjusting values based on intuition rather than testing them properly. I eventually had the agent automate three types of player behaviour: doing nothing, mashing the controls, and playing well. That exposed a problem I would not have found by just reading the code: the difficulty could settle into a stable state where a skilled player could keep going forever, even though the game was supposed to always be finishable.
The issue only became obvious as a pattern across repeated runs. It changed how I approach systems I think I already understand: test the behaviour instead of relying on another pass through the code.

## What did this work change about who I want to be as a software developer?
I want to get better at treating my understanding of a system as something to test, not something to assume is correct. The lesson for me is to test my assumptions early, especially when I feel certain about them. A quick automated run that can prove me wrong is often more useful than reading through the code again, because some problems only appear through behaviour, not inspection.