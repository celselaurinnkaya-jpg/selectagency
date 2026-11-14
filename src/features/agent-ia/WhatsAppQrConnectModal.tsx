"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, QrCode, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeWhatsAppSignupAction } from "./whatsapp-actions";

// Connexion WhatsApp par le vrai QR code de Meta.
// Le QR code n'est pas dessiné par SELECT : un QR code fabriqué ne peut relier aucun téléphone. Il est affiché par
// Meta dans sa fenêtre officielle (Embedded Signup, « WhatsApp Business app onboarding »), et se scanne avec
// l'application WhatsApp Business. À la fin, le serveur enregistre le numéro, demande l'historique du téléphone
// et la boîte WhatsApp Web s'ouvre (/agent-ia).

interface WhatsAppQrConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID?.trim() ?? "";
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION?.trim() || "v27.0";

type FbLoginResponse = { authResponse?: { code?: string } | null };
type Fb = {
  init(options: Record<string, unknown>): void;
  login(callback: (response: FbLoginResponse) => void, options: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: Fb;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<Fb> | null = null;

/** Kit JavaScript de Facebook, chargé seulement quand cette fenêtre s'ouvre. */
function loadFacebookSdk(): Promise<Fb> {
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<Fb>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Le kit Facebook n'a pas pu être chargé."));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

const isFacebookOrigin = (origin: string) => {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
};

type Phase = "loading" | "ready" | "waiting" | "finishing" | "done" | "error";

const STEPS = [
  "Cliquez sur « Afficher le QR code de Meta » : la fenêtre officielle de Meta (Facebook) s'ouvre.",
  "Connectez-vous avec le compte Facebook du responsable, choisissez le portefeuille de l'agence, puis connectez votre application WhatsApp Business et son numéro.",
  "Meta affiche un QR code. Sur le téléphone, ouvrez WhatsApp Business : un message de Meta vous demande de scanner ce code. Scannez-le.",
  "Acceptez le partage de l'historique, puis cliquez sur « Terminer » : la boîte WhatsApp Web s'ouvre avec vos conversations.",
];

export function WhatsAppQrConnectModal({ isOpen, onClose, onSuccess }: WhatsAppQrConnectModalProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const configured = Boolean(APP_ID && CONFIG_ID);

  // Chargement du kit Facebook et écoute des messages de la fenêtre Meta (fin, abandon, erreur).
  useEffect(() => {
    if (!isOpen || !configured) return;
    let active = true;
    session.current = {};
    loadFacebookSdk()
      .then(() => active && setPhase("ready"))
      .catch((err: unknown) => {
        if (!active) return;
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "Le kit Facebook n'a pas pu être chargé.");
      });

    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let data: { type?: string; event?: string; data?: Record<string, string> } | null = null;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event?.startsWith("FINISH")) {
        session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
      } else if (data.event === "CANCEL") {
        setPhase("ready");
        setMessage("Connexion interrompue avant la fin. Vous pouvez recommencer.");
      } else if (data.event === "ERROR") {
        setPhase("error");
        setMessage(`Meta : ${data.data?.error_message ?? "erreur pendant la connexion"}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, [isOpen, configured]);

  if (!isOpen) return null;

  const https = typeof window !== "undefined" && window.location.protocol === "https:";

  const finish = async (code: string) => {
    setPhase("finishing");
    // Les informations du compte arrivent par un message séparé de la fenêtre Meta : on les attend un instant.
    for (let i = 0; i < 15 && !session.current.wabaId; i++) await new Promise((r) => setTimeout(r, 200));
    const result = await completeWhatsAppSignupAction({ code, ...session.current });
    setMessage(result.message);
    if (!result.ok) {
      setPhase("error");
      return;
    }
    setPhase("done");
    onSuccess?.();
    setTimeout(() => {
      onClose();
      router.push("/agent-ia");
    }, 1500);
  };

  const openMetaQr = () => {
    const fb = window.FB;
    if (!fb) return;
    setMessage(null);
    setPhase("waiting");
    session.current = {};
    // Appel direct dans le clic : sinon le navigateur bloque la fenêtre de Meta.
    fb.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) void finish(code);
        else {
          setPhase("ready");
          setMessage((m) => m ?? "Fenêtre Meta fermée sans terminer la connexion.");
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-navy-900/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wa-qr-title">
      <div className="relative my-6 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
        <div className="flex items-center justify-between gap-3 bg-navy-800 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-citron-400 text-navy-900">
              <QrCode className="size-6" aria-hidden />
            </span>
            <div>
              <h2 id="wa-qr-title" className="text-lg font-semibold">
                Connexion WhatsApp par QR code
              </h2>
              <p className="text-xs text-white/85">QR code officiel de Meta, à scanner avec l&apos;application WhatsApp Business.</p>
            </div>
          </div>
          <Button type="button" variant="onNavy" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="size-5" />
          </Button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {!configured && (
            <p role="alert" className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Connexion Meta pas encore configurée : ajoutez <strong>NEXT_PUBLIC_META_APP_ID</strong> (identifiant de l&apos;application),{" "}
                <strong>NEXT_PUBLIC_WHATSAPP_CONFIG_ID</strong> (identifiant de configuration de l&apos;inscription intégrée) et{" "}
                <strong>WHATSAPP_APP_SECRET</strong> (clé secrète de l&apos;application), puis redémarrez le site.
              </span>
            </p>
          )}
          {configured && !https && (
            <p className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Meta n&apos;ouvre sa fenêtre que sur un site en https. Faites la connexion depuis le site en ligne (adresse en https).</span>
            </p>
          )}
          {message && (
            <p
              role={phase === "error" ? "alert" : "status"}
              className={
                phase === "error"
                  ? "flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  : phase === "done"
                    ? "flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                    : "flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800"
              }
            >
              {phase === "done" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span>{message}</span>
            </p>
          )}

          <div className="grid items-center gap-6 md:grid-cols-12">
            <ol className="space-y-3 text-sm text-slate-700 md:col-span-7">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400 tabular-nums">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-4 text-center md:col-span-5">
              <span className="flex size-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-navy-800">
                {phase === "finishing" || phase === "waiting" ? <Loader2 className="size-10 animate-spin" aria-hidden /> : <QrCode className="size-14" aria-hidden />}
              </span>
              <p className="text-xs text-slate-600">
                {phase === "waiting"
                  ? "Suivez les étapes dans la fenêtre de Meta et scannez le QR code avec WhatsApp Business."
                  : phase === "finishing"
                    ? "Scan terminé : enregistrement du numéro et demande de l'historique…"
                    : "Le QR code s'affiche dans la fenêtre officielle de Meta."}
              </p>
              <Button
                type="button"
                variant="accent"
                className="h-11 w-full gap-2"
                disabled={!configured || phase === "loading" || phase === "waiting" || phase === "finishing" || phase === "done"}
                onClick={openMetaQr}
              >
                {phase === "loading" && configured ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
                Afficher le QR code de Meta
              </Button>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-border p-3 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-navy-800">
              <ShieldCheck className="size-4" aria-hidden />
              Bon à savoir
            </p>
            <p className="flex gap-1.5">
              <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Application WhatsApp Business 2.24.17 ou plus récente, laissée ouverte pendant la synchronisation. L&apos;agence garde son téléphone :
              les messages apparaissent des deux côtés. Historique des 180 derniers jours, sans les groupes.
            </p>
            <p>SELECT ne demande jamais le mot de passe WhatsApp de l&apos;agence.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
