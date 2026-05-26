'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SearchResult = {
  id: string; sku: string; designName: string; category: string | null;
  collection: string | null; subcollection: string | null; size: string | null; color: string | null;
  priceAmd: string; imageUrl: string | null; status: string; reorderPoint: number; quantity: number | null;
};

type SellingPoint = { id: string; name: string; type: string };

export function ProductSearch({
  sellingPoints, defaultSellingPointId, onPick, hideStock = false, autoFocus = false,
}: {
  sellingPoints: SellingPoint[];
  defaultSellingPointId?: string;
  onPick?: (r: SearchResult) => void;
  hideStock?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [spId, setSpId] = useState(defaultSellingPointId || '');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('');
  const [inStock, setInStock] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const url = useMemo(() => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (spId) u.set('sellingPointId', spId);
    if (category) u.set('category', category);
    if (color) u.set('color', color);
    if (inStock) u.set('inStock', '1');
    u.set('limit', '25');
    return `/api/search?${u.toString()}`;
  }, [q, spId, category, color, inStock]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      fetch(url).then((r) => r.json()).then((d) => setResults(d.results || []))
        .finally(() => setLoading(false));
    }, 180);
  }, [url]);

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <input
          autoFocus={autoFocus}
          inputMode="search"
          enterKeyHint="search"
          placeholder="Search SKU, design, color, letter, barcode…"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <select className="input flex-1 min-w-[140px]" value={spId} onChange={(e) => setSpId(e.target.value)}>
            <option value="">All selling points</option>
            {sellingPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
          <select className="input flex-1 min-w-[120px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option>Pendant</option><option>Earring</option><option>Ring</option>
            <option>Bracelet</option><option>Necklace</option><option>Brooch</option>
          </select>
          <input className="input flex-1 min-w-[100px]" placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
            In stock only
          </label>
        </div>
      </div>

      {loading && <p className="text-xs text-karni-700 text-center">Searching…</p>}

      <ul className="grid gap-2">
        {results.map((r) => {
          const qty = r.quantity ?? 0;
          const stockBadge = hideStock ? null
            : qty <= 0 ? <span className="chip-danger">Out of stock</span>
            : qty <= r.reorderPoint ? <span className="chip-warn">Low: {qty}</span>
            : <span className="chip-ok">{qty} in stock</span>;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick?.(r)}
                className="w-full text-left card flex items-center gap-3 hover:bg-karni-50"
              >
                <div className="w-16 h-16 rounded-lg bg-karni-100 flex items-center justify-center overflow-hidden shrink-0">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt={r.designName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-karni-500 text-xs">no photo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.designName}</p>
                  <p className="text-xs text-karni-700 truncate">
                    {[r.subcollection, r.color, r.size].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-[10px] text-karni-700 mt-1 font-mono truncate">{r.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{Math.round(Number(r.priceAmd)).toLocaleString()} ֏</p>
                  {stockBadge}
                </div>
              </button>
            </li>
          );
        })}
        {!loading && results.length === 0 && (
          <li className="text-center text-karni-700 text-sm py-8">No results.</li>
        )}
      </ul>
    </div>
  );
}
