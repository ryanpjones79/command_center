export function formatNotebookTitle(notebook: { number: number | null; title: string }) {
  if (notebook.number) {
    return `Notebook ${String(notebook.number).padStart(2, "0")}`;
  }

  return notebook.title;
}

export function formatNotebookMonth(value: Date | null | undefined) {
  if (!value) return "No started date";
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
