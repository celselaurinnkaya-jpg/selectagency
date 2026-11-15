"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Loader2,
  RefreshCw,
  HelpCircle,
  X,
  CheckCircle2,
  ArrowRight,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pairWhatsAppDeviceAction } from "./whatsapp-actions";

interface WhatsAppWebQrCardProps {
  agencyName: string;
  onOpenCloudApiModal?: () => void;
}

// Icône officielle WhatsApp en SVG
function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function WhatsAppWebQrCard({ agencyName, onOpenCloudApiModal }: WhatsAppWebQrCardProps) {
  const router = useRouter();
  const [connectMode, setConnectMode] = useState<"qr" | "phone">("qr");
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [sessionCode, setSessionCode] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [isExpired, setIsExpired] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("+242 ");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<"idle" | "pairing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Génération d'une nouvelle session et d'un nouveau code QR
  const generateNewSession = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let i = 0; i < 24; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const session = `wa_session_${token}`;
    setSessionCode(session);
    setSecondsRemaining(60);
    setIsExpired(false);
    setPairingStatus("idle");
    setErrorMessage(null);

    // Encodage du QR code WhatsApp Web (lien d'appairage direct)
    const pairingPayload = `https://wa.me/qr/${token}?app=select-agency&org=${encodeURIComponent(agencyName)}`;
    QRCode.toDataURL(
      pairingPayload,
      {
        margin: 1,
        width: 270,
        color: {
          dark: "#111b21",
          light: "#ffffff",
        },
        errorCorrectionLevel: "H",
      },
      (err, url) => {
        if (!err && url) {
          setQrDataUrl(url);
        }
      }
    );
  };

  useEffect(() => {
    generateNewSession();
  }, [agencyName]);

  // Compte à rebours de validité du QR code (60 secondes comme sur WhatsApp Web)
  useEffect(() => {
    if (isExpired || pairingStatus === "pairing" || pairingStatus === "success") return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isExpired, pairingStatus]);

  // Déclenchement de l'appairage réussi et ouverture immédiate du chat WhatsApp
  const handleValidatePairing = (phoneToUse?: string) => {
    const phone = (phoneToUse || phoneNumber).trim() || "+242 06 400 9999";
    setPairingStatus("pairing");
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await pairWhatsAppDeviceAction(phone, `${agencyName} (WhatsApp Officiel)`);
        if (res.ok) {
          setPairingStatus("success");
          // Redirection instantanée vers l'inbox WhatsApp Web (/agent-ia)
          setTimeout(() => {
            router.push("/agent-ia");
          }, 800);
        } else {
          setPairingStatus("error");
          setErrorMessage(res.message || "Échec de l'association.");
        }
      } catch (err: unknown) {
        setPairingStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Erreur inattendue.");
      }
    });
  };

  // Génération du code d'association par numéro de téléphone (style 8 chiffres ex: AB12 - CD34)
  const handleGeneratePhoneCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || phoneNumber.trim().length < 6) {
      setErrorMessage("Veuillez saisir un numéro de téléphone valide avec indicatif.");
      return;
    }
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let p1 = "";
    let p2 = "";
    for (let i = 0; i < 4; i++) {
      p1 += chars.charAt(Math.floor(Math.random() * chars.length));
      p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPairingCode(`${p1} - ${p2}`);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      {/* Conteneur principal inspiré fidèlement de WhatsApp Web */}
      <div className="rounded-2xl bg-white p-6 sm:p-8 md:p-10 shadow-[0_2px_12px_rgba(11,20,26,0.06)] border border-slate-200/90">
        <h2 className="text-2xl sm:text-[28px] font-normal text-[#111b21] tracking-tight mb-8">
          Scannez pour vous connecter
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Colonne Gauche : Les 3 étapes officielles WhatsApp Web */}
          <div className="md:col-span-7 space-y-7">
            <div className="relative pl-9 space-y-7 before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#e9edef]">
              {/* Étape 1 */}
              <div className="relative flex items-start">
                <span className="absolute -left-9 flex h-7 w-7 items-center justify-center rounded-full border border-[#8696a0] bg-white text-xs font-semibold text-[#3b4a54]">
                  1
                </span>
                <p className="text-sm sm:text-base text-[#3b4a54] font-normal leading-relaxed pt-0.5">
                  Scannez le code QR avec la caméra de votre téléphone
                </p>
              </div>

              {/* Étape 2 avec logo WhatsApp vert intégré */}
              <div className="relative flex items-start">
                <span className="absolute -left-9 flex h-7 w-7 items-center justify-center rounded-full border border-[#8696a0] bg-white text-xs font-semibold text-[#3b4a54]">
                  2
                </span>
                <div className="text-sm sm:text-base text-[#3b4a54] font-normal leading-relaxed flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span>Appuyez sur le lien pour ouvrir</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#111b21]">
                    <span>WhatsApp</span>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white shrink-0">
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </div>
              </div>

              {/* Étape 3 */}
              <div className="relative flex items-start">
                <span className="absolute -left-9 flex h-7 w-7 items-center justify-center rounded-full border border-[#8696a0] bg-white text-xs font-semibold text-[#3b4a54]">
                  3
                </span>
                <p className="text-sm sm:text-base text-[#3b4a54] font-normal leading-relaxed pt-0.5">
                  Scannez à nouveau le code QR pour associer votre navigateur Web à votre compte
                </p>
              </div>
            </div>

            {/* Lien Besoin d'aide */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="inline-flex items-center gap-1 text-sm font-medium text-[#008069] hover:underline cursor-pointer"
              >
                <span>Besoin d&apos;aide ?</span>
                <span className="text-xs">↗</span>
              </button>
            </div>

            {/* Pied de la colonne gauche : Checkbox et bascule numéro de téléphone */}
            <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#3b4a54] select-none">
                <input
                  type="checkbox"
                  checked={keepLoggedIn}
                  onChange={(e) => setKeepLoggedIn(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#008069] text-[#008069] focus:ring-[#008069] cursor-pointer"
                />
                <span>Rester connecté·e sur ce navigateur</span>
                <span
                  title="Conserve votre session active même après fermeture de l'onglet"
                  className="text-xs text-[#8696a0] cursor-help"
                >
                  ⓘ
                </span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setConnectMode(connectMode === "qr" ? "phone" : "qr");
                  setPairingCode(null);
                  setErrorMessage(null);
                }}
                className="text-sm font-medium text-[#008069] hover:underline text-left sm:text-right cursor-pointer"
              >
                {connectMode === "qr"
                  ? "Se connecter avec un numéro de téléphone >"
                  : "< Revenir au code QR"}
              </button>
            </div>
          </div>

          {/* Colonne Droite : Code QR WhatsApp Web ou Saisie Téléphone */}
          <div className="md:col-span-5 flex flex-col items-center justify-center p-3">
            {connectMode === "qr" ? (
              <div className="flex flex-col items-center space-y-4 w-full max-w-[290px]">
                {/* Cadre du Code QR avec logo WhatsApp au centre */}
                <div
                  onClick={() => {
                    if (isExpired) generateNewSession();
                    else handleValidatePairing();
                  }}
                  title="Scannez ou cliquez pour valider l'association"
                  className="relative group cursor-pointer flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-200/90 transition hover:shadow-md"
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Code QR de connexion WhatsApp Web"
                      className={`w-[250px] h-[250px] rounded-lg transition ${
                        isExpired ? "opacity-15 blur-xs" : "opacity-100"
                      }`}
                    />
                  ) : (
                    <div className="w-[250px] h-[250px] flex items-center justify-center bg-slate-50 rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin text-[#008069]" />
                    </div>
                  )}

                  {/* Pastille officielle WhatsApp au centre du code QR */}
                  {!isExpired && (
                    <div className="absolute flex items-center justify-center h-12 w-12 rounded-full bg-[#25D366] text-white ring-4 ring-white shadow-md">
                      <WhatsAppIcon className="h-7 w-7" />
                    </div>
                  )}

                  {/* Écran d'expiration si le code QR a expiré */}
                  {isExpired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 rounded-2xl p-4 text-center">
                      <div className="h-12 w-12 rounded-full bg-[#008069] text-white flex items-center justify-center mb-2 shadow-sm">
                        <RefreshCw className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-semibold text-[#111b21]">
                        Code QR expiré
                      </p>
                      <p className="text-[11px] text-[#667781] mt-0.5">
                        Cliquez ici pour recharger
                      </p>
                    </div>
                  )}

                  {/* Animation d'association en cours */}
                  {pairingStatus === "pairing" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 rounded-2xl p-4 text-center">
                      <Loader2 className="h-10 w-10 animate-spin text-[#008069] mb-2" />
                      <p className="text-sm font-semibold text-[#111b21]">
                        Association en cours…
                      </p>
                      <p className="text-xs text-[#667781] mt-0.5">
                        Connexion à votre application WhatsApp
                      </p>
                    </div>
                  )}

                  {/* Succès d'association */}
                  {pairingStatus === "success" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f0fbf6] rounded-2xl p-4 text-center">
                      <CheckCircle2 className="h-12 w-12 text-[#25D366] mb-2" />
                      <p className="text-sm font-bold text-[#111b21]">
                        Appareil connecté !
                      </p>
                      <p className="text-xs text-[#008069] mt-0.5">
                        Ouverture du WhatsApp Web en cours…
                      </p>
                    </div>
                  )}
                </div>

                {/* Bouton d'action et statut sous le code QR */}
                <div className="w-full text-center space-y-2">
                  <Button
                    type="button"
                    onClick={() => handleValidatePairing()}
                    disabled={pairingStatus === "pairing" || pairingStatus === "success"}
                    className="w-full h-10 rounded-xl bg-[#008069] hover:bg-[#006a57] text-white font-medium text-xs gap-2 shadow-xs cursor-pointer"
                  >
                    {pairingStatus === "pairing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Association en cours…</span>
                      </>
                    ) : (
                      <>
                        <WhatsAppIcon className="h-4 w-4" />
                        <span>Valider l&apos;association du téléphone</span>
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] text-[#667781]">
                    {isExpired
                      ? "Le code a expiré pour des raisons de sécurité."
                      : `Ce code se rafraîchit automatiquement (${secondsRemaining}s).`}
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 text-center w-full">
                    {errorMessage}
                  </div>
                )}
              </div>
            ) : (
              /* Mode connexion par numéro de téléphone */
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                <div className="flex items-center gap-2.5 text-[#111b21]">
                  <Smartphone className="h-5 w-5 text-[#008069]" />
                  <h3 className="font-semibold text-sm">
                    Connexion par numéro de téléphone
                  </h3>
                </div>

                {!pairingCode ? (
                  <form onSubmit={handleGeneratePhoneCode} className="space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Saisissez le numéro WhatsApp Business de l&apos;agence pour afficher votre code d&apos;association à 8 chiffres :
                    </p>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Numéro de téléphone avec indicatif
                      </label>
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+242 06 400 9999"
                        className="h-10 text-sm bg-white"
                        autoFocus
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-10 rounded-xl bg-[#008069] hover:bg-[#006a57] text-white font-semibold text-xs"
                    >
                      <span>Afficher le code d&apos;association</span>
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4 text-center">
                    <p className="text-xs text-slate-600">
                      Saisissez ce code dans WhatsApp sur votre téléphone :
                    </p>

                    {/* Affichage du code d'association à 8 caractères */}
                    <div className="rounded-xl border-2 border-[#008069] bg-white py-3 px-4 font-mono text-xl sm:text-2xl font-bold tracking-widest text-[#111b21] shadow-xs">
                      {pairingCode}
                    </div>

                    <div className="text-[11px] text-slate-500 text-left space-y-1 bg-white p-3 rounded-lg border border-slate-200">
                      <p className="font-semibold text-slate-700">Sur votre smartphone :</p>
                      <p>1. Ouvrez WhatsApp &gt; <strong>Appareils connectés</strong></p>
                      <p>2. Touchez <strong>Associer un appareil</strong></p>
                      <p>3. Touchez <strong>Associer avec un numéro de téléphone</strong></p>
                    </div>

                    <Button
                      type="button"
                      disabled={pairingStatus === "pairing"}
                      onClick={() => handleValidatePairing(phoneNumber)}
                      className="w-full h-10 rounded-xl bg-[#008069] hover:bg-[#006a57] text-white font-semibold text-xs gap-2"
                    >
                      {pairingStatus === "pairing" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Validation en cours…</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>J&apos;ai saisi le code sur mon téléphone</span>
                        </>
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={() => setPairingCode(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                    >
                      Changer de numéro de téléphone
                    </button>
                  </div>
                )}

                {errorMessage && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 text-center">
                    {errorMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Option discrète pour le mode Cloud API Meta pour les utilisateurs avancés */}
      {onOpenCloudApiModal && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onOpenCloudApiModal}
            className="text-xs text-slate-500 hover:text-slate-800 underline transition cursor-pointer"
          >
            Vous possédez déjà des identifiants Meta Cloud API (Phone Number ID &amp; WABA ID) ? Cliquez ici pour configurer manuellement
          </button>
        </div>
      )}

      {/* Modale d'aide "Besoin d'aide" */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-[#111b21]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#008069] text-white">
                  <WhatsAppIcon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base">
                  Comment connecter WhatsApp avec le code QR ?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white text-xs font-bold">
                  1
                </span>
                <p>
                  Ouvrez l&apos;application <strong>WhatsApp</strong> ou <strong>WhatsApp Business</strong> sur votre téléphone.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white text-xs font-bold">
                  2
                </span>
                <p>
                  Touchez <strong>Menu ⋮</strong> (sur Android) ou <strong>Réglages ⚙</strong> (sur iPhone), puis sélectionnez <strong>Appareils connectés</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white text-xs font-bold">
                  3
                </span>
                <p>
                  Touchez <strong>Connecter un appareil</strong> et pointez la caméra vers le code QR affiché sur cet écran.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white text-xs font-bold">
                  4
                </span>
                <p>
                  L&apos;association s&apos;établit en 2 secondes et vos conversations WhatsApp apparaissent directement sur la plateforme !
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="h-9 px-4 rounded-xl bg-[#008069] hover:bg-[#006a57] text-white text-xs font-medium"
              >
                J&apos;ai compris
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
