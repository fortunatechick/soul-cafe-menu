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
npm run sync-media   # match, resize and publish item photos
```

---

## Tech

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | JavaScript (JSX) |
| Styling | One plain CSS file — `src/app/globals.css` |
| State | React Context (`CartContext`) |
| Fonts | Inter (body) + Prata (display headings) |
| Icons | Emoji |
| Hosting | Vercel |

No Tailwind, no CSS modules, no icon library, no UI kit — same as the spec.

**Responsive:** the stylesheet is mobile-first and the phone layout is the base —
every wider-screen rule lives in `min-width` media queries at the end of
`globals.css`, so a phone never evaluates one of them and the mobile design is
untouched by anything done for desktop. Breakpoints:

| Width | Container | Menu cards | Checkout |
|---|---|---|---|
| < 768px | 480px | one column | one column |
| >= 768px | 720px | two columns | one column |
| >= 1024px | 960px | two columns | two columns |
| >= 1280px | 1120px | three columns | two columns |

On desktop the checkout puts the basket on the left and the fields on the right,
so the form is reachable without scrolling past the order. Pointer devices also
get visible scrollbars on the category and featured rails, which a mouse cannot
flick.

**Typography note:** the spec called for Playfair Display, but the display face is
now **Prata** — the closest free match to the logo wordmark's high-contrast serif.
Prata ships in 400 only, so every display heading is pinned to `font-weight: 400`;
requesting 600 would give a synthesised bold, which smears a face with hairlines
this fine. Display serif is used for the hero title, section titles, the checkout
top bar, the options sheet and the confirmation title. Everything else — item
names, descriptions, prices, chips, labels, buttons — is Inter.

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

`src/data/menu.json` is generated from the café's own PetPooja area-wise price
export (`Item_AreawisePrice_388482.xlsx`, plus `Category_Report.csv` for category
order), so names, descriptions, prices, categories and ordering all match the POS.

- **211 items across 29 categories.**
- Only rows PetPooja marks `ExposeToOnline = Yes` are published. The `Add-Ons` and
  `The Joy Pizzateria` categories are POS/other-outlet only and are skipped
  wholesale.
- 69 items carry variations (Regular/Large, Jain/Regular, combo drink choice),
  which arrive as separate `Name (Variation)` rows in the export and are folded
  back into one item. Their card shows `from ₹X` and tapping **Add** opens a picker.
- 4 items are unavailable for home delivery in the POS. They carry
  `"deliveryAvailable": false`, show a **Pickup only** badge, and are rejected by
  `/api/orders/place` if the order type is delivery.
- Item ids **are** the PetPooja `ItemID`s (see below), and `posShortCode` is kept
  alongside, so PetPooja can match a line back to its own record when the POS
  integration goes live.

Regenerating: the export is read straight from the spreadsheet, so re-running the
generator after a fresh PetPooja export is the intended way to update the menu.

Category names keep the café's own spelling from the POS (e.g. "Hot Bevarages").
Fix them in PetPooja and regenerate, or edit `menu.json` directly.

### Updating the menu

Edit `src/data/menu.json` — it is the single source of truth for the site.
Item shape:

```json
{
  "id": "159721795",
  "slug": "americano",
  "name": "Americano",
  "description": "Espresso eased with hot water …",
  "price": 185,
  "veg": true,
  "available": true,
  "posShortCode": "41",
  "variations": [
    { "id": "159721795", "name": "Regular", "price": 185 },
    { "id": "159721796", "name": "Large", "price": 235 }
  ]
}
```

**`id` is the PetPooja `ItemID`, copied verbatim from the export** — not a
generated key. PetPooja treats every size as its own item with its own ItemID, so
each variation carries the id the POS will actually be asked for; an item with
sizes takes its base row's id. When an order is placed, the line records
`posItemId` for the *chosen* variation (Americano Large → `159721796`), and that
is the id sent to `save_order`.

Set `"available": false` to grey an item out and block it at checkout.

---

## Item photos

Photos live in **`/menu_images`** (or `/media` — both are scanned), named after
the menu item. Run:

```bash
npm run sync-media
```

That matches each file to a menu item, downscales it and writes it to
`public/menu/`, then regenerates `src/data/media-manifest.json`, which the menu
page reads. Items without a photo render text-only, so partial coverage is fine.

**29 photos are wired up, covering 30 of 211 items** (Creamed Bee appears on the
menu twice and shares one photo).

Matching ignores case, spacing and punctuation, and strips export suffixes like
`_linkedin_post_1200x627`. Where a photo's name genuinely differs from the POS
name — `cheesy loaded fries` vs the menu's `Loaded Fries` — add an entry to
`ALIASES` in `scripts/sync-media.py` rather than renaming the file, so
re-exporting the photos does not break the mapping.

The script prints any file it could not match, so a typo fails loudly instead of
silently dropping a photo.

**Sizing:** the source photos are square (the `1200x627` in their filenames is a
naming template, not their real size — they are 2767px to 4000px square) and
average 700 KB. `sync-media` resizes each to 600px and re-encodes it, which took
the current set from 19.5 MB to 1.2 MB. Serving the originals would have made the
menu page a ~20 MB download. This step needs Pillow (`pip install pillow`);
without it the script still runs but copies at full size and warns.

The originals in `menu_images/` are committed so the set can be re-synced at a
different size later. If the photo library grows much beyond this, consider
keeping originals out of git and syncing them from Drive instead.

**Logo:** `public/soul-logo-bgreemoved-upscaled.png` — the brand lockup supplied
with its background already removed, so its transparency sits on whatever the
page background is. 1326x752, shown at 300px wide in the hero, and reused as the
favicon and touch icon.

Because the lockup already carries the name and the tagline, the hero's `<h1>`
and tagline are `.sr-only` — present for search engines and screen readers, not
drawn twice. `public/soul-logo.svg` remains only as the fallback if the PNG ever
fails to load.

To swap the logo, drop a new file into `public/` and update the two references
(`src/app/page.js` for the hero, `src/app/layout.js` for the icons).

**Link previews:** sharing the URL on WhatsApp, iMessage or Slack shows
`src/app/opengraph-image.jpg` — the dedicated card supplied as
`soul_whatsapp_logo.jpg` in the project root, copied in byte for byte. Next
serves it as `og:image` by file convention, filling in the URL, dimensions and
mime type.

It is 1200x630 (the OpenGraph standard, and the aspect scrapers crop least) and
45 KB, well under the ~300 KB above which WhatsApp skips the preview entirely.
To replace it, overwrite `src/app/opengraph-image.jpg` with another 1200x630
JPEG.

`og:image` must be absolute, so the origin has to be known at build time — and
it has to be the *stable* origin. `VERCEL_URL` is deliberately not used: it is
the per-deployment hostname (`soul-cafe-menu-45qzk....vercel.app`), which changes
on every push, and previews are cached per URL. The origin resolves as
`NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → the production
`.vercel.app` domain. Set `NEXT_PUBLIC_SITE_URL` in Vercel once a custom domain
is attached.

