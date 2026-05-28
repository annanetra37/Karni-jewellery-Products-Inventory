# Karni Sales — Data Model

PostgreSQL via Prisma. All primary keys are `cuid()` strings unless noted.
**PK** = primary key · **FK** = foreign key · **UK** = unique key.

- `data-model.png` — full ER diagram with every column, PK/FK/UK marks.
- `data-model-overview.png` — relationships-only map (easier to read).
- `data-model.mmd` / `data-model-overview.mmd` — Mermaid sources (render on GitHub).

## How to read the relationships

`A ||--o{ B` means **one A has many B** (B holds the foreign key to A).
Example: `Sale ||--o{ SaleLineItem` — one sale has many line items.

---

## Reference data (set up once)

### `User`
Staff accounts (admin + salespeople).

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| email | **UK** | login id |
| passwordHash | | null until invite accepted |
| fullName | | |
| role | | `SALES` \| `ADMIN` |
| isActive | | deactivate instead of delete |
| inviteToken | **UK** | one-time activation/reset link |
| inviteAcceptedAt | | |
| createdById | **FK → User** | who invited them |
| createdAt | | |

**Populated by:**
- First admin → **seeded automatically** on first deploy from `ADMIN_EMAIL` env var (catalog import / bootstrap).
- New staff → **Admin → Users → "Generate invite"** (creates the row, emails the invite link via Resend; the user sets their password on `/invite/[token]`).
- Self password change → **`/account/password`**. Admin reset → **Admin → Users → "Reset / set password"**.

### `Design`
The design concept (163 rows) — story, motif, materials. One per concept.

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| designId | **UK** | e.g. `DSGN-PEND-ALPHA-AYB` |
| nameEn, nameHy | | English / Armenian names |
| category, collection, subcollection | | |
| motif, culturalMeaningEn/Hy | | marketing/story |
| metal, plating, enamelType | | descriptors |
| basePriceAmd, status, primaryImageUrl, notes | | |

