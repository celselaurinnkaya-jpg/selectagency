"use client";

import { useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Card, Section, EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { AddTemplateModal } from "./AddTemplateModal";
import { deleteTemplateAction } from "./templates-actions";
import type { WaTemplateRecord } from "@/lib/domain/ai";

interface TemplatesManagerProps {
  templates: WaTemplateRecord[];
  canManage: boolean;
}

export function TemplatesManager({ templates, canManage }: TemplatesManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous supprimer ce modèle WhatsApp ?")) return;
    setDeletingId(id);
    try {
      const fd = new FormData();
      fd.append("id", id);
      await deleteTemplateAction(fd);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notice sur la règle Meta des 24h */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-navy-900 text-base">
              Règle des 24 heures et Modèles Meta
            </h3>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Pour écrire à un client au-delà de 24 heures après son dernier message, Meta impose
              l&apos;utilisation d&apos;un modèle pré-approuvé (utilitaire, rappel ou marketing).
              Pendant la fenêtre de 24h, l&apos;IA ou votre équipe peut répondre librement.
            </p>
          </div>

          {canManage && (
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="gap-1.5 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nouveau modèle</span>
            </Button>
          )}
        </div>
      </div>

      {/* Liste des modèles */}
      <Section title="Modèles configurés">
        <p className="text-sm text-slate-600 mb-4 -mt-1">
          Modèles utilisables pour les notifications, rappels de rendez-vous et relances de documents.
        </p>

        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun modèle WhatsApp enregistré"
            description="Créez votre premier modèle utilitaire (ex: rappel de rendez-vous consulaire ou pièces prêtes) pour relancer vos clients en toute conformité."
            action={
              canManage ? (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Créer un modèle</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => {
              const isDeleting = deletingId === tpl.id;

              return (
                <Card key={tpl.id} className="flex flex-col justify-between p-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-navy-900 text-sm font-mono">{tpl.name}</h4>
                        <span className="text-[11px] text-slate-500 capitalize">
                          {tpl.category === "UTILITY"
                            ? "Utilitaire"
                            : tpl.category === "MARKETING"
                              ? "Marketing"
                              : "Authentification"}{" "}
                          • {tpl.language.toUpperCase()}
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Approuvé
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed">
                      {tpl.bodyText}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Créé le {new Date(tpl.createdAt).toLocaleDateString()}</span>

                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => handleDelete(tpl.id)}
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Supprimer ce modèle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* Modale */}
      {isModalOpen && <AddTemplateModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
