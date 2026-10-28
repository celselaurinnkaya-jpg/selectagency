"use client";

import { useRef } from "react";
import Form from "next/form";

// Formulaire de filtres en GET : il fonctionne sans JavaScript (bouton « Filtrer »),
// et se soumet tout seul au changement d'une liste déroulante une fois l'interface chargée.
export function FilterForm({ action, children }: { action: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Form
      ref={ref}
      action={action}
      onChange={(event) => {
        if ((event.target as HTMLElement).tagName === "SELECT") ref.current?.requestSubmit();
      }}
      className="mb-4 flex flex-col gap-2 rounded-xl bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {children}
    </Form>
  );
}
