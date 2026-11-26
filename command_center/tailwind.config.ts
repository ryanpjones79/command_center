import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"]
      },
      colors: {
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          active: "hsl(var(--sidebar-active))"
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        today: {
          accent: "hsl(var(--t-accent))",
          "accent-soft": "hsl(var(--t-accent-soft))",
          "accent-line": "hsl(var(--t-accent-line))",
          "accent-ink": "hsl(var(--t-accent-ink))",
          mint: "hsl(var(--t-mint))",
          "mint-line": "hsl(var(--t-mint-line))",
          "mint-ink": "hsl(var(--t-mint-ink))",
          track: "hsl(var(--t-track))",
          "track-line": "hsl(var(--t-track-line))",
          tick: "hsl(var(--t-tick))",
          "tick-major": "hsl(var(--t-tick-major))",
          protected: "hsl(var(--t-protected))",
          "protected-line": "hsl(var(--t-protected-line))",
          ink2: "hsl(var(--t-ink-2))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      }
    }
  },
  plugins: []
};

export default config;
