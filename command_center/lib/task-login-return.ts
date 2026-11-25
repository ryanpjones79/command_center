// Default after sign-in is Now (it was /time-blocks when this was written); only the connector's authorize route may override it.
// Only the integration's validated authorization route can change the existing login destination.
export function taskLoginReturn(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2500 ||
    /[\\\r\n]/.test(value)
  )
    return "/now";
  try {
    const url = new URL(value, "https://return.example.invalid");
    if (
      !value.startsWith("/api/mcp/oauth/authorize?") ||
      url.origin !== "https://return.example.invalid" ||
      url.pathname !== "/api/mcp/oauth/authorize" ||
      url.hash
    )
      return "/now";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/now";
  }
}
