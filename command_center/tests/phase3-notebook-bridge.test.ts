import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { notebookEntrySchema, notebookEntryTypes } from "@/lib/notebook-options";
import {
  buildNotebookEntryWhere,
  getActiveNotebook,
  normalizeNotebookFilters
} from "@/server/notebook-service";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("Phase 3 Notebook Bridge", () => {
  it("adds Notebook and NotebookEntryIndex to both Prisma schemas", () => {
    for (const schemaName of ["schema.prisma", "schema.postgres.prisma"]) {
      const schema = readSource("prisma", schemaName);

      expect(schema).toContain("model Notebook {");
      expect(schema).toContain("model NotebookEntryIndex {");
      expect(schema).toContain("notebooks         Notebook[]");
      expect(schema).toContain("notebookEntries   NotebookEntryIndex[]");
      expect(schema).toContain("@@unique([userId, number])");
      expect(schema).toContain("@@index([notebookId, pageNumber])");
      expect(schema).toMatch(/project\s+ExecutionProject\?/);
      expect(schema).toMatch(/domain\s+ExecutionDomain\?/);
    }
  });

  it("keeps entry types exact and validates required entry fields", () => {
    expect(notebookEntryTypes.map((type) => type.label)).toEqual([
      "Insight",
      "Decision",
      "Project Note",
      "Spiritual Reflection",
      "Meeting",
      "Idea",
      "Reference"
    ]);

    expect(
      notebookEntrySchema.safeParse({
        notebookId: "",
        pageNumber: "",
        title: "",
        entryType: "decision"
      }).success
    ).toBe(false);

    expect(
      notebookEntrySchema.safeParse({
        notebookId: "notebook_1",
        pageNumber: "42",
        title: "CTCC supervisor buckets",
        entryType: "decision"
      }).success
    ).toBe(true);
  });

  it("infers an active notebook only when exactly one notebook is incomplete", () => {
    const openNotebook = { id: "open", completedAt: null };

    expect(getActiveNotebook([openNotebook, { id: "done", completedAt: new Date() }])).toEqual(
      openNotebook
    );
    expect(getActiveNotebook([openNotebook, { id: "open_2", completedAt: null }])).toBeNull();
    expect(getActiveNotebook([{ id: "done", completedAt: new Date() }])).toBeNull();
  });

  it("builds metadata-only search filters across notebook, page, title, type, area, project, and date", () => {
    const normalized = normalizeNotebookFilters({
      query: "CTCC",
      notebookId: "notebook_3",
      entryType: "decision",
      domainId: "domain_1",
      projectId: "project_1",
      date: "2026-07-03"
    });
    const where = buildNotebookEntryWhere("user_1", {
      query: "42",
      notebookId: "notebook_3",
      entryType: "decision",
      domainId: "domain_1",
      projectId: "project_1",
      date: "2026-07-03"
    });

    expect(normalized.entryType).toBe("decision");
    expect(where).toMatchObject({
      userId: "user_1",
      notebookId: "notebook_3",
      entryType: "decision",
      domainId: "domain_1",
      projectId: "project_1"
    });
    expect(JSON.stringify(where)).toContain("pageNumber");
    expect(JSON.stringify(where)).toContain("notebook");
    expect(JSON.stringify(where)).toContain("domain");
    expect(JSON.stringify(where)).toContain("project");
  });

  it("keeps notebook CRUD and authorization checks user-scoped in the service", () => {
    const service = readSource("server", "notebook-service.ts");

    expect(service).toContain("export async function createNotebook(");
    expect(service).toContain("export async function updateNotebook(");
    expect(service).toContain("export async function deleteNotebook(");
    expect(service).toContain("export async function createNotebookEntry(");
    expect(service).toContain("export async function updateNotebookEntry(");
    expect(service).toContain("export async function deleteNotebookEntry(");
    expect(service).toContain("where: { id: parsed.notebookId, userId }");
    expect(service).toContain("where: { id: parsed.projectId, userId }");
    expect(service).toContain("where: { id: entryId, userId }");
  });

  it("exposes Notebook Index from Library and project-linked entries as read-only project references", () => {
    const libraryPage = readSource("app", "library", "page.tsx");
    const notebookPage = readSource("app", "library", "notebooks", "page.tsx");
    const projectsPage = readSource("app", "projects", "page.tsx");

    expect(libraryPage).toContain('href: "/library/notebooks"');
    expect(notebookPage).toContain("Find the page. Do not transcribe the life.");
    expect(notebookPage).toContain("Your notebook is your primary thinking space.");
    expect(notebookPage).toContain("<NotebookEntryForm");
    expect(notebookPage).toContain("<NotebookEntryList");
    expect(projectsPage).toContain("Linked Notebook Entries");
    expect(projectsPage).not.toContain("updateNotebookEntryAction");
  });
});
