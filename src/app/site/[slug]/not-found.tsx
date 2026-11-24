import Link from "next/link";

// Adresse de site inconnue, ou site mis hors ligne par son agence.
export default function SiteNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Ce site n&apos;est pas disponible</h1>
      <p className="max-w-md text-slate-600">L&apos;adresse est peut-être erronée, ou l&apos;agence a mis son site hors ligne.</p>
      <Link href="/" className="text-sm font-medium text-slate-700 underline">
        SELECT Agency
      </Link>
    </main>
  );
}
