# Karni Sales — User Manual

A guide to every screen in the app, who can use it, and how. Phone-first: every screen is designed for a phone at the counter.

---

## Contents

1. [Signing in](#1-signing-in)
2. [The home screen](#2-the-home-screen)
3. [The bottom navigation](#3-the-bottom-navigation)
4. [Sell — making a sale](#4-sell--making-a-sale)
5. [Catalog — browsing products](#5-catalog--browsing-products)
6. [Receive — checking in new stock](#6-receive--checking-in-new-stock)
7. [Kacca — the cash drawer handover](#7-kacca--the-cash-drawer-handover)
8. [Orders](#8-orders)
9. [Customers](#9-customers)
10. [Notifications](#10-notifications)
11. [The receipt](#11-the-receipt)
12. [Admin → Users (admin only)](#12-admin--users-admin-only)
13. [Admin → Products (admin only)](#13-admin--products-admin-only)
14. [Admin → Inventory (admin only)](#14-admin--inventory-admin-only)
15. [Admin → Reports (admin only)](#15-admin--reports-admin-only)
16. [Two roles, what they see](#16-two-roles-what-they-see)
17. [Tips, troubleshooting, FAQ](#17-tips-troubleshooting-faq)

---

## 1. Signing in

**URL:** `/login`

**Who:** everyone.

1. Open the app on your phone.
2. Enter your **email** and **password**.
3. Tap **Sign in**.

If you've never signed in before, the admin will have sent you an **invite link** of the form `/invite/<long-token>`. Open it, set a password (8+ characters), and you're in — no separate login step needed the first time.

If you forget your password, an admin can re-send the invite (your old password is wiped and you set a new one on the invite page).

To sign out, tap **Logout** in the top-right of any page.

---

## 2. The home screen

**URL:** `/`

What you see depends on whether you're sales or admin.

- **Hello, [your name]** card at the top.
- **Shift status** card —
  - Green if your kacca shift is open (shows location and opening count). Tap to manage it.
  - Amber if no shift is open. Tap to start one.
- **Sales today** and **Revenue today** — both refresh on each visit.
- Big action buttons:
  - **Start a sale** → `/sell`
  - **Receive stock** → `/receive`
  - **New order** → `/orders/new`
  - **Customers** → `/customers`
- (Admin only) **Admin** card with shortcuts to Users / Products / Inventory / Reports, plus a low-stock counter.

---

## 3. The bottom navigation

A fixed mobile-friendly tab bar at the bottom of every page (except print views):

| Tab | What |
|---|---|
| **Sell** | Start the sell flow. |
| **Catalog** | Browse / search the full product list. |
| **Receive** | Check in newly arrived stock. |
| **Kacca** | Open / close your cash drawer shift. |
| **Orders** | List of orders you (or anyone, if admin) created. |

The top-right has **Notifs** (unread badge) and **Logout**.

---

## 4. Sell — making a sale

**URL:** `/sell`. **Spec:** §4–5.

The fastest path from "customer hands you a piece" to "sale recorded + receipt".

### Step 1 — pick a product

You land on a search bar. Type any of:

- **SKU** (e.g. `karni-pend-alpha-ayb-red`)
- **Design name** (English or Armenian)
- **Color** (e.g. `turquoise`)
- **Armenian subcollection letter** (e.g. `Ա`)
- **Barcode** — if you have a scanner attached, just point and shoot; it types the code and the search runs.

The search is **typo-tolerant** (trigram fuzzy) and updates as you type. Filter chips below let you narrow by:

- **Selling point** — switching this changes the live stock numbers shown.
- **Category** — Pendant, Earring, Ring, Bracelet, Necklace, Brooch.
- **Color**.
- **In stock only** toggle.

Each result card shows the **photo** (or "no photo" placeholder), name, variant info, **price in AMD**, and a stock badge:

- 🟢 `N in stock` — fine.
- 🟡 `Low: N` — at or below the reorder point.
- 🔴 `Out of stock` — none at that location.

**Tap the card** to select it.

### Step 2 — confirm sale details

The screen turns into a sales sheet with three blocks:

**A. Product** — name, variant, SKU. Use **−** / **+** to change quantity. Use **Change** (top right) to swap to a different product. The line total recalculates live.

**B. Selling point + payment**
- **Selling point** — defaults to whatever location your current kacca shift is at (if any). Required.
- **Stock here** is shown beneath so you know how many are at that location.
- **Payment method** — Cash / Card / Transfer / Other. **Only Cash** sales count toward the kacca's expected closing total.

**C. Customer**
- Start typing in **Find by name / phone / email** — matches appear instantly. Tap one to attach.
- Or tap **+ Add new customer**, fill in name + phone and/or email, save. (If a customer with that phone/email already exists, the system attaches the existing one instead of creating a duplicate.)
- Or skip entirely — the sale will be marked as walk-in / no customer.

### Step 3 — Confirm & Sell

Big primary button at the bottom: **Confirm & Sell — N ֏**.

What happens behind the scenes, all inside one database transaction:

1. The system locks the inventory row at that selling point.
2. **Rejects** if the resulting quantity would go below 0 — you'll see `Only N left at [location]`.
3. Writes a `SALE` movement to the audit log.
4. Decrements cached stock.
5. Creates the sale + line item, assigns a sale number (e.g. `KARNI-2026-00042`).
6. If the new stock is at or below the reorder point (default: 2), an admin notification fires.

You're redirected to the **receipt**.

---

## 5. Catalog — browsing products

**URL:** `/products`. **Spec:** §4.

Same search component as the Sell flow, but selecting a product does nothing (it's view-only). Use it to:

- Check stock anywhere quickly.
- Show a customer the photo and price before they commit.
- Hand the phone over so the customer can browse.

---

## 6. Receive — checking in new stock

**URL:** `/receive`. **Spec:** §8.

When the owner / atelier brings new pieces, you record them here so the system knows they're sellable.

1. Pick the **selling point** they're going to (defaults to your open shift's location).
2. Tap **+ Add variant**. A search opens (same as Sell) — find the SKU and tap it.
3. Repeat for every line in the delivery (you can batch them).
4. For each line: set the **quantity** and an optional **note** (e.g. "atelier batch #5", "from supplier X").
5. Tap **Check in N items**.

What it does: writes one `CHECKIN` movement per line (attributed to you, with timestamp) and increments the cached stock at that selling point. Everything is transactional — if anything fails, nothing is partially recorded.

A **Recent check-ins** list at the bottom shows the last 8 receipts so you can confirm they landed.

---

## 7. Kacca — the cash drawer handover

**URL:** `/kacca`. **Spec:** §7.

This is the heart of the shift-change workflow. **Every shift change is a two-sided handover** — outgoing counts and records, incoming counts and records, the system reconciles.

### Starting a shift (incoming person)

1. Sign in.
2. Go to **Kacca**. If no shift of yours is open, you see **Start a shift**.
3. Pick the **selling point** (only physical / consignment points are listed).
4. **Count the drawer.** Enter the total AMD as **Opening count**.
5. Tap **Start shift**.

The system:
- Refuses to start if someone else's shift is already open at that selling point — it tells you who: "Previous shift by [name] hasn't been closed — close it first."
- Compares your opening count with the **previous person's closing count** (if any). If they don't match, **both numbers are saved**, the session is flagged with a **handover mismatch**, and admins are notified. The shift still starts — the discrepancy is logged immutably.

### Ending a shift (outgoing person)

1. On the **Kacca** page you see your open shift, in green, with the opening count and when you opened it.
2. **Count the drawer** again.
3. Enter the **Closing count** and tap **End shift & hand over**.

The system computes:
- **Expected closing** = opening count + the sum of **cash sales** at this selling point during your shift.
- **Discrepancy** = your closing count − expected.

If the discrepancy is non-zero, the session goes to status `DISPUTED` and admins are notified.

### Recent sessions

Below the action area is a list of recent sessions (yours only as sales; all sessions as admin) showing opening, closing, discrepancy, status, and whether the handover matched.

---

## 8. Orders

**URL:** `/orders` (list), `/orders/new` (form). **Spec:** §9.

For items that aren't an immediate counter sale: a custom request, an online DM order, a piece reserved for someone.

### Create an order

1. Tap **+ New order**.
2. Fill in:
   - **Customer name** (free text — or link to an existing customer later).
   - **Address**.
   - **Note** (anything special).
   - **Deadline** (date).
   - **Channel** — Online or Sales point.
   - **Selling point** (if "Sales point").
3. (Optional) Tap **+ Add item** and pick variants from search. Each item lets you set the quantity.
4. Tap **Create order**.

An order number is assigned (e.g. `ORD-2026-00001`). **All admins are notified.**

### Orders list

A reverse-chronological list of orders. Sales users see only orders they created; admins see all. Each card shows the order number, customer, channel, deadline, line items, note, and current status (`NEW` → `IN_PROGRESS` → `READY` → `FULFILLED`).

---

## 9. Customers

**URL:** `/customers`. **Spec:** §1, §5.

A list of every customer plus a search box (name / phone / email).

- **+ Add new customer** opens a small form. Phone OR email is required; both are best.
- The system soft-dedupes: if the phone or email matches an existing customer, you're attached to them instead of creating a duplicate.

(You can also add new customers from inside the Sell flow.)

---

## 10. Notifications

**URL:** `/notifications`.

An in-app feed. Types of notifications:

| Type | When |
|---|---|
| `NEW_ORDER` | Someone creates an order. (Admins.) |
| `LOW_STOCK` | A sale leaves a variant's stock at or below its reorder point at a location. Debounced per SKU/location for 10 min so it doesn't spam. (Admins.) |
| `KACCA_MISMATCH` | A handover count doesn't match, or a shift closes with a cash discrepancy. (Admins.) |
| `INVITE` | (Future — when invite emails are enabled.) |

Unread notifications have a coloured border and increment the badge on the **Notifs** link in the header. Tap **Mark all read** to clear.

---

## 11. The receipt

**URL:** `/sale/[id]/receipt`. **Spec:** §5(c).

After every sale you land on the receipt. It includes:

- Brand header (Karni Jewellery).
- Sale number, date/time.
- Sold by (your name).
- **Location name and address.**
- Customer (if any), payment method.
- One row per line item with name, variant info, SKU, quantity, line total.
- Grand total in AMD.

Buttons at the bottom:
- **Print** — opens your device's native print dialog. The receipt is print-styled (CSS `@media print`) so headers/buttons are hidden. Works on a phone (print to PDF or AirDrop the PDF to the customer).
- **New sale** — go back to start another sale.
- **Home**.

---

## 12. Admin → Users (admin only)

**URL:** `/admin/users`. **Spec:** §1.

Inviting and managing staff.

### Invite a new user

1. Fill in **Full name**, **Email**, choose **Role** (Sales or Admin).
2. Tap **Send invite**.
3. The user appears below with an **Invite URL** of the form `/invite/<token>`. **Copy that URL** and send it to them (WhatsApp / email / etc.). When they open it, they set a password and become active.

(Email send isn't wired — see README's _Limitations_. Until SMTP is configured, manual copy is how invites flow.)

### Manage existing users

- **Deactivate** — disables sign-in. Their history is preserved.
- **Reactivate** — re-enables.
- The role chip (`SALES` / `ADMIN`) is shown next to each name.

---

## 13. Admin → Products (admin only)

**URL:** `/admin/products`. **Spec:** §10.

Browse the 474 variants. Search bar searches SKU / name / color. Tap any card to edit.

### Editing a variant

**URL:** `/admin/products/[id]`.

Top form:

- **Image URL** — paste a URL to a hosted image. A preview renders below. (Direct upload is a TODO.)
- **Price (AMD)** — editing this automatically recomputes USD / EUR / RUB using the FX rates.
- **Cost (AMD)** — optional.
- **Reorder point** — when stock at any location drops to or below this, admins get a low-stock notification. Default 2.
- **Status** — `ACTIVE`, `OUT_OF_STOCK`, `COMING_SOON`, `ARCHIVED`. Archived variants are hidden from search but kept for sales history.
- **Channel flags** — Website, Etsy, Instagram, Consignment.

Tap **Save**.

Below the form: **Stock by selling point**. For each location, set the absolute quantity and tap **Set**. The system writes an `ADJUSTMENT` movement (with the signed delta) to the audit log so the change is attributable to you.

> ⚠ The system does **not** hard-delete variants. Use `ARCHIVED` instead — this preserves all historical sales.

---

## 14. Admin → Inventory (admin only)

**URL:** `/admin/inventory`. **Spec:** §10.

Two sections:

1. **Low / out of stock** — every `(variant, selling point)` row at or below its reorder point. Click through to the product page to restock or adjust.
2. **Recent movements (audit log)** — the last 20 stock changes: type, variant, location, who, when, signed quantity. This is your full inventory paper trail — every sale, check-in, adjustment, transfer, gift, damage.

---

## 15. Admin → Reports (admin only)

**URL:** `/admin/reports`. **Spec:** §10.

A light dashboard:

- **Today** and **Last 7 days** — total sales count and revenue.
- **Revenue by selling point (7d)** — which channels are paying for themselves.
- **Revenue by salesperson (7d)** — accountability across the part-time team.
- **Top-selling SKUs (7d)** — what to reorder.
- **Cash sessions** — last 20 sessions across all selling points, with discrepancies and ⚠ on handover mismatches.

---

## 16. Two roles, what they see

| Capability | Sales | Admin |
|---|---|---|
| Search products, see photos / price / stock | ✅ | ✅ |
| Sell a product | ✅ | ✅ |
| Pick selling point / channel | ✅ | ✅ |
| Find existing customer | ✅ | ✅ |
| Add new customer | ✅ | ✅ |
| Check in new stock | ✅ | ✅ |
| Kacca check-in / check-out | ✅ | ✅ |
| Create an order | ✅ | ✅ |
| Invite / add new sales users | ❌ | ✅ |
| Add / remove other admins | ❌ | ✅ |
| Create / edit / archive products | ❌ | ✅ |
| Edit prices, cost, photos, reorder points | ❌ | ✅ |
| Reports / analytics | partial (own shifts/sales via Kacca + Orders) | ✅ (everything) |

Permissions are enforced **both** in the UI (we hide controls) and in the API / server actions (we refuse the request). Don't try to URL-hack — you'll just get redirected.

---

## 17. Tips, troubleshooting, FAQ

**The search returns nothing for a SKU I'm certain exists.**
Check that the catalog import has been run (`npm run import:catalog`) and that the trigram index exists (`variant_search_trgm`). Spelling matters less than completeness — the trigram fuzzy match will tolerate typos, but if the variant isn't in the DB it can't return.

**"Only N left at [location]" — but I just received more?**
Refresh the page (it picks up the latest cached stock from the API). If wrong, check the audit log on the admin Inventory page — every change is timestamped and attributed.

**Two people opened a shift at the same selling point.**
Not possible — the system refuses to open a second one. If the first person never closed their shift, ask an admin to use the Kacca admin view to close it on their behalf (or contact them).

**The handover count differs.**
That's fine. **Both numbers are saved** and admin is notified. Don't try to "make them match" — the truth of who counted what is more important than a tidy ledger.

**Receipt looks wrong on print.**
The print stylesheet hides the bottom nav and header. If you see them, the browser may be ignoring print CSS — try a different browser or use **Print → Save as PDF**.

**Where do photos come from?**
Admin → Products → edit a variant → paste an Image URL. (Direct upload to an object store is a planned feature.)

**A customer says they're already in the system.**
Type their phone or email in **Customers** — soft-dedupe should match them. If two records exist by mistake, contact the developer; safe merging is a planned admin action.

**How are prices in other currencies computed?**
From a `FxRate` table seeded with 1 AMD = 0.0026 USD / 0.0024 EUR / 0.205 RUB. Edit those rates in the database; the next admin **Save** on a variant recomputes its USD / EUR / RUB columns. (A dedicated FX admin screen is on the roadmap.)

**Can I delete a variant?**
No — set its **Status** to `ARCHIVED`. This hides it from search but keeps it visible in past sales / movements. Hard deletion would corrupt history.

**I want to do a return.**
The schema has `RETURN` stock movements. The UI for it is on the roadmap — for now, ask an admin to use the Inventory adjustment to bump the count back up, with a note explaining why.
