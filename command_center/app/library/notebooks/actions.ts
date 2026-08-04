"use server";

import { revalidatePath } from "next/cache";
import { createNotebook, createNotebookEntry } from "@/server/notebook-service";
import { requireUser } from "@/lib/session";

function formValue(formData: FormData, key: string) {
  return formData.get(key);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

function revalidateNotebookRoutes() {
  revalidatePath("/library");
  revalidatePath("/library/notebooks");
  revalidatePath("/projects");
}

export async function createNotebookAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();

  try {
    await createNotebook(user.id, {
      title: formValue(formData, "title"),
      number: formValue(formData, "number"),
      startedAt: formValue(formData, "startedAt"),
      completedAt: formValue(formData, "completedAt"),
      description: formValue(formData, "description")
    });
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not create notebook")
    };
  }

  revalidateNotebookRoutes();
  return { ok: true, error: "" };
}

export async function createNotebookEntryAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();

  try {
    await createNotebookEntry(user.id, {
      notebookId: formValue(formData, "notebookId"),
      pageNumber: formValue(formData, "pageNumber"),
      title: formValue(formData, "title"),
      entryType: formValue(formData, "entryType"),
      date: formValue(formData, "date"),
      summary: formValue(formData, "summary"),
      domainId: formValue(formData, "domainId"),
      projectId: formValue(formData, "projectId")
    });
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not save notebook entry")
    };
  }

  revalidateNotebookRoutes();
  return { ok: true, error: "" };
}
