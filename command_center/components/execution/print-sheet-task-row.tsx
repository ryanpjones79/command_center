type PrintTask = {
  id: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  followUpDate?: Date | null;
  waitingOn: string | null;
  note: string | null;
  pinToTodayUntilDone?: boolean;
  domain: { name: string };
  project: { name: string } | null;
};

export function PrintSheetTaskRow({
  task,
  mode
}: {
  task: PrintTask;
  mode: "compact" | "extended";
}) {
  return (
    <div className="border-b border-black/15 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm border border-black" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-[11px] font-semibold leading-tight">{task.title}</p>
            {task.project?.name && <span className="text-[10px] text-black/65">{task.project.name}</span>}
            <span className="text-[10px] uppercase tracking-[0.14em] text-black/65">{task.domain.name}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-black/65">{task.priority}</span>
            {task.pinToTodayUntilDone && (
              <span className="text-[10px] uppercase tracking-[0.14em] text-black/65">Pinned</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-black/70">
            {task.dueDate && <span>Due {task.dueDate.toLocaleDateString()}</span>}
            {task.followUpDate && <span>Follow up {task.followUpDate.toLocaleDateString()}</span>}
            {task.waitingOn && <span>Waiting on {task.waitingOn}</span>}
          </div>
          {mode === "extended" && task.note && <p className="mt-1 text-[10px] leading-snug text-black/75">{task.note}</p>}
        </div>
      </div>
    </div>
  );
}
