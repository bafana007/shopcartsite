import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { readUserData, trackUserInput, writeUserData, writeUserText } from "../lib/firebase.js";
import { readProducts } from "../lib/supabase.js";
import { DEFAULT_PRODUCTS } from "../lib/products.js";
import { CURRENCIES, store, withProductPhotos } from "../lib/catalog.js";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;

  /* ---------- products ---------- */
  const [products, setProducts] = useState(() => DEFAULT_PRODUCTS.map((p) => ({ ...p })));
  useEffect(() => {
    let cancelled = false;
    readProducts()
      .then((rows) => {
        if (cancelled || !rows.length) return;
        setProducts(withProductPhotos([...rows].sort((a, b) => a.id - b.id)));
      })
      .catch((e) => console.warn("Using the built-in catalog because Supabase products are unavailable:", e));
    return () => { cancelled = true; };
  }, []);

  /* ---------- currency ---------- */
  const [currency, setCurrencyState] = useState(() => {
    const saved = store.get("shopcart:currency", "ZAR");
    return CURRENCIES[saved] ? saved : "ZAR";
  });
  const setCurrency = useCallback((code) => {
    const next = CURRENCIES[code] ? code : "ZAR";
    setCurrencyState(next);
    store.set("shopcart:currency", next);
  }, []);
  const formatMoney = useCallback((n) => {
    const c = CURRENCIES[currency];
    const [int, dec] = (Number(n || 0) * c.rate).toFixed(2).split(".");
    return { symbol: c.symbol, int: Number(int).toLocaleString(c.locale), dec };
  }, [currency]);
  const money = useCallback((n) => {
    const f = formatMoney(n);
    return `${f.symbol}${f.int}.${f.dec}`;
  }, [formatMoney]);

  /* ---------- toast ---------- */
  const [toastState, setToastState] = useState({ msg: "", show: false });
  const toastTimer = useRef();
  const toast = useCallback((msg, opts = {}) => {
    clearTimeout(toastTimer.current);
    setToastState({ msg, show: true });
    toastTimer.current = setTimeout(() => setToastState((t) => ({ ...t, show: false })), opts.duration ?? 2000);
  }, []);
  const hideToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToastState((t) => ({ ...t, show: false }));
  }, []);

  /* ---------- cart + wishlist ---------- */
  const cartKey = uid ? `shopcart:user:${uid}:cart` : "shopcart:cart";
  const wishKey = uid ? `shopcart:user:${uid}:wishlist` : "shopcart:wishlist";
  const [cart, setCartState] = useState(() => store.get("shopcart:cart", []));
  const [wishlist, setWishlistState] = useState(() => store.get("shopcart:wishlist", []));
  const cartRef = useRef(cart);
  const wishRef = useRef(wishlist);
  const profileRef = useRef(profile);
  const userRef = useRef(user);
  profileRef.current = profile;
  userRef.current = user;

  const setCart = useCallback((next) => { cartRef.current = next; setCartState(next); }, []);
  const setWishlist = useCallback((next) => { wishRef.current = next; setWishlistState(next); }, []);

  // Load the right cart/wishlist whenever the signed-in user changes
  useEffect(() => {
    let cancelled = false;
    const guestCart = store.get("shopcart:cart", []);
    const guestWish = store.get("shopcart:wishlist", []);
    if (!uid) {
      setCart(guestCart);
      setWishlist(guestWish);
      return undefined;
    }
    setCart(store.get(`shopcart:user:${uid}:cart`, []));
    setWishlist(store.get(`shopcart:user:${uid}:wishlist`, []));
    readUserData(uid)
      .then((remote) => {
        if (cancelled) return;
        const nextCart = remote ? (Array.isArray(remote.cart) ? remote.cart : []) : guestCart;
        const nextWish = remote ? (Array.isArray(remote.wishlist) ? remote.wishlist : []) : guestWish;
        setCart(nextCart);
        setWishlist(nextWish);
        store.set(`shopcart:user:${uid}:cart`, nextCart);
        store.set(`shopcart:user:${uid}:wishlist`, nextWish);
        if (!remote) syncCloud(uid, nextCart, nextWish);
      })
      .catch((e) => console.error("Could not load account data:", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  function syncCloud(forUid, nextCart, nextWish, profileOverride) {
    const u = userRef.current;
    const p = { ...(profileRef.current || {}), ...(profileOverride || {}) };
    const profileData = {
      name: u?.name || "",
      email: u?.email || "",
      address: p.address || "",
    };
    return Promise.all([
      writeUserData(forUid, { profile: profileData, cart: nextCart, wishlist: nextWish }),
      writeUserText(forUid, profileData),
    ]).then(() => true).catch((e) => {
      console.error("Could not sync account data:", e);
      return false;
    });
  }

  const commitCart = useCallback(async (next, profileOverride) => {
    setCart(next);
    store.set(cartKey, next);
    if (!uid) return false;
    return syncCloud(uid, next, wishRef.current, profileOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, uid, setCart]);

  const addToCart = useCallback(async (id, qty = 1, color = null) => {
    const next = cartRef.current.map((l) => ({ ...l }));
    const found = next.find((l) => l.id === id && l.color === color);
    if (found) found.qty += qty; else next.push({ id, qty, color });
    const saved = await commitCart(next);
    const product = products.find((p) => p.id === id);
    if (product && uid) {
      trackUserInput(uid, "add_to_cart", {
        productId: id, productName: product.name, quantity: qty, color, price: product.price,
      }).catch((e) => console.warn("Could not record add-to-cart activity:", e));
    }
    return { databaseSaved: Boolean(uid && saved) };
  }, [commitCart, products, uid]);

  const removeCartLine = useCallback((index) => {
    const next = cartRef.current.slice();
    next.splice(index, 1);
    return commitCart(next);
  }, [commitCart]);

  const clearCart = useCallback((profileOverride) => commitCart([], profileOverride), [commitCart]);

  const toggleWish = useCallback((id) => {
    const list = wishRef.current;
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    setWishlist(next);
    store.set(wishKey, next);
    if (uid) syncCloud(uid, cartRef.current, next);
    return next.includes(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishKey, uid, setWishlist]);

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  const value = useMemo(() => ({
    products, currency, setCurrency, formatMoney, money,
    toast, hideToast, toastState,
    cart, cartCount, addToCart, removeCartLine, clearCart, commitCart,
    wishlist, toggleWish,
  }), [products, currency, setCurrency, formatMoney, money, toast, hideToast, toastState,
    cart, cartCount, addToCart, removeCartLine, clearCart, commitCart, wishlist, toggleWish]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}
