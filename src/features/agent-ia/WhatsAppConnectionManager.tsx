"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plug,
  Smartphone,
  ShieldCheck,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, Section } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { WhatsAppQrConnectModal } from "./WhatsAppQrConnectModal";
import {
  connectWhatsAppAccountAction,
  disconnectWhatsAppAccountAction,
  reconnectWhatsAppAccountAction,
  sendTestWhatsAppMessageAction,
} from "./whatsapp-actions";
import type { WaAccountRecord } from "@/lib/domain/ai";

interface WhatsAppConnectionManagerProps {
  accounts: WaAccountRecord[];
  canManage: boolean;
  agencyName: string;
  maxWaNumbers: number;
}

const CONNECT_STEPS = [
  { title: "Vos informations", text: "Déjà remplies avec celles de l'agence : vérifiez-les." },
  { title: "À lire d'abord", text: "Téléphone à portée de main, WhatsApp Business à jour." },
  { title: "Fenêtre de Meta", text: "Code ou QR code à confirmer dans WhatsApp Business." },
];

function AgencyCloudApiForm() {
  const [state, formAction, isPending] = useActionState(
    connectWhatsAppAccountAction,
    initialFormState
  );
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message && (
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      )}

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-emerald-900">Connexion directe Meta Cloud API</p>
          <p className="text-emerald-800/90 mt-0.5">
            Renseignez le Phone Number ID, le WABA ID et la clé d&apos;accès de votre numéro (Meta for Developers). SELECT
            vérifie la clé auprès de Meta, puis l&apos;enregistre chiffrée : elle n&apos;est jamais réaffichée.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id="agency-wa-phone-id"
          label="Phone Number ID (Meta)"
          required
          hint="Identifiant numérique du numéro chez Meta"
          error={e.phoneNumberId}
        >
          <Input
            id="agency-wa-phone-id"
            name="phoneNumberId"
            defaultValue={v.phoneNumberId}
            placeholder="Ex. : 105829471938501"
            className="font-mono text-xs"
          />
        </FormField>

        <FormField
          id="agency-wa-waba-id"
          label="WABA ID (WhatsApp Business Account)"
          required
          hint="Identifiant du compte Business chez Meta"
          error={e.wabaId}
        >
          <Input
            id="agency-wa-waba-id"
            name="wabaId"
            defaultValue={v.wabaId}
            placeholder="Ex. : 194820485910482"
            className="font-mono text-xs"
          />
        </FormField>

        <FormField
          id="agency-wa-access-token"
          label="Clé d'accès Meta de ce numéro"
          required
          hint="Meta → Paramètres de l'entreprise → Utilisateurs système → générer une clé avec whatsapp_business_messaging et whatsapp_business_management. Le numéro et le nom seront ceux de Meta."
          error={e.accessToken}
          className="sm:col-span-2"
        >
          <Input
            id="agency-wa-access-token"
            name="accessToken"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="EAA…"
            className="font-mono text-xs"
          />
        </FormField>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-navy-800" />
          <label htmlFor="wa-agency-coexistence" className="text-xs font-bold text-navy-900 cursor-pointer">
            Activer le mode Coexistence
          </label>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Permet de continuer à utiliser l&apos;application mobile WhatsApp Business sur le smartphone de votre agence
          tout en laissant l&apos;Agent IA répondre automatiquement.
        </p>
        <div className="pt-1 flex items-center gap-2">
          <input
            type="checkbox"
            id="wa-agency-coexistence"
            name="coexistence"
            value="true"
            defaultChecked={true}
            className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-500"
          />
          <label htmlFor="wa-agency-coexistence" className="text-xs text-slate-700 cursor-pointer">
            Garder l&apos;application WhatsApp Business active sur mon smartphone
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end pt-2">
        <Button
          type="submit"
          disabled={isPending}
          variant="accent"
          className="font-semibold text-xs min-w-36 cursor-pointer"
        >
          <Plug className="h-4 w-4 mr-1.5" />
          {isPending ? "Connexion en cours..." : "Enregistrer la ligne WhatsApp"}
        </Button>
      </div>
    </form>
  );
}

