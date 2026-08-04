import { marketingRoutePaths } from "@/content/site-content";

const marketingPrefixes = marketingRoutePaths.filter((path) => path !== "/");

export function isMarketingPath(pathname: string) {
  if (pathname === "/" || pathname === "/login") {
    return true;
  }

  return marketingPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
