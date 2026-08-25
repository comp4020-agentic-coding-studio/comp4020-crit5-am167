import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// SENSORS — harness, not this week's contract.
//
// These assert standards I hold the agent to whatever the brief is, so they
// travel to next week's repo with CLAUDE.md. Nothing here knows what Junction
// is or that this week wanted a game.
//
// Why this one: the shipped invariants check that a description and a card
// *exist*, not that they say anything. The template ships placeholder text in
// exactly those fields, and placeholder text passes every check in the repo
// while being the first thing a marker or a link preview sees. It is invisible
// precisely because it is well-formed. Catching that once and wiring it into
// `check` is cheaper than remembering to look every week.

const DIST = resolve("dist");

function files(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const pages = files()
  .map((path) => relative(DIST, path).split(sep).join("/"))
  .filter((name) => name.endsWith(".html"))
  .map((name) => ({
    name,
    doc: new JSDOM(readFileSync(join(DIST, name), "utf8")).window.document,
  }));

/** Phrases that only ever appear because nobody replaced them. */
const BOILERPLATE = [
  "replace this with",
  "lorem ipsum",
  "comp4020 prototype",
  "your prototype",
  "this week's brief",
  "spec/readme.md",
  "todo",
  "coming soon",
];

describe("sensor: nothing shipped still says what the template said", () => {
  it("built at least one page", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const { name, doc } of pages) {
    describe(name, () => {
      it("has a description written for this site", () => {
        const description =
          doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
        for (const phrase of BOILERPLATE) {
          expect(
            description.toLowerCase(),
            "this is the sentence a search result and a link preview both show",
          ).not.toContain(phrase);
        }
        // A description that says nothing is as useless as one left blank.
        expect(description.split(/\s+/).length).toBeGreaterThan(4);
      });

      it("has a title that is not the template's", () => {
        expect(doc.title.trim().toLowerCase()).not.toBe("comp4020 prototype");
      });

      it("carries no leftover template prose in the body", () => {
        const text = (doc.body.textContent ?? "").toLowerCase();
        for (const phrase of BOILERPLATE) {
          expect(text, `"${phrase}" is template text that shipped`).not.toContain(phrase);
        }
      });
    });
  }
});
