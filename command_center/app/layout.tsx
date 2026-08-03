import type { Metadata } from "next";
import "@/app/globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: {
    default: "RyanOS",
    template: "%s | RyanOS"
  },
  description:
    "Daily execution screen for deciding what matters and blocking when it happens.",
  openGraph: {
    type: "website",
    siteName: "RyanOS",
    title: "RyanOS",
    description:
      "Daily execution screen for deciding what matters and blocking when it happens.",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "RyanOS",
    description:
      "Daily execution screen for deciding what matters and blocking when it happens."
  }
};

const themeScript = `
(() => {
  const storageKey = "ryanos-theme";
  const legacyStorageKey = "rykas-theme";
  const storedTheme = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
  const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {session?.user ? <AppShell>{children}</AppShell> : children}
      </body>
    </html>
  );
}
