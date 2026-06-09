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

export function isSuperAdmin(u: { role: Role } | null): boolean {
  return u?.role === 'SUPER_ADMIN';
}

/** Admin privileges = a point-scoped ADMIN or a global SUPER_ADMIN. */
export function isAdmin(u: { role: Role } | null): boolean {
  return u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN';
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect('/');
  return u;
}

export async function requireSuperAdmin(): Promise<User> {
  const u = await requireUser();
  if (!isSuperAdmin(u)) redirect('/');
  return u;
}

/** Selling-point ids an admin may manage (empty until the super admin assigns some). */
export async function getManagedSellingPointIds(userId: string): Promise<string[]> {
  const rows = await prisma.adminSellingPoint.findMany({
    where: { userId },
    select: { sellingPointId: true },
  });
  return rows.map((r) => r.sellingPointId);
}

/**
 * Selling points a user is allowed to see in scoped views.
 * `null` means unrestricted (super admin); an array restricts to those ids
 * (a point-scoped admin with no assignments gets an empty array → sees nothing).
 */
export async function sellingPointScope(u: { id: string; role: Role }): Promise<string[] | null> {
  if (isSuperAdmin(u)) return null;
  if (u.role === 'ADMIN') return getManagedSellingPointIds(u.id);
  return [];
}
