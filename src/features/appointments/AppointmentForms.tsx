"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { APPOINTMENT_KIND, APPOINTMENT_STATUS } from "@/lib/domain/labels";
import type { AppointmentKind, AppointmentStatus } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { createAppointmentAction, deleteAppointmentAction, updateAppointmentAction } from "./actions";
import type { AppointmentValues } from "./values";

const INITIAL_STATUSES: AppointmentStatus[] = ["planned", "awaiting_confirmation", "confirmed"];
const ALL_STATUSES = Object.keys(APPOINTMENT_STATUS) as AppointmentStatus[];

type Option = { value: string; label: string };

/** Champs d'un rendez-vous, communs à la création et à la modification (identifiants préfixés). */
function AppointmentFields({
  prefix,
  state,
  members,
  cases,
  defaults,
  statuses,
}: {
  prefix: string;
  state: FormState;
  members: Option[];
  cases?: Option[];
  defaults: Partial<AppointmentValues> & { caseId?: string };
  statuses: AppointmentStatus[];
}) {
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  const id = (name: string) => `${prefix}-${name}`;
  // React vide le formulaire après chaque réponse, et une liste déroulante revient alors au choix de
  // son premier affichage. La clé la recrée avec la valeur saisie : après une erreur, la sélection
  // est conservée (sinon un second envoi enregistrerait un type ou un état que personne n'a choisi).
  const kind = v.kind ?? defaults.kind ?? "consultation";
  const status = v.status ?? defaults.status ?? "planned";
  const assignee = v.assignedTo ?? defaults.assignedTo;
  const caseId = v.caseId ?? defaults.caseId ?? "";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormField id={id("title")} label="Objet" required error={e.title} className="sm:col-span-2">
        <Input id={id("title")} name="title" defaultValue={v.title ?? defaults.title} placeholder="Ex. : Dépôt du dossier visa au centre VFS" {...describedBy(id("title"), e.title)} />
      </FormField>
      <FormField id={id("kind")} label="Type" required error={e.kind}>
        <select key={kind} id={id("kind")} name="kind" defaultValue={kind} className={selectClass}>
          {(Object.keys(APPOINTMENT_KIND) as AppointmentKind[]).map((k) => (
            <option key={k} value={k}>
              {APPOINTMENT_KIND[k]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={id("status")} label="État" required error={e.status}>
        <select key={status} id={id("status")} name="status" defaultValue={status} className={selectClass}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {APPOINTMENT_STATUS[s].label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={id("date")} label="Date" required error={e.date}>
        <Input id={id("date")} name="date" type="date" defaultValue={v.date ?? defaults.date} />
      </FormField>
      <FormField id={id("start")} label="Heure de début" error={e.startTime} hint="Vide = toute la journée (échéance)">
        <Input id={id("start")} name="startTime" type="time" defaultValue={v.startTime ?? defaults.startTime} {...describedBy(id("start"), e.startTime, "hint")} />
      </FormField>
      <FormField id={id("end")} label="Heure de fin" error={e.endTime}>
        <Input id={id("end")} name="endTime" type="time" defaultValue={v.endTime ?? defaults.endTime} {...describedBy(id("end"), e.endTime)} />
      </FormField>
      <FormField id={id("assignee")} label="Responsable" required error={e.assignedTo}>
        <select key={assignee} id={id("assignee")} name="assignedTo" defaultValue={assignee} className={selectClass}>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={id("location")} label="Lieu" error={e.location} className="sm:col-span-2">
        <Input id={id("location")} name="location" defaultValue={v.location ?? defaults.location} placeholder="Ex. : Agence, visioconférence, ambassade…" />
      </FormField>
      <FormField
        id={id("reference")}
        label="Référence de la preuve"
        error={e.externalReference}
        hint="Numéro de réservation : obligatoire pour confirmer un rendez-vous administratif."
        className="sm:col-span-2"
      >
        <Input id={id("reference")} name="externalReference" defaultValue={v.externalReference ?? defaults.externalReference} {...describedBy(id("reference"), e.externalReference, "hint")} />
      </FormField>
      {cases && (
        <FormField id={id("case")} label="Dossier lié" className="sm:col-span-2">
          <select key={caseId} id={id("case")} name="caseId" defaultValue={caseId} className={selectClass}>
            <option value="">Aucun</option>
            {cases.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      )}
    </div>
  );
}

export function AppointmentForm({
  members,
  cases,
  defaultMemberId,
  defaultDate,
  fixedCaseId,
  fixedClientId,
}: {
  members: Option[];
  cases?: Option[];
  defaultMemberId: string;
  defaultDate: string;
  fixedCaseId?: string;
  /** Fiche sans dossier (prospect) : le rendez-vous est lié à la personne. */
  fixedClientId?: string;
}) {
  const [state, action, pending] = useActionState(createAppointmentAction, initialFormState);
  const fixed = fixedCaseId || fixedClientId;
  return (
    <form action={action} className="space-y-3" noValidate>
      {fixedCaseId && <input type="hidden" name="caseId" value={fixedCaseId} />}
      {fixedClientId && <input type="hidden" name="clientId" value={fixedClientId} />}
      <AppointmentFields
        prefix="rdv"
        state={state}
        members={members}
        cases={fixed ? undefined : cases}
        defaults={{ assignedTo: defaultMemberId, date: defaultDate }}
        statuses={INITIAL_STATUSES}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : "Programmer le rendez-vous"}
        </Button>
      </div>
    </form>
  );
}

/** Modifier un rendez-vous (tous ses champs, y compris son état) ou le supprimer, après confirmation. */
export function AppointmentActions({ appointment, members }: { appointment: AppointmentValues; members: Option[] }) {
  const [editState, editAction, saving] = useActionState(updateAppointmentAction, initialFormState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteAppointmentAction, initialFormState);
  const [mode, setMode] = useState<"idle" | "edit" | "delete">("idle");
  const [handled, setHandled] = useState(editState);
  // Modification enregistrée : le formulaire se referme (ajusté pendant le rendu, à chaque nouveau résultat).
  if (editState !== handled) {
    setHandled(editState);
    if (editState.ok) setMode("idle");
  }
  const prefix = `rdv-${appointment.id.slice(0, 8)}`;

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => setMode("edit")} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline">
            <Pencil className="size-4" aria-hidden />
            Modifier
          </button>
          <button type="button" onClick={() => setMode("delete")} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-red-700 hover:underline">
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </button>
          {editState.ok && editState.message && <FormMessage message={editState.message} tone="success" />}
        </div>
      )}

      {mode === "edit" && (
        <form action={editAction} className="space-y-3" noValidate>
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <AppointmentFields prefix={prefix} state={editState} members={members} defaults={appointment} statuses={ALL_STATUSES} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <FormMessage message={editState.ok ? undefined : editState.message} />
            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
                Annuler
              </Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <form action={deleteAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <p className="text-sm text-slate-700">Supprimer définitivement « {appointment.title} » ?</p>
          <Button type="submit" size="sm" variant="destructive" disabled={deleting}>
            {deleting ? "Suppression…" : "Confirmer la suppression"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Annuler
          </Button>
          {deleteState.message && !deleteState.ok && <FormMessage message={deleteState.message} />}
        </form>
      )}
    </div>
  );
}
