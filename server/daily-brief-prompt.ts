export const DAILY_BRIEF_PROMPT_VERSION = "Action Daily OS operator brief v2";

export const DAILY_BRIEF_PROMPT_ENHANCEMENTS = [
  "Use the developed Action Daily OS brief structure as the primary output contract.",
  "Derive work blocks only from explicit work-block inputs or real calendar gaps bounded by actual events or an explicit workday window.",
  "Filter canceled commitments and surface schedule pressure when the day is fragmented or meeting-heavy.",
  "Sync against the Action Sheet so real execution tasks can feed outcomes, quick starts, and quick wins.",
  "Use task duration buckets to match short work to small gaps and longer work to the best available work blocks.",
  "Append a NEWS WATCH section with the top 3 latest items for Sacramento Kings, Los Angeles Dodgers, and Oracle Health or healthcare analytics."
] as const;
