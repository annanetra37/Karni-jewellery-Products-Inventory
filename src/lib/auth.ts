import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { redirect } from 'next/navigation';
import type { Role, User } from '@prisma/client';

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-me-in-production-please-32chars-min'
);
const COOKIE = 'karni_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const tok = (await cookies()).get(COOKIE)?.value;
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, SECRET);
    const uid = payload.uid as string;
    if (!uid) return null;
    const user = await prisma.user.findUnique({ where: { id: uid } });
    return user?.isActive ? user : null;
  } catch { return null; }
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== 'ADMIN') redirect('/');
  return u;
}

export function isAdmin(u: { role: Role } | null): boolean {
  return u?.role === 'ADMIN';
}
