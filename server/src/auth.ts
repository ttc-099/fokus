// password hashing, token signing, and the auth middleware
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env";

// let express requests carry the logged-in user id
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

const secret = new TextEncoder().encode(env.jwtSecret);

// turn a plain password into a storable hash
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

// check a plain password against a stored hash
export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

// make a login token valid for 7 days
export const makeToken = (userId: number) =>
  new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

// middleware: require a valid "Authorization: Bearer <token>" header
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "login required" });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
