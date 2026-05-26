import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';
async function main() {
  const prisma = new PrismaClient();
  const u = await prisma.user.findUnique({ where: { email: 'annanetra37@gmail.com' } });
  if (!u) process.exit(1);
  console.log(await new SignJWT({ uid: u.id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('dev-secret-change-me-in-production-please-32chars-min')));
  await prisma.$disconnect();
}
main();
