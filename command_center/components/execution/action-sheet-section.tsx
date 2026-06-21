import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskLineItem } from "@/components/execution/task-line-item";

type SectionTask = Parameters<typeof TaskLineItem>[0]["task"];

export function ActionSheetSection({
  title,
  tasks,
  empty,
  domains,
  projects
}: {
  title: string;
  tasks: SectionTask[];
  empty: string;
  domains: { id: string; name: string }[];
  projects: { id: string; name: string; domainId: string }[];
}) {
  return (
    <Card className="print-card overflow-hidden rounded-lg">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardTitle className="text-sm uppercase tracking-[0.16em] sm:text-base sm:tracking-[0.18em]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 px-4 pb-4 sm:px-5 sm:pb-5">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          tasks.map((task) => <TaskLineItem domains={domains} key={task.id} projects={projects} task={task} />)
        )}
      </CardContent>
    </Card>
  );
}
