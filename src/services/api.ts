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

export interface QuizQuestion {
  q: string;
  kind?: "recall" | "apply" | "trap";
  concept?: string;
  options: string[];
  answer: number;
  why: string;
}

export interface ModuleQuiz {
  v?: number;
  questions: QuizQuestion[];
  // pass mark for this set; older quizzes fall back to a two thirds rule
  pass?: number;
}

export interface WorkedExample {
  setup: string;
  steps: string[];
  result: string;
  watchout: string;
}

export interface ModuleDetail {
  v?: number;
  content?: string;
  concepts?: string[];
  exercise?: string;
  mistake?: string;
  // a fully worked example of the stage skill: what to do, step by step
  worked?: WorkedExample | null;
  sources: SourceLink[];
}

export interface RoadmapModule {
  title: string;
  content: string;
  fullContent: string | null;
  detail?: ModuleDetail | null;
  done: boolean;
  resources?: ModuleResources | null;
  quiz?: ModuleQuiz | null;
}

export interface LLMCall {
  model: string;
  ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  tps: number;
}

export interface TraceAgent {
  agent: string;
  ms: number;
  calls: LLMCall[];
}

export interface Trace {
  model: string;
  agents: TraceAgent[];
}

export interface TraceTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens: number;
  ms: number;
  tps: number;
  cost_usd: number;
}

export interface EngineMetrics {
  roadmaps: number;
  calls: number;
  tokens: number;
  ms: number;
  tps: number;
  cost_usd: number;
}

export interface Roadmap {
  id: number;
  topic: string;
  createdAt: number;
  modules: RoadmapModule[];
  trace?: Trace | null;
  traceTotals?: TraceTotals | null;
}

export interface AdminStats {
  users: number;
  newUsersWeek: number;
  activeWeek: number;
  roadmaps: number;
  modules: number;
  modulesDone: number;
  gateRejections: number;
  avgGenMs: number;
  lastCreated: number | null;
  tokenSeries: { day: string; tokens: number }[];
  models: { model: string; calls: number; tokens: number; tps: number; costUsd: number }[];
  funnel: { started: number; touched: number; finished: number };
  completionRate: number;
  attention: { topic: string; owner: string; ageDays: number }[];
  slowest: { topic: string; ms: number; tokens: number }[];
  agentAverages: Record<string, number>;
  config: { admins: string[]; sessionDays: number; authRateLimit: number; aiPerWindow: number };
  monthCost: number;
  dbInfo: { path: string; sizeKb: number; roadmaps: number };
  serverStarted: number;
  llm: { calls: number; tokens: number; tps: number; costUsd: number };
  series: { day: string; roadmaps: number }[];
  topUsers: { username: string; roadmaps: number; done: number }[];
  recent: { topic: string; owner: string; created: number; done: number; total: number }[];
}

export interface AdminUser {
  username: string;
  joined: number;
  roadmaps: number;
  done: number;
  lastActive: number | null;
  lastTopic?: string;
  days?: Record<string, number>;
}

export interface AdminRoadmapRow {
  id: number;
  topic: string;
  owner: string;
  created: number;
  done: number;
  total: number;
  genMs: number | null;
  tokens: number | null;
  hasResources: boolean;
}

export interface RoadmapSummary {
  id: number;
  topic: string;
  createdAt: number;
  total: number;
  done: number;
  next?: string | null;
}

export interface User {
  username: string;
  createdAt: number;
  isAdmin?: boolean;
}

export interface Activity {
  days: Record<string, number>;
  week: number;
  total: number;
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
  // a missing or expired session answers 401; signing out is still a success
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout")
    .catch(() => ({ ok: true })),

  // roadmaps
  listRoadmaps: () => request<RoadmapSummary[]>("GET", "/roadmaps"),
  validateTopic: (topic: string) =>
    request<{ ok: boolean; suggestions: string[] }>("POST", "/validate-topic", { topic }),
  activity: () => request<Activity>("GET", "/activity"),
  metrics: () => request<EngineMetrics>("GET", "/metrics"),
  adminStats: () => request<AdminStats>("GET", "/admin/stats"),
  adminUsers: () => request<AdminUser[]>("GET", "/admin/users"),
  adminRoadmaps: () => request<AdminRoadmapRow[]>("GET", "/admin/roadmaps"),
  getRoadmap: (id: number) => request<Roadmap>(`GET`, `/roadmaps/${id}`),
  createRoadmap: (topic: string) => request<Roadmap>("POST", "/roadmaps", { topic }),
  deleteRoadmap: (id: number) => request<{ ok: boolean }>("DELETE", `/roadmaps/${id}`),
  toggleModule: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/toggle`, { index }),
  moduleDetail: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/detail`, { index }),
  moduleResources: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/resources`, { index }),
  moduleQuiz: (id: number, index: number) =>
    request<Roadmap>("POST", `/roadmaps/${id}/quiz`, { index }),
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