WhatsApp caches previews for a long time, so a link shared before the site was
deployed may keep showing the old (empty) preview. Adding `?v=2` to the URL
forces a fresh scrape.

---

## Ordering flow

The customer enters four things, all captured today:

1. **Name**
2. **Phone number**
3. **Payment method** — UPI, Cash or Card
4. **Address** (delivery only; hidden for pickup)

Delivery and pickup are both free. On submit the order is validated and priced
server-side, given an order number (`SOUL-XXXXXX`), and the confirmation page
offers a pre-filled WhatsApp message to the café.

### Recommendations ("Help me choose")

A button under the search opens four questions — mood, hot/cold, flavours,
budget — and scores the menu against the answers, showing up to six picks with
an **Add** button (or a size picker for items with variations). It runs entirely
in the browser: the menu is already loaded, so there is no request and no wait.

**The POS export has no tags** — an item is a name, a description, a price and a
category — so `src/lib/recommend.js` derives traits from the category plus
keyword patterns over the name and description. That keeps `menu.json` the
single source of truth: new items are tagged on the next export with no parallel
list to maintain. The cost is that a badly-worded item gets badly tagged, which
is why each pick shows *why* it was chosen rather than a score.

Mood and hot/cold are hard filters (a hot drink is a wrong answer to "cold",
however well it scores); flavour and budget are scored, then relaxed in stages
if nothing matches, with the relaxation named in the results. Budget is two
options — under ₹350, which covers 187 of 211 items, or no limit. Results are capped
at two per category so the list does not come back as six cold brews.

