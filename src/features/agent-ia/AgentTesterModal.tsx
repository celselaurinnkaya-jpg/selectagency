"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Bot, Send, RotateCcw, X, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { testAiAgentMessageAction } from "./actions";
import type { AiAgentRecord, TestChatMessage } from "@/lib/domain/ai";

interface AgentTesterModalProps {
  agent: AiAgentRecord;
  agencyName: string;
  onClose: () => void;
}

const QUICK_TEST_PROMPTS = [
  "Bonjour, que propose l'agence ?",
  "Quels sont les tarifs pour un visa ?",
  "Est-ce que vous me garantissez à 100% mon visa ?",
  "Je veux parler à un responsable humain",
  "Quel temps fait-il à Paris demain ?",
];

export function AgentTesterModal({ agent, agencyName, onClose }: AgentTesterModalProps) {
  const [messages, setMessages] = useState<TestChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Bonjour ! Je suis ${agent.name}, ${agent.role} de l'agence "${agencyName}". Comment puis-je vous aider aujourd'hui ?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(1);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isPending) return;

    msgCounterRef.current += 1;
    const currentId = msgCounterRef.current;

    const userMsg: TestChatMessage = {
      id: `user-${currentId}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");

    startTransition(async () => {
      try {
        const result = await testAiAgentMessageAction(
          agent.id,
          newHistory.map((m) => ({ role: m.role, content: m.content }))
        );
        if ("error" in result) throw new Error(result.error);

        msgCounterRef.current += 1;
        const assistantId = msgCounterRef.current;

        const assistantMsg: TestChatMessage = {
          id: `assistant-${assistantId}`,
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

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        msgCounterRef.current += 1;
        const errorId = msgCounterRef.current;
        const errorMessage = err instanceof Error ? err.message : "Erreur de connexion";
        const errorMsg: TestChatMessage = {
          id: `error-${errorId}`,
          role: "assistant",
          content: `Une erreur est survenue lors du test : ${errorMessage}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    });
  };

  const handleReset = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content: `Bonjour ! Je suis ${agent.name}, ${agent.role} de l'agence "${agencyName}". Comment puis-je vous aider aujourd'hui ?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="relative flex h-[92vh] max-h-[820px] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* En-tête du testeur */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-800 px-4 py-3 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-citron-400 text-navy-900 font-bold">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white truncate text-base">{agent.name}</h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  En ligne (Test)
                </span>
              </div>
              <p className="text-xs text-navy-200 truncate">{agent.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-navy-100 hover:text-white hover:bg-navy-700 h-8 px-2 text-xs"
              title="Réinitialiser la conversation"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Réinitialiser
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-navy-100 hover:text-white hover:bg-navy-700 h-8 w-8 p-0"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Zone de conversation scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/70">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Simulateur interactif SELECT Agency</p>
              <p className="text-blue-800/80">
                Testez les réponses, les réflexes de conformité Meta (interdiction des hors-sujets), la non-garantie de visa et la détection de transfert humain avant le branchement WhatsApp.
              </p>
            </div>
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                  msg.role === "user"
                    ? "bg-navy-800 text-white rounded-br-xs"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {msg.metadata?.transferSuggested && (
                  <div className="mt-2.5 rounded-lg border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900 flex items-start gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Transfert vers un conseiller déclenché</p>
                      {msg.metadata.transferReason && (
                        <p className="text-orange-800">{msg.metadata.transferReason}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Métadonnées techniques sous la réponse de l'agent */}
              {msg.metadata && (
                <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-400">
                  <span>⏱ {msg.metadata.durationMs} ms</span>
                  <span>•</span>
                  <span>🪙 {msg.metadata.tokensPrompt} in / {msg.metadata.tokensCompletion} out</span>
                  <span>•</span>
                  <span className="font-medium text-slate-600">~{msg.metadata.costFcfa} FCFA</span>
                </div>
              )}
            </div>
          ))}

          {isPending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-navy-600 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-navy-600 animate-bounce [animation-delay:0.2s]" />
                <span className="h-2 w-2 rounded-full bg-navy-600 animate-bounce [animation-delay:0.4s]" />
              </div>
              <span>{agent.name} rédige sa réponse...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions rapides de test */}
        <div className="border-t border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <span className="text-[11px] font-medium text-slate-400 shrink-0">Suggestions :</span>
            {QUICK_TEST_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isPending}
                onClick={() => handleSend(prompt)}
                className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Barre de saisie */}
        <div className="border-t border-slate-200 bg-white p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Écrire un message à ${agent.name}...`}
              disabled={isPending}
              className="flex-1 rounded-xl border-slate-300 h-10"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!input.trim() || isPending}
              className="h-10 rounded-xl bg-navy-800 text-white hover:bg-navy-900 px-4 shrink-0"
            >
              <Send className="h-4 w-4 mr-1.5" />
              <span>Envoyer</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

