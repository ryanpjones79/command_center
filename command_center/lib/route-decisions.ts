export const rootRoutes = {
  authenticated: "/now",
  unauthenticated: "/login"
} as const;

export const primaryRyanOsRoutes = [
  "/now",
  "/time-blocks",
  "/work",
  "/review",
  "/library"
] as const;

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

export type RyanOsNavKey = "now" | "today" | "work" | "review" | "library";

export type RyanOsNavItem = {
  href: string;
  key: RyanOsNavKey;
  label: string;
  mark: string;
};

export const primaryRyanOsNavItems: RyanOsNavItem[] = [
  { href: "/now", key: "now", label: "Now", mark: "NW" },
  { href: "/time-blocks", key: "today", label: "Today", mark: "TD" },
  { href: "/work", key: "work", label: "Work", mark: "WK" },
  { href: "/review", key: "review", label: "Review", mark: "RV" },
  { href: "/library", key: "library", label: "Library", mark: "LB" }
];

export function getActiveRyanOsNavKey(pathname: string | null | undefined): RyanOsNavKey | null {
  if (!pathname) {
    return null;
  }

  if (pathname === "/" || pathname === "/now" || pathname.startsWith("/now/")) {
    return "now";
  }

  if (pathname === "/today" || pathname.startsWith("/time-blocks")) {
    return "today";
  }

  if (
    pathname === "/work" ||
    pathname.startsWith("/work/") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/projects")
  ) {
    return "work";
  }

  if (
    pathname === "/review" ||
    pathname.startsWith("/review/") ||
    pathname.startsWith("/weekly-review") ||
    pathname.startsWith("/daily-brief") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/print/action-sheet")
  ) {
    return "review";
  }

  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return "library";
  }

  return null;
}
