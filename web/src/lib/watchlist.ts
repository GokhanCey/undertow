const KEY = "undertow.watchlist";

export function getWatchlist(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToWatchlist(address: string): string[] {
  try {
    const current = getWatchlist();
    if (current.includes(address)) return current;
    const next = [address, ...current].slice(0, 12);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return getWatchlist();
  }
}

export function removeFromWatchlist(address: string): string[] {
  try {
    const next = getWatchlist().filter((a) => a !== address);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return getWatchlist();
  }
}
