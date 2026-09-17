import { promises as fs } from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "watches.json");

export interface Watch {
  id: string;
  address: `0x${string}`;
  thresholdUsd: string; // 8-decimal fixed point, same convention as everywhere else
  webhookUrl: string;
  createdAt: number;
  lastCheckedAt: number | null;
  lastWorstCaseLossUsd: string | null;
  fired: boolean;
}

async function readStore(): Promise<Watch[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeStore(watches: Watch[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(watches, null, 2));
}

export async function addWatch(watch: Watch): Promise<void> {
  const watches = await readStore();
  watches.push(watch);
  await writeStore(watches);
}

export async function listWatchesPublic(): Promise<Omit<Watch, "webhookUrl">[]> {
  const watches = await readStore();
  return watches.map(({ webhookUrl: _webhookUrl, ...rest }) => rest);
}

export async function getAllWatches(): Promise<Watch[]> {
  return readStore();
}

export async function updateWatch(id: string, patch: Partial<Watch>): Promise<void> {
  const watches = await readStore();
  const next = watches.map((w) => (w.id === id ? { ...w, ...patch } : w));
  await writeStore(next);
}
