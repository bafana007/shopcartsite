# Shopcart (React)

React + Vite version of the Shopcart storefront. Same backends as the original: Firebase (auth, carts, orders, activity), Supabase (products + image uploads) and PayPal checkout. The original `css/style.css` is reused unchanged, so the look is the same.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Add `localhost` to Firebase Authentication's authorized domains if it isn't there already.

Firebase, Supabase and PayPal values are public client config. Set the required `VITE_*` variables in a local `.env` file or in your hosting provider's environment settings. Without Supabase configuration, the storefront starts with its built-in product catalog; Supabase-backed catalog and admin actions require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Routes

| Old page | Route |
|---|---|
| `index.html` | `/` |
| `shop.html` | `/shop` (filters: `?type=Bags&q=bag`) |
| `product.html?id=3` | `/product/3` |
| `checkout.html` | `/checkout` |
| `login.html` | `/login` (`?mode=signup`, `?mode=admin`, `?next=/checkout`) |
| `profile.html` | `/profile` |
| `admin.html` | `/admin` |

## Structure

```
src/
  lib/        firebase.js, supabase.js, config.js, products.js, catalog.js
  context/    AuthContext (user, admin flag, sessions) and ShopContext (products, cart, wishlist, currency, toast)
  components/ Layout (header/footer/admin layout), ProductCard, Stars, Price, Toast
  pages/      Home, Shop, Product, Checkout, Login, Profile, Admin
```

Firebase rules (`database.rules.json`, `firestore.rules`) and the Supabase SQL (`supabase/`) are unchanged.

## Behaviour changes from the original

- Checkout's "Delivery Information" was hard-coded text; it now shows the signed-in user's name, email and saved address.
- Order dates now display (the old code looked for a Firestore timestamp, but orders use a Realtime Database number).
- The admin dashboard now converts money with the selected currency (it used to print the USD amount with an "R").
- Category menu and header search now work from any page by routing to `/shop`.
- `?next=` redirects only accept in-app paths.

## PayFast (South African rand payments)

Checkout has a "PayFast (card or instant EFT)" option. The browser never sees PayFast's secret keys: two small server functions in `api/` do the sensitive work.

| File | What it does |
|---|---|
| `api/payfast-sign.js` | Checks the signed-in user owns the order, re-checks prices against the real catalog, then returns the signed form the browser posts to PayFast. |
| `api/payfast-itn.js` | PayFast's server calls this when a payment completes. It verifies the signature, merchant, amount and PayFast's own confirmation, then marks the order `confirmed`. |

The browser's return page (`/checkout?payfast=success`) proves nothing; only the server notification confirms an order.

### Set up

1. Add every variable listed in `.env.example` in Vercel > Settings > Environment Variables. The `VITE_` ones are the browser config (Firebase, Supabase, PayPal client ID); the rest below are server-only (never in the repo, never with a `VITE_` prefix):
   `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX` (`true` while testing),
   `FIREBASE_SERVICE_ACCOUNT` (the whole service-account JSON) and `FIREBASE_DATABASE_URL`.
2. Run `npm install` once (adds `firebase-admin` and refreshes `package-lock.json`), then redeploy.
3. Publish the updated `database.rules.json` (Firebase console > Realtime Database > Rules). It allows the extra order fields the server writes. Compare it with your live rules first.
4. Locally, use `vercel dev` instead of `npm run dev`, otherwise `/api/*` does not exist.

### Test with the sandbox

PayFast's servers must be able to reach `/api/payfast-itn`, so test on a public URL. Vercel preview URLs are often behind Vercel's login, which blocks PayFast; the simplest route is to deploy to Production with the **sandbox** keys and `PAYFAST_SANDBOX=true`, test, then swap in the live keys and set `PAYFAST_SANDBOX=false`.

1. Add something to the cart, choose PayFast, press "Pay with PayFast".
2. On the sandbox page pay with the test buyer account shown in your sandbox dashboard.
3. Back on `/checkout`, the order moves from Pending to Confirmed within a few seconds.
4. Also try cancelling: the order stays Pending and shows a "Pay now with PayFast" button.

Prices are stored in USD and charged in rand at the rate in `src/lib/catalog.js` (the same rate the shop displays).

## Still true from the original (demo-level)

- Registering `admin@gmail.com` through `/login?mode=signup&adminRequest=true` grants admin. Remove that flow and the matching rule in `database.rules.json` before going public.
- PayPal totals are computed in the browser. Verify amounts server-side before taking real payments (PayFast already does).
- The SAVE10 coupon is checked in the browser only; the server just caps any discount at 10% of items.
