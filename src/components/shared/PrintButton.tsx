"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Impression du navigateur : permet aussi d'enregistrer le reçu en PDF. */
export function PrintButton({ label = "Imprimer ou enregistrer en PDF" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
