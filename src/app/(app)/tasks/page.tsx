import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { cn } from "cn";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { PRIORITY, ROLE } from "@/lib/domain/labels";
import { dayKey, formatRelativeDay } from "@/lib/format";
import { listTasks, type TaskScope } from "@/features/operations/queries";
import { TaskCreateForm, TaskToggle } from "@/features/tasks/TaskForms";

export const metadata: Metadata = { title: "Tâches" };

const SCOPES: { key: TaskScope; label: string }[] = [
  { key: "a-faire", label: "À faire" },
  { key: "en-retard", label: "En retard" },
  { key: "terminees", label: "Terminées" },
  { key: "toutes", label: "Toutes" },
];

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <PageHeader title="Tâches" description="Le travail de l'équipe : relances, vérifications, préparations. Cochez une tâche pour la terminer." />
      <Suspense fallback={<PageSkeleton />}>
        <Tasks searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Tasks({ searchParams }: Pick<PageProps<"/tasks">, "searchParams">) {
  const { vue, qui } = await searchParams;
  const scope = SCOPES.find((s) => s.key === vue)?.key ?? "a-faire";
  const mine = qui === "moi";
  const data = await listTasks(scope, mine);
  const tz = data.agency.timezone;
  const query = (changes: { vue?: string; qui?: string }) => {
    const params = new URLSearchParams();
    const v = changes.vue ?? scope;
    const q = "qui" in changes ? changes.qui : mine ? "moi" : undefined;
    if (v !== "a-faire") params.set("vue", v);
    if (q) params.set("qui", q);
    const s = params.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  return (
    <div className="space-y-6">
      <div>
        <Pills label="Filtre" active={scope} items={SCOPES.map((s) => ({ key: s.key, label: s.label, count: data.counts[s.key], href: query({ vue: s.key }) }))} />
        <div className="-mt-1 mb-4 flex gap-4 text-sm">
          <Link href={query({ qui: undefined })} aria-current={!mine ? "page" : undefined} className={cn("font-medium", !mine ? "text-navy-800 underline underline-offset-4" : "text-slate-600 hover:text-navy-800")}>
            Toute l&apos;équipe
          </Link>
          <Link href={query({ qui: "moi" })} aria-current={mine ? "page" : undefined} className={cn("font-medium", mine ? "text-navy-800 underline underline-offset-4" : "text-slate-600 hover:text-navy-800")}>
            Mes tâches
          </Link>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState icon={ListChecks} title="Aucune tâche dans cette vue" />
        ) : (
          <ul className="space-y-2">
            {data.rows.map(({ task, clientName, caseRef, assignee, overdue }) => {
              const done = task.status === "done";
              return (
                <li key={task.id}>
                  <Card className="flex items-start gap-3">
                    {data.canWrite && <TaskToggle taskId={task.id} done={done} title={task.title} />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", done ? "text-slate-500 line-through" : "text-slate-900")}>{task.title}</p>
                      <p className="text-sm text-slate-600">
                        {caseRef && task.caseId && (
                          <>
                            <Link href={`/cases/${task.caseId}?tab=taches`} className="font-medium text-navy-700 hover:underline">
                              {caseRef}
                            </Link>
                            {" · "}
                          </>
                        )}
                        {[clientName, assignee?.fullName].filter(Boolean).join(" · ")}
                      </p>
                      <p className={cn("text-sm", overdue ? "font-semibold text-red-700" : "text-slate-500")}>
                        {overdue ? "En retard · " : done ? "Échéance : " : "Pour "}
                        {formatRelativeDay(task.dueAt, data.now, tz)}
                      </p>
                    </div>
                    {!done && (task.priority === "high" || task.priority === "urgent") && <StatusBadge spec={PRIORITY[task.priority]} />}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data.canWrite && (
      <Section title="Nouvelle tâche" id="nouvelle-tache">
        <TaskCreateForm
          defaultMemberId={data.currentMemberId}
          defaultDate={dayKey(data.now, tz)}
          members={data.members.filter((m) => m.role !== "viewer").map((m) => ({ value: m.id, label: `${m.fullName} (${ROLE[m.role].label})` }))}
          cases={data.cases.map((c) => ({ value: c.id, label: c.label }))}
        />
      </Section>
      )}
    </div>
  );
}
