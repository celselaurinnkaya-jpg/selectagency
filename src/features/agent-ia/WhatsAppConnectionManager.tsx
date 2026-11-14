"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plug,
  Smartphone,
  ShieldCheck,
  Send,
  Trash2,
  Copy,
  Check,
  Radio,
  QrCode,
} from "lucide-react";
import { Card, Section } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectWhatsAppModal } from "./ConnectWhatsAppModal";
import { WhatsAppMetaConnectModal } from "./WhatsAppMetaConnectModal";
import { WhatsAppQrConnectModal } from "./WhatsAppQrConnectModal";
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
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
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
            className="text-xs opacity-60 hover:opacity-100 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Si aucun compte n'est actuellement connecté */}
      {!activeAccount ? (
        <div className="space-y-6">
          <Card className="p-6 md:p-8 border-slate-200 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                  <Radio className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                  Meta Cloud API Officielle
                </div>
                <h3 className="text-xl font-bold text-navy-900">
                  Branchez le numéro WhatsApp officiel de {agencyName}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Connectez votre compte WhatsApp Business officiel pour que votre Agent IA puisse répondre
                  immédiatement 24h/24 aux questions consulaires, de voyages et d&apos;études de vos clients.
                </p>
              </div>

              {canManage && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                  <Button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    variant="accent"
                    className="h-11 px-5 rounded-xl font-semibold gap-2"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Connecter par Code QR (WhatsApp Web)</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsConnectModalOpen(true)}
                    className="h-11 px-4 rounded-xl font-medium gap-2 border-slate-300 text-slate-700 bg-white"
                  >
                    <Plug className="h-4 w-4" />
                    <span>Mode API Cloud</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Les 3 piliers de la connexion */}
            <div className="grid gap-4 sm:grid-cols-3 pt-4 border-t border-slate-100">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800 text-citron-400 font-bold text-xs">
                  1
                </span>
                <h4 className="font-bold text-navy-900 text-sm">Zéro mot de passe partagé</h4>
                <p className="text-xs text-slate-600">
                  La connexion utilise les jetons chiffrés de Meta. Votre agence garde la maîtrise totale de sa ligne.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800 text-citron-400 font-bold text-xs">
                  2
                </span>
                <h4 className="font-bold text-navy-900 text-sm">Mode Coexistence</h4>
                <p className="text-xs text-slate-600">
                  Gardez votre application mobile WhatsApp Business active sur le téléphone pendant que l&apos;IA répond.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800 text-citron-400 font-bold text-xs">
                  3
                </span>
                <h4 className="font-bold text-navy-900 text-sm">Passage de relais humain</h4>
                <p className="text-xs text-slate-600">
                  Dès qu&apos;un client formule une négociation ou demande un responsable, la main repasse à votre équipe.
                </p>
              </div>
            </div>
          </Card>

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
                    Cette ligne est actuellement en sommeil. Vous pouvez la rebrancher en 1 clic ou connecter une nouvelle ligne ci-dessus.
                  </p>
                </div>

                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isReconnecting}
                    onClick={() => handleReconnect(disconnectedAccounts[0].id)}
                    className="h-9 px-3.5 text-xs border-slate-300 text-navy-900 hover:bg-white shrink-0 gap-1.5"
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

                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isDisconnecting}
                      onClick={() => handleDisconnect(activeAccount.id)}
                      className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200 text-xs gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isDisconnecting ? "Déconnexion..." : "Déconnecter"}</span>
                    </Button>
                  )}
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
                          className="h-8 w-8 p-0 shrink-0"
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
                      className="w-full h-8 text-xs bg-navy-800 text-white hover:bg-navy-900"
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

      {/* Modale de connexion */}
      {isConnectModalOpen && (
        <ConnectWhatsAppModal onClose={() => setIsConnectModalOpen(false)} />
      )}

      {/* Connexion officielle de Meta */}
      <WhatsAppMetaConnectModal
        isOpen={isMetaModalOpen}
        onClose={() => setIsMetaModalOpen(false)}
      />

      {/* Connexion par Code QR WhatsApp Web */}
      <WhatsAppQrConnectModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />
    </div>
  );
}
