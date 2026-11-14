"use client";

import { useState, useTransition } from "react";
import { UserPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProspectFromConversationAction } from "./conversations-actions";
import type { MemberOption } from "./conversations-queries";

interface CreateProspectModalProps {
  conversationId: string;
  defaultName?: string;
  phone: string;
  members: MemberOption[];
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProspectModal({
  conversationId,
  defaultName,
  phone,
  members,
  isOpen,
  onClose,
}: CreateProspectModalProps) {
  // Découper le nom de profil WhatsApp éventuel en prénom et nom
  const parts = (defaultName ?? "").trim().split(/\s+/);
  const initialFirst = parts.length > 1 ? parts[0] : defaultName ?? "";
  const initialLast = parts.length > 1 ? parts.slice(1).join(" ") : "";

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [residenceCountry, setResidenceCountry] = useState("CM");
  const [assignedTo, setAssignedTo] = useState(members[0]?.id ?? "");
  const [notes, setNotes] = useState("Prospect généré depuis un échange sur le WhatsApp officiel de l'agence.");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("Veuillez indiquer le prénom et le nom.");
      return;
    }
    setErrorMsg(null);

    startTransition(async () => {
      const res = await createProspectFromConversationAction({
        conversationId,
        firstName,
        lastName,
        residenceCountry,
        assignedTo,
        notes,
      });

      if (res.ok) {
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-prospect-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-citron-400">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h3 id="create-prospect-title" className="text-base font-bold text-navy-900">
              Créer un prospect depuis ce contact
            </h3>
            <p className="text-xs text-slate-500">
              Générez instantanément une fiche prospect dans le CRM et liez-y ce fil de discussion.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prénom <span className="text-red-500">*</span>
              </label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex : Moussa"
                className="text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ex : Kamdem"
                className="text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Numéro WhatsApp (reçu)
            </label>
            <Input
              value={phone}
              readOnly
              className="bg-slate-50 text-slate-600 font-mono text-xs cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pays de résidence
              </label>
              <select
                value={residenceCountry}
                onChange={(e) => setResidenceCountry(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-navy-600"
              >
                <option value="CM">Cameroun</option>
                <option value="CI">Côte d&apos;Ivoire</option>
                <option value="SN">Sénégal</option>
                <option value="GA">Gabon</option>
                <option value="CD">RDC</option>
                <option value="CG">Congo</option>
                <option value="TG">Togo</option>
                <option value="BJ">Bénin</option>
                <option value="FR">France</option>
                <option value="CA">Canada</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Conseiller assigné
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-navy-600"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes internes de départ
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-navy-600 resize-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-navy-800 text-white hover:bg-navy-700 gap-1.5"
            >
              <Sparkles className="h-4 w-4 text-citron-400" />
              {isPending ? "Création..." : "Créer le prospect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

