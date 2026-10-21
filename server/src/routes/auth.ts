// auth routes — register, login, and "who am i"
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { hashPassword, makeToken, requireAuth, verifyPassword } from "../auth";

const router = Router();

// request shapes
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(8, "password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// the user object we hand back to the client (never the hash)
const publicUser = (u: { id: number; email: string; name: string | null }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
});

// create an account and log in straight away
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { email, name, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "an account with that email already exists" });
    return;
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });

  res.status(201).json({ token: await makeToken(user.id), user: publicUser(user) });
});

// log in with email + password
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "wrong email or password" });
    return;
  }

  res.json({ token: await makeToken(user.id), user: publicUser(user) });
});

// get the logged-in user's info
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    res.status(401).json({ error: "account no longer exists" });
    return;
  }
  res.json({ user });
});

export default router;
