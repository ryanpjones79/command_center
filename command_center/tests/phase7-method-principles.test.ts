import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("Phase 7 RyanOS Method and Principles", () => {
  it("renders the full RyanOS Method guide from Library", () => {
    const page = readSource("app", "library", "method", "page.tsx");
    const library = readSource("app", "library", "page.tsx");

    expect(library).toContain('href: "/library/method"');
    expect(page).toContain("RyanOS Method");
    expect(page).toContain("Why RyanOS Exists");
    expect(page).toContain("Most productivity systems encourage you to capture more");
    expect(page).toContain("Paper is where you think.");
    expect(page).toContain("RyanOS is where you commit.");
  });

  it("keeps the required paper versus RyanOS lists exact enough to teach the system", () => {
    const page = readSource("app", "library", "method", "page.tsx");

    for (const item of ["Read", "Reflect", "Think", "Sketch", "Meetings", "Prayer", "Meditation", "Questions"]) {
      expect(page).toContain(`"${item}"`);
    }

    for (const item of ["Commit", "Projects", "Time Blocks", "Tasks", "Reviews", "Calendar", "Notebook Index"]) {
      expect(page).toContain(`"${item}"`);
    }
  });

  it("includes daily rhythm, weekly rhythm, reset, and season philosophy", () => {
    const page = readSource("app", "library", "method", "page.tsx");

    expect(page).toContain("Morning Compass");
    expect(page).toContain("Needle Move");
    expect(page).toContain("Weekly Theme");
    expect(page).toContain("Commit only what matters.");
    expect(page).toContain("Life happens in seasons.");
    expect(page).toContain("Needle Moves support today.");
  });

  it("updates Today compact card with a Learn More link", () => {
    const card = readSource("components", "execution", "how-ryanos-works-card.tsx");

    expect(card).toContain("Learn More");
    expect(card).toContain('href="/library/method"');
    expect(card).toContain("Paper is where you think. RyanOS is where you commit.");
  });

  it("adds a one-time browser onboarding gate without database persistence", () => {
    const gate = readSource("components", "layout", "method-onboarding-gate.tsx");
    const shell = readSource("components", "layout", "root-shell.tsx");

    expect(gate).toContain("ryanos-method-seen-v1");
    expect(gate).toContain("window.localStorage");
    expect(gate).toContain('router.replace("/library/method?from=onboarding")');
    expect(shell).toContain("<MethodOnboardingGate />");
  });

  it("provides a condensed print version and avoids schema changes", () => {
    const page = readSource("app", "library", "method", "page.tsx");
    const css = readSource("app", "globals.css");
    const schema = readSource("prisma", "schema.prisma");

    expect(page).toContain("method-print-root print-only");
    expect(page).toContain("<PrintBrowserButton />");
    expect(css).toContain(".method-print-grid");
    expect(css).toContain(".method-print-card");
    expect(schema).not.toContain("RyanOsMethod");
    expect(schema).not.toContain("PrincipleScore");
  });
});
