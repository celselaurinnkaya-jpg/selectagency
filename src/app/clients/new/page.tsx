"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { initialClients } from "@/lib/mockData";

export default function NewClientPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("Cameroun");
  const [city, setCity] = useState("Douala");
  const [type, setType] = useState<"student" | "individual" | "professional" | "company">("student");
  const [preferredLanguage, setPreferredLanguage] = useState("Français");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Duplicate check alert
  const possibleDuplicate = initialClients.find(
    (c) =>
      (phone && c.phone.replace(/\s+/g, "").includes(phone.replace(/\s+/g, ""))) ||
      (email && c.email.toLowerCase() === email.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !phone) {
      setErrorMsg("Veuillez renseigner au minimum le prénom, le nom et le téléphone.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    setTimeout(() => {
      setIsSubmitting(false);
      // Navigate to clients list with created state
      router.push("/clients");
    }, 700);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Link & Header */}
        <div>
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la liste des clients</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#023764] flex items-center justify-center border border-blue-100">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Enregistrer un nouveau client
              </h1>
              <p className="text-xs text-slate-500">
                Création de la fiche d'identification du demandeur.
              </p>
            </div>
          </div>
        </div>

        {/* Duplicate detection warning */}
        {possibleDuplicate && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Attention : Client similaire détecté</p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Un client avec un numéro ou un e-mail identique existe déjà :{" "}
                <Link
                  href={`/clients/${possibleDuplicate.id}`}
                  className="font-bold underline hover:text-amber-950"
                >
                  {possibleDuplicate.firstName} {possibleDuplicate.lastName} ({possibleDuplicate.reference})
                </Link>
                . Assurez-vous qu'il ne s'agit pas d'un doublon avant de valider.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-6"
        >
          {/* Identity Section */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#023764]" />
              Identité du client
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Prénom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Arnaud"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764] focus:ring-2 focus:ring-[#023764]/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom de famille <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Tchouameni"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764] focus:ring-2 focus:ring-[#023764]/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type de profil
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                >
                  <option value="student">Étudiant / Candidat aux études</option>
                  <option value="individual">Particulier / Tourisme</option>
                  <option value="professional">Professionnel / Mission d'affaires</option>
                  <option value="company">Entreprise / Compte corporatif</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Langue de communication préférée
                </label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                >
                  <option value="Français">Français</option>
                  <option value="Anglais">Anglais (English)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#023764]" />
              Coordonnées et localisation
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Numéro de téléphone principal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+237 699 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Format international recommandé avec indicatif (+237, +225, etc.)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Numéro WhatsApp (optionnel)
                </label>
                <input
                  type="tel"
                  placeholder="+237 699 00 00 00"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Adresse e-mail
              </label>
              <input
                type="email"
                placeholder="client@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pays de résidence
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                >
                  <option value="Cameroun">Cameroun</option>
                  <option value="Côte d'Ivoire">Côte d'Ivoire</option>
                  <option value="Sénégal">Sénégal</option>
                  <option value="Bénin">Bénin</option>
                  <option value="Togo">Togo</option>
                  <option value="RD Congo">RD Congo</option>
                  <option value="Gabon">Gabon</option>
                  <option value="Autre">Autre pays</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ville de résidence
                </label>
                <input
                  type="text"
                  placeholder="Ex : Douala"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Notes internes et historique préalable
            </label>
            <textarea
              rows={3}
              placeholder="Précisez le contexte du projet, premier contact, ou antécédents éventuels..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link
              href="/clients"
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Annuler
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Enregistrement...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Créer la fiche client</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
