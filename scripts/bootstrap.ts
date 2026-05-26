/**
 * Runs once on every startup. Idempotent.
 *
 * 1. Apply pending Prisma migrations.
 * 2. If Variant table is empty (fresh DB), run the catalog import
 *    + seed selling points + FX rates + admin user.
 *
 * Designed for Railway: set the start command to
 *   `tsx scripts/bootstrap.ts && next start`
 * (or use the `start` npm script which does this for you).
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

function sh(cmd: string) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

async function main() {
  // 1. Migrate.
  try {
    sh('npx prisma migrate deploy');
  } catch (e) {
    console.error('Migrations failed:', e);
    process.exit(1);
  }

  // 2. Seed catalog if empty.
  const variantCount = await prisma.variant.count();
  if (variantCount > 0) {
    console.log(`✓ Catalog already populated (${variantCount} variants). Skipping import.`);
    return;
  }

  const sheet = path.resolve(process.cwd(), 'Karni_Master_Product_Database.xlsx');
  if (!existsSync(sheet)) {
    console.warn(`⚠ ${sheet} not found — skipping catalog import. Run \`npm run import:catalog\` later.`);
    return;
  }
  console.log('→ Fresh database. Running catalog import…');
  sh('npx tsx scripts/import-catalog.ts');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
