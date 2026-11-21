"use client";

import { useState, useTransition, useRef, useEffect, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Bot,
  Save,
  Send,
  RotateCcw,
  CheckCircle2,
  Clock,
  ExternalLink,
  QrCode,
  Sliders,
  ShoppingBag,
  FileText,
  AlertCircle,
  Layers,
  Globe,
  Upload,
  Loader2,
  Trash2,
  FileUp,
  Link2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppQrConnectModal } from "./WhatsAppQrConnectModal";
import { AddTextKnowledgeModal } from "./AddTextKnowledgeModal";
import {
  saveAiAgentAction,
  testAiAgentMessageAction,
  analyzeAndIndexExternalLinkAction,
} from "./actions";
import {
  uploadKnowledgeFileAction,
  deleteKnowledgeSourceAction,
} from "./knowledge-actions";
import { initialFormState, type FormState } from "@/lib/form-state";
import type {
  AiAgentRecord,
  AiKnowledgeSourceRecord,
  AiUsageSummary,
  TestChatMessage,
  WaAccountRecord,
} from "@/lib/domain/ai";

interface AgentStudioProps {
  agents: AiAgentRecord[];
  usage: AiUsageSummary;
  agencyName: string;
  canManage: boolean;
  sources: AiKnowledgeSourceRecord[];
  accounts: WaAccountRecord[];
  initialAgentId?: string;
  onSwitchToList?: () => void;
}

type StudioTab = "all" | "prompt" | "documents" | "links" | "services" | "connections" | "tools";

const DELAY_OPTIONS = [
  { value: 0, label: "0s (Instantané)" },
  { value: 5, label: "5s (Rapide)" },
  { value: 10, label: "10s (Naturel)" },
  { value: 15, label: "15s (Recommandé)" },
  { value: 20, label: "20s (Posé)" },
  { value: 30, label: "30s (Réfléchi)" },
];

const TEMPLATE_PRESETS = [
  {
    key: "support_client",
    title: "Support Client Polyvalent (Recommandé)",
    prompt: `# DESCRIPTION DU RÔLE
Tu es le service client d'élite pour notre agence.
Tu aides les clients de façon amicale, chaleureuse et naturelle, exactement comme un membre d'expérience de notre équipe.
Tu réponds aux questions, clarifies les démarches, orientes les prospects et assures une expérience client irréprochable.

# RÈGLES DE CONDUITE
1. Accueille chaque visiteur avec politesse et bienveillance.
2. Renseigne-toi d'abord sur son projet (voyage, visa ou études à l'étranger).
3. Utilise toujours les informations officielles de nos documents PDF et de notre page pour répondre aux tarifs et démarches.
4. Ne garantis JAMAIS l'obtention d'un visa à 100% (seul le consulat est souverain).
5. Si le client souhaite un devis personnalisé, négocier ou parler à un humain, dis-lui qu'un conseiller prend le relais et ajoute [DEMANDE_TRANSFERT].
6. Reste synthétique, poli et courtois sur WhatsApp.`,
  },
  {
    key: "visas",
    title: "Spécialiste Procédures Visas",
    prompt: `# DESCRIPTION DU RÔLE
Tu es le spécialiste consulaire de notre agence.
Ton rôle est d'orienter les voyageurs sur les pièces à fournir et le montage des dossiers pour les visas Schengen, Canada, USA, Turquie et Dubaï.

# RÈGLES DE SÉCURITÉ
- Ne jamais promettre l'obtention d'un visa.
- Rappeler l'importance de pièces authentiques et complètes.
- En cas de refus antérieur ou situation complexe, transférer vers un conseiller humain avec [DEMANDE_TRANSFERT].`,
  },
  {
    key: "studies",
    title: "Conseiller Campus France & Études",
    prompt: `# DESCRIPTION DU RÔLE
Tu es le conseiller mobilité internationale de notre agence.
Tu accompagnes les bacheliers et étudiants dans leurs projets d'études à l'étranger (Campus France, universités canadiennes et européennes).

# MISSIONS
- Renseigner sur les sessions de rentrée et le calendrier des candidatures.
- Expliquer les prérequis financiers (Attestation de Virement Irrévocable AVI, garants).
- Inviter à prendre rendez-vous pour bâtir le dossier académique.`,
  },
];

const QUICK_TEST_QUESTIONS = [
  "Bonjour, que propose votre service client ?",
  "Quels sont vos tarifs pour un visa Schengen ?",
  "Comment fonctionne l'accompagnement Campus France ?",
  "Est-ce que vous me garantissez le visa ?",
  "Je veux parler à un responsable humain.",
];

