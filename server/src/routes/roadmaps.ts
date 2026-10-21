// roadmap routes — list, generate, read, update progress, delete
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { withFallback } from "../ai";

const router = Router();
router.use(requireAuth);

// request shapes
const generateSchema = z.object({
  topic: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(300).optional(),
  moduleCount: z.number().int().min(3).max(16).default(8),
});

const toggleSchema = z.object({
  completed: z.boolean(),
});

// helper: fetch one roadmap, but only if it belongs to the caller
const ownRoadmap = async (roadmapId: number, userId: number) => {
  return prisma.roadmap.findFirst({
    where: { id: roadmapId, userId },
    include: { cells: { orderBy: { order: "asc" } } },
  });
};

// list all of the user's roadmaps with progress counts
router.get("/", async (req, res) => {
  const roadmaps = await prisma.roadmap.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    include: {
      cells: { select: { completed: true } },
    },
  });

  res.json({
    roadmaps: roadmaps.map((r) => ({
      id: r.id,
      title: r.title,
      topic: r.topic,
      goal: r.goal,
      provider: r.provider,
      createdAt: r.createdAt,
      total: r.cells.length,
      completed: r.cells.filter((c) => c.completed).length,
    })),
  });
});

// generate a brand-new roadmap with ai and save it
router.post("/generate", async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { topic, goal, moduleCount } = parsed.data;

  // ask the ai for a plan (falls back to offline if the provider fails)
  const { result: plan, provider } = await withFallback((p) =>
    p.generateRoadmap(topic, goal, moduleCount),
  );

  const roadmap = await prisma.roadmap.create({
    data: {
      title: plan.title,
      topic,
      goal,
      provider,
      userId: req.userId!,
      cells: {
        create: plan.cells.map((c, i) => ({
          order: i + 1,
          title: c.title,
          summary: c.summary,
        })),
      },
    },
    include: { cells: { orderBy: { order: "asc" } } },
  });

  res.status(201).json({ roadmap });
});

// get one roadmap with its cells
router.get("/:id", async (req, res) => {
  const roadmap = await ownRoadmap(Number(req.params.id), req.userId!);
  if (!roadmap) {
    res.status(404).json({ error: "roadmap not found" });
    return;
  }
  res.json({ roadmap });
});

// delete a roadmap
router.delete("/:id", async (req, res) => {
  const roadmap = await ownRoadmap(Number(req.params.id), req.userId!);
  if (!roadmap) {
    res.status(404).json({ error: "roadmap not found" });
    return;
  }
  await prisma.roadmap.delete({ where: { id: roadmap.id } });
  res.json({ ok: true });
});

// mark a cell complete or incomplete
router.patch("/:id/cells/:cellId", async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "completed (boolean) is required" });
    return;
  }

  const roadmap = await ownRoadmap(Number(req.params.id), req.userId!);
  if (!roadmap) {
    res.status(404).json({ error: "roadmap not found" });
    return;
  }

  const cell = roadmap.cells.find((c) => c.id === Number(req.params.cellId));
  if (!cell) {
    res.status(404).json({ error: "cell not found" });
    return;
  }

  const updated = await prisma.roadmapCell.update({
    where: { id: cell.id },
    data: {
      completed: parsed.data.completed,
      completedAt: parsed.data.completed ? new Date() : null,
    },
  });

  res.json({ cell: updated });
});

// get (or lazily generate) the detailed study guide for a cell
router.post("/:id/cells/:cellId/detail", async (req, res) => {
  const roadmap = await ownRoadmap(Number(req.params.id), req.userId!);
  if (!roadmap) {
    res.status(404).json({ error: "roadmap not found" });
    return;
  }

  const cell = roadmap.cells.find((c) => c.id === Number(req.params.cellId));
  if (!cell) {
    res.status(404).json({ error: "cell not found" });
    return;
  }

  // already generated before? serve the saved version
  if (cell.detail) {
    res.json({ cell });
    return;
  }

  // generate and persist for next time
  const { result: detail } = await withFallback((p) =>
    p.generateCellDetail(
      roadmap.topic,
      cell.title,
      cell.order,
      roadmap.cells.length,
    ),
  );

  const updated = await prisma.roadmapCell.update({
    where: { id: cell.id },
    data: { detail },
  });

  res.json({ cell: updated });
});

export default router;
