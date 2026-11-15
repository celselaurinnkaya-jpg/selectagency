"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  History,
  Loader2,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form";
import { countryName } from "@/lib/countries";
import type { EmbeddedSignupSetup, SignupInfo } from "@/lib/whatsapp/signup-prefill";
import { completeWhatsAppSignupAction, getWhatsAppSignupPrefillAction, prepareWhatsAppSignupAction } from "./whatsapp-actions";

// Connexion de l'application WhatsApp Business de l'agence, en 3 étapes (comme les grands outils du marché) :
//   1. « Vos informations » : l'agence vérifie les données qui pré-remplissent la fenêtre de Meta ;
//   2. « À lire d'abord » : conseils et case « WhatsApp Business est ouvert », puis « Continuer avec Facebook » ;
//   3. « Fenêtre de Meta » : parcours officiel de Meta (Embedded Signup, coexistence). Meta y affiche un code d'accès
//      ou un QR code à confirmer dans WhatsApp Business. À la fin, le serveur enregistre le numéro et son accès,
//      demande l'historique du téléphone, et la boîte WhatsApp Web s'ouvre (/agent-ia).
// Aucun QR code n'est dessiné par SELECT : un QR code fabriqué ne peut relier aucun téléphone.

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

type Step = 1 | 2 | 3;
type Phase = "loading" | "ready" | "waiting" | "finishing" | "done" | "error";
type Fields = Pick<SignupInfo, "name" | "email" | "phone" | "address" | "city">;

const STEP_LABELS = ["Vos informations", "À lire d'abord", "Fenêtre de Meta"] as const;
const EMPTY_FIELDS: Fields = { name: "", email: "", phone: "", address: "", city: "" };

const ADVICE = [
  {
    icon: Smartphone,
    text: "Gardez le téléphone de l'agence à portée de main, avec WhatsApp Business ouvert. Pendant la connexion, WhatsApp Business vous demandera de confirmer : sans cette confirmation, la connexion ne peut pas aboutir.",
  },
  {
    icon: RefreshCw,
    text: "Mettez WhatsApp Business à jour (version 2.24.17 ou plus récente). Sinon, l'option de connexion n'apparaît pas dans l'application.",
  },
  {
    icon: History,
    text: "Meta vous demandera une seule fois de partager l'historique des 6 derniers mois (sans les groupes). Choisissez « Partager toutes les discussions » pour retrouver vos conversations dans SELECT.",
  },
  {
    icon: TabletSmartphone,
    text: "Sur téléphone, la fenêtre de Meta s'ouvre dans un nouvel onglet. Après la confirmation dans WhatsApp Business, revenez dans le navigateur pour finir.",
  },
  {
    icon: MousePointerClick,
    text: "À la toute fin, appuyez sur « Terminer » (le dernier bouton en bas), et non sur « Ajouter un moyen de paiement ». Gardez cette page SELECT ouverte jusqu'au bout.",
  },
  {
    icon: ShieldCheck,
    text: "SELECT ne demande jamais le mot de passe WhatsApp de l'agence. WhatsApp Business reste actif sur le téléphone : les messages apparaissent des deux côtés.",
  },
];

const META_SCREENS = [
  "« Associez votre compte à … » : appuyez sur Continuer. Si Meta le demande, connectez-vous avec le compte Facebook du responsable.",
  "Choisissez le portefeuille Business de l'agence. S'il faut en créer un, les informations de l'étape 1 sont déjà remplies.",
  "Numéro : gardez « Saisir un nouveau numéro de téléphone » et tapez le numéro WhatsApp Business de l'agence. N'utilisez pas l'option de numéro virtuel.",
  "Meta montre le profil WhatsApp Business, puis un code d'accès : copiez-le. Sur ordinateur, vous pouvez aussi choisir « Utilisez plutôt un code QR » et le scanner avec le téléphone.",
  "Dans WhatsApp Business : ouvrez la discussion « Facebook Business » et appuyez sur Connect (sinon : Paramètres › Compte › Plateforme Business). Choisissez « Partager toutes les discussions », confirmez, collez le code (ou scannez le QR code), puis OK.",
  "Revenez dans la fenêtre de Meta : Suivant, vérifiez les accès, Confirmer, puis « Terminer ».",
];

export function WhatsAppQrConnectModal({ isOpen, onClose, onSuccess }: WhatsAppQrConnectModalProps) {
  // Monté à chaque ouverture : le parcours repart toujours de l'étape 1.
  if (!isOpen) return null;
  return <ConnectWizard onClose={onClose} onSuccess={onSuccess} />;
}

