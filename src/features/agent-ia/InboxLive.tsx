"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// Temps réel : dès qu'un message arrive ou qu'une conversation change dans l'agence, l'écran se met à jour,
// comme sur WhatsApp Web. Les changements reçus sont filtrés par les règles d'accès de la base (RLS) :
// un membre ne reçoit que ceux de son agence. Rien n'est affiché depuis l'événement lui-même : la page est
// simplement relue.

export function InboxLive({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const reload = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const filter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`agent-ia-inbox-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages", filter }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_conversations", filter }, reload)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600" role="status">
      <span aria-hidden className={live ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-slate-300"} />
      {live ? "En direct" : "Connexion…"}
    </span>
  );
}
