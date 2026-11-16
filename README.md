# Shopcart (React)

The Shopcart storefront (look, layout, copy, images and shopping logic of `shopcart-vanilla`) as a React + Vite app, running on the real backend: Firebase (accounts, carts, orders, activity), Supabase (products and image uploads), PayFast and PayPal. Signed-in shoppers can upload products and sell them.

## Set up (in this order)

1. **Supabase SQL** (Supabase > SQL Editor). Fresh project: run `supabase/schema.sql`, then `supabase/seed.sql`. Existing project that already ran the old SQL: run `supabase/update.sql` once (safe to run twice). Seller listings: run `supabase/sellers.sql` to add the seller columns, approval status, and approved-only public read policy. `schema.sql` also creates the public `product-images` storage bucket.
2. **Firebase rules**: publish `database.rules.json` (Realtime Database > Rules). This version adds the extra profile fields, unique usernames, the newsletter list, product-view activity, order phone number, per-recipient chat delivery/read receipts, and the unread message badge. Compare with your live rules before replacing them.
3. **Environment**: copy `.env.example` to `.env` and fill it in. The `VITE_FIREBASE_*` values are required (the app shows a setup message without them); `VITE_SUPABASE_*` give you the live catalog, selling and profile pictures; the rest enable PayPal, PayFast and seller uploads on the server. Password reset is handled by Supabase Auth (see below).
4. **Google sign-in**: in Firebase Authentication > Sign-in method, enable **Google** and add your authorized domains (`localhost` for local work). The login and create-account forms both offer a Google button; new Google accounts get a profile with their name and email (usernames are only chosen during email sign-up).
5. `npm install`, then `npm run dev` (http://localhost:5173) or `npm run build`.

Add `localhost` and your production domain to Firebase Authentication's authorized domains. On Netlify/Vercel set the same variables in the dashboard; `public/_redirects` makes deep links such as `/product/3` work.

`npm run dev` also serves the functions in `api/` (seller uploads, PayFast), so selling works locally once `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_DATABASE_URL` are in `.env`. PayFast cannot call back to `localhost`, so a payment finished locally stays Pending.

## Selling

Any signed-in shopper (not admins, who use the dashboard) can open **Sell** in the top bar:

1. **+ List a product**: name, price in US dollars, category, colour, material, description and a photo (JPG/PNG/WebP, up to 5 MB).
2. The photo goes straight to Supabase Storage through a one-time upload link the server hands out for that seller's own folder; the listing is saved by `api/seller-products.js`, which checks the Firebase login first.
3. The product stays pending until an admin approves it in the admin dashboard. Approved listings appear in the shop as "Sold by <username>" and can be bought through the normal checkout. Sellers can edit or remove their listings (max 50 each); edits need approval again.

The server ignores any rating, review count or sale flag a seller sends, only accepts the 7 categories, and only accepts images from the seller's own folder. Money is collected by the store's PayFast/PayPal account; there is no seller payout or seller order view yet, so orders are fulfilled from the admin dashboard.

## Profile pictures

On **My account**, upload a JPG, PNG or WebP (up to 5 MB). `api/seller-products.js` hands the browser a one-time Supabase Storage upload slot under `product-images/avatars/<uid>/...`; the public URL is saved as `profile.photoURL`. The picture appears in the account header and the admin header; accounts without one keep the initials avatar.

## Routes

| Page | Route |
|---|---|
| Home | `/` |
| Shop | `/shop` (`?type=Bags`, `?q=bag`, `#deals`) |
| Product | `/product/3` |
| Checkout and order tracking | `/checkout` (`#ot`) |
| Sign in / create account | `/login` (`?mode=signup`, `?mode=admin`, `?next=/checkout`) |
| Forgot password | `/forgot-password` |
| Reset password (from the email link) | `/reset-password` |
| My account | `/account` (the old `/profile` redirects here) |
| Sell | `/sell` |
| Messages | `/messages` |
| Admin | `/admin` |

## Structure

```
src/
  lib/        firebase.js, supabase.js, sellerApi.js, avatarApi.js, config.js, products.js (29 products), catalog.js (categories, currencies)
  context/    AuthContext (user, profile, admin flag, sessions), ShopContext (products, cart, wishlist, currency, toast)
  components/ Layout (storefront), AdminLayout, ProductCard, Carousel, Stars, Price, Toast, RequireAuth, ...
  pages/      Home, Shop, Product, Checkout, Login, ForgotPassword, ResetPassword, Account, Sell, Messages, Admin
  api/          save-profile.js, seller-products.js, admin-products.js, payfast-sign.js, payfast-itn.js
supabase/     schema.sql, seed.sql, update.sql, sellers.sql (already included in schema.sql)
```

## Notes on the merge

- **Categories** are now Electronics, Fashion, Home, Food, Bags, Sports and Health & Beauty everywhere (shop, sell form, admin form, API). The old headphone categories were folded into Electronics by `update.sql`.
- **Sign in is by email.** The username chosen at sign-up is unique and shown on the account page, but it cannot be used to log in (that would need a public username-to-email lookup).
- **Messages** is now a Firebase Realtime Database direct-message inbox. Conversations are keyed by the two participant UIDs and are readable only by those participants; admins can open **User support** from the admin sidebar to start a private conversation with any user. Support conversations also appear in that user's Messages inbox.
- **Newsletter** sign-ups are stored at `newsletter/` in Realtime Database (only admins can read them).
- Filters and sort order are remembered between visits; the category and search text come from the address bar so links and the Back button work.
- Large vanilla photos were resized for the web (about 21 MB down to under 3 MB); file names are unchanged.
- Several catalog items (shirts, jackets, home and food items) use the vanilla project's stand-in photos (laptop bags, landing images); replace them in `src/lib/products.js` and `supabase/seed.sql`, or edit them in the admin dashboard.

## PayFast (South African rand payments)

Checkout has a "PayFast (card or instant EFT)" option. The browser never sees PayFast's secret keys: two small server functions in `api/` do the sensitive work.

| File | What it does |
|---|---|
| `api/payfast-sign.js` | Checks the signed-in user owns the order, re-checks prices against the real catalog, then returns the signed form the browser posts to PayFast. |
| `api/payfast-itn.js` | PayFast's server calls this when a payment completes. It verifies the signature, merchant, amount and PayFast's own confirmation, then marks the order `confirmed`. |

The browser's return page (`/checkout?payfast=success`) proves nothing; only the server notification confirms an order.

### Set up

1. Add these in Vercel > Settings > Environment Variables (never in the repo, never with a `VITE_` prefix):
   `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX` (`true` while testing),
   `FIREBASE_SERVICE_ACCOUNT` (the whole service-account JSON) and `FIREBASE_DATABASE_URL`.
2. Run `npm install` once (adds `firebase-admin` and refreshes `package-lock.json`), then redeploy.
3. Publish the updated `database.rules.json` (Firebase console > Realtime Database > Rules). It allows the extra order fields the server writes, the session fields, and the pay-on-delivery status rule. Compare it with your live rules first.
4. Locally, `npm run dev` now serves `/api/*` too (see above).

### Test with the sandbox

PayFast's servers must be able to reach `/api/payfast-itn`, so test on a public URL. Vercel preview URLs are often behind Vercel's login, which blocks PayFast; the simplest route is to deploy to Production with the **sandbox** keys and `PAYFAST_SANDBOX=true`, test, then swap in the live keys and set `PAYFAST_SANDBOX=false`.

1. Add something to the cart, choose PayFast, press "Pay with PayFast".
2. On the sandbox page pay with the test buyer account shown in your sandbox dashboard.
3. Back on `/checkout`, the order moves from Pending to Confirmed within a few seconds.
4. Also try cancelling: the order stays Pending and shows a "Pay now with PayFast" button.

Prices are stored in USD and charged in rand at the rate in `src/lib/catalog.js` (the same rate the shop displays).

## Sessions

Every sign-in creates a session record in Realtime Database (`userSessions/{uid}/{sessionId}`: device, started, last active). A visible tab refreshes it every 2 minutes, and closing the tab or signing out ends it.

- A session ends after 60 minutes without activity (`SESSION_IDLE_MS` in `src/lib/config.js`), including when someone returns to a browser that still remembered the login.
- My account > Active sessions lists where the account is signed in and can end other sessions. "Sign out everywhere" on the login page does the same and signs out this tab too. Ended tabs notice within seconds and sign themselves out.
- Admin > Users shows each user's active sessions and can end them.
- Ending a session from another device is cooperative: that browser signs itself out as soon as it is online. To invalidate a stolen login completely, revoke the user's refresh tokens in the Firebase console.

## Password reset

Sign in > **Forgot password?** asks for an email address and calls `supabase.auth.resetPasswordForEmail`, which sends Supabase's own recovery email. The link returns to `/reset-password` in this app, where `supabase.auth.updateUser({ password })` saves the new password.

In the Supabase dashboard, under **Authentication > URL Configuration**, set **Site URL** to this site's address and add `<site>/reset-password` to **Redirect URLs**. The email template and SMTP settings live under **Authentication > Emails**. No server function or third-party email provider is used.

## Pay on delivery

Pay-on-delivery orders always start Pending and unpaid. Only an admin can move them on (Admin > Orders > View > Update Status); marking one Delivered also marks it paid. `database.rules.json` enforces this: shoppers can create orders with status Pending only (PayPal orders are the one exception, as before).

## Styled dialogs

`src/lib/dialogs.js` replaces `alert`, `confirm` and `prompt`: `await dialog.alert(msg)`, `await dialog.confirm(msg)`, `await dialog.prompt(msg)`. `<DialogHost />` in `main.jsx` renders them.

## Still true (demo-level)

- Registering `admin@gmail.com` through `/login?mode=signup&adminRequest=true` grants admin. Remove that flow and the matching rule in `database.rules.json` before going public.
- PayPal totals are computed in the browser. Verify amounts server-side before taking real payments (PayFast already does).
- The SAVE10 coupon is checked in the browser only; the server just caps any discount at 10% of items.
- The credit/debit card option is a demo and charges nothing.

## Live Demo : https://cart-with-paypal-3.vercel.app/
