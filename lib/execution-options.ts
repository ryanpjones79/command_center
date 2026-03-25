import type {
  ExecutionActiveStatus,
  ExecutionDurationBucket,
  ExecutionPriority,
  ExecutionProjectStatus,
  ExecutionTaskStatus,
  ExecutionTaskType,
  ExecutionWeeklyFocus,
  ExecutionWhenBucket
} from "@prisma/client";

export type ExecutionSelectOptions = {
  priorities: ExecutionPriority[];
  durationBuckets: ExecutionDurationBucket[];
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
