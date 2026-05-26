import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';
async function main() {
  const prisma = new PrismaClient();
  const SECRET = new TextEncoder().encode('dev-secret-change-me-in-production-please-32chars-min');
  const u = await prisma.user.findUnique({ where: { email: 'annanetra37@gmail.com' } });
  if (!u) { console.error('no user'); process.exit(1); }
  const tok = await new SignJWT({ uid: u.id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(SECRET);
  console.log(tok);
  await prisma.$disconnect();
}
main();
