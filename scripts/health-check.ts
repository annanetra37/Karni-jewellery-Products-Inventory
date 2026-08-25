/**
 * Command-line health check: runs the same integrity checks as the admin
 * "System health" page and exits non-zero if any invariant is violated. Handy
 * for a scheduled job or CI. Usage: `npm run health`.
 */
import { runHealthChecks } from '../src/lib/health';
import { prisma } from '../src/lib/db';

async function main() {
  const checks = await runHealthChecks();
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.label}${c.ok ? '' : ` — ${c.failCount} issue(s)`}`);
    if (!c.ok) {
      failed++;
      for (const s of c.samples) console.log(`    ${s}`);
      if (c.failCount > c.samples.length) console.log(`    …and ${c.failCount - c.samples.length} more`);
    }
  }
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
