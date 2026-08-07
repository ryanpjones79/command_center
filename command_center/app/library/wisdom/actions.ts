"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  addWisdomReflection,
  createWisdomEntry,
  createWisdomInboxItem,
  deleteWisdomEntry,
  markWisdomShown,
  promoteInboxWisdom,
  promoteNotebookEntryToWisdom,
  setWisdomStatus,
  toggleWisdomActive,
  toggleWisdomFavorite,
  updateWisdomEntry
} from "@/server/wisdom-service";
import { ensureExecutionSetup } from "@/server/execution-service";

function formValue(formData: FormData, key: string) {
  return formData.get(key);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

function revalidateWisdomRoutes() {
  revalidatePath("/");
  revalidatePath("/time-blocks");
  revalidatePath("/library");
  revalidatePath("/library/wisdom");
  revalidatePath("/library/notebooks");
}

export async function quickCaptureWisdomAction(
  _prevState: unknown,
  formData: FormData
) {
  const user = await requireUser();

  try {
    await createWisdomInboxItem(user.id, {
      idea: formValue(formData, "idea"),
      photoUrl: formValue(formData, "photoUrl"),
      sourceType: formValue(formData, "sourceType") || "other",
      sourceName: formValue(formData, "sourceName")
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not capture wisdom") };
  }

  revalidateWisdomRoutes();
  return { ok: true, error: "" };
}

export async function createWisdomEntryAction(
  _prevState: unknown,
  formData: FormData
) {
  const user = await requireUser();

  try {
    await createWisdomEntry(user.id, {
      title: formValue(formData, "title"),
      idea: formValue(formData, "idea"),
      takeaway: formValue(formData, "takeaway"),
      application: formValue(formData, "application"),
      sourceType: formValue(formData, "sourceType") || "other",
      sourceName: formValue(formData, "sourceName"),
      author: formValue(formData, "author"),
      reference: formValue(formData, "reference"),
      category: formValue(formData, "category") || "Other",
      capturedAt: formValue(formData, "capturedAt"),
      favorite: formData.get("favorite") === "on",
      active: formData.get("active") === "on",
      tags: formValue(formData, "tags"),
      photoUrl: formValue(formData, "photoUrl"),
      status: formValue(formData, "status") || "library",
      notebookEntryId: formValue(formData, "notebookEntryId")
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not save wisdom") };
  }

  revalidateWisdomRoutes();
  return { ok: true, error: "" };
}

export async function updateWisdomEntryAction(formData: FormData) {
  const user = await requireUser();
  const wisdomId = String(formData.get("wisdomId") ?? "");

  await updateWisdomEntry(user.id, wisdomId, {
    title: formValue(formData, "title"),
    idea: formValue(formData, "idea"),
    takeaway: formValue(formData, "takeaway"),
    application: formValue(formData, "application"),
    sourceType: formValue(formData, "sourceType") || "other",
    sourceName: formValue(formData, "sourceName"),
    author: formValue(formData, "author"),
    reference: formValue(formData, "reference"),
    category: formValue(formData, "category") || "Other",
    capturedAt: formValue(formData, "capturedAt"),
    favorite: formData.get("favorite") === "on",
    active: formData.get("active") === "on",
    tags: formValue(formData, "tags"),
    photoUrl: formValue(formData, "photoUrl"),
    status: formValue(formData, "status") || "library",
    notebookEntryId: formValue(formData, "notebookEntryId")
  });

  revalidateWisdomRoutes();
}

export async function promoteInboxWisdomAction(wisdomId: string) {
  const user = await requireUser();
  await promoteInboxWisdom(user.id, wisdomId);
  revalidateWisdomRoutes();
}

export async function archiveWisdomAction(wisdomId: string) {
  const user = await requireUser();
  await setWisdomStatus(user.id, wisdomId, "archived");
  revalidateWisdomRoutes();
}

export async function deleteWisdomAction(wisdomId: string) {
  const user = await requireUser();
  await deleteWisdomEntry(user.id, wisdomId);
  revalidateWisdomRoutes();
}

export async function toggleWisdomFavoriteAction(wisdomId: string) {
  const user = await requireUser();
  await toggleWisdomFavorite(user.id, wisdomId);
  revalidateWisdomRoutes();
}

export async function toggleWisdomActiveAction(wisdomId: string) {
  const user = await requireUser();
  await toggleWisdomActive(user.id, wisdomId);
  revalidateWisdomRoutes();
}

export async function shuffleTodayPrincipleAction(wisdomId: string) {
  const user = await requireUser();
  await markWisdomShown(user.id, wisdomId);
  revalidateWisdomRoutes();
}

export async function addWisdomReflectionAction(
  wisdomId: string,
  _prevState: unknown,
  formData: FormData
) {
  const user = await requireUser();

  try {
    await addWisdomReflection(user.id, wisdomId, {
      text: formValue(formData, "text")
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not save reflection") };
  }

  revalidateWisdomRoutes();
  return { ok: true, error: "" };
}

export async function createTaskFromWisdomAction(wisdomId: string) {
  const user = await requireUser();
  await ensureExecutionSetup(user.id);

  const [wisdom, domain] = await Promise.all([
    prisma.wisdomEntry.findFirst({ where: { id: wisdomId, userId: user.id } }),
    prisma.executionDomain.findFirst({
      where: { userId: user.id, slug: "work" },
      orderBy: { createdAt: "asc" }
    })
  ]);

  if (!wisdom || !domain) return;

  await prisma.executionTask.create({
    data: {
      userId: user.id,
      domainId: domain.id,
      title: wisdom.title,
      type: "ACTION",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      whenBucket: "TODAY",
      note: wisdom.application || wisdom.takeaway || wisdom.idea,
      source: `Wisdom: ${wisdom.sourceName || wisdom.sourceType}`
    }
  });

  revalidatePath("/tasks");
  revalidatePath("/time-blocks");
}

export async function convertWisdomToParkedIdeaAction(wisdomId: string) {
  const user = await requireUser();
  const wisdom = await prisma.wisdomEntry.findFirst({
    where: { id: wisdomId, userId: user.id }
  });
  if (!wisdom) return;

  await prisma.parkedIdea.create({
    data: {
      userId: user.id,
      idea: wisdom.title,
      lane: "wisdom",
      triggerCondition: wisdom.application || wisdom.takeaway || wisdom.idea
    }
  });

  await setWisdomStatus(user.id, wisdomId, "archived");
  revalidateWisdomRoutes();
}

export async function promoteNotebookEntryToWisdomAction(entryId: string) {
  const user = await requireUser();
  await promoteNotebookEntryToWisdom(user.id, entryId);
  revalidateWisdomRoutes();
}
