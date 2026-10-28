import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

// Rubik : formes arrondies proches du logo et de la référence visuelle, très lisible en petite taille.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SELECT Agency — La gestion intelligente des agences de voyages",
    template: "%s · SELECT Agency",
  },
  description:
    "Logiciel de gestion pour les agences de voyages : clients, dossiers de visa et d'études, documents, rendez-vous et paiements.",
};

export const viewport: Viewport = {
  themeColor: "#023764",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={rubik.variable}>
      <body>{children}</body>
    </html>
  );
}
