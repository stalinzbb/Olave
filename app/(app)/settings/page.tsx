import { Chip, PageHeader } from "@/components/kit";
import { connectionStatus } from "@/lib/server/env";
import { requireUser } from "@/lib/server/supabase";

export default async function SettingsPage() {
  await requireUser();
  const status = connectionStatus();
  const rows = [
    { name: "OpenRouter", env: "OPENROUTER_API_KEY", on: status.openrouter, off: "Mock mode: runs return placeholder text and LLM judges are skipped." },
    { name: "TypeSafe (Jev)", env: "TYPESAFE_API_KEY", on: status.typesafe, off: "Jev graders are skipped." },
  ];
  return (
    <>
      <PageHeader eyebrow="Project" title="Settings" />
      <section className="card max-w-2xl divide-y divide-line">
        {rows.map((row) => (
          <div key={row.env} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.name}</p>
              <p className="hint">{row.on ? "Key is set on the server." : row.off} Set <code>{row.env}</code> in the server environment.</p>
            </div>
            <Chip tone={row.on ? "good" : "warn"}>{row.on ? "connected" : "not connected"}</Chip>
          </div>
        ))}
      </section>
      <p className="hint mt-3 max-w-2xl">Provider keys live only in server environment variables. They are never sent to the browser, stored in the database, written to logs, or accepted from this page: this screen can only see whether each one is set.</p>
    </>
  );
}
