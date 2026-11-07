import "server-only";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { countryOptions, RESIDENCE_COUNTRIES } from "@/lib/countries";
import { ROLE } from "@/lib/domain/labels";
import { activeMembers } from "@/lib/domain/members";
import type { Appointment, Client, Task } from "@/lib/domain/types";
import { dayKey } from "@/lib/format";
import { loadCampaigns } from "@/features/communications/queries";

// Prospects : fiches au statut « prospect », avec leur prochaine relance (tâche ouverte la plus
// proche) et leur prochain rendez-vous. « À relancer » = relance prévue aujourd'hui ou en retard.

export type ProspectFilter = "tous" | "a-relancer" | "sans-relance" | "devenus-clients";

export const isProspectFilter = (value: unknown): value is ProspectFilter =>
  value === "tous" || value === "a-relancer" || value === "sans-relance" || value === "devenus-clients";

const open = (t: Task) => t.status === "todo" || t.status === "in_progress";

export interface ProspectRow {
  client: Client;
  advisor?: string;
  nextFollowUp?: Task;
  nextAppointment?: Appointment;
  dueToday: boolean;
}

export async function listProspects(filter: ProspectFilter) {
  const { data, now, ctx } = await readAgency({ clients: true, tasks: true, appointments: true });
  const tz = data.agency.timezone;
  const today = dayKey(now, tz);
  const month = today.slice(0, 7);

  const rowOf = (client: Client): ProspectRow => {
    const nextFollowUp = data.tasks.filter((t) => t.clientId === client.id && open(t)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    const nextAppointment = data.appointments
      .filter((a) => a.clientId === client.id && a.status !== "cancelled" && a.status !== "done" && new Date(a.startsAt).getTime() >= now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return {
      client,
      advisor: data.members.find((m) => m.id === client.assignedTo)?.fullName,
      nextFollowUp,
      nextAppointment,
      dueToday: !!nextFollowUp && dayKey(nextFollowUp.dueAt, tz) <= today,
    };
  };

  const prospects = data.clients.filter((c) => c.status === "prospect" && !c.archivedAt).map(rowOf);
  // Devenus clients : les plus récents d'abord (trois derniers mois).
  const since = new Date(now.getTime() - 92 * 24 * 3600 * 1000).toISOString();
  const converted = data.clients
    .filter((c) => c.status === "client" && c.convertedAt && c.convertedAt >= since)
    .sort((a, b) => (b.convertedAt ?? "").localeCompare(a.convertedAt ?? ""))
    .map(rowOf);

  const lists: Record<ProspectFilter, ProspectRow[]> = {
    tous: prospects,
    "a-relancer": prospects.filter((p) => p.dueToday),
    "sans-relance": prospects.filter((p) => !p.nextFollowUp && !p.nextAppointment),
    "devenus-clients": converted,
  };
  // Relances dues d'abord, puis les fiches les plus récentes.
  const rows =
    filter === "devenus-clients"
      ? converted
      : [...lists[filter]].sort(
          (a, b) =>
            Number(b.dueToday) - Number(a.dueToday) ||
            (a.nextFollowUp?.dueAt ?? "9999").localeCompare(b.nextFollowUp?.dueAt ?? "9999") ||
            b.client.registeredAt.localeCompare(a.client.registeredAt),
        );

  return {
    agency: data.agency,
    now,
    rows,
    canWrite: allowed(ctx, "operations.write"),
    counts: {
      tous: prospects.length,
      "a-relancer": lists["a-relancer"].length,
      "sans-relance": lists["sans-relance"].length,
      "devenus-clients": converted.length,
    },
    convertedThisMonth: data.clients.filter((c) => c.convertedAt && dayKey(c.convertedAt, tz).startsWith(month)).length,
    newThisMonth: data.clients.filter((c) => c.status === "prospect" && dayKey(c.registeredAt, tz).startsWith(month)).length,
  };
}

/** Données du formulaire « Nouveau prospect ». */
export async function getProspectForm() {
  const { data, ctx, now } = await readAgency({});
  const campaigns = await loadCampaigns(ctx);
  return {
    campaigns,
    partnersLocked: ctx.locked.includes("partners"),
    forbidden: allowed(ctx, "operations.write") ? undefined : forbiddenMessage(ctx, "operations.write"),
    defaultCountry: data.agency.countryCode,
    defaultMemberId: ctx.member.id,
    members: activeMembers(data.members)
      .filter((m) => m.role !== "viewer")
      .map((m) => ({ value: m.id, label: `${m.fullName} (${ROLE[m.role].label})` })),
    countries: countryOptions(RESIDENCE_COUNTRIES).map((c) => ({ value: c.code, label: c.name })),
    today: dayKey(now, data.agency.timezone),
  };
}
