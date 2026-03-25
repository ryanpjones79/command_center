import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;

  if (path.startsWith("/api/") || path.startsWith("/_next") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  if (!isLoggedIn && path !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && path === "/login") {
    return NextResponse.redirect(new URL("/watchlist", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/(.*)"]
};
