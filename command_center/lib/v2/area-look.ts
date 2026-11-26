// One colour per area. card = list cards (accent edge + faint wash), block = calendar blocks (solid gradient),
// dot = area markers. Full class names are written out so Tailwind keeps them.
export type AreaLook = { card: string; block: string; dot: string };
const look = (card: string, block: string, dot: string): AreaLook => ({ card, block, dot });
const AREA_LOOK: Record<string, AreaLook> = {
  ebay: look("border-l-amber-400 bg-gradient-to-r from-amber-400/[0.13] to-transparent", "from-amber-400 to-orange-500 shadow-orange-500/30", "bg-amber-400"),
  rykas: look("border-l-orange-500 bg-gradient-to-r from-orange-500/[0.13] to-transparent", "from-orange-500 to-rose-500 shadow-rose-500/30", "bg-orange-500"),
  "betting-models": look("border-l-violet-500 bg-gradient-to-r from-violet-500/[0.14] to-transparent", "from-violet-500 to-indigo-500 shadow-indigo-500/30", "bg-violet-500"),
  "casino-ap": look("border-l-fuchsia-500 bg-gradient-to-r from-fuchsia-500/[0.13] to-transparent", "from-fuchsia-500 to-pink-500 shadow-pink-500/30", "bg-fuchsia-500"),
  work: look("border-l-sky-500 bg-gradient-to-r from-sky-500/[0.13] to-transparent", "from-sky-500 to-blue-600 shadow-blue-600/30", "bg-sky-500"),
  health: look("border-l-emerald-500 bg-gradient-to-r from-emerald-500/[0.13] to-transparent", "from-emerald-500 to-teal-500 shadow-teal-500/30", "bg-emerald-500"),
  golf: look("border-l-lime-500 bg-gradient-to-r from-lime-500/[0.13] to-transparent", "from-lime-500 to-emerald-600 shadow-emerald-600/30", "bg-lime-500"),
  family: look("border-l-rose-500 bg-gradient-to-r from-rose-500/[0.13] to-transparent", "from-rose-500 to-pink-600 shadow-pink-600/30", "bg-rose-500"),
  kids: look("border-l-pink-500 bg-gradient-to-r from-pink-500/[0.13] to-transparent", "from-pink-500 to-rose-500 shadow-rose-500/30", "bg-pink-500"),
  opportunities: look("border-l-teal-500 bg-gradient-to-r from-teal-500/[0.13] to-transparent", "from-teal-500 to-cyan-600 shadow-cyan-600/30", "bg-teal-500")
};
const DEFAULT_LOOK = look("border-l-slate-400 bg-gradient-to-r from-slate-400/[0.12] to-transparent", "from-slate-500 to-slate-600 shadow-slate-600/30", "bg-slate-400");
export const areaLook = (slug: string) => AREA_LOOK[slug] ?? DEFAULT_LOOK;

// The same area colours as hex, for inline accents (Plan shelf selection, time-grid block edges and tints).
const AREA_HEX: Record<string, string> = {
  ebay: "#f59e0b", rykas: "#f97316", "betting-models": "#8b5cf6", "casino-ap": "#d946ef", work: "#0ea5e9",
  health: "#10b981", golf: "#84cc16", family: "#f43f5e", kids: "#ec4899", opportunities: "#14b8a6"
};
export const areaHex = (slug: string) => AREA_HEX[slug] ?? "#94a3b8";
