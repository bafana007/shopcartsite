import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { getOrderProgress, trackFormSubmission, watchUserOrders, writeOrder } from "../lib/firebase.js";
import { AIRPODS_COLORS, CURRENCIES, SHIPPING, imgSrc } from "../lib/catalog.js";
import { startPayfastPayment } from "../lib/payfast.js";
import { PAYPAL_CLIENT_ID, PAYPAL_CURRENCY } from "../lib/config.js";

const LOGIN_NEXT = "/login?next=" + encodeURIComponent("/checkout");

let paypalPromise = null;
function loadPayPalSdk() {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (!paypalPromise) {
    paypalPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=${PAYPAL_CURRENCY}&intent=capture`;
      script.onload = () => resolve(window.paypal);
      script.onerror = () => { paypalPromise = null; reject(new Error("Could not load the PayPal script.")); };
      document.head.append(script);
    });
  }
  return paypalPromise;
}

function formatOrderDate(ts) {
  if (!ts) return null;
  const d = typeof ts === "number" ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Checkout() {
  const { user, profile, setProfile } = useAuth();
  const { products, cart, removeCartLine, clearCart, money, toast } = useShop();
  const navigate = useNavigate();
  const location = useLocation();

  const [coupon, setCoupon] = useState("");
  const [discountRate, setDiscountRate] = useState(0);
  const [couponNote, setCouponNote] = useState("Try SAVE10 for 10% off.");
  const [addr, setAddr] = useState("");
  const [pay, setPay] = useState("card");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [orders, setOrders] = useState(null); // null = not loaded
  const [ordersNote, setOrdersNote] = useState("Sign in to view your orders.");

  // prefill the address field from the saved profile
  useEffect(() => { setAddr((current) => current || profile.address || ""); }, [profile.address]);

  const lines = useMemo(
    () => cart.map((l, cartIndex) => ({ ...l, cartIndex, p: products.find((p) => p.id === l.id) })).filter((l) => l.p),
    [cart, products],
  );
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const shipping = lines.length ? SHIPPING : 0;
  const discountAmount = Math.min(discountRate * subtotal, subtotal);
  const total = subtotal + shipping - discountAmount;
  const zarTotal = (total * CURRENCIES.ZAR.rate).toFixed(2); // PayFast charges rand

  function applyCoupon() {
    const code = coupon.trim().toUpperCase();
    if (code === "SAVE10") { setDiscountRate(0.1); setCouponNote("SAVE10 applied: 10% off your items."); }
    else { setDiscountRate(0); setCouponNote(code ? "That code isn't valid. Check it and try again." : "Enter a coupon code first."); }
  }

  // Back from PayFast: the page only tells the customer what happened.
  // The order itself is confirmed by PayFast's server notification, and the tracker below updates live.
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("payfast");
    if (result === "success") setNote("Thank you! PayFast is confirming your payment. Your order status below updates automatically.");
    else if (result === "cancelled") setNote("PayFast payment cancelled. You have not been charged. You can pay for the order from Track Your Order when you are ready.");
  }, [location.search]);

  /* Saves the order. Used by "Place Order", PayFast, and, after a captured payment, by PayPal.
     Resolves with the new order id (or false) so PayFast can pay for exactly that order. */
  async function saveOrder(method, extra = {}) {
    if (!user) { navigate(LOGIN_NEXT); return false; }
    if (!lines.length) return false;
    const address = addr.trim() || profile.address || "";
    setBusy(true);
    setNote("Saving your order...");
    try {
      const orderId = await writeOrder({
        userId: user.uid,
        customerName: user.name,
        customerEmail: user.email || "",
        deliveryAddress: address,
        items: lines.map((l) => ({
          productId: l.id, name: l.p.name, price: l.p.price, quantity: l.qty, color: l.color || null,
        })),
        subtotal, shipping, discount: discountAmount, total,
        paymentMethod: method,
        ...extra,
      });
      trackFormSubmission(user.uid, "checkout", {
        items: lines.map((l) => ({ id: l.id, name: l.p.name, qty: l.qty, price: l.p.price })),
        subtotal, shipping, discount: discountAmount, total, paymentMethod: method,
      }).catch(() => {});
      setProfile({ name: user.name, email: user.email, address });
      await clearCart({ name: user.name, email: user.email || "", address });
      setNote(method === "paypal"
        ? "Payment received and order saved. Thank you!"
        : method === "payfast"
          ? "Order saved. Taking you to PayFast..."
          : "Order saved. This demo does not process payments.");
      toast("Order saved");
      return orderId || true;
    } catch (error) {
      console.error("Could not save order:", error);
      setNote(extra.paypalOrderId
        ? `Your PayPal payment went through (reference ${extra.paypalOrderId}) but we could not save the order. Please contact us with this reference.`
        : "Could not save your order. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ---------- PayFast ---------- */
  async function continuePayfast(orderId) {
    if (!user) { navigate(LOGIN_NEXT); return; }
    setBusy(true);
    setNote("Taking you to PayFast...");
    try {
      await startPayfastPayment(orderId); // leaves this page on success
    } catch (error) {
      console.error("PayFast could not start:", error);
      setNote(`${error.message} Your order is saved. You can pay for it from Track Your Order.`);
      setBusy(false);
    }
  }

  async function payWithPayfast() {
    const orderId = await saveOrder("payfast");
    if (typeof orderId === "string") await continuePayfast(orderId);
  }

  /* ---------- PayPal ---------- */
  // PayPal calls these handlers long after the render that created them,
  // so they read the latest values through a ref instead of a stale closure.
  const latest = useRef({});
  latest.current = { user, lines, total, saveOrder, navigate };
  const paypalBox = useRef(null);

  useEffect(() => {
    if (pay !== "paypal") return undefined;
    let cancelled = false;
    let buttons = null;
    loadPayPalSdk()
      .then((paypal) => {
        if (cancelled || !paypalBox.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", label: "paypal" },
          onClick: (data, actions) => {
            const { user: u, lines: l, navigate: nav } = latest.current;
            if (!u) { nav(LOGIN_NEXT); return actions.reject(); }
            if (!l.length) { setNote("Your cart is empty."); return actions.reject(); }
            setNote("");
            return actions.resolve();
          },
          createOrder: (data, actions) => actions.order.create({
            purchase_units: [{
              description: "Shopcart order",
              amount: { currency_code: PAYPAL_CURRENCY, value: latest.current.total.toFixed(2) },
            }],
          }),
          onApprove: async (data, actions) => {
            setNote("Confirming your PayPal payment...");
            const details = await actions.order.capture();
            const capture = details.purchase_units?.[0]?.payments?.captures?.[0];
            if (details.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
              setNote("PayPal did not complete this payment, so your order was not placed. Please try again.");
              return;
            }
            await latest.current.saveOrder("paypal", { paypalOrderId: details.id, status: "confirmed" });
          },
          onCancel: () => setNote("PayPal payment cancelled. You have not been charged."),
          onError: (error) => {
            console.error("PayPal error:", error);
            setNote("PayPal could not process the payment. Please try again.");
          },
        });
        buttons.render(paypalBox.current);
      })
      .catch((error) => {
        console.error("Could not load PayPal:", error);
        if (!cancelled) setNote("Could not load PayPal. Check your connection and try again.");
      });
    return () => { cancelled = true; try { buttons?.close?.(); } catch { /* already closed */ } };
  }, [pay]);

  /* ---------- order history ---------- */
  useEffect(() => {
    if (!user) {
      setOrders(null);
      setOrdersNote("Sign in to view orders placed from your account.");
      return undefined;
    }
    setOrders(null);
    setOrdersNote("Loading your orders...");
    return watchUserOrders(user.uid, (list) => {
      setOrders(list);
      setOrdersNote(list.length ? `${list.length} order${list.length === 1 ? "" : "s"}` : "No orders on this account yet.");
    }, (error) => {
      console.error("Could not load order history:", error);
      setOrdersNote("Could not load your orders. Check your connection and try again.");
    });
  }, [user?.uid]);

  function handleClear() {
    if (!user) { navigate(LOGIN_NEXT); return; }
    clearCart();
    toast("Cart cleared");
  }

  return (
    <main className="container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Checkout</span></nav>
      <div className="checkout">
        <div>
          <section className="panel" aria-labelledby="rv">
            <div className="panel-head"><h2 id="rv">Review Item And Shipping</h2><button className="btn" type="button" onClick={handleClear}>Clear Cart</button></div>
            <div>
              {lines.length === 0 ? (
                <div className="empty-cart"><p>Your cart is empty. Add a pair of headphones to get started.</p><Link className="btn primary" to="/shop">Browse headphones</Link></div>
              ) : lines.map((l) => {
                const img = l.id === 2 ? (AIRPODS_COLORS.find((c) => c.name === l.color) || AIRPODS_COLORS[0]).image : l.p.image;
                return (
                  <div className="line-item" key={`${l.id}-${l.color}-${l.cartIndex}`}>
                    <div className="thumb"><img src={imgSrc(img)} alt="" /></div>
                    <div className="info"><strong>{l.p.name}</strong><small>{l.color || ""}</small></div>
                    <div className="amount">{money(l.p.price * l.qty)}<small>Quantity: {l.qty}</small>
                      <button className="remove" type="button" onClick={() => removeCartLine(l.cartIndex)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel" aria-labelledby="dl">
            <div className="panel-head"><h2 id="dl">Delivery Information</h2><button className="btn" type="button" onClick={() => document.getElementById("addr")?.focus()}>Edit Address</button></div>
            {user ? (
              <dl className="dl">
                <dt>Name</dt><dd>{user.name}</dd>
                <dt>Email</dt><dd>{user.email}</dd>
                <dt>Address</dt><dd>{profile.address || "Not set yet"}</dd>
              </dl>
            ) : (
              <p className="notice">Sign in to use your saved delivery details. <Link to={LOGIN_NEXT}>Sign in</Link></p>
            )}
            <label className="field" style={{ marginTop: 16 }}>
              <span>Update delivery address</span>
              <input id="addr" type="text" placeholder="Street, city, zip code" value={addr} onChange={(e) => setAddr(e.target.value)} />
            </label>
          </section>

          <section className="panel" aria-labelledby="ot">
            <h2 id="ot">Track Your Order</h2>
            <p className="notice" role="status">{ordersNote}</p>
            {user && <p className="order-live-note">Order progress updates automatically.</p>}
            <div className="order-history-list" aria-live="polite">
              {!user && <Link className="btn primary" to={LOGIN_NEXT}>Sign in</Link>}
              {orders?.map((order) => {
                const date = formatOrderDate(order.createdAt);
                const names = (Array.isArray(order.items) ? order.items : []).map((i) => `${i.name || "Item"} x ${i.quantity || 1}`).join(", ");
                const rawStatus = (order.status || "pending").toLowerCase();
                const status = rawStatus.replace(/^./, (c) => c.toUpperCase());
                const progress = Number.isFinite(order.progress)
                  ? Math.max(0, Math.min(100, order.progress))
                  : getOrderProgress(rawStatus);
                return (
                  <article className="track-order" key={order.id}>
                    <div className="track-order-head">
                      <strong>Order {order.id}</strong>
                      {date ? <time dateTime={date.toISOString()}>{date.toLocaleDateString()}</time> : <time>Date unavailable</time>}
                    </div>
                    <p className="track-order-status">Status: {status}</p>
                    <div className="order-progress" role="progressbar" aria-label={`Order ${order.id} progress`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-valuetext={`${status}, ${progress}%`}>
                      <div className="order-progress-track"><div className="order-progress-fill" style={{ width: `${progress}%` }} /></div>
                      <span className="order-progress-value">{progress}%</span>
                    </div>
                    <div className="order-progress-steps" aria-hidden="true">
                      {["Placed", "Confirmed", "Shipped", "Delivered"].map((step, index) => {
                        const stepProgress = [10, 35, 70, 100][index];
                        return <span className={progress >= stepProgress ? "complete" : ""} key={step}>{step}</span>;
                      })}
                    </div>
                    <p>Items: {names || "—"}</p>
                    <p>Total: {money(order.total || 0)}</p>
                    <p>Shipping to: {order.deliveryAddress || "—"}</p>
                    {order.paymentMethod === "payfast" && rawStatus === "pending" && (
                      <button className="btn primary" type="button" disabled={busy} onClick={() => continuePayfast(order.id)}>Pay now with PayFast</button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside>
          <section className="panel" aria-labelledby="os">
            <h2 id="os">Order Summary</h2>
            <div className="promo">
              <input type="text" placeholder="Enter Coupon Code" aria-label="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
              <button className="btn primary" type="button" onClick={applyCoupon}>Apply Coupon</button>
            </div>
            <p className="notice" role="status" style={{ margin: "-10px 0 12px" }}>{couponNote}</p>
            <div className="sum"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="sum"><span>Shipping</span><span>{money(shipping)}</span></div>
            <div className="sum"><span>Discount</span><span>{discountAmount ? `−${money(discountAmount)}` : money(0)}</span></div>
            <div className="sum total"><span>Total</span><span>{money(total)}</span></div>
          </section>

          <section className="panel" aria-labelledby="pd">
            <h2 id="pd">Payment Details</h2>
            <div className="pay-options">
              {[["cod", "Cash on Delivery"], ["shopcart", "Shopcart Card"], ["payfast", "PayFast (card or instant EFT)"], ["paypal", "Paypal"], ["card", "Credit or Debit card"]].map(([value, label]) => (
                <label className="radio" key={value}>
                  <input type="radio" name="pay" value={value} checked={pay === value} onChange={() => setPay(value)} /> {label}
                </label>
              ))}
            </div>
            <p className="notice">Card and cash on delivery are demo only. PayFast and PayPal payments are processed securely by PayFast and PayPal.</p>
            {pay === "paypal" ? (
              <>
                <div ref={paypalBox} style={{ marginTop: 12 }} />
                <p className="notice">PayPal charges in US dollars: <strong>US${total.toFixed(2)}</strong></p>
              </>
            ) : pay === "payfast" ? (
              <>
                <button className="btn primary block" type="button" disabled={!lines.length || busy} onClick={payWithPayfast}>Pay with PayFast</button>
                <p className="notice">PayFast charges in rand: <strong>R{zarTotal}</strong>. You finish paying on PayFast's secure page.</p>
              </>
            ) : (
              <button className="btn primary block" type="button" disabled={!lines.length || busy} onClick={() => saveOrder(pay)}>Place Order</button>
            )}
            <p className="notice" role="status">{note}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
