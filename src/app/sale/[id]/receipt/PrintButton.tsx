'use client';
export function PrintButton() {
  return <button className="btn-primary flex-1" onClick={() => window.print()}>Print</button>;
}
