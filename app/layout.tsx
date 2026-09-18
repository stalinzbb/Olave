import type { Metadata } from "next";
import { Figtree } from "next/font/google";

import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

// Every page is rendered per request so Next can stamp the CSP nonce from proxy.ts onto its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "LLM Evals", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
