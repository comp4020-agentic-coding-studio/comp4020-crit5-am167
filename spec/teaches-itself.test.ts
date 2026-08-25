import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// C5 contract test: "It teaches itself — no instructions on screen or off; the
// opening screen invites the first move and play teaches the rest."
//
// Only half of that line is mechanically checkable. Whether the opening screen
// actually invites the first move is a question for four people at a keyboard,
// and this file does not pretend otherwise. What it can do is hold the line
// that no text crept back in — which is the failure mode with a real gravity
// to it, because the temptation to add "click to change the lights" arrives
// exactly when someone doesn't get it.
//
// Retires with this brief.

const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8")).window.document;

/** Everything a player would actually read on the page. */
function visibleText(): string {
  const body = doc.body.cloneNode(true) as HTMLElement;
  // The name of the game, and the skip link, are allowed: one labels, the
  // other is an accessibility affordance. Neither explains how to play.
  body.querySelector("h1")?.remove();
  body.querySelector(".skip")?.remove();
  for (const s of body.querySelectorAll("script")) s.remove();
  return body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("the page teaches itself", () => {
  it("ships no prose at all", () => {
    expect(
      visibleText(),
      "the game has to be legible without being told; anything here is a tutorial",
    ).toBe("");
  });

  it("names the game without explaining it", () => {
    const h1 = doc.querySelector("h1")?.textContent?.trim() ?? "";
    expect(h1).toBe("Junction");
    // Naming is explicitly allowed by the brief. A sentence is not a name.
    expect(h1.split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it("has no how-to-play language anywhere in the markup", () => {
    // Including attributes, so an aria-label or a title tooltip cannot smuggle
    // the tutorial back in through the side door.
    const markup = doc.documentElement.outerHTML.toLowerCase();
    const tells = [
      "how to play",
      "instructions",
      "click to",
      "tap to",
      "press space",
      "arrow keys",
      "objective",
      "your goal",
      "the rules",
      "tutorial",
      "get started",
    ];
    for (const tell of tells) {
      expect(markup, `"${tell}" is the page explaining itself`).not.toContain(tell);
    }
  });

  it("offers exactly one thing to do, so there is no wrong target to miss", () => {
    // No buttons, no menus, no settings: any click anywhere is the control.
    expect(doc.querySelectorAll("button, select, input").length).toBe(0);
    expect(doc.querySelectorAll("canvas").length).toBe(1);
  });
});
