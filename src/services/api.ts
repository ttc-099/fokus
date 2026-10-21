// api client — one axios instance that carries the login token
import axios from "axios";

// types shared across pages
export interface User {
  id: number;
  email: string;
  name: string | null;
}

export interface RoadmapCell {
  id: number;
  order: number;
  title: string;
  summary: string;
  detail: string | null;
  completed: boolean;
}

export interface Roadmap {
  id: number;
  title: string;
  topic: string;
  goal: string | null;
  provider: string;
  createdAt: string;
  cells: RoadmapCell[];
}

export interface RoadmapSummary {
  id: number;
  title: string;
  topic: string;
  goal: string | null;
  provider: string;
  createdAt: string;
  total: number;
  completed: number;
}

// the shared http client (vite proxies /api to the server)
const api = axios.create({ baseURL: "/api" });

// attach the saved token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fokus_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// log the user out if the token expires or gets rejected
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("fokus_token");
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// pull the error message out of any failed request
export const apiError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message;
  }
  return "something went wrong";
};

// ---- auth calls ----

export const apiRegister = async (email: string, name: string, password: string) => {
  const res = await api.post<{ token: string; user: User }>("/auth/register", {
    email,
    name: name || undefined,
    password,
  });
  return res.data;
};

export const apiLogin = async (email: string, password: string) => {
  const res = await api.post<{ token: string; user: User }>("/auth/login", {
    email,
    password,
  });
  return res.data;
};

export const apiMe = async () => {
  const res = await api.get<{ user: User }>("/auth/me");
  return res.data.user;
};

// ---- roadmap calls ----

export const apiListRoadmaps = async () => {
  const res = await api.get<{ roadmaps: RoadmapSummary[] }>("/roadmaps");
  return res.data.roadmaps;
};

export const apiGenerateRoadmap = async (
  topic: string,
  goal: string,
  moduleCount = 8,
) => {
  const res = await api.post<{ roadmap: Roadmap }>("/roadmaps/generate", {
    topic,
    goal: goal || undefined,
    moduleCount,
  });
  return res.data.roadmap;
};

export const apiGetRoadmap = async (id: number) => {
  const res = await api.get<{ roadmap: Roadmap }>(`/roadmaps/${id}`);
  return res.data.roadmap;
};

export const apiDeleteRoadmap = async (id: number) => {
  await api.delete(`/roadmaps/${id}`);
};

export const apiToggleCell = async (
  roadmapId: number,
  cellId: number,
  completed: boolean,
) => {
  const res = await api.patch<{ cell: RoadmapCell }>(
    `/roadmaps/${roadmapId}/cells/${cellId}`,
    { completed },
  );
  return res.data.cell;
};

export const apiCellDetail = async (roadmapId: number, cellId: number) => {
  const res = await api.post<{ cell: RoadmapCell }>(
    `/roadmaps/${roadmapId}/cells/${cellId}/detail`,
  );
  return res.data.cell;
};

export const apiHealth = async () => {
  const res = await api.get<{ ok: boolean; aiProvider: string }>("/health");
  return res.data;
};

export default api;
