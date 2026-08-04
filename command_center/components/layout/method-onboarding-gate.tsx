"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const storageKey = "ryanos-method-seen-v1";

export function MethodOnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/library/method")) {
      window.localStorage.setItem(storageKey, "true");
      return;
    }
    if (window.localStorage.getItem(storageKey) === "true") return;

    window.localStorage.setItem(storageKey, "true");
    router.replace("/library/method?from=onboarding");
  }, [pathname, router]);

  return null;
}
