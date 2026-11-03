import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { CURRENCIES } from "../lib/catalog.js";
import Toast from "./Toast.jsx";
import Icon from "./Icon.jsx";

const CATEGORIES = ["Over-ear", "Earbuds", "Open-ear", "Kids", "Bags"];

function CurrencySelect() {
  const { currency, setCurrency } = useShop();
  return (
    <label>
      <span className="sr-only" style={{ position: "absolute", left: -9999 }}>Currency</span>
      <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.label}</option>)}
      </select>
    </label>
  );
}

function TopBar({ children }) {
  return (
    <div className="topbar">
      <div className="container">
        <a className="phone" href="tel:+0123456890">+001234587890</a>
        <p className="promo">{children}</p>
        <div className="right">
          <label><span className="sr-only" style={{ position: "absolute", left: -9999 }}>Language</span>
            <select aria-label="Language"><option>Eng</option><option>Fra</option><option>Zul</option></select></label>
          <label><span className="sr-only" style={{ position: "absolute", left: -9999 }}>Location</span>
            <select aria-label="Location"><option>Location</option><option>South Africa</option><option>United States</option></select></label>
          <CurrencySelect />
        </div>
      </div>
    </div>
  );
}

function Header() {
  const { user, isAdmin } = useAuth();
  const { cartCount } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const onShop = location.pathname === "/shop";
  const type = onShop ? params.get("type") || "" : "";
  const urlQuery = onShop ? params.get("q") || "" : "";
  const [text, setText] = useState(urlQuery);

  // keep the box in sync when the URL changes (e.g. arriving from another page)
  useEffect(() => { setText(urlQuery); }, [urlQuery]);

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    if (onShop) {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value); else next.delete("q");
      setParams(next, { replace: true });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    if (onShop) document.getElementById("headphones")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate(`/shop?q=${encodeURIComponent(q)}`);
  }

  function pickCategory(label) {
    const next = onShop ? new URLSearchParams(params) : new URLSearchParams();
    if (label) next.set("type", label); else next.delete("type");
    navigate({ pathname: "/shop", search: next.toString() ? `?${next}` : "" });
    document.activeElement?.blur?.();
  }

  return (
    <header className="header">
      <div className="container">
        <Link className="logo" to="/"><img src="/images/logo.svg" alt="" />Shopcart</Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>Home</NavLink>
          <div className="nav-dropdown">
            <button className="nav-link" type="button" aria-haspopup="true">Categories &#9662;</button>
            <div className="nav-menu" role="menu">
              <button type="button" role="menuitemradio" aria-checked={!type} onClick={() => pickCategory("")}>All</button>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" role="menuitemradio" aria-checked={type === c} onClick={() => pickCategory(c)}>{c}</button>
              ))}
            </div>
          </div>
          <Link to="/shop#deals">Deals</Link>
          <Link to="/shop">What's New</Link>
          {!isAdmin && <Link to="/checkout">Delivery</Link>}
        </nav>
        <form className="search" role="search" onSubmit={handleSubmit}>
          <input type="search" placeholder="Search Product" aria-label="Search products" value={text} onChange={handleChange} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.500-3.500" /></svg>
        </form>
        <div className="header-actions">
          <Link to={user ? "/profile" : "/login"} className="account-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
            <span className="label">{user ? `Hi, ${user.name}` : "Account"}</span>
            {isAdmin && <span className="role-badge">Admin</span>}
          </Link>
          {!isAdmin && (
            <Link to="/checkout" aria-label="Cart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h3l2.500 11h11l2-8H7" /><circle cx="10" cy="20" r="1.500" /><circle cx="18" cy="20" r="1.500" /></svg>
              <span className="label">Cart</span>
              <span className="cart-count" data-n={cartCount}>{cartCount}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { isAdmin } = useAuth();

  return (
    <footer className="footer">
      <div className="container footer-main">
        <section className="footer-brand">
          <Link className="footer-logo" to="/">Shopcart</Link>
          <p>Headphones and earbuds for work, travel, and downtime.</p>
          <p className="footer-demo-note">Demo checkout only. Card and cash-on-delivery are not processed; PayPal payments are handled by PayPal.</p>
        </section>
        <nav className="footer-column" aria-label="Shop links">
          <h2>Shop</h2>
          <Link to="/">Home</Link><Link to="/shop">All products</Link><Link to="/shop#deals">Deals</Link>
        </nav>
        <nav className="footer-column" aria-label="Account links">
          <h2>Account</h2>
          <Link to="/login">Sign in</Link>
          {!isAdmin && <><Link to="/checkout">Cart and checkout</Link><Link to="/checkout#ot">Track an order</Link></>}
        </nav>
        <section className="footer-column" aria-labelledby="footer-delivery-title">
          <h2 id="footer-delivery-title">Delivery and returns</h2>
          <p>Free delivery on orders over $50.</p><p>30-day returns on unused items.</p><p>Prices follow your selected currency.</p>
        </section>
      </div>
      <div className="container footer-bottom">
        <p>&copy; 2026 Shopcart. All rights reserved.</p>
        <p>Made for everyday listening.</p>
      </div>
    </footer>
  );
}

/* Scroll to #hash targets (e.g. /shop#deals) and to the top on normal navigation */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function Layout() {
  return (
    <>
      <ScrollManager />
      <TopBar>Get 50% Off on Selected Items <Link to="/shop">Shop Now</Link></TopBar>
      <Header />
      <main><Outlet /></main>
      <Footer />
      <Toast />
    </>
  );
}

const ADMIN_NAV = [
  { label: "Manage", items: [
    { to: "/admin", hash: "", icon: "chart", text: "Dashboard" },
    { to: "/admin#products", hash: "#products", icon: "package", text: "Products" },
    { to: "/admin#users", hash: "#users", icon: "users", text: "Users" },
    { to: "/admin#orders", hash: "#orders", icon: "bag", text: "Orders" },
    { to: "/admin#activity", hash: "#activity", icon: "activity", text: "Activity" },
  ] },
];

const THEME_KEY = "shopcart:admin-theme";
const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function AdminLayout() {
  const { user, isAdmin } = useAuth();
  const { cartCount } = useShop();
  const { hash } = useLocation();
  const [open, setOpen] = useState(() => !isNarrow());
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* ignore */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }
  const closeIfNarrow = () => { if (isNarrow()) setOpen(false); };

  return (
    <div className={`admin-page${open ? " sidebar-open" : ""}`} data-theme={theme}>
      <ScrollManager />
      <aside className="admin-sidebar" id="admin-sidebar" aria-label="Admin navigation" aria-hidden={!open} inert={!open ? "" : undefined}>
        <Link className="admin-brand" to="/" onClick={closeIfNarrow}>
          <span className="brand-mark"><Icon name="cart" size={18} /></span>
          <span>Shopcart Admin</span>
        </Link>

        {ADMIN_NAV.map((group) => (
          <nav className="side-group" key={group.label} aria-label={group.label}>
            <p className="side-label">{group.label}</p>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`side-link${hash === item.hash ? " active" : ""}`}
                aria-current={hash === item.hash ? "page" : undefined}
                onClick={closeIfNarrow}
              >
                <Icon name={item.icon} />{item.text}
              </Link>
            ))}
          </nav>
        ))}

        <nav className="side-group" aria-label="Store">
          <p className="side-label">Store</p>
          <Link className="side-link" to="/" onClick={closeIfNarrow}><Icon name="store" />View store</Link>
          {!isAdmin && (
            <Link className="side-link" to="/checkout" onClick={closeIfNarrow}>
              <Icon name="cart" />Cart
              {cartCount > 0 && <span className="side-count">{cartCount}</span>}
            </Link>
          )}
        </nav>

        <div className="side-card">
          <h2>Back to the store</h2>
          <p>See your shop the way customers do, from products to checkout.</p>
          <Link className="btn primary block" to="/" onClick={closeIfNarrow}>Open store</Link>
        </div>
      </aside>

      {open && <button className="side-scrim" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} />}

      <div className="admin-shell">
        <header className="admin-topbar">
          <button className="icon-btn" type="button" aria-label={open ? "Hide navigation" : "Show navigation"} aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(!open)}>
            <Icon name="panel" />
          </button>
          <Link className="store-chip" to="/"><Icon name="cart" size={16} />Shopcart Store</Link>
          <div className="topbar-right">
            <Link className="topbar-link" to="/">View store</Link>
            <button className="icon-btn" type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <Link className="avatar" to="/profile" aria-label={user ? `${user.name}, profile` : "Profile"}>
              {initials(user?.name)}
              {isAdmin && <span className="sr-only">Administrator</span>}
            </Link>
          </div>
        </header>
        <Outlet />
      </div>
      <Toast />
    </div>
  );
}
