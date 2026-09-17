import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Undertow: The Systemic View",
  description: "Network wide worst case risk across Robinhood Chain's largest real tokenized equity and crypto holders, computed live on chain.",
};

export default function EcosystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
