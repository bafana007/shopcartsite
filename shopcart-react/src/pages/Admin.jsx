import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import {
  deleteUser,
  setAdmin,
  suspendUser,
  updateOrderStatus,
  watchAdminData,
  watchUserActivity,
} from "../lib/firebase.js";
import { deleteProduct, uploadProductImage, watchProducts, writeProduct } from "../lib/supabase.js";
import { DEFAULT_PRODUCTS } from "../lib/products.js";
import { imgSrc } from "../lib/catalog.js";

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "refunded"];
const ACTIVITY_TYPES = [
  ["add_to_cart", "Add to Cart"], ["product_view", "Product View"], ["search", "Search"],
  ["filter", "Filter"], ["form_submission", "Form Submission"], ["page_view", "Page View"],
];
const STATUS_COLORS = {
  pending: "var(--warning)", confirmed: "var(--info)", shipped: "var(--primary)",
  delivered: "var(--success)", cancelled: "var(--danger)", refunded: "var(--muted)",
};
const EMPTY_PRODUCT = {
  name: "", price: "", type: "Earbuds", color: "", material: "", image: "", desc: "", rating: 5, reviews: 0, offer: false,
};

function formatDate(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const StatusBadge = ({ status }) => <span className="badge" style={{ "--dot": STATUS_COLORS[status] || "var(--muted)" }}>{status}</span>;
const SuspendedBadge = ({ suspended }) => (
  suspended ? <span className="badge danger">Suspended</span> : <span className="badge success">Active</span>
);
const includes = (value, needle) => String(value ?? "").toLowerCase().includes(needle.toLowerCase());

const DAY = 24 * 60 * 60 * 1000;
const SPAN_DAYS = 28;
const BUCKETS = 8;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const toMs = (ts) => (!ts ? 0 : ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime());

/* Sum orders into BUCKETS slices of the last 28 days, plus the 28 days before for comparison */
function summarize(orders, valueOf, now) {
  const series = Array(BUCKETS).fill(0);
  let current = 0;
  let previous = 0;
  const slice = (SPAN_DAYS * DAY) / BUCKETS;
  for (const o of orders) {
    const ms = toMs(o.createdAt);
    const age = now - ms;
    if (!ms || age < 0) continue;
    const v = valueOf(o);
    if (age < SPAN_DAYS * DAY) {
      series[BUCKETS - 1 - Math.floor(age / slice)] += v;
      current += v;
    } else if (age < 2 * SPAN_DAYS * DAY) {
      previous += v;
    }
  }
  return { series, current, previous, pct: previous > 0 ? ((current - previous) / previous) * 100 : null };
}

function initialsOf(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function hueOf(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function Delta({ pct }) {
  if (pct == null) return <p className="delta">Nothing to compare with yet</p>;
  return (
    <p className="delta">
      <span className={pct >= 0 ? "up" : "down"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span> from the previous {SPAN_DAYS} days
    </p>
  );
}

function BarChart({ values, label }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars" role="img" aria-label={`${label}: ${values.join(", ")}`}>
      {values.map((v, i) => (
        <div className="bar-col" key={i}>
          <span className="bar-value">{v}</span>
          <span className="bar" style={{ height: 14 + (v / max) * 96 }} />
        </div>
      ))}
    </div>
  );
}

function LineChart({ values, label }) {
  const W = 300;
  const H = 130;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => ({
    x: 12 + (i * (W - 24)) / (values.length - 1),
    y: max === min ? H / 2 : H - 16 - ((v - min) / (max - min)) * (H - 32),
  }));
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" strokeWidth="2" />)}
    </svg>
  );
}

/* <dialog> controlled by an `open` prop */
function Modal({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="admin-modal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div>
          <header className="modal-header">
            <h3>{title}</h3>
            <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </header>
          <div className="modal-body">{children}</div>
          <footer className="modal-footer">{footer}</footer>
        </div>
      )}
    </dialog>
  );
}

