// src/services/api.ts
// small api client for the fokus backend: same-origin fetch, json everywhere
// the backend sets an HttpOnly session cookie, so no tokens in js

import { createContext, useContext } from "react";

export interface VideoResource {
  id: string;
  title: string;
  channel: string;
  length: string;
}

export interface LinkResource {
  name: string;
  platform: string;
  url: string;
}

export interface ModuleResources {
  videos: VideoResource[];
  links: LinkResource[];
}

export interface SourceLink {
  title: string;
  url: string;
}

export interface ModuleDetail {
  v?: number;
  content?: string;
  concepts?: string[];
  exercise?: string;
  mistake?: string;
  sources: SourceLink[];
}

export interface RoadmapModule {
  title: string;
  content: string;
  fullContent: string | null;
  detail?: ModuleDetail | null;
  done: boolean;
  resources?: ModuleResources | null;
}

export interface Roadmap {
  id: number;
  topic: string;
  createdAt: number;
  modules: RoadmapModule[];
}

export interface RoadmapSummary {
  id: number;
  topic: string;
  createdAt: number;
  total: number;
  done: number;
}

export interface User {
  username: string;
  createdAt: number;
}

// one fetch helper: parses json, turns {error: "..."} into a thrown Error
// (errors may carry a suggestions array for the did-you-mean panel)
async function request<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `request failed (${res.status})`);
    const suggestions = (data as { suggestions?: string[] }).suggestions;
    if (Array.isArray(suggestions)) {
      (err as Error & { suggestions?: string[] }).suggestions = suggestions;
    }
    throw err;
  }
  return data as T;
}

export const api = {
  // auth
  me: () => request<User>("GET", "/me"),
  login: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/login", { username, password }),
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout"),

  // roadmaps
  listRoadmaps: () => request<RoadmapSummary[]>("GET", "/roadmaps"),
  validateTopic: (topic: string) =>
    request<{ ok: boolean; suggestions: string[] }>("POST", "/validate-topic", { topic }),
  getRoadmap: (id: number) => request<Roadmap>(`GET`, `/roadmaps/${id}`),
  createRoadmap: (topic: string) => request<Roadmap>("POST", "/roadmaps", { topic }),
  deleteRoadmap: (id: number) => request<{ ok: boolean }>("DELETE", `/roadmaps/${id}`),
  toggleModule: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/toggle`, { index }),
  moduleDetail: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/detail`, { index }),
  moduleResources: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/resources`, { index }),
};

// auth context: user is null when signed out, undefined while checking
export interface AuthState {
  user: User | null | undefined;
  setUser: (u: User | null) => void;
}

export const AuthContext = createContext<AuthState>({
  user: undefined,
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);
