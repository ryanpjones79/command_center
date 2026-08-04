"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const storageKey = "rykas-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(storageKey, theme);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setMounted(true);
    const currentTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setTheme(currentTheme);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={mounted ? `Switch to ${nextTheme} mode` : "Toggle color mode"}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/85 text-foreground shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary",
        className
      )}
      onClick={() => {
        if (!mounted) return;
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      type="button"
    >
      {mounted && theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
    </button>
  );
}
