"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClientAction } from "./actions";

interface DeleteClientModalProps {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    reference: string;
  };
  variant?: "button" | "icon" | "dropdown";
}

export function DeleteClientModal({ client, variant = "button" }: DeleteClientModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setIsPending(true);
    setError(null);
    try {
      const res = await deleteClientAction(client.id);
      if (!res.ok) {
        setError(res.message ?? "Une erreur est survenue lors de la suppression.");
        setIsPending(false);
        return;
      }
      setIsOpen(false);
      router.push("/clients?ok=client-supprime");
      router.refresh();
    } catch {
      setError("Erreur inattendue lors de la suppression.");
      setIsPending(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 transition"
          title="Supprimer ce client"
          aria-label={`Supprimer ${client.firstName} ${client.lastName}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : variant === "dropdown" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 transition"
        >
          <Trash2 className="size-4" aria-hidden />
          <span>Supprimer le client</span>
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300"
        >
          <Trash2 className="size-4" aria-hidden />
          Supprimer
        </Button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="size-6" aria-hidden />
              </div>
              <div className="space-y-1">
                <h3 id="delete-dialog-title" className="text-base font-semibold text-navy-900">
                  Supprimer la fiche client
                </h3>
                <p className="text-sm text-slate-600">
                  Êtes-vous sûr de vouloir supprimer définitivement la fiche de{" "}
                  <strong className="text-navy-900 font-semibold">
                    {client.firstName} {client.lastName}
                  </strong>{" "}
                  (<span className="font-mono text-xs">{client.reference}</span>) ?
                </p>
                <p className="mt-2 text-xs text-red-600">
                  ⚠️ Cette action est irréversible. Le client n&apos;apparaîtra plus dans vos listes et recherches.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {isPending ? "Suppression en cours…" : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
