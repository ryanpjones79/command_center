import type {
  ExecutionActiveStatus,
  ExecutionDurationBucket,
  ExecutionPriority,
  ExecutionProjectStatus,
  ExecutionRecurrenceFrequency,
  ExecutionTaskStatus,
  ExecutionTaskType,
  ExecutionWeeklyFocus,
  ExecutionWhenBucket
} from "@prisma/client";

export type ExecutionSelectOptions = {
  priorities: ExecutionPriority[];
  durationBuckets: ExecutionDurationBucket[];
  recurrenceFrequencies: ExecutionRecurrenceFrequency[];
  taskTypes: ExecutionTaskType[];
  taskStatuses: ExecutionTaskStatus[];
  whenBuckets: ExecutionWhenBucket[];
  projectStatuses: ExecutionProjectStatus[];
  activeStatuses: ExecutionActiveStatus[];
  weeklyFocuses: ExecutionWeeklyFocus[];
};

export const executionSelectOptions: ExecutionSelectOptions = {
  priorities: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  durationBuckets: ["UNDER_30_MIN", "THIRTY_TO_SIXTY_MIN", "ONE_TO_TWO_HOURS", "TWO_HOURS_PLUS"],
  recurrenceFrequencies: ["NONE", "DAILY", "WORKDAYS", "WEEKENDS", "WEEKLY", "CUSTOM_WEEKDAYS"],
  taskTypes: ["ACTION", "FOLLOW_UP", "ADMIN", "QUICK_WIN"],
  taskStatuses: ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DONE", "DROPPED"],
  whenBuckets: ["TODAY", "THIS_WEEK", "LATER", "WAITING", "PARKING_LOT"],
  projectStatuses: ["ON_TRACK", "NEEDS_ATTENTION", "BLOCKED", "COMPLETED"],
  activeStatuses: ["ACTIVE_NOW", "ACTIVE_LATER", "PARKED", "COMPLETED"],
  weeklyFocuses: ["TOP_3", "ACTIVE", "NONE"]
};

export function formatExecutionLabel(value: string) {
  return value
    .split("_")
    .map((part) => {
      if (part === "3") return part;
      return `${part.charAt(0)}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

export function formatExecutionDurationBucket(value: string) {
  switch (value) {
    case "UNDER_30_MIN":
      return "<30 min";
    case "THIRTY_TO_SIXTY_MIN":
      return "30-60 min";
    case "ONE_TO_TWO_HOURS":
      return "1-2 hrs";
    case "TWO_HOURS_PLUS":
      return "2 hrs+";
    default:
      return formatExecutionLabel(value);
  }
}

export const executionWeekdayOptions = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" }
] as const;

export function formatRecurrenceFrequency(value: string) {
  switch (value) {
    case "NONE":
      return "Does not repeat";
    case "DAILY":
      return "Daily";
    case "WORKDAYS":
      return "Workdays";
    case "WEEKENDS":
      return "Weekends";
    case "WEEKLY":
      return "Weekly";
    case "CUSTOM_WEEKDAYS":
      return "Custom weekdays";
    case "MONTHLY":
      return "Monthly";
    default:
      return formatExecutionLabel(value);
  }
}

export function describeRecurrenceFrequency(value: string) {
  switch (value) {
    case "DAILY":
      return "True every day anchors.";
    case "WORKDAYS":
      return "Monday-Friday operating tasks.";
    case "WEEKENDS":
      return "Saturday-Sunday items only.";
    case "WEEKLY":
      return "Same day each week.";
    case "CUSTOM_WEEKDAYS":
      return "Pick exact weekdays below.";
    default:
      return "One-time task or project work.";
  }
}

export function parseRecurrenceWeekdays(value: string | null | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((day) => day.trim())
      .filter((day) => executionWeekdayOptions.some((option) => option.value === day))
  );
}

export function formatRecurrenceWeekdays(value: string | null | undefined) {
  const selected = parseRecurrenceWeekdays(value);
  if (selected.size === 0) return "";

  return executionWeekdayOptions
    .filter((option) => selected.has(option.value))
    .map((option) => option.label)
    .join(", ");
}