export function AgentStudio({
  agents,
  agencyName,
  canManage,
  sources,
  accounts,
  initialAgentId,
  onSwitchToList,
}: AgentStudioProps) {
  const router = useRouter();

  // Sélection de l'agent actif
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    initialAgentId || agents[0]?.id || ""
  );
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Onglet actif : par défaut sur "all" pour voir immédiatement les 3 parties (Prompt, Documents PDF, Liens)
  const [activeTab, setActiveTab] = useState<StudioTab>("all");

  // États du formulaire de l'agent (synchronisés avec l'agent actif)
  const [promptText, setPromptText] = useState(
    activeAgent?.systemInstructions || TEMPLATE_PRESETS[0].prompt
  );
  const [modelTier, setModelTier] = useState<"haiku" | "sonnet">(
    activeAgent?.modelTier || "haiku"
  );
  const [responseDelay, setResponseDelay] = useState<number>(
    activeAgent?.responseDelaySeconds ?? 15
  );
  const [facebookUrl, setFacebookUrl] = useState(activeAgent?.facebookUrl || "");
  const [catalogUrl, setCatalogUrl] = useState(activeAgent?.catalogUrl || "");
  const [customLinkUrl, setCustomLinkUrl] = useState("");
  const [servicesScope, setServicesScope] = useState(
    activeAgent?.servicesScope ||
      "Assistance visa Schengen (150 000 FCFA), Procédure Campus France (300 000 FCFA), Billetterie aérienne et réservations hôtelières."
  );
  const [isActive, setIsActive] = useState(activeAgent?.isActive ?? true);

  // Upload de fichier PDF
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileMessage, setFileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Modales
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);

  // Playground state
  const [currency, setCurrency] = useState<"FCFA" | "EUR">("FCFA");
  const [chatMessages, setChatMessages] = useState<TestChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Bonjour ! Je suis le Support Client de ${agencyName}. Comment puis-je vous aider aujourd'hui ?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTypingSimulated, setIsTypingSimulated] = useState(false);
  const [typingCountdown, setTypingCountdown] = useState(0);
  const [isTestingTransition, startTestingTransition] = useTransition();
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(1);

  // Analyse de lien externe
  const [isAnalyzingLink, setIsAnalyzingLink] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Sauvegarde globale de l'agent
  const [saveState, saveAction, isSaving] = useActionState(
    async (prev: FormState, formData: FormData) => {
      return await saveAiAgentAction(prev, formData);
    },
    initialFormState
  );

  const handleSelectAgent = (newId: string) => {
    setSelectedAgentId(newId);
    const nextAgent = agents.find((a) => a.id === newId);
    if (nextAgent) {
      setPromptText(nextAgent.systemInstructions || TEMPLATE_PRESETS[0].prompt);
      setModelTier(nextAgent.modelTier);
      setResponseDelay(nextAgent.responseDelaySeconds ?? 15);
      setFacebookUrl(nextAgent.facebookUrl || "");
      setCatalogUrl(nextAgent.catalogUrl || "");
      setServicesScope(nextAgent.servicesScope || "");
      setIsActive(nextAgent.isActive);
      setChatMessages([
        {
          id: `welcome-${nextAgent.id}`,
          role: "assistant",
          content: `Bonjour ! Je suis ${nextAgent.name}, Support Client pour l'agence "${agencyName}". Comment puis-je vous renseigner aujourd'hui ?`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
  };

  // Scroll automatique dans le chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTypingSimulated]);

  // Upload d'un document PDF / Word / Texte
  const handleFileUpload = async (file: File) => {
    setIsUploadingFile(true);
    setFileMessage(null);
    try {
      const fd = new FormData();
      fd.append("agentId", activeAgent?.id && activeAgent.id !== "default-support-client" ? activeAgent.id : "");
      fd.append("file", file);
      const res = await uploadKnowledgeFileAction(fd);
      setFileMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        router.refresh();
      }
    } catch (err: unknown) {
      setFileMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Erreur lors du dépôt du document.",
      });
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Suppression d'une source
  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm("Voulez-vous supprimer ce document des connaissances de l'agent ?")) return;
    const fd = new FormData();
    fd.append("id", sourceId);
    await deleteKnowledgeSourceAction(fd);
  };

  // Envoi d'un message dans le Playground
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend ?? inputMessage).trim();
    if (!text || isTestingTransition || isTypingSimulated) return;

    msgCounterRef.current += 1;
    const userMsg: TestChatMessage = {
      id: `user-${msgCounterRef.current}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setInputMessage("");

    // Simulation du délai de frappe configuré (ex: 15s)
    const simDelaySec = Math.min(Math.max(responseDelay > 0 ? 3 : 0.5, 1), 5);
    setIsTypingSimulated(true);
    setTypingCountdown(responseDelay);

    startTestingTransition(async () => {
      try {
        const result = await testAiAgentMessageAction(
          activeAgent?.id || "demo",
          newHistory.map((m) => ({ role: m.role, content: m.content })),
          {
            name: activeAgent?.name,
            role: activeAgent?.role,
            systemInstructions: promptText,
            servicesScope: servicesScope,
            facebookUrl: facebookUrl,
            catalogUrl: catalogUrl,
          }
        );

        // Attente de l'effet de frappe
        await new Promise((r) => setTimeout(r, simDelaySec * 1000));
        setIsTypingSimulated(false);

        msgCounterRef.current += 1;
        if ("error" in result) {
          const errorMsg: TestChatMessage = {
            id: `error-${msgCounterRef.current}`,
            role: "assistant",
            content: `Attention : ${result.error}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setChatMessages((prev) => [...prev, errorMsg]);
          return;
        }

        const assistantMsg: TestChatMessage = {
          id: `assistant-${msgCounterRef.current}`,
          role: "assistant",
          content: result.replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          metadata: {
            durationMs: result.durationMs,
            tokensPrompt: result.tokensPrompt,
            tokensCompletion: result.tokensCompletion,
            costFcfa: result.estimatedCostFcfa,
            transferSuggested: result.transferSuggested,
            transferReason: result.transferReason,
          },
        };

        setChatMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        setIsTypingSimulated(false);
        msgCounterRef.current += 1;
        const errorMsg: TestChatMessage = {
          id: `error-${msgCounterRef.current}`,
          role: "assistant",
          content: `Une erreur est survenue lors du test : ${
            err instanceof Error ? err.message : "Erreur inconnue"
          }`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    });
  };

  const handleResetChat = () => {
    setChatMessages([
      {
        id: `welcome-reset-${Date.now()}`,
        role: "assistant",
        content: `Bonjour ! Je suis le Support Client de ${agencyName}. Comment puis-je vous aider ?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleAnalyzeLink = async (url: string, kind: "facebook" | "catalog" | "website") => {
    if (!url.trim()) return;

    setIsAnalyzingLink(true);
    setAnalysisResult(null);
    try {
      const res = await analyzeAndIndexExternalLinkAction(activeAgent.id, url, kind);
      setAnalysisResult({ ok: res.ok, text: res.message });
      if (res.ok && kind === "website") {
        setCustomLinkUrl("");
      }
    } catch (err: unknown) {
      setAnalysisResult({
        ok: false,
        text: err instanceof Error ? err.message : "Erreur d'analyse du lien.",
      });
    } finally {
      setIsAnalyzingLink(false);
    }
  };

  // Seule une ligne réellement connectée compte : une ligne déconnectée ne doit jamais s'afficher « en ligne ».
  const connectedWaAccount = accounts.find((a) => a.status === "connected");
  // L'agent ne répond aux clients que s'il est actif ET qu'une ligne WhatsApp est connectée.
  const agentStatus = !isActive
    ? { label: "Brouillon", box: "border-orange-200 bg-orange-50 text-orange-800", dot: "bg-orange-500" }
    : connectedWaAccount
      ? { label: "Actif sur WhatsApp", box: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" }
      : { label: "Actif, mais WhatsApp déconnecté : aucune réponse n'est envoyée", box: "border-red-200 bg-red-50 text-red-800", dot: "bg-red-500" };
  const fileSources = sources.filter((s) => s.kind === "file" || s.kind === "text");
  const linkSources = sources.filter((s) => s.kind === "url" || Boolean(s.sourceUrl));

  return (
    <div className="space-y-4">
      {/* Barre de navigation haute : Support Client & Statut */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-800 text-citron-400 font-bold">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-navy-900 text-base leading-tight">
                Support client
              </h3>
              {agents.length > 1 && (
                <select
                  value={selectedAgentId}
                  onChange={(e) => handleSelectAgent(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-navy-900"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {activeAgent?.name || "Assistant"} — Service client automatique sur WhatsApp
            </p>
          </div>

          {/* Badge de statut */}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${agentStatus.box}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${agentStatus.dot}`} />
            {agentStatus.label}
          </span>
        </div>

        {/* Actions d'en-tête */}
        <div className="flex items-center gap-2">
          {onSwitchToList && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSwitchToList}
              className="text-xs text-slate-600 gap-1"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Vue Cartes</span>
            </Button>
          )}

          {canManage && (
            <form action={saveAction} className="inline-flex items-center gap-2">
              <input type="hidden" name="id" value={activeAgent?.id && activeAgent.id !== "default-support-client" ? activeAgent.id : ""} />
              <input type="hidden" name="name" value={activeAgent?.name || "Support Client"} />
              <input type="hidden" name="role" value={activeAgent?.role || "Support Client"} />
              <input type="hidden" name="starterModel" value={activeAgent?.starterModel || "support"} />
              <input type="hidden" name="tone" value={activeAgent?.tone || "courtois"} />
              <input type="hidden" name="personality" value={activeAgent?.personality || ""} />
              <input type="hidden" name="systemInstructions" value={promptText} />
              <input type="hidden" name="servicesScope" value={servicesScope} />
              <input type="hidden" name="restrictedTopics" value={activeAgent?.restrictedTopics || ""} />
              <input type="hidden" name="transferConditions" value={activeAgent?.transferConditions || ""} />
              <input type="hidden" name="responseDelaySeconds" value={responseDelay} />
              <input type="hidden" name="facebookUrl" value={facebookUrl} />
              <input type="hidden" name="catalogUrl" value={catalogUrl} />
              <input type="hidden" name="modelTier" value={modelTier} />
              <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />

              <Button
                type="submit"
                disabled={isSaving}
                variant="accent"
                size="sm"
                className="gap-1.5 text-xs font-semibold shadow-xs"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>{isSaving ? "Enregistrement..." : "Enregistrer"}</span>
              </Button>
            </form>
          )}
        </div>
      </div>

      {saveState.message && (
        <div
          className={`rounded-xl p-3 text-xs font-medium border ${
            saveState.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {saveState.message}
        </div>
      )}

      {/* Disposition Split View (Éditeur Support Client à gauche, Playground Permanent à droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ==================== VOLET GAUCHE : ÉDITEUR (PROMPT, DOCUMENTS PDF, LIENS) ==================== */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden min-h-[660px]">
          {/* Les 3 sections clés en haut de l'éditeur */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("prompt")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                activeTab === "prompt"
                  ? "bg-navy-50/80 border-navy-300 ring-1 ring-navy-400"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400 font-bold text-xs">
                1
              </div>
              <div className="min-w-0">
                <p className="font-bold text-navy-900 text-xs truncate">1. Le Prompt</p>
                <p className="text-[10px] text-slate-500 tabular-nums truncate">
                  {promptText.length} / 12000 car.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("documents")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                activeTab === "documents"
                  ? "bg-red-50/80 border-red-300 ring-1 ring-red-400"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-800 font-bold text-xs">
                2
              </div>
              <div className="min-w-0">
                <p className="font-bold text-navy-900 text-xs truncate">2. Documents (PDF)</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {fileSources.length} fichier{fileSources.length > 1 ? "s" : ""} déposé{fileSources.length > 1 ? "s" : ""}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                activeTab === "links"
                  ? "bg-blue-50/80 border-blue-300 ring-1 ring-blue-400"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-800 font-bold text-xs">
                3
              </div>
              <div className="min-w-0">
                <p className="font-bold text-navy-900 text-xs truncate">3. Joindre les liens</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {linkSources.length} lien{linkSources.length > 1 ? "s" : ""} joint{linkSources.length > 1 ? "s" : ""}
                </p>
              </div>
            </button>
          </div>

          {/* Navigation par Onglets (Les 3 parties demandées en priorité) */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50/80 p-2 overflow-x-auto text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "all"
                  ? "bg-navy-800 text-citron-400 shadow-xs font-bold"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Les 3 parties ensemble</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("prompt")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "prompt"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-citron-600" />
              <span>1. Le Prompt</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("documents")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "documents"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <FileUp className="h-3.5 w-3.5 text-navy-700" />
              <span>2. Documents (PDF)</span>
              {fileSources.length > 0 && (
                <span className="rounded-full bg-navy-100 px-1.5 py-0.2 text-[10px] font-bold text-navy-800">
                  {fileSources.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "links"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <Link2 className="h-3.5 w-3.5 text-blue-600" />
              <span>3. Joindre les liens</span>
              {linkSources.length > 0 && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-800">
                  {linkSources.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("services")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "services"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
              <span>Produits et services</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("connections")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "connections"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <QrCode className="h-3.5 w-3.5 text-green-600" />
              <span>Connexion WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tools")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors whitespace-nowrap ${
                activeTab === "tools"
                  ? "bg-white text-navy-900 shadow-xs font-bold border border-slate-200"
                  : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
              }`}
            >
              <Sliders className="h-3.5 w-3.5 text-purple-600" />
              <span>Outils</span>
            </button>
          </div>

          {/* Contenu de la section sélectionnée */}
          <div className="p-5 flex-1 flex flex-col space-y-6 overflow-y-auto">
            {/* ==================== 1. LA PARTIE PROMPT ==================== */}
            {(activeTab === "all" || activeTab === "prompt") && (
              <div className="space-y-4 flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-800 text-citron-400 font-bold text-xs">
                      1
                    </span>
                    <h4 className="font-bold text-navy-900 text-sm">
                      1. Le Prompt — Configuration et rôle Support Client
                    </h4>
                  </div>
                  {activeTab === "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("prompt")}
                      className="text-[11px] text-navy-700 hover:underline font-medium"
                    >
                      Agrandir le Prompt seul
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-navy-900 text-sm">Configuration du prompt Support Client</h4>
                    <p className="text-xs text-slate-500">
                      Définissez les consignes de réponse, le rôle et le comportement de l&apos;IA.
                    </p>
                  </div>

                  {/* Choix du modèle d'IA */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Modèle d&apos;IA :</span>
                    <select
                      value={modelTier}
                      onChange={(e) => setModelTier(e.target.value as "haiku" | "sonnet")}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-navy-900"
                    >
                      <option value="haiku">Rapide (recommandé)</option>
                      <option value="sonnet">Haute précision</option>
                    </select>
                  </div>
                </div>

                {/* Templates & Compteur de caractères */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400">Templates :</span>
                    {TEMPLATE_PRESETS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setPromptText(t.prompt)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition"
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>

                  {/* Compteur de caractères dynamique */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                    <span>Caractères :</span>
                    <span
                      className={`font-semibold ${
                        promptText.length > 10000 ? "text-orange-600" : "text-emerald-700"
                      }`}
                    >
                      {promptText.length} / 12000
                    </span>
                  </div>
                </div>

                {/* Éditeur de texte grand format pour le prompt */}
                <div className="flex-1 flex flex-col">
                  <Textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={12}
                    className="flex-1 font-mono text-xs leading-relaxed border-slate-300 focus:border-navy-500 focus:ring-1 focus:ring-navy-500 resize-none p-3.5 bg-slate-50/50"
                    placeholder="Écrivez le prompt système de votre agent Support Client..."
                  />
                </div>

                {/* Délai de réponse en secondes (Simulation humaine) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-citron-600" />
                      <span className="text-xs font-bold text-navy-900">
                        Délai de réponse IA (Simulation de frappe humaine)
                      </span>
                    </div>
                    <span className="rounded-full bg-navy-800 px-2.5 py-0.5 text-xs font-bold text-citron-400">
                      {responseDelay} seconde{responseDelay > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    L&apos;IA patiente ce nombre de secondes avant d&apos;envoyer sa réponse sur WhatsApp afin
                    de simuler le temps de frappe et de réflexion d&apos;un conseiller humain.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {DELAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setResponseDelay(opt.value)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                          responseDelay === opt.value
                            ? "border-navy-800 bg-navy-800 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 2. LA PARTIE DOCUMENTS (PDF) ==================== */}
            {(activeTab === "all" || activeTab === "documents") && (
              <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-100 text-red-800 font-bold text-xs">
                      2
                    </span>
                    <h4 className="font-bold text-navy-900 text-sm">
                      2. Documents (PDF) — Guides & connaissances de référence
                    </h4>
                  </div>
                  {activeTab === "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("documents")}
                      className="text-[11px] text-navy-700 hover:underline font-medium"
                    >
                      Agrandir les Documents seuls
                    </button>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">
                    Documents de référence de l&apos;agent (PDF, Word, TXT)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Déposez les documents officiels de l&apos;agence (guides de visas, barèmes de prix, formulaires, procédures). L&apos;intelligence artificielle lira et comprendra ces informations pour répondre précisément à vos clients.
                  </p>
                </div>

                {/* Zone de glisser-déposer de fichiers PDF */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? "border-navy-600 bg-navy-50/50 scale-[0.99]"
                      : "border-slate-300 hover:border-navy-400 bg-slate-50/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="hidden"
                  />

                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-800 text-citron-400 shadow-xs">
                      {isUploadingFile ? (
                        <Loader2 className="h-6 w-6 animate-spin text-citron-400" />
                      ) : (
                        <FileUp className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-navy-900">
                        {isUploadingFile
                          ? "Lecture et indexation du document en cours..."
                          : "Déposez votre document PDF ici"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Formats acceptés : <strong>PDF</strong>, Word (.docx) ou texte (.txt). Taille max : 20 Mo.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={isUploadingFile}
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-navy-800 text-white hover:bg-navy-900 gap-1.5 text-xs"
                      >
                        <Upload className="h-3.5 w-3.5 text-citron-400" />
                        <span>Sélectionner un fichier PDF</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsTextModalOpen(true)}
                        className="text-xs gap-1 border-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Saisir un texte / FAQ</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Message de succès ou d'erreur */}
                {fileMessage && (
                  <div
                    className={`rounded-xl p-3 text-xs font-medium border flex items-center gap-2 ${
                      fileMessage.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {fileMessage.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span>{fileMessage.text}</span>
                  </div>
                )}

                {/* Liste des documents PDF et textes déposés */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy-900">
                      Documents déposés ({fileSources.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      L&apos;IA s&apos;y réfère prioritairement pour répondre
                    </span>
                  </div>

                  {fileSources.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      Aucun document PDF déposé pour le moment. Déposez vos brochures ou procédures ci-dessus.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                      {fileSources.map((src) => (
                        <div
                          key={src.id}
                          className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold text-[11px]">
                              PDF
                            </div>
                            <div className="truncate">
                              <p className="font-semibold text-slate-900 truncate">{src.title}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span>{src.chunksCount} passages indexés</span>
                                <span>•</span>
                                <span>{new Date(src.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Prêt</span>
                            </span>

                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSource(src.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                title="Supprimer ce document"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== 3. LA PARTIE JOINDRE LES LIENS ==================== */}
            {(activeTab === "all" || activeTab === "links") && (
              <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-800 font-bold text-xs">
                      3
                    </span>
                    <h4 className="font-bold text-navy-900 text-sm">
                      3. Joindre les liens — Page Facebook, Boutique & Web
                    </h4>
                  </div>
                  {activeTab === "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("links")}
                      className="text-[11px] text-navy-700 hover:underline font-medium"
                    >
                      Agrandir les Liens seuls
                    </button>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">
                    Joindre des liens web (Page Facebook, Boutique, Site)
                  </h4>
                  <p className="text-xs text-slate-500">
                    L&apos;intelligence artificielle examine le contenu des liens joints pour comprendre vos offres et activités, puis répondre automatiquement aux clients sur WhatsApp.
                  </p>
                </div>

                {/* Feedback d'analyse de lien */}
                {analysisResult && (
                  <div
                    className={`rounded-xl p-3 text-xs font-medium border flex items-center gap-2 ${
                      analysisResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {analysisResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span>{analysisResult.text}</span>
                  </div>
                )}

                {/* 1. Page Facebook */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-navy-900">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <span>Lien de la page Facebook de l&apos;agence</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    L&apos;IA examine les publications récentes, les services présentés et les informations officielles de votre page Facebook.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={facebookUrl}
                      onChange={(e) => setFacebookUrl(e.target.value)}
                      placeholder="https://facebook.com/selectagencyofficiel"
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!facebookUrl.trim() || isAnalyzingLink}
                      onClick={() => handleAnalyzeLink(facebookUrl, "facebook")}
                      className="shrink-0 text-xs gap-1.5 border-navy-200 text-navy-800"
                    >
                      {isAnalyzingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-citron-600" />
                      )}
                      <span>Analyser & Joindre</span>
                    </Button>
                  </div>
                </div>

                {/* 2. Boutique en ligne / Catalogue */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-navy-900">
                    <ShoppingBag className="h-4 w-4 text-emerald-600" />
                    <span>Lien de la boutique en ligne ou catalogue</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    L&apos;IA examine vos articles, forfaits, options d&apos;inscription et tarifs publiés dans votre boutique.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={catalogUrl}
                      onChange={(e) => setCatalogUrl(e.target.value)}
                      placeholder="https://selectagency.cg/nos-offres"
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!catalogUrl.trim() || isAnalyzingLink}
                      onClick={() => handleAnalyzeLink(catalogUrl, "catalog")}
                      className="shrink-0 text-xs gap-1.5 border-navy-200 text-navy-800"
                    >
                      {isAnalyzingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-citron-600" />
                      )}
                      <span>Analyser & Joindre</span>
                    </Button>
                  </div>
                </div>

                {/* 3. Joindre n'importe quel autre lien web */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-2 text-xs font-bold text-navy-900">
                    <Link2 className="h-4 w-4 text-purple-600" />
                    <span>Joindre un autre lien web (site vitrine, brochure en ligne...)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={customLinkUrl}
                      onChange={(e) => setCustomLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="text-xs bg-white"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!customLinkUrl.trim() || isAnalyzingLink}
                      onClick={() => handleAnalyzeLink(customLinkUrl, "website")}
                      className="shrink-0 text-xs gap-1.5 bg-navy-800 text-white hover:bg-navy-900"
                    >
                      {isAnalyzingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-citron-400" />
                      )}
                      <span>Analyser ce lien</span>
                    </Button>
                  </div>
                </div>

                {/* Liste des liens joints et analysés */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-navy-900">
                    Liens actuellement joints ({linkSources.length})
                  </span>

                  {linkSources.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      Aucun lien web joint pour le moment. Ajoutez l&apos;URL de votre page Facebook ou boutique ci-dessus.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                      {linkSources.map((src) => (
                        <div
                          key={src.id}
                          className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                              <Globe className="h-4 w-4" />
                            </div>
                            <div className="truncate">
                              <p className="font-semibold text-slate-900 truncate">{src.title}</p>
                              <a
                                href={src.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-blue-600 hover:underline truncate block"
                              >
                                {src.sourceUrl}
                              </a>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{src.chunksCount} passages</span>
                            </span>

                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSource(src.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                title="Supprimer ce lien"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== 4. PRODUITS ET SERVICES ==================== */}
            {activeTab === "services" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">Produits et services de l&apos;agence</h4>
                  <p className="text-xs text-slate-500">
                    Définissez la liste des prestations que l&apos;agent peut proposer avec leurs honoraires officiels.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Périmètre des prestations et tarifs connus de l&apos;IA
                  </label>
                  <Textarea
                    value={servicesScope}
                    onChange={(e) => setServicesScope(e.target.value)}
                    rows={6}
                    className="text-xs border-slate-300 font-mono"
                    placeholder="Détaillez les tarifs et prestations..."
                  />
                  <p className="text-[11px] text-slate-500">
                    L&apos;IA respectera scrupuleusement ces montants et refusera d&apos;en inventer d&apos;autres.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border border-slate-200 p-3 space-y-1 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-navy-900 text-xs">Visas Schengen & Tourisme</span>
                      <span className="font-bold text-navy-800 text-xs">150 000 FCFA</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Vérification des pièces, prise de rendez-vous consulaire et lettre explicative.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3 space-y-1 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-navy-900 text-xs">Campus France & Études</span>
                      <span className="font-bold text-navy-800 text-xs">300 000 FCFA</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Création du compte, validation du panier de formations, préparation entretien.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 5. CONNEXION WHATSAPP ==================== */}
            {activeTab === "connections" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">Connexion WhatsApp Web par Code QR</h4>
                  <p className="text-xs text-slate-500">
                    Associez le smartphone de votre agence pour activer le Support Client sur vos discussions WhatsApp.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white font-bold">
                        <QrCode className="h-6 w-6" />
                      </div>
                      <div>
                        <h5 className="font-bold text-navy-900 text-sm">
                          {connectedWaAccount ? "WhatsApp Business connecté" : "WhatsApp non connecté"}
                        </h5>
                        <p className="text-xs text-slate-500">
                          {connectedWaAccount
                            ? `Numéro lié : ${connectedWaAccount.displayPhoneNumber}${connectedWaAccount.verifiedName ? ` (${connectedWaAccount.verifiedName})` : ""}`
                            : "Scannez le code QR pour synchroniser les messages de vos clients."}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        connectedWaAccount
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          connectedWaAccount ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {connectedWaAccount ? "En ligne" : "Déconnecté"}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      onClick={() => setIsQrModalOpen(true)}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <QrCode className="h-4 w-4" />
                      <span>{connectedWaAccount ? "Re-scanner / Changer d'appareil" : "Scanner le Code QR"}</span>
                    </Button>

                    <Link href="/agent-ia">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-navy-800 border-navy-200"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Ouvrir la boîte WhatsApp Web</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 6. OUTILS ==================== */}
            {activeTab === "tools" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">Outils & Relais conseiller</h4>
                  <p className="text-xs text-slate-500">
                    Paramétrez le transfert vers un humain et la détection d&apos;intention d&apos;achat.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-navy-900 text-xs">
                        Transfert automatique vers un conseiller humain
                      </span>
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        Actif
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Dès qu&apos;un client négocie un tarif, manifeste une inquiétude ou demande expressément un conseiller humain, l&apos;IA passe la main avec courtoisie.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-navy-900 text-xs">
                        Détection d&apos;intention d&apos;achat & Prospect CRM
                      </span>
                      <span className="text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-full px-2 py-0.5">
                        Automatique
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Si le numéro n&apos;est pas encore enregistré dans SELECT Agency, l&apos;équipe peut créer la fiche prospect en un clic depuis le fil WhatsApp.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== VOLET DROIT : PLAYGROUND PERMANENT ==================== */}
        <div className="lg:col-span-5 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden h-[660px]">
          {/* En-tête du Playground */}
          <div className="flex items-center justify-between border-b border-navy-100 bg-navy-800 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-citron-400 text-navy-900 font-bold">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs leading-tight">
                  Playground — Support Client
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>En direct (Test temps réel)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Sélecteur de devise */}
              <button
                type="button"
                onClick={() => setCurrency(currency === "FCFA" ? "EUR" : "FCFA")}
                className="rounded-md border border-navy-600 bg-navy-700/80 px-2 py-0.5 text-[10px] font-semibold text-citron-300 hover:bg-navy-700 transition"
                title="Basculer la devise d'affichage"
              >
                {currency}
              </button>

              <button
                type="button"
                onClick={handleResetChat}
                className="text-navy-200 hover:text-white p-1 rounded hover:bg-navy-700 transition"
                title="Réinitialiser la discussion de test"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Corps de chat du Playground */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2]/40">
            {chatMessages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? "bg-navy-800 text-white rounded-br-xs"
                        : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Métadonnées & Alerte de transfert */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 px-1">
                    <span>{msg.timestamp}</span>
                    {msg.metadata?.durationMs && (
                      <span>• {msg.metadata.durationMs}ms</span>
                    )}
                    {msg.metadata?.costFcfa !== undefined && (
                      <span>
                        • {currency === "FCFA"
                          ? `${msg.metadata.costFcfa} FCFA`
                          : `${(msg.metadata.costFcfa / 655.957).toFixed(3)} €`}
                      </span>
                    )}
                  </div>

                  {msg.metadata?.transferSuggested && (
                    <div className="mt-1 flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-800">
                      <AlertCircle className="h-3 w-3 text-orange-600" />
                      <span>Transfert conseiller humain notifié</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicateur de frappe avec compte à rebours de délai */}
            {isTypingSimulated && (
              <div className="flex flex-col items-start">
                <div className="rounded-2xl rounded-bl-xs border border-slate-200 bg-white px-3.5 py-2 shadow-xs flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Support Client écrit...
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  Simulation du délai configuré ({typingCountdown}s)
                </span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Raccourcis de questions de test rapides */}
          <div className="border-t border-slate-200 bg-white px-3 py-1.5 overflow-x-auto flex items-center gap-1.5 shrink-0 text-xs">
            <span className="text-[10px] text-slate-400 uppercase font-semibold shrink-0">
              Tester :
            </span>
            {QUICK_TEST_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={isTestingTransition || isTypingSimulated}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100 shrink-0 transition"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Barre de saisie */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="border-t border-slate-200 bg-white p-3 flex items-center gap-2 shrink-0"
          >
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Écrire un message de test au Support Client..."
              disabled={isTestingTransition || isTypingSimulated}
              className="text-xs flex-1"
            />
            <Button
              type="submit"
              disabled={!inputMessage.trim() || isTestingTransition || isTypingSimulated}
              variant="accent"
              size="sm"
              className="h-9 w-9 p-0 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Modale d'appairage QR Code WhatsApp */}
      <WhatsAppQrConnectModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />

      {/* Modale d'ajout de texte libre */}
      {isTextModalOpen && (
        <AddTextKnowledgeModal
          agents={agents}
          selectedAgentId={activeAgent?.id}
          onClose={() => setIsTextModalOpen(false)}
        />
      )}
    </div>
  );
}
