# Soul — Café Menu & Ordering

Customer-facing menu and ordering site for **Soul — Speciality Coffees & Fusion Bakehouse**
(Azad Nagar, Andheri West, Mumbai).

Built from `soul_frontend_design_spec.md`. Deployed on Vercel.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000

```bash
npm run build    # production build
npm run start    # serve the production build
npm run sync-media   # pull item photos from /media into /public/menu
```

---

## Tech

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | JavaScript (JSX) |
| Styling | One plain CSS file — `src/app/globals.css` |
| State | React Context (`CartContext`) |
| Fonts | Inter (body) + Playfair Display (headings) |
| Icons | Emoji |
| Hosting | Vercel |

No Tailwind, no CSS modules, no icon library, no UI kit — same as the spec.

---

## Pages

```
/                 Menu — hero, sticky category rail, search, cards, cart FAB
/checkout         Cart, order type, payment method, customer details
/confirmation     Order number, receipt, WhatsApp confirmation
```

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/menu` | Full menu JSON (available items only) |
| `POST` | `/api/orders/place` | Validates, re-prices and records an order |
| `GET` | `/api/orders/verify/[orderNumber]` | Look up a placed order |

**Prices are never trusted from the browser.** `/api/orders/place` re-prices every
line against `src/data/menu.json` before totalling, so a tampered cart cannot
change what an order costs.

---

## The menu data

`src/data/menu.json` was generated from the café's own PetPooja export
(`items_388482_*.csv` + `Category_Report.csv`), so names, descriptions, prices,
categories and category order all match the POS.

- **203 items across 28 categories.**
- Categories with no *Online Display Name* in PetPooja (`Add-Ons`, `Monsoon Menu`,
  `The Joy Pizzateria`) are treated as POS-only and left off the website.
- 68 items carry variations (Regular/Large, Jain/Regular, combo drink choice).
  Their card shows `from ₹X` and tapping **Add** opens a picker.
- `posShortCode` is kept on every item so PetPooja can match the line back to its
  own item when the POS integration goes live.

Category names keep the café's own spelling from the POS (e.g. "Hot Bevarages").
Fix them in PetPooja and regenerate, or edit `menu.json` directly.

### Updating the menu

Edit `src/data/menu.json` — it is the single source of truth for the site.
Item shape:

```json
{
  "id": "uuid",
  "slug": "iced-latte",
  "name": "Iced Latte",
  "description": "…",
  "price": 245,
  "veg": true,
  "available": true,
  "posShortCode": "57",
  "variationGroup": "Size",
  "variations": [{ "name": "Regular", "price": 245 }, { "name": "Large", "price": 295 }]
}
```

Set `"available": false` to grey an item out and block it at checkout.

---

## Item photos

1. Drop photos into **`/media`**, named after the menu item.
   Case, spaces and punctuation don't matter — `Iced Latte.jpg`,
   `iced-latte.png` and `ICED_LATTE.webp` all match the same item.
   `media/README.md` has the full checklist of item names.
2. Run:

   ```bash
   npm run sync-media
   ```

3. Commit and push. Vercel redeploys.

The script copies matched files into `public/menu/`, writes
`src/data/media-manifest.json`, and prints any filename it could not match.
Items without a photo render text-only, so partial coverage is fine.

**Logo:** `public/soul-logo.svg` is a placeholder. Drop the real
`soul-logo.png` into `public/` and the hero picks it up automatically.

---

## Ordering flow

The customer enters four things, all captured today:

1. **Name**
2. **Phone number**
3. **Payment method** — UPI, Cash or Card
4. **Address** (delivery only; hidden for pickup)

Delivery adds ₹30; pickup is free. On submit the order is validated and priced
server-side, given an order number (`SOUL-XXXXXX`), and the confirmation page
offers a pre-filled WhatsApp message to the café.

### PetPooja — not connected yet

`src/lib/petpooja.js` builds the order in PetPooja's `save_order` shape and POSTs
it **only when credentials are present** in the environment. Without them it
returns `{ status: 'skipped' }` and ordering still works end to end.

To switch it on, set `PETPOOJA_APP_KEY`, `PETPOOJA_APP_SECRET`,
`PETPOOJA_ACCESS_TOKEN`, `PETPOOJA_RESTAURANT_ID` and `PETPOOJA_ORDER_API_URL`.
Check the field names against the café's current PetPooja API docs first — the
payload in that file follows their published `save_order` schema but has not been
tested against a live account, and `payment_type` codes in particular need
confirming.

`src/lib/store.js` keeps placed orders **in memory**. That is enough for the
confirmation page in a single server process, but on Vercel each instance has its
own memory and orders vanish on redeploy. Replace it with a database (or let
PetPooja be the record) before taking real orders.

---

## Environment variables

Copy `.env.example` to `.env.local` for local work; set the same keys in Vercel →
Project → Settings → Environment Variables.

| Variable | Value | Required |
|---|---|---|
| `NEXT_PUBLIC_WA_NUMBER` | `917032257595` | Yes |
| `NEXT_PUBLIC_STORE_NAME` | `Soul` | Optional |
| `NEXT_PUBLIC_API_URL` | *(blank)* | No — relative routes |
| `PETPOOJA_*` | see `.env.example` | Only when the POS is wired up |

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. Vercel → **Add New… → Project** → import the repo.
3. Framework preset: **Next.js**. No build settings to change.
4. Add the environment variables above.
5. Deploy. Every push to `main` redeploys.

---

## Project layout

```
src/
├── app/
│   ├── globals.css              # every style in the app
│   ├── layout.js                # root layout + CartProvider + metadata
│   ├── page.js                  # menu page
│   ├── checkout/page.js
│   ├── confirmation/page.js
│   └── api/
│       ├── menu/route.js
│       └── orders/
│           ├── place/route.js
│           └── verify/[orderNumber]/route.js
├── context/CartContext.js       # cart state, sessionStorage-backed
├── data/
│   ├── menu.json                # menu source of truth
│   └── media-manifest.json      # generated by sync-media
└── lib/
    ├── api.js                   # client fetch helpers + ₹ formatting
    ├── store.js                 # temporary in-memory order store
    └── petpooja.js              # POS payload builder (inactive)

media/                           # drop item photos here
public/menu/                     # generated — served photos
scripts/sync-media.mjs
```
