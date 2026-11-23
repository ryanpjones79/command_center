import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getActiveRyanOsNavKey,
  primaryRyanOsNavItems,
  primaryRyanOsRoutes,
  secondaryRyanOsNavItems,
  secondaryRyanOsRoutes,
  temporaryLegacyToolRoutes
} from "@/lib/route-decisions";

const appDir = path.join(process.cwd(), "app");
const shellPath = path.join(process.cwd(), "components", "layout", "app-shell.tsx");

function pageForRoute(route: string) {
  return path.join(appDir, ...route.split("/").filter(Boolean), "page.tsx");
}

function sourceForRoute(route: string) {
  return readFileSync(pageForRoute(route), "utf8");
}

describe("Phase 1 navigation information architecture", () => {
  it("defines exactly the four primary RyanOS v2 destinations, Now first", () => {
    expect(primaryRyanOsNavItems.map((item) => item.label)).toEqual(["Now", "Plan", "Projects", "Inbox"]);
    expect(primaryRyanOsRoutes).toEqual(["/now", "/plan", "/projects", "/inbox"]);
  });

  it("makes Now the landing tab", () => {
    expect(getActiveRyanOsNavKey("/now")).toBe("now");
    expect(getActiveRyanOsNavKey("/")).toBe("now");
  });

  it("uses a desktop sidebar and one mobile bottom nav", () => {
    const source = readFileSync(shellPath, "utf8");

    expect(source).toContain('aria-label="Primary"');
    expect(source).toContain('aria-label="Mobile primary"');
    expect(source).toContain("lg:hidden");
    expect(source).toContain("hidden lg:flex");
  });

  it("keeps Settings and Sign Out accessible outside the primary nav", () => {
    const source = readFileSync(shellPath, "utf8");

    expect(source).toContain('aria-label="Settings"');
    expect(source).toContain('href="/settings"');
    expect(source).toContain("Sign Out");
  });

  it("maps active route state to the intended primary tab and keeps old areas in More", () => {
    expect(getActiveRyanOsNavKey("/time-blocks")).toBe("today");
    expect(getActiveRyanOsNavKey("/today")).toBe("today");
    expect(getActiveRyanOsNavKey("/plan")).toBe("today");
    expect(getActiveRyanOsNavKey("/projects")).toBe("projects");
    expect(getActiveRyanOsNavKey("/projects/progress")).toBe("projects");
    expect(getActiveRyanOsNavKey("/inbox")).toBe("inbox");
    expect(getActiveRyanOsNavKey("/watchlist")).toBeNull();
    expect(secondaryRyanOsNavItems.map((item) => item.href)).toEqual(
      expect.arrayContaining(["/tasks", "/work", "/review", "/daily-brief", "/library", "/agent-hq"])
    );
  });

  it("renders Work landing with Tasks and Projects links", () => {
    const source = sourceForRoute("/work");

    expect(source).toContain("Maintain commitments without turning maintenance into the day.");
    expect(source).toContain('href: "/tasks"');
    expect(source).toContain('href: "/projects"');
    expect(source).toContain('href: "/work/areas"');
  });

  it("renders Review landing with Weekly Reset and Daily Brief links", () => {
    const source = sourceForRoute("/review");

    expect(source).toContain("Close the day, review the system, and choose what deserves attention next.");
    expect(source).toContain('title: "Weekly Reset"');
    expect(source).toContain('href: "/review/weekly-reset"');
    expect(source).toContain('href: "/daily-brief"');
  });

  it("renders Library landing and approved method copy", () => {
    const librarySource = sourceForRoute("/library");
    const methodSource = sourceForRoute("/library/method");

    expect(librarySource).toContain("Keep what deserves to be found again without turning every thought into a task.");
    expect(librarySource).toContain('href: "/library/method"');
    expect(methodSource).toContain("The RyanOS Method");
    expect(methodSource).toContain("Paper is where you think. RyanOS is where you commit.");
    expect(methodSource).toContain("Guilt disguised as a task");
  });

  it("keeps existing direct RyanOS and legacy routes available", () => {
    const directRoutes = [
      "/time-blocks",
      "/tasks",
      "/projects",
      "/weekly-review",
      "/review/weekly-reset",
      "/daily-brief",
      "/dashboard",
      "/print/action-sheet",
      "/settings",
      "/watchlist",
      "/signals",
      "/market-settings",
      "/work",
      "/review",
      "/library",
      "/library/method"
    ];

    for (const route of directRoutes) {
      expect(existsSync(pageForRoute(route)), `${route} should have a page`).toBe(true);
    }

    expect(existsSync(path.join(appDir, "chart", "[symbol]", "page.tsx"))).toBe(true);
    for (const route of temporaryLegacyToolRoutes) {
      expect(primaryRyanOsRoutes).not.toContain(route);
    }
    expect(secondaryRyanOsRoutes).toEqual(["/dashboard", "/print/action-sheet"]);
  });
});
