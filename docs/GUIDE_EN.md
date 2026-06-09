# Karni Sales — Staff Guide (English)

A short, practical guide to everything you can do in the Karni Sales app.
The app is built for your **phone** — keep it open at the counter.

There are two roles:
- **Sales** — sell, receive stock, run the cash drawer, take orders.
- **Admin** — everything Sales can do, **plus** managing staff, products, photos, prices and reports.

> 👉 Sales staff: read **Part A**. Admins: read **Part A and Part B**.

---

## Getting started (everyone)

### Sign in
1. Open the app link on your phone.
2. The first time, the admin sends you an **invite link** (looks like `…/invite/xxxx`). Open it, set a password (at least 8 characters), and you're in.
3. After that, go to the app, enter your **email** and **password**, tap **Sign in**.
4. To sign out, tap **Logout** at the top-right.

### Change the language 🇦🇲 🇬🇧 🇷🇺
At the top-right of every screen there is a small language switch: **EN · ՀՅ · РУ**.
Tap **ՀՅ** for Armenian, **EN** for English, **РУ** for Russian. The whole app changes instantly and remembers your choice.

### Change your own password
Go to **Account → Password** (`/account/password`). Enter your current password, then your new one twice, and tap **Update password**.

### Finding your way around
- **Top bar:** back arrow · "Karni Sales" · language switch · 🔔 notifications (with an unread count) · Logout.
- **Bottom bar (5 tabs):** **Sell · Catalog · Receive · Kacca · Orders**. These are always one tap away.
- **Home screen** shows: your name, your shift status, **Sales today** and **Revenue today**, and big buttons for the common jobs.

---

# Part A — For Sales Staff

Your day usually goes: **open the cash drawer (Kacca) → sell → (receive stock if a delivery comes) → close the cash drawer**.

## 1. Start your shift (Kacca = cash drawer)

Before selling, open your shift so the cash is tracked.

1. Tap **Kacca** in the bottom bar.
2. Choose your **selling point** (e.g. Megamall).
3. **Count the money in the drawer** and type the total as the **Opening count**.
4. Tap **Start shift**.

Notes:
- If someone else's shift is still open at that point, the app won't let you start — it tells you whose shift it is. They must close it first (or an admin closes it).
- Your opening count is compared with the **last person's closing count**. If they differ, both numbers are saved, a **handover mismatch** is flagged, and admins are notified — but your shift still starts. Don't try to force the numbers to match; the truth of who counted what matters more.

## 2. Make a sale

Tap **Sell** in the bottom bar. You can sell **several items in one go**.

**a) Find the product**
- Type in the search box: **SKU**, **design name** (English or Armenian), **color**, the **Armenian subcollection letter** (e.g. `Ա`), or scan a **barcode**.
- Search is typo-tolerant and updates as you type.
- Use the filter chips to narrow by **selling point, category, color, size, in-stock only**.
- Each card shows the photo, name, **price in AMD**, and a stock badge: 🟢 in stock · 🟡 low · 🔴 out of stock.

**b) Build the cart**
- **Tap a card** to add it. Tap again to add one more of the same item.
- In the cart, use **−/+** to change quantity, **Remove** to drop a line, **Clear** to empty the cart.
- Tap **+ Add another item** to search for more.

**c) Confirm the details**
- **Selling point** — defaults to your open shift's location.
- **Payment method** — Cash / Card / Transfer / Other. ⚠ Only **Cash** sales count toward your cash-drawer total at the end of the shift.
- **Customer** — type a name/phone/email to find an existing customer, or tap **+ Add new customer**, or just skip it (walk-in).

**d) Finish**
- Tap **Confirm & Sell**.
- If any item doesn't have enough stock, the whole sale is rejected with a clear message (e.g. *"Only 2 left at Megamall"*) and your cart is kept so you can fix it.
- On success you get a **receipt** with every item, the total, location, and your name.

## 3. The receipt
After a sale you land on the receipt. Tap **Print** to open your phone's print/share dialog (you can save it as a PDF and send it to the customer). Tap **New sale** to start again, or **Home**.

## 4. Catalog / Browse — look things up
Tap **Catalog** (bottom bar). Two ways to look:
- **Browse:** pick a **Collection → Category → product**, organised with photos and grouped by size. Great for showing a customer.
- **Search & filter:** the same search as the Sell screen, but view-only. Use it to check stock or show a price/photo. Nothing is sold from here.

