export const rootRoutes = {
  authenticated: "/time-blocks",
  unauthenticated: "/login"
} as const;

export const primaryRyanOsRoutes = [
  "/time-blocks",
  "/daily-brief",
  "/weekly-review",
  "/tasks",
  "/projects",
  "/settings"
] as const;

export const secondaryRyanOsRoutes = ["/dashboard", "/print/action-sheet"] as const;

export const temporaryLegacyToolRoutes = [
  "/chart",
  "/signals",
  "/watchlist",
  "/market-settings"
] as const;

export function getRootRedirectPath(isAuthenticated: boolean) {
  return isAuthenticated ? rootRoutes.authenticated : rootRoutes.unauthenticated;
}
