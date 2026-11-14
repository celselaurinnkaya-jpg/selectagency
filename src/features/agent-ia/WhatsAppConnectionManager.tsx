"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plug,
  Smartphone,
  ShieldCheck,
  Send,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { Card, Section } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectWhatsAppModal } from "./ConnectWhatsAppModal";
import { WhatsAppQrConnectModal } from "./WhatsAppQrConnectModal";
import { WhatsAppWebQrCard } from "./WhatsAppWebQrCard";
import {
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

export function WhatsAppConnectionManager({
  accounts,
  canManage,
  agencyName,
  maxWaNumbers,
}: WhatsAppConnectionManagerProps) {
  const router = useRouter();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSendingTest, startSendingTest] = useTransition();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Un compte n'est actif que si son statut est explicitement 'connected'
  const activeAccount = accounts.find((a) => a.status === "connected");
  const disconnectedAccounts = accounts.filter((a) => a.status === "disconnected");

  const handleCopyWebhookUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${origin}/api/webhooks/whatsapp`);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

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

      {/* Si aucun compte n'est actuellement connecté : AFFICHER DIRECTEMENT LE SCANNER WHATSAPP WEB */}
      {!activeAccount ? (
        <div className="space-y-6">
          <WhatsAppWebQrCard
            agencyName={agencyName}
            onOpenCloudApiModal={() => setIsConnectModalOpen(true)}
            onOpenMetaModal={() => setIsMetaModalOpen(true)}
          />

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
                    Cette ligne est actuellement en sommeil. Vous pouvez la rebrancher en 1 clic ou scanner le code QR ci-dessus.
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
                            activeAccount.status === "connected"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {activeAccount.status === "connected" ? "Connecté" : "Déconnecté"}
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

                {/* Identifiants techniques Meta */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-400">Phone Number ID :</span>
                    <span className="font-mono font-medium text-slate-800">{activeAccount.phoneNumberId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-400">WABA ID :</span>
                    <span className="font-mono font-medium text-slate-800">{activeAccount.wabaId}</span>
                  </div>
                </div>
              </Card>

              {/* Panneau de configuration Webhook & Test */}
              <div className="space-y-4">
                {/* Configuration du Webhook Meta */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-navy-800" />
                    <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider">
                      Paramètres Webhook Meta
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    À renseigner dans votre portail Meta Developers pour router les messages :
                  </p>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">URL de rappel :</span>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input
                          readOnly
                          value="/api/webhooks/whatsapp"
                          className="h-8 text-xs font-mono bg-slate-50"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyWebhookUrl}
                          className="h-8 w-8 p-0 shrink-0 cursor-pointer"
                          title="Copier l'URL complète"
                        >
                          {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Jeton de vérification (Verify Token) :</span>
                      <Input
                        readOnly
                        value="select_agency_wa_token_2026"
                        className="h-8 text-xs font-mono bg-slate-50 mt-1"
                      />
                    </div>
                  </div>
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
                    Saisissez un numéro pour envoyer un message de test :
                  </p>

                  <form onSubmit={handleSendTestMessage} className="space-y-2">
                    <Input
                      value={testPhoneNumber}
                      onChange={(e) => setTestPhoneNumber(e.target.value)}
                      placeholder="+237 6..."
                      className="h-8 text-xs"
                    />
                    <Button
                      type="submit"
                      disabled={isSendingTest || !testPhoneNumber.trim()}
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

      {/* Modale de connexion manuelle Cloud API (optionnelle) */}
      {isConnectModalOpen && (
        <ConnectWhatsAppModal onClose={() => setIsConnectModalOpen(false)} />
      )}

      {/* Modale officielle Meta pour afficher le QR code officiel scannable par le téléphone */}
      <WhatsAppQrConnectModal
        isOpen={isMetaModalOpen}
        onClose={() => setIsMetaModalOpen(false)}
      />
    </div>
  );
}
