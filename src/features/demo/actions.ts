"use server";

import { redirect } from "next/navigation";
import { resetDb } from "@/lib/demo/store";

/** Remet les données fictives dans leur état d'origine (utile après une démonstration). */
export async function resetDemoAction(): Promise<void> {
  resetDb();
  redirect("/dashboard");
}
