// Shared PayFast helpers. Pure functions only (no Firebase), so they are easy to test.
import crypto from "node:crypto";
import { CURRENCIES, SHIPPING } from "../../src/lib/catalog.js";
import { DEFAULT_PRODUCTS } from "../../src/lib/products.js";

export const isSandbox = () => String(process.env.PAYFAST_SANDBOX || "").toLowerCase() === "true";
const host = () => (isSandbox() ? "sandbox.payfast.co.za" : "www.payfast.co.za");
export const processUrl = () => `https://${host()}/eng/process`;
export const validateUrl = () => `https://${host()}/eng/query/validate`;

/** Same output as PHP's urlencode(), which is what PayFast signs with. */
export function pfEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export const md5 = (text) => crypto.createHash("md5").update(text).digest("hex");

/**
 * Signature over [name, value] pairs, in the order given.
 * Payment requests skip blank values and trim; ITN checks keep every field as received.
 */
export function signature(entries, passphrase, { forRequest }) {
  const parts = [];
  for (const [key, raw] of entries) {
    const value = forRequest ? String(raw ?? "").trim() : String(raw ?? "");
    if (forRequest && value === "") continue;
    parts.push(`${key}=${pfEncode(value)}`);
  }
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase)}`);
  return md5(parts.join("&"));
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Catalog prices are stored in USD; PayFast charges rand, using the same rate the shop displays. */
export const zarAmount = (totalUsd) => (totalUsd * CURRENCIES.ZAR.rate).toFixed(2);

export function siteUrl(req) {
  const fixed = process.env.PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const hostName = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(hostName)) throw new Error("Could not work out the site address. Set PUBLIC_SITE_URL.");
  return `${proto === "http" ? "http" : "https"}://${hostName}`;
}

/* ---------- order checks (the order is written by the browser, so never trust it) ---------- */

async function livePrices(ids, fetchImpl) {
  // Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel (same values as the VITE_ ones; products are readable by everyone).
  const rawBase = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!rawBase || !key) return null;
  const base = rawBase.replace(/\/+$/, "");
  try {
    const res = await fetchImpl(`${base}/rest/v1/products?select=id,price&id=in.(${ids.join(",")})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? new Map(rows.map((r) => [Number(r.id), Number(r.price)])) : null;
  } catch {
    return null;
  }
}

/**
 * Recomputes what the order should cost from real catalog prices.
 * Returns { ok: true, total } (USD) or { ok: false, error }.
 */
export async function verifyOrderTotal(order, fetchImpl = fetch) {
  const items = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
  if (!items.length || items.length > 100) return { ok: false, error: "This order has no items." };

  const ids = [...new Set(items.map((i) => Number(i.productId)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return { ok: false, error: "This order has an invalid item." };

  const live = await livePrices(ids, fetchImpl);
  const fallback = new Map(DEFAULT_PRODUCTS.map((p) => [p.id, p.price]));
  let subtotal = 0;
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { ok: false, error: "This order has an invalid quantity." };
    const id = Number(item.productId);
    const price = live?.get(id) ?? fallback.get(id);
    if (price === undefined) return { ok: false, error: "An item in this order is no longer sold." };
    if (Math.abs(Number(item.price) - price) > 0.005) return { ok: false, error: "Prices have changed since this order was placed. Please place the order again." };
    subtotal += price * quantity;
  }

  const discount = Number(order.discount || 0);
  // The only coupon is SAVE10 (10% off items), so a discount can never exceed that.
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal * 0.1 + 0.01) return { ok: false, error: "This order has an invalid discount." };
  if (Math.abs(Number(order.shipping) - SHIPPING) > 0.005) return { ok: false, error: "This order has an invalid shipping amount." };

  const total = subtotal + SHIPPING - discount;
  if (Math.abs(Number(order.total) - total) > 0.01) return { ok: false, error: "This order's total does not add up." };
  return { ok: true, total };
}