Keyword tagging needs care, and the tests caught real mistakes: `cheese` matched
inside *cheesecake*, `masala` made chai savoury, `toast` matched "**Toasted**
croissant", and `nut` matched *coconut* and *nutmeg*. The patterns use
lookarounds for these. When adding menu items with unusual names, check the
traits look sane.

### Motion

Two touches only, and **no dependencies**. Framer Motion (~35 KB gzipped) and
Lenis were considered and declined: a menu loading on mobile data should not
carry an animation runtime, and smooth-scroll libraries hijack the momentum
scrolling phones already do better.

- **Menu → checkout** — the cart bar presses in, the menu fades back, then the
  route changes after 200ms and the checkout rises in. All pages share
  `page-enter`, so navigation reads as one surface.
- **Scroll** — category rows settle in as they come into view.

Both are skipped under `prefers-reduced-motion`.

**The page animations move opacity only, never transform.** A transform on
`.page` — including the `translateY(0)` it settles on — makes that element the
containing block for every `position: fixed` descendant. That pins the cart bar
and both bottom sheets to the bottom of the whole document rather than the
viewport: the bar stops floating and a sheet opens thousands of pixels off
screen, leaving only its blurred backdrop over an apparently dead page. Nothing
that wraps fixed children may carry a transform, a filter, or `will-change` on
those properties.

**The reveal state lives in React, not in a class poked onto the DOM.** `.cat`
has a React-managed `className`, so an imperative `classList.add` is wiped by
the next render — opening a section or typing in search rewrites that attribute
and the row would vanish. Rows already on screen are marked revealed before
first paint, and a 4-second failsafe covers the case where
IntersectionObserver never fires: its callbacks ride the frame lifecycle, so a
tab that is not rendering never receives them.

### The loading screen

`BrewLoader` in `src/app/page.js` is a CSS-only coffee pour — stream, filling
cup, steam — on a 1.8s loop, in place of the old spinner. The menu is a static
JSON route that normally answers in a fraction of that, so the splash is held
for `SPLASH_MIN_MS` (1800ms, one full pour) before the menu renders. Anyone with
`prefers-reduced-motion` skips the wait, since the animation is stilled for them
and the hold would just be a frozen screen.

Raise or drop `SPLASH_MIN_MS` to taste; set it to 0 to show the menu the moment
it arrives.

### Coupons

Codes live in `src/data/coupons.json` (percent or flat, minimum subtotal, cap,
expiry, and which order types they apply to). `POST /api/coupons/validate` backs
the live feedback in the cart, and `/api/orders/place` **re-evaluates the same
coupon against its own subtotal** before charging — the browser sends only a
code, never an amount, so a forged discount is impossible by construction. The
resolved amount is passed to PetPooja as `discount_total` plus a Discount entry
so the POS total reconciles.

PetPooja owns discounts in its own system but exposes them through the POS API
rather than a public offers endpoint, so this file is the source of truth until
credentials exist.

### Location autofill

The address field has a **Use my location** button: the browser supplies
coordinates, `/api/geocode` turns them into an address. PetPooja has no
geocoder — it stores whatever address string it is given — so this uses a
mapping provider. With `GOOGLE_MAPS_API_KEY` set it uses Google (better Indian
street-level data); without it, OpenStreetMap Nominatim, which needs no key but
rate-limits to roughly one request per second. The call is proxied server-side
so a key never reaches the browser. Permission denial and lookup failure both
fall back to typing, with a message rather than a dead button.

### Returning customers

On a repeat visit the checkout pre-fills name, phone and address, shows a
"Welcome back" line, and offers **Not you?** to clear it. Sources, best first:

1. **PetPooja** — `fetchCustomer()` in `src/lib/petpooja.js`, the only source
   that also knows about orders placed in-store or over the phone. Inactive
   until `PETPOOJA_CUSTOMER_API_URL` and the credentials are set; the endpoint
   and payload differ between PetPooja's POS and Ordering API tiers, so confirm
   against the café's own account before enabling.