function ConnectWizard({ onClose, onSuccess }: Omit<WhatsAppQrConnectModalProps, "isOpen">) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<SignupInfo | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [infoLoading, setInfoLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [omitted, setOmitted] = useState<string[]>([]);
  const [phoneReady, setPhoneReady] = useState(false);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  // Données de pré-remplissage validées à l'étape 1, prêtes avant le clic « Continuer avec Facebook ».
  const prefill = useRef<EmbeddedSignupSetup>({});
  const configured = Boolean(APP_ID && CONFIG_ID);

  // À l'ouverture : informations de l'agence, kit Facebook et écoute de la fenêtre Meta.
  useEffect(() => {
    let active = true;
    getWhatsAppSignupPrefillAction()
      .then((data) => {
        if (!active) return;
        setInfo(data);
        setFields({ name: data.name, email: data.email, phone: data.phone, address: data.address, city: data.city });
      })
      .catch(() => {
        // Sans ces informations, l'agence les saisit ici ou directement dans la fenêtre de Meta.
      })
      .finally(() => active && setInfoLoading(false));

    if (!configured) return () => {
      active = false;
    };

    loadFacebookSdk()
      .then(() => active && setPhase("ready"))
      .catch((err: unknown) => {
        if (!active) return;
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "Le kit Facebook n'a pas pu être chargé.");
      });

    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; waba_ids?: string[]; phone_number_id?: string; error_message?: string } } | null = null;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event?.startsWith("FINISH")) {
        // « waba_id », ou « waba_ids » quand Meta relie plusieurs comptes.
        session.current = { wabaId: data.data?.waba_id ?? data.data?.waba_ids?.[0], phoneNumberId: data.data?.phone_number_id };
      } else if (data.event === "CANCEL") {
        setPhase("ready");
        setMessage("Connexion interrompue avant la fin. Vous pouvez rouvrir la fenêtre de Meta.");
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
  }, [configured]);

  const https = typeof window !== "undefined" && window.location.protocol === "https:";
  const busy = phase === "waiting" || phase === "finishing";

  const close = () => {
    if (phase === "finishing") return;
    onClose();
  };

  const update = (field: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [field]: e.target.value }));

  // Étape 1 → 2 : le serveur met les informations au format de Meta (pays et fuseau relus dans le profil de l'agence).
  const confirmInfo = async () => {
    setPreparing(true);
    try {
      const result = await prepareWhatsAppSignupAction(fields);
      prefill.current = result.setup;
      setOmitted(result.omitted);
    } catch {
      // Sans pré-remplissage, l'agence saisit ses informations dans la fenêtre de Meta.
      prefill.current = {};
      setOmitted([]);
    } finally {
      setPreparing(false);
      setStep(2);
    }
  };

  const finish = async (code: string) => {
    setPhase("finishing");
    // Les informations du compte arrivent par un message séparé de la fenêtre Meta : on les attend un instant
    // (le code reste valable 30 secondes). Sans elles, le serveur retrouve le compte auprès de Meta.
    for (let i = 0; i < 25 && !session.current.wabaId; i++) await new Promise((r) => setTimeout(r, 200));
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

  // « Continuer avec Facebook » : ouvre la fenêtre officielle de Meta.
  const openMeta = () => {
    const fb = window.FB;
    if (!fb) return;
    setMessage(null);
    setStep(3);
    setPhase("waiting");
    session.current = {};
    // Appel direct dans le clic : sinon le navigateur bloque la fenêtre de Meta.
    fb.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) void finish(code);
        else {
          setPhase("ready");
          setMessage((m) => m ?? "Fenêtre de Meta fermée avant la fin. Vous pouvez la rouvrir.");
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: prefill.current, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  };

  const canOpenMeta = configured && phoneReady && typeof window !== "undefined" && Boolean(window.FB) && (phase === "ready" || phase === "error");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/60 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wa-connect-title">
      <div className="relative my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
        <div className="flex items-center justify-between gap-3 bg-navy-800 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-citron-400 text-navy-900">
              <MessageCircle className="size-6" aria-hidden />
            </span>
            <div>
              <h2 id="wa-connect-title" className="text-lg font-semibold">
                Connecter WhatsApp Business
              </h2>
              <p className="text-xs text-white/85">
                Étape <span className="tabular-nums">{step}</span> sur 3 · {STEP_LABELS[step - 1]}
              </p>
            </div>
          </div>
          <Button type="button" variant="onNavy" size="icon" className="size-10" onClick={close} disabled={phase === "finishing"} aria-label="Fermer">
            <X className="size-5" />
          </Button>
        </div>

        <ol className="grid grid-cols-3 gap-2 border-b border-border bg-surface px-4 py-3" aria-label="Étapes">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step || (n === 3 && phase === "done");
            const current = n === step && !done;
            return (
              <li key={label} className="flex min-w-0 flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-2" aria-current={current ? "step" : undefined}>
                <span
                  className={
                    done
                      ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                      : current
                        ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400 tabular-nums"
                        : "flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-500 tabular-nums"
                  }
                >
                  {done ? <Check className="size-4" aria-hidden /> : n}
                </span>
                <span className={current ? "truncate text-xs font-semibold text-navy-800" : "truncate text-xs text-slate-600"}>{label}</span>
              </li>
            );
          })}
        </ol>

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

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-navy-800">Vérifiez vos informations</h3>
                <p className="mt-1 text-sm text-slate-600">
                  SELECT les transmet à la fenêtre de Meta pour vous éviter de les saisir. Elles servent seulement si Meta vous fait créer un
                  portefeuille Business, et ne modifient pas les paramètres de l&apos;agence.
                </p>
              </div>

              {infoLoading ? (
                <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-slate-600">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Chargement des informations de l&apos;agence…
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id="wa-info-name" label="Nom de l'entreprise" className="sm:col-span-2">
                    <Input id="wa-info-name" value={fields.name} onChange={update("name")} maxLength={200} autoComplete="organization" className="h-10" />
                  </FormField>
                  <FormField id="wa-info-email" label="E-mail de l'entreprise">
                    <Input id="wa-info-email" type="email" value={fields.email} onChange={update("email")} maxLength={254} autoComplete="email" className="h-10" />
                  </FormField>
                  <FormField id="wa-info-phone" label="Téléphone de l'entreprise">
                    <Input id="wa-info-phone" type="tel" value={fields.phone} onChange={update("phone")} maxLength={40} autoComplete="tel" className="h-10" />
                  </FormField>
                  <FormField id="wa-info-address" label="Adresse">
                    <Input id="wa-info-address" value={fields.address} onChange={update("address")} maxLength={300} autoComplete="street-address" className="h-10" />
                  </FormField>
                  <FormField id="wa-info-city" label="Ville">
                    <Input id="wa-info-city" value={fields.city} onChange={update("city")} maxLength={100} autoComplete="address-level2" className="h-10" />
                  </FormField>
                  {info && (info.countryCode || info.timezone) && (
                    <p className="rounded-xl border border-border bg-surface p-3 text-xs text-slate-600 sm:col-span-2">
                      {info.countryCode && (
                        <>
                          Pays : <strong className="text-navy-800">{countryName(info.countryCode)}</strong>
                        </>
                      )}
                      {info.countryCode && info.timezone && " · "}
                      {info.timezone && (
                        <>
                          Fuseau horaire : <strong className="text-navy-800">{info.timezone}</strong>
                        </>
                      )}
                      <span className="block pt-0.5">Repris du profil de l&apos;agence.</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" className="h-11" onClick={close}>
                  Annuler
                </Button>
                <Button type="button" variant="accent" className="h-11 gap-2" disabled={infoLoading || preparing} onClick={() => void confirmInfo()}>
                  {preparing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Continuer
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {omitted.length > 0 && (
                <p className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Format non reconnu, laissé vide dans la fenêtre de Meta : {omitted.join(", ")}. Vous pourrez le saisir chez Meta, ou revenir le
                    corriger.
                  </span>
                </p>
              )}

              <h3 className="text-base font-semibold text-navy-800">Avant de commencer</h3>
              <ul className="space-y-3">
                {ADVICE.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3 text-sm text-slate-700">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-navy-800 text-citron-400">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="pt-1">{text}</span>
                  </li>
                ))}
              </ul>

              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-navy-900">
                <input
                  type="checkbox"
                  checked={phoneReady}
                  onChange={(e) => setPhoneReady(e.target.checked)}
                  className="size-5 shrink-0 cursor-pointer rounded border-slate-300 accent-navy-800"
                />
                WhatsApp Business est ouvert et à jour sur le téléphone de l&apos;agence
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Retour
                </Button>
                <Button type="button" variant="accent" className="h-11 gap-2" disabled={!canOpenMeta} onClick={openMeta}>
                  {phase === "loading" && configured ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Continuer avec Facebook
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
              {configured && !phoneReady && <p className="text-center text-xs text-slate-500 sm:text-right">Cochez la case pour continuer.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {message ? (
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
              ) : (
                busy && (
                  <p role="status" className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                    <span>
                      {phase === "finishing"
                        ? "Connexion reçue : enregistrement du numéro et demande de l'historique…"
                        : "La fenêtre de Meta est ouverte. Suivez ses écrans jusqu'à « Terminer », puis revenez ici."}
                    </span>
                  </p>
                )
              )}

              {phase !== "done" && (
                <>
                  <h3 className="text-base font-semibold text-navy-800">Ce que vous allez voir</h3>
                  <ol className="space-y-3">
                    {META_SCREENS.map((text, i) => (
                      <li key={text} className="flex gap-3 text-sm text-slate-700">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400 tabular-nums">
                          {i + 1}
                        </span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {(phase === "ready" || phase === "error") && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setStep(2)}>
                    <ArrowLeft className="size-4" aria-hidden />
                    Retour aux conseils
                  </Button>
                  <Button type="button" variant="accent" className="h-11 gap-2" disabled={!canOpenMeta} onClick={openMeta}>
                    <RefreshCw className="size-4" aria-hidden />
                    Rouvrir la fenêtre de Meta
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