export function WhatsAppConnectionManager({
  accounts,
  canManage,
  agencyName,
  maxWaNumbers,
}: WhatsAppConnectionManagerProps) {
  const router = useRouter();
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSendingTest, startSendingTest] = useTransition();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isConnectOpen, setIsConnectOpen] = useState(false);

  // Un compte n'est actif que si son statut est explicitement 'connected'
  const activeAccount = accounts.find((a) => a.status === "connected");
  const disconnectedAccounts = accounts.filter((a) => a.status === "disconnected");
  // Numéro relié sans sa propre autorisation Meta (aucune clé de secours) : il ne peut rien envoyer.
  const missingAccess = Boolean(activeAccount && activeAccount.hasOwnAccess === false);

  const handleSendTestMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhoneNumber.trim() || !activeAccount) return;

    startSendingTest(async () => {
      const res = await sendTestWhatsAppMessageAction(activeAccount.id, testPhoneNumber);
      setTestResult(res);
    });
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Voulez-vous vraiment déconnecter ce numéro WhatsApp de l'Agent IA ?")) return;
    setIsDisconnecting(true);
    setActionFeedback(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      const res = await disconnectWhatsAppAccountAction(fd);
      if (res.ok) {
        setActionFeedback({ ok: true, message: res.message || "Numéro WhatsApp déconnecté." });
        router.refresh();
      } else {
        setActionFeedback({ ok: false, message: res.message || "Impossible de déconnecter ce compte." });
      }
    } catch {
      setActionFeedback({ ok: false, message: "Une erreur inattendue est survenue lors de la déconnexion." });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReconnect = async (id: string) => {
    setIsReconnecting(true);
    setActionFeedback(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      const res = await reconnectWhatsAppAccountAction(fd);
      if (res.ok) {
        setActionFeedback({ ok: true, message: res.message || "Numéro WhatsApp reconnecté." });
        router.refresh();
      } else {
        setActionFeedback({ ok: false, message: res.message || "Impossible de reconnecter ce compte." });
      }
    } catch {
      setActionFeedback({ ok: false, message: "Une erreur inattendue est survenue lors de la reconnexion." });
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {actionFeedback && (
        <div
          className={`rounded-xl p-3.5 text-xs font-medium flex items-center justify-between ${
            actionFeedback.ok
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs opacity-60 hover:opacity-100 ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Si aucun compte n'est actuellement connecté */}
      {!activeAccount ? (
        <div className="space-y-6">
          {/* Parcours officiel de Meta en 3 étapes (informations, conseils, fenêtre de Meta) */}
          <Section title="Connecter WhatsApp Business">
            <Card className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-navy-800 text-citron-400">
                  <Smartphone className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-navy-900">Reliez l&apos;application WhatsApp Business de l&apos;agence en quelques minutes</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Connexion officielle de Meta. Votre équipe garde WhatsApp Business sur le téléphone, et l&apos;Agent IA répond depuis SELECT.
                  </p>
                </div>
              </div>

              <ol className="grid gap-3 sm:grid-cols-3">
                {CONNECT_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-sm">
                      <span className="block font-semibold text-navy-900">{s.title}</span>
                      <span className="text-slate-600">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {canManage ? (
                <Button type="button" variant="accent" className="h-11 w-full gap-2 sm:w-auto" onClick={() => setIsConnectOpen(true)}>
                  <Plug className="size-4" aria-hidden />
                  Connecter WhatsApp Business
                </Button>
              ) : (
                <p className="rounded-xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
                  Seul le propriétaire ou un administrateur de l&apos;agence peut connecter le numéro WhatsApp.
                </p>
              )}
            </Card>
          </Section>

          {canManage && (
            <details className="rounded-2xl border border-border bg-surface p-4">
              <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-navy-800">
                Configuration manuelle : vous avez déjà des identifiants Meta Cloud API (Phone Number ID et WABA ID)
              </summary>
              <Card className="mt-3 p-5">
                <AgencyCloudApiForm />
              </Card>
            </details>
          )}

          {/* Ligne précédemment déconnectée si existante */}
          {disconnectedAccounts.length > 0 && (
            <Card className="p-5 border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                    <h4 className="text-sm font-bold text-navy-900">
                      Ligne précédemment enregistrée
                    </h4>
                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      Déconnectée
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Numéro : <strong className="font-mono text-navy-900">{disconnectedAccounts[0].displayPhoneNumber}</strong> ({disconnectedAccounts[0].verifiedName || agencyName})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Cette ligne est actuellement en sommeil. Vous pouvez la rebrancher en 1 clic ou relancer la connexion ci-dessus.
                  </p>
                </div>

                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReconnecting}
                    onClick={() => handleReconnect(disconnectedAccounts[0].id)}
                    className="h-9 px-3.5 text-xs border-slate-300 text-navy-900 hover:bg-white shrink-0 gap-1.5 cursor-pointer"
                  >
                    <Plug className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{isReconnecting ? "Reconnexion..." : "Rebrancher ce numéro"}</span>
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      ) : (
        /* Si le compte WhatsApp est connecté */
        <div className="space-y-6">
          <Section title="Numéro WhatsApp connecté">
            <p className="text-sm text-slate-600 mb-4 -mt-1">
              Ce numéro est actuellement relié à votre Agent IA et écoute les messages entrants.
            </p>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Carte principale du numéro */}
              <Card className="p-5 lg:col-span-2 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-navy-900 text-lg">
                          {activeAccount.displayPhoneNumber}
                        </h4>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            missingAccess
                              ? "bg-orange-100 text-orange-900 border-orange-200"
                              : activeAccount.status === "connected"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {missingAccess ? "Autorisation manquante" : activeAccount.status === "connected" ? "Connecté" : "Déconnecté"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activeAccount.verifiedName || agencyName} • WhatsApp Business Cloud API
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      asChild
                      variant="accent"
                      size="sm"
                      className="h-9 px-3.5 rounded-xl font-semibold text-xs gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Link href="/agent-ia">
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Ouvrir WhatsApp Web</span>
                      </Link>
                    </Button>

                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDisconnecting}
                        onClick={() => handleDisconnect(activeAccount.id)}
                        className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200 text-xs gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{isDisconnecting ? "Déconnexion..." : "Déconnecter"}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Métriques et détails techniques */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                    <span className="text-slate-500 font-medium">Qualité de ligne</span>
                    <p className="font-semibold text-emerald-700 capitalize">
                      {activeAccount.qualityRating || "Non communiquée par Meta"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                    <span className="text-slate-500 font-medium">Quota formule</span>
                    <p className="font-semibold text-navy-900">
                      1 / {maxWaNumbers} numéro
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                    <span className="text-slate-500 font-medium">Coexistence</span>
                    <p className="font-semibold text-navy-900">
                      {activeAccount.coexistence ? "Activée (Mobile)" : "Standard API"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                    <span className="text-slate-500 font-medium">Date d&apos;activation</span>
                    <p className="font-semibold text-slate-700">
                      {new Date(activeAccount.connectedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Numéro sans sa propre autorisation : rien ne part, il faut le reconnecter. */}
                {missingAccess ? (
                <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-orange-950 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" aria-hidden />
                    <span>Autorisation Meta manquante pour ce numéro</span>
                  </div>
                  <p className="text-xs text-orange-900 leading-relaxed">
                    Ce numéro a été relié sans sa propre clé d&apos;accès Meta. SELECT n&apos;utilise aucune clé de secours : il ne peut donc
                    rien envoyer, et l&apos;Agent IA ne répond pas. Déconnectez-le, puis reconnectez-le avec le QR de Meta, ou par la
                    configuration manuelle avec sa clé d&apos;accès.
                  </p>
                </div>
                ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-950 font-semibold text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Ligne WhatsApp Business officielle active</span>
                  </div>
                  <p className="text-xs text-emerald-900/90 leading-relaxed">
                    Votre Agent IA écoute et répond 24h/24 aux questions de vos clients (visas, devis, procédures) conformément à vos guides de connaissances.
                  </p>
                  <p className="text-[11px] text-emerald-800/80">
                    💡 <strong>Mode Coexistence activé :</strong> Votre équipe continue d&apos;utiliser normalement l&apos;application WhatsApp Business sur smartphone sans aucune interruption.
                  </p>
                </div>
                )}
              </Card>

              {/* Panneau latéral : Accès WhatsApp Web & Test */}
              <div className="space-y-4">
                {/* Accès direct à l'inbox WhatsApp Web */}
                <Card className="p-4 space-y-3 bg-linear-to-br from-navy-900 via-navy-800 to-navy-950 text-white border-0 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-citron-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-citron-400">
                      Messagerie WhatsApp Web
                    </h4>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Retrouvez vos discussions clients en temps réel et prenez le relais sur l&apos;Agent IA quand vous le souhaitez.
                  </p>
                  <Button
                    asChild
                    variant="accent"
                    size="sm"
                    className="w-full h-9 text-xs font-semibold cursor-pointer"
                  >
                    <Link href="/agent-ia">
                      Ouvrir la boîte de réception
                    </Link>
                  </Button>
                </Card>

                {/* Test d'envoi sortant */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-navy-800" />
                    <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider">
                      Tester l&apos;envoi d&apos;un message
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600">
                    Numéro de téléphone qui recevra le message de test, avec l&apos;indicatif du pays :
                  </p>

                  <form onSubmit={handleSendTestMessage} className="space-y-2">
                    <Input
                      value={testPhoneNumber}
                      onChange={(e) => setTestPhoneNumber(e.target.value)}
                      placeholder="+237 6 99 11 22 33"
                      inputMode="tel"
                      aria-label="Numéro qui recevra le message de test"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="submit"
                      disabled={isSendingTest || !testPhoneNumber.trim() || missingAccess}
                      className="w-full h-8 text-xs bg-navy-800 text-white hover:bg-navy-900 cursor-pointer"
                    >
                      {isSendingTest ? "Envoi..." : "Envoyer le test"}
                    </Button>
                  </form>

                  {testResult && (
                    <div
                      className={`rounded-lg p-2.5 text-xs ${
                        testResult.ok
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border border-orange-200 bg-orange-50 text-orange-900"
                      }`}
                    >
                      {testResult.message}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </Section>
        </div>
      )}

      {canManage && <WhatsAppQrConnectModal isOpen={isConnectOpen} onClose={() => setIsConnectOpen(false)} />}
    </div>
  );
}
