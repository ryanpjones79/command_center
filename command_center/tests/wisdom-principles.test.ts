import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...parts: string[]) {
  return readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

describe("Wisdom & Principles MVP", () => {
  it("adds Wisdom models and reflection storage", () => {
    const schema = readSource("prisma", "schema.prisma");

    expect(schema).toContain("model WisdomEntry");
    expect(schema).toContain("model WisdomReflection");
    expect(schema).toContain("active          Boolean");
    expect(schema).toContain("favorite        Boolean");
    expect(schema).toContain("notebookEntryId String?");
  });

  it("exposes Wisdom from Library and global quick capture", () => {
    const library = readSource("app", "library", "page.tsx");
    const shell = readSource("components", "layout", "app-shell.tsx");

    expect(library).toContain("Wisdom & Principles");
    expect(library).toContain("/library/wisdom");
    expect(shell).toContain("WisdomQuickCapture");
  });

  it("renders Today Principle and supports resurfacing actions", () => {
    const board = readSource("components", "execution", "time-block-board.tsx");
    const card = readSource("components", "execution", "today-principle-card.tsx");

    expect(board).toContain("TodayPrincipleCard");
    expect(card).toContain("Today&apos;s Principle");
    expect(card).toContain("shuffleTodayPrincipleAction");
    expect(card).toContain("toggleWisdomFavoriteAction");
    expect(card).toContain("toggleWisdomActiveAction");
    expect(card).toContain("addWisdomReflectionAction");
  });

  it("allows notebook entries to promote into the Wisdom Inbox", () => {
    const notebookList = readSource(
      "components",
      "library",
      "notebook-entry-list.tsx"
    );
    const service = readSource("server", "wisdom-service.ts");

    expect(notebookList).toContain("Promote to Wisdom");
    expect(service).toContain("promoteNotebookEntryToWisdom");
    expect(service).toContain('status: "inbox"');
  });
});
