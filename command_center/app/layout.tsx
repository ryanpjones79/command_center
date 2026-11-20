import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "@/app/globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";
import { resolveTools } from "@/lib/v2/tools";
import { INBOX_STATUS } from "@/server/inbox/inbox";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: {
    default: "RyanOS",
    template: "%s | RyanOS"
  },
  description: "Your day, prepared: the next feasible action, already waiting.",
  appleWebApp: { capable: true, title: "RyanOS", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "RyanOS",
    title: "RyanOS",
    description: "Your day, prepared: the next feasible action, already waiting.",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "RyanOS",
    description: "Your day, prepared: the next feasible action, already waiting."
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1513" }
  ]
};

// Explicit choice wins; otherwise follow the device. Storage failures are ignored.
const themeScript = `
(() => {
  let stored = null;
  try { stored = window.localStorage.getItem("ryanos-theme") ?? window.localStorage.getItem("rykas-theme"); } catch (e) {}
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
})();
`;

// Inbox badge = items needing Ryan's judgment, not every tracked task.
async function judgmentCount(userId: string) {
  try {
    const [tasks, ideas] = await Promise.all([
      prisma.executionTask.count({ where: { userId, needsJudgment: true, status: { notIn: ["DONE", "DROPPED"] } } }),
      prisma.parkedIdea.count({ where: { userId, status: INBOX_STATUS } })
    ]);
    return tasks + ideas;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const userId = session?.user?.id;
  const inboxCount = userId ? await judgmentCount(userId) : 0;

  return (
    <html className={`${bodyFont.variable} ${displayFont.variable}`} lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {userId ? (
          <AppShell inboxCount={inboxCount} tools={resolveTools()}>
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
