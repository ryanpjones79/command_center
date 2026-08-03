import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRootRedirectPath,
  primaryRyanOsRoutes,
  rootRoutes,
  secondaryRyanOsRoutes,
  temporaryLegacyToolRoutes
} from "@/lib/route-decisions";

const appDir = path.join(process.cwd(), "app");

function pageForRoute(route: string) {
  if (route === "/") {
    return path.join(appDir, "page.tsx");
  }

  return path.join(appDir, ...route.split("/").filter(Boolean), "page.tsx");
}

describe("Phase 0 route ownership", () => {
  it("keeps root owned by RyanOS Today for signed-in users", () => {
    expect(getRootRedirectPath(true)).toBe(rootRoutes.authenticated);
    expect(getRootRedirectPath(false)).toBe(rootRoutes.unauthenticated);
  });

  it("keeps primary RyanOS routes backed by local pages", () => {
    for (const route of primaryRyanOsRoutes) {
      expect(existsSync(pageForRoute(route)), `${route} should have a page`).toBe(true);
    }
  });

  it("keeps secondary Action Sheet routes available without making them root", () => {
    expect(secondaryRyanOsRoutes).toContain("/dashboard");
    expect(secondaryRyanOsRoutes).not.toContain("/");
    expect(existsSync(pageForRoute("/dashboard"))).toBe(true);
  });

  it("parks legacy market tools outside primary RyanOS navigation", () => {
    for (const route of temporaryLegacyToolRoutes) {
      expect(primaryRyanOsRoutes).not.toContain(route);
    }
  });
});
