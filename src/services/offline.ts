// src/services/offline.ts
// per-roadmap offline copies: a saved roadmap (with whatever guides, videos
// and quizzes were generated) is kept in localStorage so it opens without
// a connection. videos and new quizzes still need the internet.

import type { Roadmap, User } from "./api";

const KEY = "fokus.offline.v1";

export interface SavedRoadmap {
  savedAt: number;
  roadmap: Roadmap;
}

type Store = Record<string, SavedRoadmap>;

const read = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
};

const write = (store: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage full or blocked: offline save is best effort
  }
};

export const offline = {
  save(roadmap: Roadmap) {
    const store = read();
    store[String(roadmap.id)] = { savedAt: Date.now(), roadmap };
    write(store);
  },
  remove(id: number) {
    const store = read();
    delete store[String(id)];
    write(store);
  },
  has(id: number) {
    return String(id) in read();
  },
  get(id: number): SavedRoadmap | null {
    return read()[String(id)] ?? null;
  },
  list(): SavedRoadmap[] {
    return Object.values(read()).sort((a, b) => b.savedAt - a.savedAt);
  },
  clearAll() {
    write({});
  },
};

// a tiny formatter for the "saved" labels
export const savedLabel = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

// the last signed-in identity, so an offline launch does not look like a logout
const USER_KEY = "fokus.user.v1";

export const cachedUser = {
  save(user: User) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
  },
  read(): User | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  },
  clear() {
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  },
};