**Populated by:**
- **Catalog import** (`scripts/import-catalog.ts`) from `Karni_Master_Product_Database.xlsx`.
- **Admin → Products → New product** (creates a new Design when you don't pick an existing one).
- **Admin → Products → [edit]** updates the design fields.

### `SellingPoint`
Locations / channels (Megamall, Website, Etsy, consignment galleries…).

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| name | **UK** | |
| type | | `PHYSICAL` \| `ONLINE` \| `CONSIGNMENT` |
| address | | printed on receipts |
| isActive | | |

**Populated by:** **seeded** at import time (10 points). No UI to add more yet (DB only).

### `FxRate`
Currency conversion rates (base = AMD).

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| currency | **UK** | USD / EUR / RUB |
| ratePerAmd | | 1 AMD = this much |

**Populated by:** **seeded** at import. Used when admin saves a variant price (recomputes USD/EUR/RUB). Editing is DB-only for now.

### `Counter`
Sequence generator for human-readable numbers.

| Column | Key | Notes |
|---|---|---|
| id | **PK** | `sale` or `order` |
| current | | last number issued |

**Populated by:** the app, atomically, when a Sale or Order is created.

---

## Catalog

### `Variant` — the sellable SKU (474 rows). **The unit of inventory and sale.**

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| sku | **UK** | e.g. `KARNI-PEND-ALPHA-AYB-RED` (auto-generated for new products) |
| designId | **FK → Design** | |
| designName, category, collection, subcollection | | denormalised for fast search |
| size, color | | |
| priceAmd | | base price |
| priceUsd, priceEur, priceRub | | computed from FxRate |
| **costAmd** | | **auto-sum of the cost breakdown below** |
| **metalType, metalCostAmd** | | metal (silver/gold/platinum) + its cost |
| **fillingMaterial, fillingCostAmd** | | enamel/resin/etc. + its cost |
| **platingType, platingCostAmd** | | gold plating/etc. + its cost |
| **laborCostAmd** | | |
| barcode | **UK** | nullable; scanner-friendly |
| imageUrl | | Azure Blob URL (or pasted URL) |
| weightG, reorderPoint | | reorderPoint default 2 |
| status | | `ACTIVE` \| `OUT_OF_STOCK` \| `ARCHIVED` \| `COMING_SOON` |
| onWebsite, onEtsy, onIg, inStockists | | channel flags |
| searchBlob | | lowercased text for trigram search |
| createdAt, updatedAt | | |

**Populated by:**
- **Catalog import** (bulk).
- **Admin → Products → New product** (creates the Variant + auto-SKU; photo uploaded to Azure).
- **Admin → Products → [edit]** edits all fields incl. the **cost breakdown** and photo.
- **Admin → Products → [edit] → Delete** archives (if it has sales) or hard-deletes.

> Stock is **not** stored here — see `InventoryItem`.

---

## Inventory (stock per location + audit ledger)

### `InventoryItem` — cached stock per (variant, selling point)

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| variantId | **FK → Variant** | part of unique pair |
| sellingPointId | **FK → SellingPoint** | part of unique pair |
| quantity | | cached count, ≥ 0 |
| createdById | **FK → User** | who first checked it in |
| firstSeenAt, updatedAt | | |

Unique constraint: **(variantId, sellingPointId)**.

**Populated by:**
- **Receive** screen (`/receive`) — first check-in creates the row and stamps `createdById`.
- **Sell** flow — decrements `quantity` on sale.
- **Admin → Products → [edit] → "Stock by selling point" → Set** — manual adjustment.

### `StockMovement` — append-only audit ledger (**never updated, only inserted**)

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| variantId | **FK → Variant** | |
| sellingPointId | **FK → SellingPoint** | |
| type | | `SALE` \| `CHECKIN` \| `RETURN` \| `ADJUSTMENT` \| `TRANSFER` \| `SAMPLE_GIFT` \| `DAMAGE_LOSS` |
| qtyDelta | | signed: `-1` sale, `+10` check-in |
| unitPriceAmd | | for sales |
| performedById | **FK → User** | who did it |
| saleId | **FK → Sale** | nullable; set for sale movements |
| note, createdAt | | |

**Populated by:** automatically — every **Sell**, **Receive**, and admin **stock adjustment** writes a row inside the same transaction. Viewed in **Admin → Inventory → audit log**.

---

## People

### `Customer`

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| fullName | | |
| email, phone | | at least one required; soft-deduped |
| notes, isLoyalty | | |
| createdById | **FK → User** | |
| createdAt | | |

**Populated by:** **Customers** page (`/customers`), or inline in the **Sell** flow ("+ Add new customer").

---

## Sales

### `Sale` — a completed sale

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| saleNumber | **UK** | `KARNI-2026-00042` |
| sellingPointId | **FK → SellingPoint** | |
| customerId | **FK → Customer** | nullable (walk-in) |
| soldById | **FK → User** | |
| subtotalAmd, totalAmd, currency | | |
| paymentMethod | | `CASH` \| `CARD` \| `TRANSFER` \| `OTHER` |
| createdAt | | |

### `SaleLineItem` — one row per item in a sale

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| saleId | **FK → Sale** | cascade delete |
| variantId | **FK → Variant** | |
| quantity, unitPriceAmd, lineTotalAmd | | |

**Populated by:** the **Sell** flow (`/sell`) on **Confirm & Sell** — one Sale + N SaleLineItems + N StockMovements, all in one transaction. Rendered on the **receipt** (`/sale/[id]/receipt`).

---

## Orders (future/promised fulfilment)

### `Order`

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| orderNumber | **UK** | `ORD-2026-00001` |
| createdById | **FK → User** | |
| customerId | **FK → Customer** | nullable |
| customerName | | free-text alternative |
| address, note, deadline | | |
| channel | | `ONLINE` \| `SALES_POINT` |
| sellingPointId | **FK → SellingPoint** | nullable |
| status | | `NEW` \| `IN_PROGRESS` \| `READY` \| `FULFILLED` \| `CANCELLED` |
| createdAt | | |

### `OrderLineItem` — one row per ordered item (catalog **or** custom)

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| orderId | **FK → Order** | cascade delete |
| variantId | **FK → Variant** | **nullable** — null = fully custom made-to-order |
| quantity, description | | description used for custom items |
| metalType, metalCostAmd | | per-line cost breakdown |
| fillingMaterial, fillingCostAmd | | |
| platingType, platingCostAmd | | |
| laborCostAmd, unitPriceAmd | | |

**Populated by:** **New order** (`/orders/new`). Each line captures the metal/material/plating choices + costs; picking a catalog item prefills them from the Variant. Viewed in **Orders** (`/orders`). Creating an order fires a `NEW_ORDER` notification.

---

## Operations

### `CashDrawerSession` — the kacca handover

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| sellingPointId | **FK → SellingPoint** | |
| userId | **FK → User** | person on shift |
| openingCountAmd, openingById **(FK→User)**, openingAt | | check-in |
| closingCountAmd, closingById **(FK→User)**, closingAt | | check-out (nullable until closed) |
| expectedClosingAmd | | computed: opening + cash sales |
| discrepancyAmd | | computed: counted − expected |
| priorClosingAmd | | previous session's close, for handover compare |
| handoverMismatch | | true if counts disagree |
| status | | `OPEN` \| `CLOSED` \| `DISPUTED` |
| note | | |

**Populated by:** **Kacca** screen (`/kacca`) — "Start shift" creates it, "End shift" closes it. Mismatches/discrepancies fire `KACCA_MISMATCH` notifications. Reviewed in **Admin → Reports**.

### `Notification`

| Column | Key | Notes |
|---|---|---|
| id | **PK** | |
| userId | **FK → User** | nullable = broadcast |
| type | | `NEW_ORDER` \| `LOW_STOCK` \| `KACCA_MISMATCH` \| `INVITE` |
| title, body | | |
| relatedId | | id of the related order/variant/session |
| isRead, createdAt | | |

**Populated by:** the app automatically (low-stock after a sale, new order, kacca mismatch, invite). Also emailed via Resend. Viewed in **Notifications** (`/notifications`).

---

## Quick map: UI screen → tables it writes

| Screen | Writes to |
|---|---|
| Login / invite / `/account/password` | `User` |
| Admin → Users | `User` (+ email) |
| Admin → Products (new/edit/delete) | `Design`, `Variant`, `InventoryItem`, `StockMovement` |
| Receive (`/receive`) | `InventoryItem`, `StockMovement` |
| Sell (`/sell`) | `Sale`, `SaleLineItem`, `StockMovement`, `InventoryItem`, `Customer`, `Notification`, `Counter` |
| Customers (`/customers`) | `Customer` |
| New order (`/orders/new`) | `Order`, `OrderLineItem`, `Notification`, `Counter` |
| Kacca (`/kacca`) | `CashDrawerSession`, `Notification` |
| Catalog import (one-off) | `Design`, `Variant`, `SellingPoint`, `FxRate`, `User` (admin) |
