"use server";

import { revalidatePath } from "next/cache";
import { createSeason, completeSeason, setCurrentSeason, updateSeason } from "@/server/season-service";
import { requireUser } from "@/lib/session";

function revalidateSeasons() {
  revalidatePath("/time-blocks");
  revalidatePath("/projects");
  revalidatePath("/weekly-review");
  revalidatePath("/library");
  revalidatePath("/library/seasons");
}

export async function createSeasonAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();
  const result = await createSeason(user.id, formData);
  revalidateSeasons();
  return result;
}

export async function updateSeasonAction(seasonId: string, formData: FormData) {
  const user = await requireUser();
  await updateSeason(user.id, seasonId, formData);
  revalidateSeasons();
}

export async function setCurrentSeasonAction(seasonId: string) {
  const user = await requireUser();
  await setCurrentSeason(user.id, seasonId);
  revalidateSeasons();
}

export async function completeSeasonAction(seasonId: string) {
  const user = await requireUser();
  await completeSeason(user.id, seasonId);
  revalidateSeasons();
}
