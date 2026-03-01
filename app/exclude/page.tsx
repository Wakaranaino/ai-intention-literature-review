import { ExcludeWorkspace } from "@/components/exclude-workspace";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ExcludePage() {
  const excludedCount = await prisma.excludedPaper.count();

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <ExcludeWorkspace initialCount={excludedCount} />
      </div>
    </main>
  );
}
