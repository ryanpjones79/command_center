import type { MetadataRoute } from "next";

// Installable app + Android share target (Chrome). iOS Safari does not support
// share targets; use the Shortcut in docs/RYANOS_V2_INTEGRATIONS.md instead.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RyanOS",
    short_name: "RyanOS",
    start_url: "/now",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#0e1513",
    // share_target is valid Web App Manifest but not in Next's type yet.
    ...({
      share_target: {
        action: "/inbox/share",
        method: "GET",
        params: { title: "title", text: "text", url: "url" }
      }
    } as Record<string, unknown>)
  } as MetadataRoute.Manifest;
}
