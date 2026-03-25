import { PrintSheetTaskRow } from "@/components/execution/print-sheet-task-row";

type PrintTask = Parameters<typeof PrintSheetTaskRow>[0]["task"];

export function PrintSheetSection({
  title,
  tasks,
  mode,
  overflowCount,
  empty
}: {
  title: string;
  tasks: PrintTask[];
  mode: "compact" | "extended";
  overflowCount?: number;
  empty: string;
}) {
  return (
    <section className="rounded-none border border-black/30 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-black/20 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-black">{title}</h3>
        <span className="text-[10px] text-black/60">{tasks.length + (overflowCount ?? 0)} items</span>
      </div>
      {tasks.length === 0 ? (
        <p className="py-2 text-[10px] text-black/55">{empty}</p>
      ) : (
        <div>
          {tasks.map((task) => (
            <PrintSheetTaskRow key={task.id} mode={mode} task={task} />
          ))}
        </div>
      )}
      {!!overflowCount && <p className="pt-2 text-[10px] italic text-black/60">+ {overflowCount} more in app</p>}
    </section>
  );
}
