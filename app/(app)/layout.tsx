import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authed = await requireUser().catch(() => null);
  if (!authed) redirect("/login");
  return (
    <div className="flex h-full">
      <Nav email={authed.user.email ?? "signed in"} />
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
