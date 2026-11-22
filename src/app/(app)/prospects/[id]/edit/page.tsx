import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import EditClientPage from "@/app/(app)/clients/[id]/edit/page";

export const metadata: Metadata = { title: "Modifier le prospect" };

export default function EditProspectPage(props: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditClientPage {...props} />
    </Suspense>
  );
}
