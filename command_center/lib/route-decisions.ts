export const rootRoutes = {
  authenticated: "/now",
  unauthenticated: "/login"
} as const;

// RyanOS v2 primary navigation: Now · Plan · Projects · Inbox. Plan (2026-11-22) replaces Today: lists on
// the left, calendar on the right, drag to schedule. The old Today page stays under More.
export const primaryRyanOsRoutes = ["/now", "/plan", "/projects", "/inbox"] as const;

export const secondaryRyanOsRoutes = ["/dashboard", "/print/action-sheet"] as const;
export const agentHqRoute = "/agent-hq" as const;

export const temporaryLegacyToolRoutes = [
  "/chart",
  "/signals",
  "/watchlist",
  "/market-settings"
] as const;

export function getRootRedirectPath(isAuthenticated: boolean) {
  return isAuthenticated ? rootRoutes.authenticated : rootRoutes.unauthenticated;
}

export type RyanOsNavKey = "now" | "today" | "projects" | "inbox";

export type RyanOsNavItem = {
  href: string;
  key: RyanOsNavKey;
  label: string;
  mark: string;
};

export const primaryRyanOsNavItems: RyanOsNavItem[] = [
  { href: "/now", key: "now", label: "Now", mark: "NW" },
  { href: "/plan", key: "today", label: "Plan", mark: "PL" },
  { href: "/projects", key: "projects", label: "Projects", mark: "PR" },
  { href: "/inbox", key: "inbox", label: "Inbox", mark: "IN" }
];

// Existing features stay reachable from the secondary "More" menu.
export const secondaryRyanOsNavItems: { href: string; label: string }[] = [
  { href: "/time-blocks", label: "Today (list view)" },
  { href: "/tasks", label: "All tasks" },
  { href: "/work", label: "Work areas" },
  { href: "/review", label: "Review" },
  { href: "/review/weekly-reset", label: "Weekly reset" },
  { href: "/daily-brief", label: "Daily Brief" },
  { href: "/library", label: "Library" },
  { href: "/agent-hq", label: "Agent HQ" }
];

export function getActiveRyanOsNavKey(pathname: string | null | undefined): RyanOsNavKey | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0];
  if (path === "/" || path === "/now" || path.startsWith("/now/")) return "now";
  if (path === "/today" || path === "/plan" || path.startsWith("/plan/") || path.startsWith("/time-blocks")) return "today";
  if (path === "/projects" || path.startsWith("/projects/")) return "projects";
  if (path === "/inbox" || path.startsWith("/inbox/")) return "inbox";
  return null;
}
