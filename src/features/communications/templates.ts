// Modèles de messages à envoyer manuellement (WhatsApp). Ton factuel : aucune promesse de résultat.

export interface MessageTemplate {
  key: string;
  label: string;
  text: string;
}

export function buildMessageTemplates(ctx: {
  firstName: string;
  agencyName: string;
  caseReference?: string;
  missingDocuments: string[];
  nextAppointment?: { title: string; when: string; location?: string };
  balance?: string;
}): MessageTemplate[] {
  const hello = `Bonjour ${ctx.firstName},`;
  const signature = `\n\n${ctx.agencyName}`;
  const ref = ctx.caseReference ? ` (dossier ${ctx.caseReference})` : "";
  const templates: MessageTemplate[] = [];

  if (ctx.missingDocuments.length) {
    templates.push({
      key: "documents",
      label: "Pièces manquantes",
      text: `${hello}\n\nPour avancer sur votre dossier${ref}, il nous manque encore :\n${ctx.missingDocuments.map((d) => `- ${d}`).join("\n")}\n\nMerci de nous les transmettre dès que possible.${signature}`,
    });
  }
  if (ctx.nextAppointment) {
    const where = ctx.nextAppointment.location ? `, ${ctx.nextAppointment.location}` : "";
    templates.push({
      key: "rdv",
      label: "Rappel de rendez-vous",
      text: `${hello}\n\nNous vous rappelons votre rendez-vous « ${ctx.nextAppointment.title} » : ${ctx.nextAppointment.when}${where}.\n\nMerci de nous prévenir en cas d'empêchement.${signature}`,
    });
  }
  if (ctx.balance) {
    templates.push({
      key: "solde",
      label: "Solde à régler",
      text: `${hello}\n\nLe solde restant à régler pour votre dossier${ref} est de ${ctx.balance}. Vous pouvez passer à l'agence ou nous contacter pour convenir du règlement.${signature}`,
    });
  }
  templates.push({ key: "libre", label: "Message libre", text: `${hello}\n\n${signature.trim()}` });
  return templates;
}
