import { Link } from "react-router-dom";
import { useShop } from "../context/ShopContext.jsx";
import ProductCard from "../components/ProductCard.jsx";

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export default function Home() {
  const { products } = useShop();
  const featured = products.filter((p) => p.offer).slice(0, 4);
  featured.push(...products.filter((p) => !featured.includes(p)).slice(0, 8 - featured.length));

  return (
    <>
      <section className="hero landing-hero" aria-label="Introduction">
        <div className="hero-copy">
          <span className="hero-tag">New season collection</span>
          <h1>Your sound.<br />Your style.</h1>
          <p className="hero-sub">Headphones and earbuds from top brands — up to 50% off selected items, with free delivery on orders over $50.</p>
          <div className="hero-cta">
            <Link className="btn primary" to="/shop">Shop headphones</Link>
            <Link className="btn outline" to="/shop#deals">View deals</Link>
          </div>
          <div className="hero-trust">
            <span className="trust-item"><svg viewBox="0 0 24 24" strokeWidth="1.5" {...stroke}><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg> 4.8/5 rating</span>
            <span className="trust-item"><svg viewBox="0 0 24 24" strokeWidth="1.5" {...stroke}><path d="M21 12V7H5v5" /><path d="M16 19h6" /><path d="M19 16v6" /></svg> 24h dispatch</span>
            <span className="trust-item"><svg viewBox="0 0 24 24" strokeWidth="1.5" {...stroke}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 3v4M8 3v4" /></svg> 2yr warranty</span>
          </div>
        </div>
        <img src="/images/landing.jpg" alt="Headphones promotion" />
      </section>

      <div className="container">
        {featured.length > 0 && (
          <section className="featured" aria-label="Featured products">
            <div className="section-head">
              <br />
              <Link className="link" to="/shop">View all <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></Link>
            </div>
            <div className="grid" aria-label="Featured products">
              {featured.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        <section className="perk-grid" aria-label="Why shop with Shopcart">
          <div className="perk-card">
            <span className="ico"><svg viewBox="0 0 24 24" strokeWidth="1.8" {...stroke}><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11" /><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2" /><circle cx="7" cy="18" r="2" /><path d="M9 18h6" /><circle cx="17" cy="18" r="2" /></svg></span>
            <strong>Free delivery</strong><span>On orders over $50</span>
          </div>
          <div className="perk-card">
            <span className="ico"><svg viewBox="0 0 24 24" strokeWidth="1.8" {...stroke}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></span>
            <strong>30-day returns</strong><span>Free returns on unused items</span>
          </div>
          <div className="perk-card">
            <span className="ico"><svg viewBox="0 0 24 24" strokeWidth="1.8" {...stroke}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></span>
            <strong>Secure checkout</strong><span>Card and cash on delivery</span>
          </div>
          <div className="perk-card">
            <span className="ico"><svg viewBox="0 0 24 24" strokeWidth="1.8" {...stroke}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r="1" /></svg></span>
            <strong>Up to 50% off</strong><span>Selected headphones and earbuds</span>
          </div>
        </section>

        <section className="newsletter" aria-label="Newsletter signup">
          <div className="newsletter-inner">
            <div>
              <h2>Join the sound club</h2>
              <p>Early access to drops, exclusive offers, and audio tips.</p>
            </div>
            <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}>
              <label><span className="sr-only">&nbsp;&nbsp;&nbsp;</span><input type="email" placeholder="Email address" required /></label>
              <button className="btn primary" type="submit">Subscribe</button>
            </form>
            <p className="newsletter-note">No spam. Unsubscribe anytime.</p>
          </div>
        </section>

        <section className="cta-band" aria-label="Deals">
          <div><h2>Deals end soon</h2></div>
        </section>
      </div>
    </>
  );
}
