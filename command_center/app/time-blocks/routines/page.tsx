import { redirect } from "next/navigation";

// The standard week moved to Plan → Routines (fixed-time and fill-in routines in one place).
export default function LegacyRoutinesPage() {
  redirect("/plan/routines");
}
