import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { runHealthChecks } from '@/lib/health';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireSuperAdmin();
  const checks = await runHealthChecks();
  const failing = checks.filter((c) => !c.ok).length;
  const allOk = failing === 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-karni-700 hover:text-karni-900">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        Home
      </Link>

      <header>
        <h1 className="page-title">System health</h1>
        <p className="page-subtitle">
          Live integrity checks over inventory and money. Refresh any time — nothing here changes data.
        </p>
      </header>

      <div className={`card flex items-center gap-3 ${allOk ? 'border-emerald-300' : 'border-red-300'}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${allOk ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          {allOk ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          )}
        </div>
        <div>
          <p className="font-semibold">{allOk ? 'All checks passed' : `${failing} check${failing === 1 ? '' : 's'} need attention`}</p>
          <p className="text-sm text-karni-700">
            {allOk
              ? 'Inventory reconciles with the stock ledger and all sale and cash totals add up.'
              : 'See the failing checks below for the affected records.'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.id} className={`card ${c.ok ? '' : 'border-red-300'}`}>
            <div className="flex items-start gap-3">
              <span className={`chip ${c.ok ? 'chip-ok' : 'chip-danger'} mt-0.5`}>{c.ok ? 'OK' : `${c.failCount} issue${c.failCount === 1 ? '' : 's'}`}</span>
              <div className="min-w-0">
                <p className="font-semibold">{c.label}</p>
                <p className="text-sm text-karni-700">{c.proves}</p>
                {!c.ok && c.samples.length > 0 && (
                  <ul className="mt-2 text-sm text-red-800 space-y-0.5 font-mono break-words">
                    {c.samples.map((s, i) => <li key={i}>• {s}</li>)}
                    {c.failCount > c.samples.length && (
                      <li className="text-karni-700 font-sans">…and {c.failCount - c.samples.length} more</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
