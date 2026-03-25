import type { Metadata } from "next";
import "@/app/globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Daily Action OS",
  description: "Printable action sheet and weekly review companion to your emailed Daily Brief."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>{session?.user ? <AppShell>{children}</AppShell> : children}</body>
    </html>
  );
}
