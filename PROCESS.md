# Process overview

## What I built

Junction is a traffic game built around a single intersection. Cars approach from four directions while you control the traffic lights, trying to keep everyone moving before drivers lose patience. The round ends when a crash happens, and your score is based on how many cars you managed to get through safely.


## Moments that mattered

**Measuring the complaint disproved it, and the real bug was in the rules.**
[`3427793`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/3427793)
I told the agent that the crash scene was feeling laggy, so I had the agent measure the frame rate before making any changes. The results showed the game was still running smoothly at 60 fps, which meant the lag was real as an experience, but not actually a performance problem. The issue was the collision logic. The game could register a crash while the two cars were still visibly several car lengths apart, so the explosion appeared over empty road and made the scene look frozen. I had the agent change the rule so a crash only happens when the cars themselves overlap. That change also meant the game logic needed to understand the actual size and position of each car, rather than leaving that information only in the renderer. I then had the agent add tests at different screen sizes to make sure what the simulation considers a crash always matches what the player sees on screen.

**The probe, not guesswork, found three real bugs before any tuning.**
[`d369dc1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-am167/commit/d369dc1)
I had the agent test the game automatically in a few different ways instead of just making assumptions about how it would behave. I told it to simulate a player doing nothing, repeatedly pressing controls, and playing as effectively as possible, then repeat those tests across multiple runs. That uncovered three issues: cars could spawn in an invalid position, rapidly pressing controls could cause collisions during a light change, and a skilled player could eventually reach a state where the game would continue forever. None of those problems were obvious from just reading the code.
