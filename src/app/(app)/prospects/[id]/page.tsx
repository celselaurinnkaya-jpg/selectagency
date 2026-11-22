import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import ClientPage from "@/app/(app)/clients/[id]/page";

export const metadata: Metadata = { title: "Fiche prospect" };

export default function ProspectDetailPage(props: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientPage {...props} />
    </Suspense>
  );
}
