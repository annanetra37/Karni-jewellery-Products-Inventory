
Set these on the app service (not the Postgres plugin):

Variable	Value	What it does

* DATABASE_URL	${{Postgres.DATABASE_URL}}	
* SESSION_SECRET	a 32+ char random string — generate with openssl rand -hex 32	Signs the auth cookies. Required. Change this and everyone gets logged out.
* ADMIN_EMAIL	your email, e.g. annanetra37@gmail.com
* ADMIN_NAME	e.g. Annanetra
* ADMIN_INITIAL_PASSWORD	 karni-admin-2026	
* NEXT_TELEMETRY_DISABLED	1	Optional — silences Next's telemetry pings.



# Karni Sales — POS & Inventory

Mobile-first POS + inventory + lightweight CRM for **Karni Jewellery**, built from the spec in `KARNI_POS_DEV_TASKS.md`.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Prisma · PostgreSQL (with `pg_trgm` for fuzzy search) · Tailwind. Runs on Railway.

This is the first cut covering milestones **M1 – M5** of the spec:

| | Done |
|---|---|
| M1 Foundations (schema, migrations, catalog import, auth + roles, selling-point seed) | ✅ |
| M2 Search & Sell (trigram product search + single-item sell flow + receipt + transactional inventory decrement + low-stock notification) | ✅ |
| M3 Receiving & Kacca (stock check-in + cash drawer with handover reconciliation + discrepancy detection) | ✅ |
| M4 Orders & Notifications (create order + in-app notification feed + mismatch alerts) | ✅ (email outbound deferred — see _Limitations_) |
| M5 Admin panel (users invite, products, inventory edit, light reports) | ✅ |
| M6 Polish (multi-line counter sales, file-upload photos, FX-rate admin UI, returns UI, full bilingual UI) | not yet |

### Explicitly not built yet
- Outbound **email** (invites, low-stock) — no Resend / SMTP wired. Invite URL is shown in the admin user list for manual sharing.
- **File upload** for product photos — admin product page accepts an image URL only. R2 / Railway-volume upload is the natural next step (schema already has `imageUrl`).
- **Multi-line counter sales** — per spec §5 the sell flow is one item per sale. Schema and receipt handle multi-line today; the UI doesn't.
- **Returns** UI — schema supports `RETURN` movements but there's no screen.
- **FX rate** admin screen — rates are seeded and used; editing requires DB access for now.
- **Bilingual UI strings** — catalog stores HY+EN; UI shell is English-only.

---

## Quick start (local dev)

```bash
# 0. Postgres must be running locally with pg_trgm available.
service postgresql start
sudo -u postgres psql -c "CREATE USER karni WITH PASSWORD 'karni' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE karni OWNER karni;"
sudo -u postgres psql -d karni -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# 1. Install
npm install

# 2. Schema
npm run db:push          # syncs Prisma schema (use db:dev / db:migrate for migrations)

# 3. Trigram index on Variant.searchBlob (required for fast fuzzy search)
sudo -u postgres psql -d karni -c \
  'CREATE INDEX IF NOT EXISTS variant_search_trgm ON "Variant" USING gin ("searchBlob" gin_trgm_ops);'

# 4. Import catalog + seed admin
npm run import:catalog   # reads Karni_Master_Product_Database.xlsx

# 5. Run
npm run build && npm start
# open http://localhost:3000
```

Default admin (override via env):

- Email: `annanetra37@gmail.com`
- Password: `karni-admin-2026`

Change `ADMIN_INITIAL_PASSWORD` in `.env` before the first import in production.

---

## Deploying on Railway (one-shot)

The app **bootstraps itself on first start**: migrations run, `pg_trgm`
extension is enabled, the trigram index is built, and the catalog
(163 designs / 474 variants / 10 selling points / FX rates / admin user)
is imported automatically — but only if the database is empty.
Re-deploys are no-ops.

1. Push this repo to GitHub. In Railway, **New Project → Deploy from GitHub** → pick this repo.
2. In the same project, **+ New → Database → PostgreSQL**. Railway auto-injects `DATABASE_URL` into the app service via the `${{Postgres.DATABASE_URL}}` reference variable. If it isn't already set, add it on the app service manually:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```
3. Set the remaining env vars on the app service:
   - `SESSION_SECRET` — 32+ chars; generate with `openssl rand -hex 32`
   - `ADMIN_EMAIL` — owner's email (becomes the first admin)
   - `ADMIN_NAME` — owner's display name
   - `ADMIN_INITIAL_PASSWORD` — first-login password; change after login
