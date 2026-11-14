import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toWaConversation, toWaMessage } from "@/lib/domain/ai";

describe("Boîte de réception WhatsApp — Modèle et Mapping", () => {
  it("mappe correctement une conversation avec ses relations", () => {
    const rawRow = {
      id: "11111111-1111-4000-8000-111111111111",
      organization_id: "22222222-2222-4000-8000-222222222222",
      account_id: "33333333-3333-4000-8000-333333333333",
      contact_id: "44444444-4444-4000-8000-444444444444",
      contact: { profile_name: "Fatou Ndiaye", wa_id: "237699445566" },
      agent: { name: "Amina Visas" },
      mode: "assist",
      status: "open",
      unread_count: 2,
      last_message_text: "Quelles sont les pièces pour Campus France ?",
      last_message_at: "2026-11-09T00:30:00Z",
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:30:00Z",
    };

    const conv = toWaConversation(rawRow);
    expect(conv.contactName).toBe("Fatou Ndiaye");
    expect(conv.contactPhone).toBe("237699445566");
    expect(conv.agentName).toBe("Amina Visas");
    expect(conv.mode).toBe("assist");
    expect(conv.unreadCount).toBe(2);
  });

  it("mappe correctement un message sortant avec ses accusés de lecture", () => {
    const rawMsg = {
      id: "55555555-5555-4000-8000-555555555555",
      organization_id: "22222222-2222-4000-8000-222222222222",
      conversation_id: "11111111-1111-4000-8000-111111111111",
      direction: "outbound",
      meta_message_id: "wamid.HBgLMjM...",
      kind: "text",
      body: "Bonjour Fatou, voici la liste des pièces requises.",
      author_kind: "ai",
      status: "read",
      delivered_at: "2026-11-09T00:31:00Z",
      read_at: "2026-11-09T00:32:00Z",
      created_at: "2026-11-09T00:30:00Z",
      updated_at: "2026-11-09T00:32:00Z",
    };

    const msg = toWaMessage(rawMsg);
    expect(msg.direction).toBe("outbound");
    expect(msg.authorKind).toBe("ai");
    expect(msg.status).toBe("read");
    expect(msg.deliveredAt).toBe("2026-11-09T00:31:00Z");
    expect(msg.readAt).toBe("2026-11-09T00:32:00Z");
  });
});

