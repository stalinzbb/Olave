"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const GROUPS = [
  { title: "Workspace", items: [{ href: "/evals", label: "Evals" }] },
  { title: "Library", items: [{ href: "/datasets", label: "Datasets" }, { href: "/graders", label: "Graders" }, { href: "/models", label: "Models" }] },
  { title: "Project", items: [{ href: "/settings", label: "Settings" }] },
];

export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <nav aria-label="Main" className="flex w-60 shrink-0 flex-col p-2">
      <div className="flex min-h-8 items-center gap-2 px-2 py-2">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent text-sm font-bold text-white">E</span>
        <span className="text-[17px] font-semibold">LLM Evals</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {GROUPS.map((group) => (
          <section key={group.title} className="py-1">
            <h2 className="px-2 py-1 text-xs font-semibold text-ink-2">{group.title}</h2>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-8 items-center rounded-el px-2 hover:bg-tint ${active ? "bg-line font-medium" : ""}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex items-center gap-1 border-t border-line px-2 pt-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={email}>{email}</span>
        <button type="button" onClick={signOut} className="btn btn-ghost btn-sm">Sign out</button>
      </div>
    </nav>
  );
}
