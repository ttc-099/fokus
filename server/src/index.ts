// server entry — wires up express, routes, and error handling
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import roadmapRoutes from "./routes/roadmaps";
import { ai } from "./ai";
import { env } from "./env";

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// basic liveness + config check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiProvider: ai.name });
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/roadmaps", roadmapRoutes);

// 404 for unknown api paths
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not found" });
});

// last-resort error handler so the server never crashes on a bad request
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server] unhandled error:", err);
    res.status(500).json({ error: "internal server error" });
  },
);

app.listen(env.port, () => {
  console.log(`[server] fokus api listening on http://localhost:${env.port}`);
  console.log(`[server] ai provider: ${ai.name}`);
});
