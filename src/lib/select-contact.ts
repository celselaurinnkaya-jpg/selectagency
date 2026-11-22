// Coordonnées de l'équipe SELECT Agency, affichées sur le site public et dans « Aide et support ».
// Une seule source : changer l'adresse e-mail (par exemple pour contact@ ou support@, une fois la boîte créée) se fait ici.

export const SELECT_CONTACT = {
  email: "notifications@myselectagency.com",
  phone: "+33 7 51 11 18 04",
  whatsapp: "+33 7 51 11 18 04",
} as const;

/** Lien WhatsApp (wa.me) vers l'équipe SELECT, avec un message prérempli facultatif. */
export function selectWhatsAppLink(text?: string): string {
  const base = `https://wa.me/${SELECT_CONTACT.whatsapp.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
