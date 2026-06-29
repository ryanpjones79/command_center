export const DAILY_BRIEF_PROMPT_VERSION = "Action Daily OS operator brief v4";

export const DAILY_BRIEF_PROMPT_ENHANCEMENTS = [
  "Use the developed Action Daily OS brief structure as the primary output contract.",
  "Derive work blocks only from explicit work-block inputs or real calendar gaps bounded by actual events or an explicit workday window.",
  "Filter canceled commitments and surface schedule pressure when the day is fragmented or meeting-heavy.",
  "Sync against the Action Sheet so real execution tasks can feed outcomes and quick wins.",
  "Use task duration buckets to match short work to small gaps and longer work to the best available work blocks.",
  "Replace Quick Start with a simple MEAL PLAN write-in section for Breakfast, Lunch, Dinner, and Snack.",
  "Keep NEWS WATCH online and in email, but omit it from the compact print brief.",
  "Use Daily Brief V4 Lite for print: plan of attack, right-thing setup, default food plan, top 3, quick wins, fallback, watchouts, and scorecard."
] as const;
