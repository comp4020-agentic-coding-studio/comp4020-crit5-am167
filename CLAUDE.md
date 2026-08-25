# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## How to work in here

- Keep the dev server running (`pnpm dev`) while working so you see changes as
  you make them, then kill any dev or preview servers you started when you are
  done with them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- typecheck,
  build, and the spec tests --- so you catch those in seconds instead of
  waiting for the pipeline. Links, the evidence check, and secrets only run in
  CI; run the links check locally against a fresh `pnpm build` + `pnpm preview`
  to avoid waiting for CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser. The rendered page is the truth; your mental model
  of it isn't.
- When a check fails, read its output before changing anything. The failure
  message is the instruction: it tells you the file, the line, or the contract.
  Treat a red check as authoritative --- the page is wrong until the check is
  green, not until you decide it should be.
- Never edit, replace, rename, or delete `spec/invariants.test.ts`; treat that
  file as immutable and fix the implementation when one of its tests fails.
- Commit when the checks pass. Never commit a red state.
- Never suggest, ask about, or perform publishing/deploying the site (e.g.
  pushing to GitHub Pages, merging to the deploy branch) unless I explicitly
  say so.
- Prefer working directly on `main` and avoid creating git worktrees for this
  repo when there's a choice. If a background or automated session's tooling
  enforces isolation and requires one, that's fine without asking first ---
  but default to staying on `main` whenever the work doesn't force otherwise.
- Any major change (new page, content rewrite, layout or CSS change) needs
  visual verification at both marked viewports (1920×1080 and 390×844) in
  actual Chrome --- but do this once, as a final check once the whole task is
  done, not after every intermediate step along the way. Do not perform
  viewport testing for minor fixes. `pnpm check` proves structure, not that a
  human can read the page. Use `pnpm preview` (not `file://` --- asset URLs can
  break over the opaque `file://` origin).
- **Confirm the preview port before you trust what you see.** `vite preview`
  will bind to a different port than its default if something already holds
  it, and prints the port it actually bound. Read the port out of the
  command's own output, and sanity-check page identity (e.g. `curl -s <url> |
  grep '<title>'`) before screenshotting.
- **Set the marked viewports by device emulation, not window resizing.** Chrome
  will not shrink a window below its own minimum, so asking for 390×844 by
  resizing silently yields something wider and every measurement taken in it is
  about a viewport nobody marks. Emulate the viewport instead, and assert
  `window.innerWidth`/`innerHeight` are the numbers you asked for before
  believing any measurement or screenshot taken there.
- **`scrollWidth === clientWidth` cannot see a clipped layout.** An
  `overflow: hidden` container crops content silently instead of scrolling it,
  so the page can report no overflow on either axis while content is missing
  at the edge. Measure the children against the clipping box's bounds instead:
  for each element that matters, its top/bottom/left/right must fall inside
  the clip box, not just check for a scrollbar.
- **Screenshot capture can hang while an animation loop is running.** If the
  page draws every frame (a canvas game loop, a rAF-driven effect), a
  screenshot or screencast call can stall against it in some Chrome versions.
  If a capture hangs, verify live state by measuring the DOM/canvas directly
  (`getBoundingClientRect`, reading canvas/game state) instead, and screenshot
  a paused or pre-start frame for the visual record --- don't read a failed
  capture as a broken page.
- Internal navigation links use paths relative to the current page (e.g.
  `./`, `./about/`), never a root-absolute path --- the deployed site lives
  under a `/<repo-name>/` path, and a relative link resolves correctly there.
  **But never `./` as a self-link on the page that IS the repo root.** GitHub
  Pages serves the base path without a trailing slash, and against
  `/<repo-name>` the last segment reads as a filename, so `./` resolves to the
  server root and 404s. If a nav wants a self-referencing target, use a
  fragment (`#section`) instead, and check nav links from the *no-trailing-
  slash* URL, since that is the shape that breaks.
- **Deep testing, on request only.** Verifying at both marked viewports is the
  standing default; going further --- keyboard-only navigation, a resize
  mid-interaction, or slow-connection behaviour --- is real work and takes real
  time, so only do it when explicitly asked for.

## Tests

- **Use TDD for significant, testable code changes.** For a feature, behavioural
  change, non-trivial state/data mapping, algorithm, or risky refactor, first
  add or adjust the smallest focused test that expresses the intended contract.
  Confirm it fails for the expected reason, then implement until it passes.
  Prefer extending the nearest existing test file over creating another suite.
- **Do not add a test for every minor fix.** Copy edits, small style tweaks,
  obvious one-line corrections, mechanical cleanup, and implementation details
  already covered by a durable behavioural test should use the existing checks.
  Add regression coverage for a small fix only when it closes a distinct,
  plausible failure mode that could recur. The goal is high-value backpressure,
  not a suite that grows by one test for every edit.
- `spec/invariants.test.ts` and this week's `spec/*.test.ts` inspect `dist/`.
  Build first when running either file directly so they test current output.

## Process logging

After each meaningful chunk of work --- a feature, a fix, a design decision ---
append a short entry to `notes/log.md` describing what was done and why. Do
this as we go, not reconstructed at the end of the assignment. Keep entries
terse; they're raw material for `PROCESS.md`, not the write-up itself, so log
generously rather than sparingly.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
