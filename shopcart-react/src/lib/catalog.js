export const AIRPODS_COLORS = [
  { name: "Red", hex: "#d8443a", image: "images/airpods-max.jpg" },
  { name: "Silver", hex: "#c9c9cf", image: "images/airpods-max.jpg" },
  { name: "Black", hex: "#2b2b30", image: "images/airpods-max.jpg" },
  { name: "Blue", hex: "#3b6a8f", image: "images/airpods-max.jpg" },
  { name: "Green", hex: "#5c8a63", image: "images/airpods-max.jpg" },
];

/* Photo to use for each item, whatever catalog the data comes from */
const PRODUCT_PHOTOS = {
  "images/earbuds-black.svg": "images/wireless-earbuds.jpg",
  "images/airpods-red.svg": "images/airpods-max.jpg",
  "images/airpods-silver.svg": "images/airpods-max.jpg",
  "images/airpods-black.svg": "images/airpods-max.jpg",
  "images/airpods-blue.svg": "images/airpods-max.jpg",
  "images/airpods-green.svg": "images/airpods-max.jpg",
  "images/headphone-black.svg": "images/foldable-headphones.jpg",
  "images/earbuds-rgb.svg": "images/open-ear-earbuds.jpg",
  "images/openear.svg": "images/monster-headphones.jpg",
  "images/headphone-blue.svg": "images/mpow-ch6-kids.jpg",
  "images/headphone-red.svg": "images/vivefox-headphones.jpg",
  "images/jbl-tune-600btnc.jpg": "images/jbl-tune-600btnc.jpg",
  "images/vivefox-headphones.jpg": "images/vivefox-headphones.jpg",
  "images/laptop-bag-1.jpg": "images/laptop bags/laptop-bag-1.jpg",
  "images/laptop-bag-2.jpg": "images/laptop bags/laptop-bag-2.jpg",
  "images/laptop-bag-3.jpg": "images/laptop bags/laptop-bag-3.jpg",
  "images/laptop-bag-4.jpg": "images/laptop bags/laptop-bag-4.jpg",
  "images/laptop-bag-5.jpg": "images/laptop bags/laptop-bag-5.jpg",
  "images/laptop-bag-6.jpg": "images/laptop bags/laptop-bag-6.jpg",
  "images/laptop-bag-7.jpg": "images/laptop bags/laptop-bag-7.jpg",
  "images/laptop-bag-8.jpg": "images/laptop bags/laptop-bag-8.jpg",
};

export function withProductPhotos(products) {
  return products.map((p) => ({ ...p, image: PRODUCT_PHOTOS[p.image] || p.image }));
}

/* Local images live in /public/images. Remote (Supabase) URLs are left untouched. */
export function imgSrc(path) {
  if (!path) return "/images/logo.svg";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return encodeURI(path.startsWith("/") ? path : `/${path}`);
}

export const CURRENCIES = {
  ZAR: { symbol: "R", rate: 18.45, locale: "en-ZA", label: "Rand (R)" },
  USD: { symbol: "$", rate: 1, locale: "en-US", label: "US Dollar ($)" },
  EUR: { symbol: "€", rate: 0.92, locale: "de-DE", label: "Euro (€)" },
  GBP: { symbol: "£", rate: 0.79, locale: "en-GB", label: "Pound (£)" },
};

export const SHIPPING = 8;

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
  },
};