## 5. Receive new stock
When a delivery arrives, record it so it becomes sellable.
1. Tap **Receive**.
2. Choose the **selling point** (defaults to your shift's location).
3. Tap **+ Add variant**, search and tap the item. Repeat for each item in the delivery.
4. For each line set the **quantity** and an optional **note** (e.g. "atelier batch #5").
5. Tap **Check in N items**.

A **Recent check-ins** list at the bottom confirms what landed (you can sort newest/oldest).

## 6. Orders
For things that aren't an immediate counter sale (a custom request, an online DM order, a reserved piece).
1. Tap **Orders → + New order**.
2. Fill in **customer name, address, note, deadline, channel** (Online or Sales point), and selling point.
3. Optionally **+ Add item** from the catalog and set quantities (custom items can include metal/filling/plating/labor costs).
4. Tap **Create order** — it gets a number like `ORD-2026-00001` and all admins are notified.

The **Orders** list shows your orders with their status: NEW → IN_PROGRESS → READY → FULFILLED.

## 7. Customers
Tap **Customers** to see and search everyone (by name/phone/email). **+ Add new customer** needs a phone OR an email. If the phone/email already exists, the app links to that person instead of making a duplicate. (You can also add a customer during a sale.)

## 8. Notifications
The 🔔 at the top shows alerts. Tap **Mark all read** to clear the badge. You'll mostly see new-order, low-stock, and cash-drawer-mismatch alerts.

## 9. End your shift (Kacca)
1. Tap **Kacca** — your open shift shows in green.
2. **Count the drawer** again.
3. Enter the **Closing count** and tap **End shift**.

The app works out the **expected** amount (opening + cash sales during your shift) and the **discrepancy**. If they don't match, the shift is flagged and admins are notified. That's fine — just count honestly.

---

# Part B — For Admins

Admins do everything above **and** get an **Admin** section on the Home screen with: Users, Products, Inventory, Analytics, Sales Analytics, Collection photos, Category photos, Reports. The Home admin card also shows a **low / out-of-stock counter**.

## 1. Users — invite and manage staff
**Admin → Users** (`/admin/users`).
- **Invite:** enter **Full name**, **Email**, choose **Role** (Sales or Admin), tap **Send invite**. The new user appears with an **Invite URL** — copy it and send it to them (WhatsApp/email). They open it, set a password, and become active.
- **Deactivate / Reactivate:** disables or re-enables sign-in. History is always kept.
- To reset someone's password, re-send the invite — their old password is wiped and they set a new one.

## 2. Products — edit prices, photos, stock
**Admin → Products** (`/admin/products`). Search by SKU / name / color, tap a card to edit. Use **+ New** to create a product.

On the edit screen:
- **Photo:** upload a file directly from your device (JPEG/PNG/WebP/GIF, up to 5 MB — stored in cloud storage), **or** paste an image URL. A preview shows below.
- **Price (AMD):** editing this auto-recalculates USD / EUR / RUB from the FX rates.
- **Cost (AMD):** optional, used for margin reports.
- **Reorder point:** when stock at any location drops to this or below, admins get a **low-stock** alert (default 2).
- **Status:** ACTIVE / OUT_OF_STOCK / COMING_SOON / ARCHIVED. ⚠ Never hard-delete — set **ARCHIVED** to hide a product while keeping its sales history.
- **Channel flags:** Website / Etsy / Instagram / Consignment.
- Tap **Save**.

**Stock by selling point** (below the form): set the exact quantity per location and tap **Set**. This writes an **ADJUSTMENT** to the audit log, attributed to you.

## 3. Inventory
**Admin → Inventory** (`/admin/inventory`). Two parts:
- **Low / out of stock** — every (product, location) at or below its reorder point. Click through to restock.
- **Recent movements (audit log)** — the last stock changes with type, item, location, who, when, and signed quantity. Your full paper trail (sales, check-ins, adjustments, etc.).

## 4. Collection & Category photos
These photos are what staff see on the **Browse** screen.
- **Admin → Collection photos** (`/admin/collections`): for each collection, upload/paste a photo and tap **Save photo**.
- **Admin → Category photos** (`/admin/categories`): same, per category.

## 5. Analytics (inventory)
**Admin → Analytics** (`/admin/analytics`). Filter by category, collection, subcollection, size, color and selling point. Shows:
- **Units in stock, Total value, Variants in stock, Low stock** at the top.
- **Average price** and **estimated margin** (if cost is set).
- Charts: units by category / selling point / size / color / subcollection, value by collection, and **top products by value**.

## 6. Sales Analytics
**Admin → Sales Analytics** (`/admin/sales-analytics`). Filter by **date range** (today / 7d / 30d / 90d / all), selling point, salesperson, payment method. Shows:
- **Sales count, Revenue, Average sale, Unique customers** at the top, plus **units sold** and the dominant payment method / location.
- Charts: revenue over time, revenue by selling point, by salesperson, payment-method split, units by category, revenue by collection.
- **Top customers** and **top SKUs** by revenue.

## 7. Reports
**Admin → Reports** (`/admin/reports`). A quick dashboard: **Today** and **Last 7 days** sales & revenue, revenue by selling point, revenue by salesperson, top-selling SKUs, and the last cash sessions with any discrepancies or handover mismatches flagged.

---

## Roles at a glance

| Task | Sales | Admin |
|---|---|---|
| Search / browse products, see price & stock | ✅ | ✅ |
| Sell, choose payment & selling point | ✅ | ✅ |
| Add / find customers | ✅ | ✅ |
| Receive stock | ✅ | ✅ |
| Open / close Kacca | ✅ | ✅ |
| Create orders | ✅ | ✅ |
| Change own password / language | ✅ | ✅ |
| Invite / deactivate users | ❌ | ✅ |
| Edit products, prices, photos, reorder points | ❌ | ✅ |
| Adjust stock / view audit log | ❌ | ✅ |
| Collection & category photos | ❌ | ✅ |
| Analytics, Sales Analytics, Reports | ❌ | ✅ |

Permissions are enforced everywhere — there's no point trying to reach an admin page by URL; you'll just be redirected.

---

## Quick troubleshooting

- **"Only N left at [location]"** — there isn't enough stock. Refresh; if a delivery was just received, check it was checked in at the right selling point.
- **Search finds nothing for a SKU you know exists** — it may be **ARCHIVED**, or at a different selling point. Check the filters.
- **Two people at one selling point** — not allowed. The previous shift must be closed first; an admin can close it if the person isn't around.
- **Handover / closing count doesn't match** — that's OK. Both numbers are saved and admins are notified. Count honestly; don't force a match.
- **Receipt shows the menus when printing** — use **Print → Save as PDF**, or try another browser.
- **I need to do a return** — there's no return screen yet; ask an admin to adjust the stock back up with a note explaining why.