4. Build command (Railway auto-detects, but if you set it manually): `npm run build`
   Start command: `npm start` *(this runs `tsx scripts/bootstrap.ts && next start`)*
5. Deploy. Watch the build logs — on the very first deploy you'll see:
   ```
   Applying migration `20260526000000_init`
   Applying migration `20260526000100_trigram_index`
   → Fresh database. Running catalog import…
   ✓ Selling points seeded: 10
   ✓ Designs upserted: 163
   ✓ Variants upserted: 474
   ✓ Admin created: annanetra37@gmail.com
   ```
   On every subsequent deploy:
   ```
   No pending migrations to apply.
   ✓ Catalog already populated (474 variants). Skipping import.
   ```
6. Open the Railway-generated URL, sign in with `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD`. You're live.

> ⚠ The `Karni_Master_Product_Database.xlsx` file **must be present in the deployed repo** for the auto-import — it's the seed data source. It's committed in this repo; don't remove it.

### Re-importing the catalog later

The import script is idempotent (upsert on `designId` / `sku`). To re-run after editing the spreadsheet:

```bash
railway run npm run import:catalog
```

---

## Data model overview

See `prisma/schema.prisma`. Key shapes (per spec §2):

- **`Design`** (163 rows): the design concept — story, motif, materials.
- **`Variant`** (474 rows): the sellable SKU. Holds price, photo, reorder point.
- **`SellingPoint`** (10 seeded): Megamall, Website, Instagram DM, Etsy, consignment galleries.
- **`InventoryItem`** = stock per `(variantId, sellingPointId)`. Cached, kept in sync inside the same transaction that writes the movement.
- **`StockMovement`**: append-only audit ledger. Every stock change writes here (`SALE`, `CHECKIN`, `ADJUSTMENT`, etc.).
- **`Sale` / `SaleLineItem`**: completed sale.
- **`Order` / `OrderLineItem`**: future fulfilment.
- **`CashDrawerSession`**: kacca workflow — opening count, closing count, expected, discrepancy, handover mismatch.
- **`Customer`**, **`User`**, **`Notification`**, **`FxRate`**.

### Transaction integrity

Every stock-affecting endpoint wraps the read → validate → insert movement → update cached qty → insert parent record in a single `prisma.$transaction`. The sale endpoint rejects with a `400` if it would push inventory below 0 (`Only N left at …`). Concurrency-safe under default Postgres row-locking inside transactions.

---

## Limitations & known TODOs

- **Email out** for invites / low-stock notifications is not wired (no SMTP/Resend credentials in this env). In-app `Notification` feed is fully functional; invite URL is shown in the admin → users list and can be copied to the new user. Add Resend in `src/lib/notify.ts` when ready.
- **Image upload**: the admin product page accepts an image URL. Direct file upload to R2 / Railway volumes is a TODO — the schema supports it (`imageUrl` field).
- **Single-item sales** at the counter per spec §5. Multi-line sale UI is deferred to M6. The schema and the receipt page already handle multiple line items, and orders support multi-line today.
- **Returns** flow (UI) deferred — schema supports it via `StockMovement.type = RETURN`.
- **Bilingual UI**: strings are flat-English; catalog stores `nameHy` and Armenian subcollection letters, which search across both.

---

## Testing what's there

The end-to-end smoke flow exercised during development:

1. Log in as admin.
2. **Receive** 5 units of any SKU at Megamall.
3. **Sell** 1 — receipt prints, inventory drops to 4.
4. Try to sell 10 — rejected with `Only 4 left at Megamall.`
5. Sell 3 — inventory hits 1, **low-stock notification** fires to admins (visible in `/notifications`).
6. **Kacca**: start shift at Megamall with opening count 50000. Make a cash sale. End shift — expected closing is shown, discrepancy computed.
7. Have a second user start a shift at the same point with a different count — handover mismatch is flagged and admins notified.
8. **Order**: create one — admins notified.

---

## User manual

See [`USER_MANUAL.md`](./USER_MANUAL.md).
