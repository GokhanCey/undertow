"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const LINKS = [
  { href: "/", label: "Scanner" },
  { href: "/vault", label: "Vault" },
  { href: "/ecosystem", label: "Ecosystem" },
  { href: "/methodology", label: "Methodology" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="mx-auto flex w-full flex-wrap items-center justify-between gap-4 px-8 py-8 sm:px-16 sm:py-10 lg:px-24">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7c3aed] font-[family-name:var(--font-display)] font-extrabold text-sm text-white">
          U
        </span>
        <span className="font-[family-name:var(--font-display)] text-lg font-extrabold text-[#0f0f14]">
          Undertow
        </span>
      </Link>
      <nav className="flex items-center gap-7 text-sm font-medium text-[#6b7280]">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href
                ? "font-bold text-[#7c3aed]"
                : "hover:text-[#0f0f14]"
            }
          >
            {link.label}
          </Link>
        ))}
        <a
          href="https://explorer.testnet.chain.robinhood.com/address/0xb20dbe9223c2a6538cd5f9ffb8cb7a1a5c827d62"
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-full border border-[#0f0f14] px-4 py-2 text-[#0f0f14] transition hover:bg-[#0f0f14] hover:text-white sm:inline-block"
        >
          View contract
        </a>
        <ConnectButton
          showBalance={false}
          chainStatus="none"
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        />
      </nav>
    </header>
  );
}
