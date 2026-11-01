import type { Appointment, AppointmentKind, AppointmentStatus } from "@/lib/domain/types";
import { dayKey, formatDate } from "@/lib/format";

/** Valeurs d'un rendez-vous telles que le formulaire de modification les affiche (fuseau de l'agence). */
export interface AppointmentValues {
  id: string;
  title: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  assignedTo: string;
  externalReference: string;
}

export function appointmentValues(a: Appointment, timeZone: string): AppointmentValues {
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    status: a.status,
    date: dayKey(a.startsAt, timeZone),
    startTime: a.allDay ? "" : formatDate(a.startsAt, timeZone, "time"),
    endTime: a.endsAt ? formatDate(a.endsAt, timeZone, "time") : "",
    location: a.location ?? "",
    assignedTo: a.assignedTo,
    externalReference: a.externalReference ?? "",
  };
}
