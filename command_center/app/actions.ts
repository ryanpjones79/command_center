"use server";

import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { settingsSchema } from "@/lib/validation";
import { addTicker } from "@/server/watchlist-service";
import { refreshSymbol } from "@/server/market-data-service";
import { deleteSignalFilter, saveSignalFilter } from "@/server/setup-filters-service";
import { toSymbol } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  await signIn("credentials", {
    email,
    password,
    redirectTo: "/"
  });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function addTickerAction(formData: FormData) {
  const user = await requireUser();
  await addTicker(user.id, formData);

  const symbol = toSymbol(String(formData.get("symbol") || ""));
  if (symbol) {
    await refreshSymbol(symbol);
  }

  revalidatePath("/watchlist");
  revalidatePath("/signals");
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse({
    accountSize: formData.get("accountSize") || undefined,
    maxRiskPerTradePercent: formData.get("maxRiskPerTradePercent"),
    preferredDteMin: formData.get("preferredDteMin"),
    preferredDteMax: formData.get("preferredDteMax"),
    definedRiskOnly: formData.get("definedRiskOnly") === "on",
    earningsBufferDays: formData.get("earningsBufferDays"),
    concentrationLimit: formData.get("concentrationLimit")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid settings");
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { ...parsed.data, userId: user.id }
  });

  revalidatePath("/settings");
  revalidatePath("/signals");
}

export async function saveSignalFilterAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "");
  const query = String(formData.get("query") || "");

  await saveSignalFilter(user.id, name, query);
  revalidatePath("/signals");
}

export async function deleteSignalFilterAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;

  await deleteSignalFilter(user.id, id);
  revalidatePath("/signals");
}