2. **A recent order** for that phone number, via the in-memory store — which
   works within a server instance but not across redeploys.
3. **The browser's own memory** (`localStorage`), which is what makes the
   feature work today with no backend. Stored on the customer's device and
   cleared by them.

### Pinning a location on a map

Next to **Use my location** is **Pin on map**, for when GPS is off or lands on
the wrong side of the building. It is a small slippy map written by hand
(`src/components/MapPicker.js`) rather than Leaflet or the Google Maps SDK — the
project ships no UI dependencies, and all this needs is a pannable tile grid
with a fixed centre crosshair, so the pinned point is simply the map's centre.

Tiles come from OpenStreetMap, which asks for attribution (shown on the map) and
light traffic; a busy store should move to a keyed provider. The chosen point is
reverse-geocoded into the address field, sent with the order as
`customerLocation`, passed to PetPooja as customer latitude/longitude, and added
to the WhatsApp message as a Google Maps link the rider can tap. If geocoding
fails the pin is still kept — the map link is useful on its own.

### The cart is checked against the live menu

The cart lives in `sessionStorage` and can be hours old, while `menu.json` is
regenerated from the POS. On arriving at checkout the cart is reconciled once
against `/api/menu`: an item that has left the menu is removed, and a price that
has moved is corrected, both reported in a notice above the order.

Without this the customer sees a total the server will not honour — the order
API re-prices from its own copy, so a stale cart quietly charges a different
amount — and a withdrawn item is only rejected at submit.

### Touch targets

Interactive controls are at least 40px on their short edge. Apple asks for 44
and Google for 48dp; 44px category chips make the sticky rail tall enough to eat
the top of the menu on a small phone, so 40 is the deliberate compromise and the
rail scrolls. The menu page has no control under 40px; it previously had 241,
with quantity steppers at 28px.

### Order limits

`src/lib/limits.js` holds the caps, imported by both the cart and the order API
so the two cannot disagree — the cart used to let a customer build a quantity
the server then refused, which ended in a dead-end error at checkout.

| Limit | Value |
|---|---|
| Per line | 50 |
| Distinct lines | 40 |
| Total units | 200 |
| Order total | ₹25,000 |
| Name / address / notes | 80 / 300 / 500 chars |

Free-text fields are stripped of control characters and angle brackets. React
escapes them on our own pages, but this text is also handed to PetPooja and
pasted into a WhatsApp message, and neither needs `<script>` in a customer name.

Quantity stepping goes through `stepQuantity(key, delta)` rather than passing a
computed `quantity + 1`: the latter reads a value captured at render, so several
quick taps all resolved to the same number and only one landed.

### Keeping bots out

Order placement is gated twice, in `/api/orders/place`:

1. **Rate limits** (`src/lib/ratelimit.js`), checked before any parsing — 40
   orders per 10 minutes per IP, and 4 per phone number. One IP is not one
   customer: everyone on the café's own wifi shares a public address, as does
   most of an Indian mobile network behind carrier-grade NAT, so a tight per-IP
   cap locks out real people during a rush. The IP limit blunts a flood; the
   phone limit is the one that approximates a person. In-memory, so it counts
   per serverless instance; a shared store is the upgrade at real traffic.
2. **A human check** (`src/lib/botcheck.js`). With `TURNSTILE_SECRET_KEY` and
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set this is **Cloudflare Turnstile**, whose
   token is verified server-side — free keys, a few minutes to set up, and the
   only one of the two that is real protection.

Without Turnstile keys the form falls back to a tick-box backed by an
HMAC-signed, 15-minute token plus a minimum fill time. **Be clear-eyed about
this**: it stops blind POSTing and replay, but a script that fetches a token
before each order will pass it. It exists so the form is not wide open before
the keys are added — it is not a substitute for them.

The token is only ever a claim; it is verified server-side before an order
exists. Verified by posting directly at the API: no token, an invented token and
a forged signature are all rejected, and a genuine token used faster than a human
could type is rejected too.

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

menu_images/                     # source item photos
media/                           # alternate photo source
public/menu/                     # generated — served photos
scripts/generate-menu.py         # rebuilds menu.json from the PetPooja xlsx
scripts/sync-media.py            # matches, resizes and publishes item photos
```
