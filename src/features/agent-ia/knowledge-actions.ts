"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { chunkText, type KnowledgeSnippet } from "@/lib/ai/knowledge";
import { extractDocumentText } from "@/lib/ai/extract-text";
import { ensureAgencyAgentId } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const textKnowledgeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  agentId: z.string().optional(),
  title: z.string().trim().min(3, "Le titre doit comporter au moins 3 caractères.").max(200),
  content: z.string().trim().min(10, "Le contenu doit comporter au moins 10 caractères.").max(50000),
});

const urlKnowledgeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  agentId: z.string().optional(),
  title: z.string().trim().min(3, "Le titre est requis.").max(200),
  url: z.string().trim().url("Veuillez entrer une adresse URL valide (ex : https://...).").max(1000),
  content: z.string().trim().min(10, "Veuillez fournir le résumé ou les informations clés de ce lien.").max(30000),
});

export async function saveTextKnowledgeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = textKnowledgeSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const input = parsed.data;
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { message: "Action réservée aux administrateurs.", values };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS.", values };
  }

  let targetAgentId = input.agentId && UUID.test(input.agentId) ? input.agentId : null;
  if (!targetAgentId) {
    targetAgentId = await ensureAgencyAgentId(ctx);
  }
  if (!targetAgentId) {
    return { message: "Impossible d'initialiser l'agent pour cette connaissance.", values };
  }

  // 1. Enregistrement de la source dans la table ai_knowledge_sources
  const { data: sourceId, error: sourceErr } = await ctx.supabase.rpc("save_ai_knowledge_source", {
    p_id: input.id ? input.id : null,
    p_org: ctx.organizationId,
    p_agent_id: targetAgentId,
    p_kind: "text",
    p_title: input.title,
    p_raw_content: input.content,
    p_source_url: null,
    p_storage_path: null,
  });

  if (sourceErr) {
    return { message: dbMessage(sourceErr), values };
  }
  if (!sourceId) {
    return { message: "Échec d'enregistrement de la source.", values };
  }

  // 2. Découpage du texte en fragments cohérents (chunks)
  const chunks = chunkText(input.content);

  // 3. Enregistrement des fragments dans ai_knowledge_chunks
  const { error: chunksErr } = await ctx.supabase.rpc("save_ai_knowledge_chunks", {
    p_org: ctx.organizationId,
    p_source_id: sourceId,
    p_agent_id: targetAgentId,
    p_chunks: chunks,
  });

  if (chunksErr) {
    return { message: dbMessage(chunksErr), values };
  }

  refresh();
  return { ok: true, message: `Connaissance enregistrée et découpée en ${chunks.length} fragment${chunks.length > 1 ? "s" : ""}.` };
}

export async function saveUrlKnowledgeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = urlKnowledgeSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const input = parsed.data;
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { message: "Action réservée aux administrateurs.", values };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS.", values };
  }

  let targetAgentId = input.agentId && UUID.test(input.agentId) ? input.agentId : null;
  if (!targetAgentId) {
    targetAgentId = await ensureAgencyAgentId(ctx);
  }
  if (!targetAgentId) {
    return { message: "Impossible d'initialiser l'agent pour cette connaissance.", values };
  }

  // Enregistrement de la source URL
  const { data: sourceId, error: sourceErr } = await ctx.supabase.rpc("save_ai_knowledge_source", {
    p_id: input.id ? input.id : null,
    p_org: ctx.organizationId,
    p_agent_id: targetAgentId,
    p_kind: "url",
    p_title: input.title,
    p_raw_content: input.content,
    p_source_url: input.url,
    p_storage_path: null,
  });

  if (sourceErr) {
    return { message: dbMessage(sourceErr), values };
  }
  if (!sourceId) {
    return { message: "Échec d'enregistrement de la source.", values };
  }

  const chunks = chunkText(input.content);

  const { error: chunksErr } = await ctx.supabase.rpc("save_ai_knowledge_chunks", {
    p_org: ctx.organizationId,
    p_source_id: sourceId,
    p_agent_id: targetAgentId,
    p_chunks: chunks,
  });

  if (chunksErr) {
    return { message: dbMessage(chunksErr), values };
  }

  refresh();
  return { ok: true, message: "Lien de référence enregistré et indexé." };
}

export async function deleteKnowledgeSourceAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Identifiant manquant." };
  }

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const { error } = await ctx.supabase.rpc("delete_ai_knowledge_source", {
    p_id: id,
    p_org: ctx.organizationId,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: "Document ou source supprimé de la base." };
}

export async function searchKnowledgeTestAction(agentId: string, query: string): Promise<KnowledgeSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const ctx = await getAgencyContext();

  const { data, error } = await ctx.supabase.rpc("search_ai_knowledge", {
    p_org: ctx.organizationId,
    p_agent_id: agentId,
    p_query: trimmed,
    p_limit: 4,
  });

  if (error) {
    console.error("Erreur de recherche RAG :", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    sourceTitle: String(row.source_title),
    content: String(row.content),
    rank: Number(row.rank ?? 0),
  }));
}

/** Envoi d'un document (PDF, Word .docx, texte) : son texte est lu puis ajouté aux connaissances de l'agent. */
export async function uploadKnowledgeFileAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const agentId = formData.get("agentId");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez un fichier." };

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Seuls le propriétaire et les administrateurs peuvent gérer la base de connaissances." };
  }
  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS." };
  }

  // Résolution résiliente de l'agent : si agentId est provisoire ou manquant, initialise l'agent Support client
  let targetAgentId = typeof agentId === "string" && UUID.test(agentId) ? agentId : null;
  if (!targetAgentId) {
    targetAgentId = await ensureAgencyAgentId(ctx);
  }

  if (!targetAgentId) {
    return {
      ok: false,
      message: "Impossible d'initialiser l'agent Support client. Veuillez d'abord cliquer sur « Enregistrer l'agent » en haut.",
    };
  }

  const read = await extractDocumentText(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!read.ok) return { ok: false, message: read.error };

  const title = (file.name.replace(/\.[a-z0-9]+$/i, "").trim() || "Document").slice(0, 200);
  const { data: sourceId, error: sourceErr } = await ctx.supabase.rpc("save_ai_knowledge_source", {
    p_id: null,
    p_org: ctx.organizationId,
    p_agent_id: targetAgentId,
    p_kind: "file",
    p_title: title,
    p_raw_content: read.text,
    p_source_url: null,
    p_storage_path: null,
  });
  if (sourceErr || !sourceId) return { ok: false, message: sourceErr ? dbMessage(sourceErr) : "Enregistrement du document impossible." };

  const chunks = chunkText(read.text);
  const { error: chunksErr } = await ctx.supabase.rpc("save_ai_knowledge_chunks", {
    p_org: ctx.organizationId,
    p_source_id: sourceId,
    p_agent_id: targetAgentId,
    p_chunks: chunks,
  });
  if (chunksErr) return { ok: false, message: dbMessage(chunksErr) };

  refresh();
  return { ok: true, message: `« ${title} » est lu et ajouté aux connaissances (${chunks.length} passage${chunks.length > 1 ? "s" : ""}).` };
}