export default function Admin() {
  const { authUser, isAdmin, loading } = useAuth();
  const { money } = useShop();

  const [products, setProducts] = useState(() => DEFAULT_PRODUCTS.map((p) => ({ ...p })));
  const [data, setData] = useState({ users: {}, orders: {}, admins: {} });
  const [activityByUser, setActivityByUser] = useState({});
  const [error, setError] = useState("");

  const [q, setQ] = useState({ product: "", user: "", order: "", orderStatus: "", activity: "", activityType: "" });
  const [userModal, setUserModal] = useState(null);       // uid
  const [orderModal, setOrderModal] = useState(null);     // order id
  const [orderStatus, setOrderStatus] = useState("pending");
  const [productModal, setProductModal] = useState(null); // { id } | { id: null }
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filePreview, setFilePreview] = useState(null);

  const showError = (e) => {
    console.error("Failed to receive admin data:", e);
    setError("Could not load live dashboard data. Check the Realtime Database rules and try again.");
  };

  // object URL for the chosen image file, released when it changes
  useEffect(() => {
    if (!file) { setFilePreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* ---------- live data ---------- */
  useEffect(() => {
    if (!authUser || !isAdmin) return undefined;
    const stopProducts = watchProducts(
      (rows) => setProducts(rows.length ? rows : DEFAULT_PRODUCTS.map((p) => ({ ...p }))),
      showError,
    );
    const stopAdmin = watchAdminData((next) => { setData(next); setError(""); }, showError);
    return () => { stopProducts?.(); stopAdmin?.(); };
  }, [authUser, isAdmin]);

  const users = useMemo(() => Object.entries(data.users).map(([uid, u]) => ({ uid, ...(u || {}) })), [data.users]);
  const orders = useMemo(
    () => Object.entries(data.orders).map(([id, o]) => ({ id, ...(o || {}) })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data.orders],
  );
  const adminUids = useMemo(() => Object.entries(data.admins).filter(([, v]) => v === true).map(([uid]) => uid), [data.admins]);

  // one activity listener per user (re-subscribed when the user list changes)
  const uidKey = users.map((u) => u.uid).join(",");
  useEffect(() => {
    if (!isAdmin || !uidKey) return undefined;
    const stops = uidKey.split(",").map((uid) => watchUserActivity(
      uid,
      (acts) => setActivityByUser((prev) => ({ ...prev, [uid]: acts })),
      showError,
    ));
    return () => stops.forEach((stop) => stop());
  }, [uidKey, isAdmin]);

  const activity = useMemo(() => {
    const list = [];
    for (const u of users) {
      for (const a of activityByUser[u.uid] || []) {
        list.push({
          ...a,
          userName: u.profile?.name || u.email?.split("@")[0] || "Unknown",
          userEmail: u.email || u.profile?.email,
        });
      }
    }
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [users, activityByUser]);

  /* ---------- route guard ---------- */
  if (loading) return <main className="admin-main" id="admin-main"><p className="notice" style={{ padding: "60px 0" }}>Checking administrator access…</p></main>;
  if (!authUser || !isAdmin) return <Navigate to={"/login?mode=admin&next=" + encodeURIComponent("/admin")} replace />;

  /* ---------- derived ---------- */
  const suspendedCount = users.filter((u) => u.suspended).length;

  const now = Date.now();
  const orderStats = summarize(orders, () => 1, now);
  const revenueStats = summarize(orders, (o) => o.total || 0, now);
  const rangeLabel = `${fmtDay(new Date(now - SPAN_DAYS * DAY))} - ${fmtDay(new Date(now))}`;
  const lastOrderAt = (uid) => orders.find((o) => o.userId === uid)?.createdAt;
  const recentUsers = [...users].sort((a, b) => toMs(lastOrderAt(b.uid)) - toMs(lastOrderAt(a.uid))).slice(0, 3);

  function exportOrders() {
    const safe = (v) => {
      let t = String(v ?? "");
      if (/^[=+\-@]/.test(t)) t = `'${t}`; // keep spreadsheets from running cell text as formulas
      return `"${t.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Order ID", "Customer", "Email", "Items", "Total", "Status", "Date"],
      ...orders.map((o) => [
        o.id, o.customerName, o.customerEmail,
        (o.items || []).map((i) => `${i.name} x${i.quantity}`).join("; "),
        o.total || 0, o.status || "pending", formatDate(o.createdAt),
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.map(safe).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fProducts = products.filter((p) => includes(p.name, q.product) || includes(p.type, q.product) || includes(p.desc, q.product));
  const fUsers = users.filter((u) => includes(u.profile?.name, q.user) || includes(u.email || u.profile?.email, q.user));
  const fOrders = orders.filter((o) =>
    (includes(o.id, q.order) || includes(o.customerName, q.order) || includes(o.customerEmail, q.order))
    && (!q.orderStatus || o.status === q.orderStatus));
  const fActivity = activity.filter((a) =>
    (includes(a.userName, q.activity) || includes(a.userEmail, q.activity) || includes(JSON.stringify(a.data || {}), q.activity))
    && (!q.activityType || a.type === q.activityType)).slice(0, 200);

  const modalUser = users.find((u) => u.uid === userModal);
  const modalUserOrders = modalUser ? orders.filter((o) => o.userId === modalUser.uid) : [];
  const modalOrder = orders.find((o) => o.id === orderModal);

  /* ---------- actions ---------- */
  async function handleUserAction(action, uid) {
    const target = users.find((u) => u.uid === uid);
    try {
      if (action === "suspend") {
        await suspendUser(uid, !target?.suspended);
      } else if (action === "delete") {
        if (authUser.uid === uid) { alert("You cannot delete your own admin account."); return; }
        if (!confirm("Delete this user and all their data? This cannot be undone.")) return;
        await deleteUser(uid);
      } else if (action === "admin") {
        const isTargetAdmin = adminUids.includes(uid);
        if (isTargetAdmin && authUser.uid === uid) { alert("You cannot revoke your own admin access."); return; }
        await setAdmin(uid, !isTargetAdmin);
      }
      setUserModal(null);
    } catch (e) {
      console.error("User action failed:", e);
      alert("Action failed: " + e.message);
    }
  }

  async function handleOrderStatusUpdate() {
    try {
      await updateOrderStatus(orderModal, orderStatus);
      setOrderModal(null);
    } catch (e) {
      console.error("Order status update failed:", e);
      alert("Failed to update status: " + e.message);
    }
  }

  function openOrder(id) {
    const o = orders.find((x) => x.id === id);
    setOrderStatus(o?.status || "pending");
    setOrderModal(id);
  }

  function openProduct(id = null) {
    const p = id == null ? null : products.find((x) => String(x.id) === String(id));
    setForm(p ? {
      name: p.name || "", price: p.price ?? "", type: p.type || "Earbuds", color: p.color || "", material: p.material || "",
      image: p.image || "", desc: p.desc || "", rating: p.rating ?? 5, reviews: p.reviews ?? 0, offer: !!p.offer,
    } : EMPTY_PRODUCT);
    setFile(null);
    setProductModal({ id: p?.id ?? null });
  }

  async function handleProductSave() {
    const name = form.name.trim();
    const price = parseFloat(form.price);
    if (!name) { alert("Item name is required."); return; }
    if (Number.isNaN(price) || price < 0) { alert("Enter a valid price."); return; }
    setSaving(true);
    try {
      let image = form.image.trim();
      if (file) {
        if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5 MB."); setSaving(false); return; }
        image = await uploadProductImage(file);
      }
      await writeProduct({
        id: productModal.id,
        name, price,
        type: form.type,
        color: form.color.trim() || null,
        material: form.material.trim() || null,
        image: image || null,
        desc: form.desc.trim() || null,
        rating: parseFloat(form.rating) || 5,
        reviews: parseInt(form.reviews, 10) || 0,
        offer: form.offer,
      });
      setProductModal(null);
    } catch (e) {
      console.error("Product save failed:", e);
      alert("Failed to save product: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleProductDelete(id) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      await deleteProduct(id);
      setProductModal(null);
    } catch (e) {
      console.error("Product delete failed:", e);
      alert("Failed to delete product: " + e.message);
    }
  }

  const setF = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const preview = filePreview || form.image;
  const set = (key) => (e) => setQ({ ...q, [key]: e.target.value });

  return (
    <main className="admin-main" id="admin-main">
      <div className="dash-head">
        <h1>Dashboard</h1>
        <div className="dash-actions">
          <span className="range-pill"><Icon name="calendar" size={16} />{rangeLabel}</span>
          <button className="btn primary" type="button" onClick={exportOrders}><Icon name="download" size={16} />Export orders</button>
        </div>
      </div>
      {error && <p className="notice" role="status">{error}</p>}

      <div className="dash-grid">
        <section className="dash-card" aria-labelledby="card-users">
          <header className="card-head"><h2 id="card-users">Users</h2><span className="card-hint">{users.length} total, {suspendedCount} suspended</span></header>
          <div className="card-body">
            {recentUsers.length ? (
              <ul className="user-list">
                {recentUsers.map((u) => {
                  const name = u.profile?.name || u.email?.split("@")[0] || "Unknown";
                  const isUserAdmin = adminUids.includes(u.uid);
                  return (
                    <li key={u.uid}>
                      <span className="mini-avatar" style={{ "--h": hueOf(u.uid) }}>{initialsOf(name)}</span>
                      <span className="user-text"><strong>{name}</strong><small>{u.email || u.profile?.email || "—"}</small></span>
                      {u.suspended ? <span className="badge danger">Suspended</span> : isUserAdmin ? <span className="badge success">Admin</span> : <span className="badge muted">User</span>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="empty">No users yet. They appear here after they sign up.</p>}
          </div>
        </section>

        <section className="dash-card" aria-labelledby="card-orders">
          <header className="card-head"><h2 id="card-orders">Orders</h2></header>
          <div className="card-body">
            <p className="big">{orderStats.current}</p>
            <Delta pct={orderStats.pct} />
            <BarChart values={orderStats.series} label="Orders per 3.5-day period over the last 28 days" />
          </div>
        </section>

        <section className="dash-card" aria-labelledby="card-revenue">
          <header className="card-head"><h2 id="card-revenue">Revenue</h2></header>
          <div className="card-body">
            <p className="big">{money(revenueStats.current)}</p>
            <Delta pct={revenueStats.pct} />
            <LineChart values={revenueStats.series} label="Revenue per 3.5-day period over the last 28 days" />
          </div>
        </section>
      </div>

      {/* Products */}
      <section id="products" className="admin-section">
        <header className="section-head">
          <h2 className="section-title">Products</h2>
          <input type="search" placeholder="Search products..." className="search-input" aria-label="Search products" value={q.product} onChange={set("product")} />
          <button className="btn primary" type="button" onClick={() => openProduct(null)}>+ Add Item</button>
        </header>
        <div className="table-wrapper">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Type</th><th>Image</th><th>Actions</th></tr></thead>
            <tbody>
              {fProducts.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td>{p.name || "—"}</td>
                  <td>{money(p.price || 0)}</td>
                  <td>{p.type || "—"}</td>
                  <td><img className="product-thumbnail" src={imgSrc(p.image)} alt={p.name || "Product image"} loading="lazy" /></td>
                  <td>
                    <button className="btn small" type="button" onClick={() => openProduct(p.id)}>Edit</button>
                    <button className="btn small danger" type="button" onClick={() => handleProductDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Users */}
      <section id="users" className="admin-section">
        <header className="section-head">
          <h2 className="section-title">Users</h2>
          <input type="search" placeholder="Search users..." className="search-input" aria-label="Search users" value={q.user} onChange={set("user")} />
        </header>
        <div className="table-wrapper">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Email</th><th>Orders</th><th>Total Spent</th><th>Status</th><th>Role</th><th>Last Order</th><th>Actions</th></tr></thead>
            <tbody>
              {fUsers.map((u) => {
                const userOrders = orders.filter((o) => o.userId === u.uid);
                const spent = userOrders.reduce((s, o) => s + (o.total || 0), 0);
                const isUserAdmin = adminUids.includes(u.uid);
                return (
                  <tr key={u.uid}>
                    <td>{u.profile?.name || "—"}</td>
                    <td>{u.email || u.profile?.email || "—"}</td>
                    <td>{userOrders.length}</td>
                    <td>{money(spent)}</td>
                    <td><SuspendedBadge suspended={u.suspended} /></td>
                    <td>{isUserAdmin ? <span className="badge success">Admin</span> : <span className="badge muted">User</span>}</td>
                    <td>{userOrders[0] ? formatDate(userOrders[0].createdAt) : "—"}</td>
                    <td>
                      <button className="btn small" type="button" onClick={() => setUserModal(u.uid)}>View</button>
                      <button className="btn small danger" type="button" onClick={() => handleUserAction("suspend", u.uid)}>{u.suspended ? "Unsuspend" : "Suspend"}</button>
                      <button className="btn small" type="button" onClick={() => handleUserAction("admin", u.uid)}>{isUserAdmin ? "Revoke Admin" : "Add Admin"}</button>
                      <button className="btn small danger" type="button" onClick={() => handleUserAction("delete", u.uid)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Orders */}
      <section id="orders" className="admin-section">
        <header className="section-head">
          <h2 className="section-title">Orders</h2>
          <input type="search" placeholder="Search orders..." className="search-input" aria-label="Search orders" value={q.order} onChange={set("order")} />
          <select className="filter-select" aria-label="Filter by status" value={q.orderStatus} onChange={set("orderStatus")}>
            <option value="">All Statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </header>
        <div className="table-wrapper">
          <table className="admin-table">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {fOrders.map((o) => (
                <tr key={o.id}>
                  <td><code>{o.id.slice(0, 12)}…</code></td>
                  <td>{o.customerName || "—"}<br /><small>{o.customerEmail || ""}</small></td>
                  <td>{(o.items || []).map((i) => `${i.name} x${i.quantity}`).join(", ")}</td>
                  <td>{money(o.total || 0)}</td>
                  <td><StatusBadge status={o.status || "pending"} /></td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td><button className="btn small" type="button" onClick={() => openOrder(o.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Activity */}
      <section id="activity" className="admin-section">
        <header className="section-head">
          <h2 className="section-title">Recent Activity</h2>
          <input type="search" placeholder="Search activity..." className="search-input" aria-label="Search activity" value={q.activity} onChange={set("activity")} />
          <select className="filter-select" aria-label="Filter by type" value={q.activityType} onChange={set("activityType")}>
            <option value="">All Types</option>
            {ACTIVITY_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </header>
        <div className="table-wrapper">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Type</th><th>Details</th><th>Time</th></tr></thead>
            <tbody>
              {fActivity.map((a) => (
                <tr key={`${a.userEmail}-${a.id}`}>
                  <td>{a.userName || "—"}<br /><small>{a.userEmail || ""}</small></td>
                  <td><span className="badge">{a.type}</span></td>
                  <td>{JSON.stringify(a.data || {}).slice(0, 100)}</td>
                  <td>{formatDate(a.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* User modal */}
      <Modal
        open={!!modalUser} onClose={() => setUserModal(null)} title="User Details"
        footer={modalUser && (
          <>
            <button className="btn outline" type="button" onClick={() => setUserModal(null)}>Close</button>
            <button className="btn" type="button" onClick={() => handleUserAction("suspend", modalUser.uid)}>{modalUser.suspended ? "Unsuspend" : "Suspend"}</button>
            <button className="btn danger" type="button" onClick={() => handleUserAction("delete", modalUser.uid)}>Delete User</button>
          </>
        )}
      >
        {modalUser && (
          <div className="user-detail">
            <p><strong>UID:</strong> {modalUser.uid}</p>
            <p><strong>Name:</strong> {modalUser.profile?.name || "—"}</p>
            <p><strong>Email:</strong> {modalUser.email || modalUser.profile?.email || "—"}</p>
            <p><strong>Address:</strong> {modalUser.profile?.address || "—"}</p>
            <p><strong>Status:</strong> <SuspendedBadge suspended={modalUser.suspended} /></p>
            <p><strong>Total Orders:</strong> {modalUserOrders.length}</p>
            <p><strong>Total Spent:</strong> {money(modalUserOrders.reduce((s, o) => s + (o.total || 0), 0))}</p>
            <hr />
            <h4>Orders</h4>
            {modalUserOrders.length ? modalUserOrders.map((o) => (
              <div className="order-mini" key={o.id}>
                <span>{o.id.slice(0, 12)}…</span><span>{money(o.total || 0)}</span>
                <span><StatusBadge status={o.status || "pending"} /></span><span>{formatDate(o.createdAt)}</span>
              </div>
            )) : <p>No orders</p>}
          </div>
        )}
      </Modal>

      {/* Order modal */}
      <Modal
        open={!!modalOrder} onClose={() => setOrderModal(null)} title="Order Details"
        footer={(
          <>
            <button className="btn outline" type="button" onClick={() => setOrderModal(null)}>Close</button>
            <select className="status-select" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button className="btn primary" type="button" onClick={handleOrderStatusUpdate}>Update Status</button>
          </>
        )}
      >
        {modalOrder && (
          <div className="order-detail">
            <p><strong>Order ID:</strong> {modalOrder.id}</p>
            <p><strong>Customer:</strong> {modalOrder.customerName || "—"} ({modalOrder.customerEmail || "—"})</p>
            <p><strong>Date:</strong> {formatDate(modalOrder.createdAt)}</p>
            <p><strong>Status:</strong> <StatusBadge status={modalOrder.status || "pending"} /></p>
            <p><strong>Payment:</strong> {modalOrder.paymentMethod || "—"}</p>
            <p><strong>Address:</strong> {modalOrder.deliveryAddress || "—"}</p>
            <hr />
            <h4>Items</h4>
            {(modalOrder.items || []).map((i, idx) => (
              <div className="order-mini" key={idx}>
                <span>{i.name}</span><span>x{i.quantity}</span><span>{money(i.price * i.quantity)}</span>
              </div>
            ))}
            <hr />
            <p><strong>Subtotal:</strong> {money(modalOrder.subtotal || 0)}</p>
            <p><strong>Shipping:</strong> {money(modalOrder.shipping || 0)}</p>
            <p><strong>Discount:</strong> {money(modalOrder.discount || 0)}</p>
            <p><strong>Total:</strong> {money(modalOrder.total || 0)}</p>
          </div>
        )}
      </Modal>

      {/* Product modal */}
      <Modal
        open={!!productModal} onClose={() => setProductModal(null)} title={productModal?.id != null ? "Edit Product" : "Add Product"}
        footer={(
          <>
            <button className="btn outline" type="button" onClick={() => setProductModal(null)}>Close</button>
            {productModal?.id != null && <button className="btn danger" type="button" onClick={() => handleProductDelete(productModal.id)}>Delete</button>}
            <button className="btn primary" type="button" disabled={saving} onClick={handleProductSave}>{saving ? "Saving…" : "Save"}</button>
          </>
        )}
      >
        <label className="field"><span>Item Name</span><input type="text" placeholder="e.g. Wireless Earbuds, IPX8" required value={form.name} onChange={setF("name")} /></label>
        <label className="field"><span>Price (USD base price)</span><input type="number" step="0.01" min="0" placeholder="0.00" required value={form.price} onChange={setF("price")} /></label>
        <label className="field"><span>Type</span>
          <select value={form.type} onChange={setF("type")}>
            {["Earbuds", "Over-ear", "Open-ear", "Kids", "Bags"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span>Color</span><input type="text" placeholder="e.g. Black" value={form.color} onChange={setF("color")} /></label>
        <label className="field"><span>Material</span><input type="text" placeholder="e.g. Plastic" value={form.material} onChange={setF("material")} /></label>
        <label className="field"><span>Image URL</span><input type="text" placeholder="images/..." value={form.image} onChange={setF("image")} /></label>
        <label className="field"><span>Upload Image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        {preview && <img className="product-thumbnail" src={filePreview ? preview : imgSrc(preview)} alt="" />}
        <label className="field"><span>Description</span><textarea rows={2} placeholder="Short product description" value={form.desc} onChange={setF("desc")} /></label>
        <label className="field"><span>Rating</span><input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={setF("rating")} /></label>
        <label className="field"><span>Reviews</span><input type="number" min="0" value={form.reviews} onChange={setF("reviews")} /></label>
        <label className="field"><input type="checkbox" checked={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.checked })} /> <span>On sale (offer)</span></label>
      </Modal>
    </main>
  );
}
