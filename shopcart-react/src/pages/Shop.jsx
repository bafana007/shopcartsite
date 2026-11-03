import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { trackFilter, trackSearch } from "../lib/firebase.js";
import ProductCard from "../components/ProductCard.jsx";

const FILTERS = [
  { key: "type", label: "Type", options: ["Over-ear", "Earbuds", "Open-ear", "Kids", "Bags"].map((v) => ({ label: v, test: (p) => p.type === v })) },
  { key: "price", label: "Price", options: [
    { label: "Under $100", test: (p) => p.price < 100 },
    { label: "$100 – $300", test: (p) => p.price >= 100 && p.price <= 300 },
    { label: "Over $300", test: (p) => p.price > 300 }] },
  { key: "review", label: "Review", options: [
    { label: "5 stars", test: (p) => p.rating === 5 },
    { label: "4 stars & up", test: (p) => p.rating >= 4 }] },
  { key: "color", label: "Color", options: ["Black", "Red", "Blue"].map((v) => ({ label: v, test: (p) => p.color === v })) },
  { key: "material", label: "Material", options: ["Plastic", "Metal", "Leather"].map((v) => ({ label: v, test: (p) => p.material === v })) },
  { key: "offer", label: "Offer", options: [{ label: "On sale", test: (p) => p.offer }] },
];

const SORTS = [
  { id: "default", label: "Featured" },
  { id: "low", label: "Price: low to high" },
  { id: "high", label: "Price: high to low" },
  { id: "rating", label: "Top rated" },
];

const Chevron = () => (
  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3.5l3 3 3-3" /></svg>
);

export default function Shop() {
  const { products } = useShop();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [openMenu, setOpenMenu] = useState(null);
  const [filters, setFilters] = useState({ price: null, review: null, color: null, material: null, offer: null });
  const [sort, setSort] = useState("default");
  const barRef = useRef(null);

  // "type" and "q" live in the URL so the header category menu and search box can drive them
  const type = params.get("type") || null;
  const q = (params.get("q") || "").trim().toLowerCase();
  const rawQ = (params.get("q") || "").trim();
  const state = { ...filters, type };

  function setFilter(key, label) {
    if (key === "type") {
      const next = new URLSearchParams(params);
      if (type === label) next.delete("type"); else next.set("type", label);
      setParams(next, { replace: true });
    } else {
      setFilters((f) => ({ ...f, [key]: f[key] === label ? null : label }));
    }
    setOpenMenu(null);
  }

  // close menus on outside click / Escape
  useEffect(() => {
    const onClick = (e) => { if (!barRef.current?.contains(e.target)) setOpenMenu(null); };
    const onKey = (e) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const list = useMemo(() => {
    const out = products.filter((p) => {
      for (const f of FILTERS) {
        const chosen = f.key === "type" ? type : filters[f.key];
        if (!chosen) continue;
        const opt = f.options.find((o) => o.label === chosen);
        if (opt && !opt.test(p)) return false;
      }
      if (q && !`${p.name} ${p.desc}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "low") out.sort((a, b) => a.price - b.price);
    if (sort === "high") out.sort((a, b) => b.price - a.price);
    if (sort === "rating") out.sort((a, b) => b.rating - a.rating);
    return out;
  }, [products, filters, type, q, sort]);

  // activity tracking (signed-in users only), debounced for search
  useEffect(() => {
    if (!user || !rawQ) return undefined;
    const t = setTimeout(() => trackSearch(user.uid, rawQ).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [rawQ, user]);

  const filterKey = JSON.stringify(state);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (!user) return;
    const active = Object.fromEntries(Object.entries(state).filter(([, v]) => v));
    if (Object.keys(active).length) trackFilter(user.uid, active).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return (
    <>
      <section className="hero shop-hero" id="deals" aria-label="Promotion">
        <div className="hero-copy">
          <span className="hero-tag">Limited time offer</span>
          <h1>Up to 50% Off Selected Headphones</h1>
          <p className="hero-sub">Premium sound, incredible value. Curated picks from top brands.</p>
          <a className="btn primary" href="#headphones" onClick={(e) => { e.preventDefault(); document.getElementById("headphones")?.scrollIntoView({ behavior: "smooth" }); }}>Shop the collection</a>
        </div>
        <img src="/images/image1.jpg" alt="Headphones promotion" />
      </section>

      <div className="container">
        <div className="filters" id="filters" aria-label="Filters" ref={barRef}>
          {FILTERS.map((f) => (
            <div className="chip-wrap" key={f.key}>
              <button
                className={`chip${state[f.key] ? " active" : ""}`}
                type="button" aria-haspopup="true" aria-expanded={openMenu === f.key}
                onClick={() => setOpenMenu(openMenu === f.key ? null : f.key)}
              >
                {f.label}<Chevron />
              </button>
              <div className={`menu${openMenu === f.key ? " open" : ""}`} role="menu">
                {f.options.map((o) => (
                  <button key={o.label} type="button" role="menuitemradio" aria-checked={state[f.key] === o.label} onClick={() => setFilter(f.key, o.label)}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="chip-wrap spacer">
            <button className="chip outline" type="button" aria-haspopup="true" aria-expanded={openMenu === "sort"} onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}>
              Sort by<Chevron />
            </button>
            <div className={`menu right${openMenu === "sort" ? " open" : ""}`} role="menu">
              {SORTS.map((s) => (
                <button key={s.id} type="button" role="menuitemradio" aria-checked={sort === s.id} onClick={() => { setSort(s.id); setOpenMenu(null); }}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        <section id="headphones" aria-labelledby="h-title">
          <header className="section-head">
            <div>
              <span className="section-tag">All products</span>
              <p className="section-sub">Discover the perfect pair — from audiophile over-ears to everyday earbuds.</p>
            </div>
            <div className="section-cta">
              <Link className="btn outline" to="/shop#deals">View all deals <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></Link>
            </div>
          </header>
          <div className="grid" id="product-grid">
            {list.length
              ? list.map((p) => <ProductCard key={p.id} product={p} />)
              : <p className="empty">No headphones match these filters. Remove a filter to see more.</p>}
          </div>
        </section>

        <section className="categories" aria-labelledby="c-title">
          <h2 className="section-title" id="c-title">Popular Categories</h2>
          <div className="cat-grid">
            {[
              ["Furniture", "/shop", <><path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5" /><path d="M3 12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z" /><path d="M5 18v2M19 18v2" /></>],
              ["Headphone", "/shop#headphones", <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="2" /><rect x="17" y="14" width="4" height="6" rx="2" /></>],
              ["Shoe", "/shop", <><path d="M4 18v-8h1l2-2h4l3 3h6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 15h18" /></>],
              ["Bag", "/shop?type=Bags", <><path d="M6 7 3.6 5.6A1 1 0 0 0 2 6.3V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6.3a1 1 0 0 0-1.6-.8L18 7" /><path d="M3 7h18" /><path d="M16 11a4 4 0 0 1-8 0" /></>],
              ["Laptop", "/shop", <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></>],
              ["Book", "/shop", <path d="M4 19.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />],
            ].map(([name, to, icon]) => (
              <Link className="cat" to={to} key={name}>
                <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg></span>
                <div><strong>{name}</strong><span>240 Item Available</span></div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
