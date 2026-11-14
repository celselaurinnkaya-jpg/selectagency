"use client";

import { useState, useTransition } from "react";
import { Link2, Search, User, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkConversationToClientAction } from "./conversations-actions";
import type { ClientOption } from "./conversations-queries";

interface LinkClientModalProps {
  conversationId: string;
  clients: ClientOption[];
  isOpen: boolean;
  onClose: () => void;
}

export function LinkClientModal({
  conversationId,
  clients,
  isOpen,
  onClose,
}: LinkClientModalProps) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.reference.toLowerCase().includes(q) ||
      c.phoneE164.includes(q)
    );
  });

  const handleConfirm = () => {
    if (!selectedClientId) return;
    setErrorMsg(null);

    startTransition(async () => {
      const res = await linkConversationToClientAction(conversationId, selectedClientId);
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
      aria-labelledby="link-client-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h3 id="link-client-title" className="text-base font-bold text-navy-900">
              Rattacher à une fiche client
            </h3>
            <p className="text-xs text-slate-500">
              Associez cette conversation WhatsApp officielle au dossier CRM d&apos;un client existant.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        {/* Barre de recherche */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, référence (CLI-...) ou téléphone..."
            className="pl-9 text-sm"
            autoFocus
          />
        </div>

        {/* Liste des clients */}
        <div className="mt-3 max-h-60 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-1 bg-slate-50/50">
          {filteredClients.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">
              Aucun client ne correspond à cette recherche.
            </p>
          ) : (
            filteredClients.map((c) => {
              const isSelected = selectedClientId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClientId(c.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                    isSelected
                      ? "bg-navy-800 text-white font-medium shadow-xs"
                      : "hover:bg-white text-navy-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <User className={`h-4 w-4 shrink-0 ${isSelected ? "text-citron-400" : "text-slate-400"}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.fullName}</p>
                      <p className={`text-[11px] truncate ${isSelected ? "text-slate-200" : "text-slate-500"}`}>
                        {c.reference} • {c.phoneE164}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-citron-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
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
            type="button"
            disabled={!selectedClientId || isPending}
            onClick={handleConfirm}
            className="bg-navy-800 text-white hover:bg-navy-700"
          >
            {isPending ? "Liaison en cours..." : "Rattacher ce client"}
          </Button>
        </div>
      </div>
    </div>
  );
}

