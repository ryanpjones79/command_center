import type { MetadataRoute } from "next";
import { marketingRoutePaths, siteContent } from "@/content/site-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return marketingRoutePaths.map((path) => ({
    url: `${siteContent.brand.siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.8
  }));
}
