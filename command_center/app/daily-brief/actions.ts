"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  getDailyBriefReferenceDate,
  sendDailyBriefEmail
} from "@/server/daily-brief-service";

export async function sendDailyBriefEmailAction() {
  const user = await requireUser();

  try {
    await sendDailyBriefEmail(getDailyBriefReferenceDate(), user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send daily brief.";
    redirect(`/daily-brief?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/daily-brief");
  redirect("/daily-brief?sent=1");
}
