"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MethodOnboardingGate } from "@/components/layout/method-onboarding-gate";
import { isMarketingPath } from "@/lib/marketing/routes";

type RootShellProps = {
  children: ReactNode;
  isAuthenticated: boolean;
};

export function RootShell({ children, isAuthenticated }: RootShellProps) {
  const pathname = usePathname();

  if (!isAuthenticated || !pathname || isMarketingPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <MethodOnboardingGate />
      <AppShell>{children}</AppShell>
    </>
  );
}
