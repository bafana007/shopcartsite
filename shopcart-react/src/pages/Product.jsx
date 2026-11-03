import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { trackUserInput } from "../lib/firebase.js";
import { AIRPODS_COLORS, imgSrc } from "../lib/catalog.js";
import ProductCard from "../components/ProductCard.jsx";
import Stars from "../components/Stars.jsx";

const HEX = { Black: "#222", Red: "#d6342c", Blue: "#2f8fe8" };

export default function Product() {
  const { id: idParam } = useParams();
  const { products, addToCart, toast, money } = useShop();
  const { user } = useAuth();
  const navigate = useNavigate();

  const id = Number(idParam) || 2;
  const p = products.find((x) => x.id === id) || products[1];
  const colors = p.id === 2
    ? AIRPODS_COLORS
    : [{ name: p.color, hex: HEX[p.color] || "#222", image: p.image }];

  const [colorName, setColorName] = useState(colors[0].name);
  const [qty, setQty] = useState(1);
  const [addState, setAddState] = useState("idle"); // idle | saving | added | error
  const [buyState, setBuyState] = useState("idle");
  const viewer = useRef(null);
  const timers = useRef([]);

  // reset when navigating between products
  useEffect(() => {
    setColorName(colors[0].name);
    setQty(1);
    setAddState("idle");
    setBuyState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  useEffect(() => { document.title = `${p.name} | Shopcart`; return () => { document.title = "Shopcart"; }; }, [p.name]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // product-view tracking
  useEffect(() => {
    if (!user) return;
    trackUserInput(user.uid, "product_view", {
      productId: p.id, productName: p.name, price: p.price, type: p.type, color: p.color,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, user?.uid]);

  const color = colors.find((c) => c.name === colorName) || colors[0];
  const monthly = Number((p.price / 6.25).toFixed(2));

  async function handleCart(goToCheckout) {
    const setState = goToCheckout ? setBuyState : setAddState;
    setState("saving");
    try {
      const result = await addToCart(p.id, qty, color.name);
      if (goToCheckout) {
        if (!result.databaseSaved && user) toast("Cart saved on this device, but database sync failed.");
        navigate("/checkout");
        return;
      }
      setState("added");
      toast(result.databaseSaved ? "Cart saved to your account" : "Added on this device. Sign in to sync your cart.");
    } catch (error) {
      console.error("Could not add product to cart:", error);
      setState("error");
    }
    timers.current.push(setTimeout(() => setState("idle"), 1600));
  }

  const related = products.filter((x) => x.id !== p.id).slice(0, 4);
  const labels = (idle) => ({ idle, saving: "Saving…", added: "Added", error: "Try Again" });

  return (
    <div className="container">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span>/</span><Link to="/shop">Headphones</Link><span>/</span><span>{p.name}</span>
      </nav>

      <section className="pdp" aria-live="polite">
        <div className="gallery">
          <div className="main">
            <button className="main-image-button" type="button" aria-label={`View ${p.name} full size`} onClick={() => viewer.current?.showModal()}>
              <img src={imgSrc(color.image)} alt={`${p.name} in ${color.name}`} />
              <span className="image-zoom-hint">View full image</span>
            </button>
          </div>
          <div className="thumbs">
            {colors.slice(0, 4).map((c) => (
              <button key={c.name} type="button" aria-label={`Show ${c.name}`} aria-pressed={c.name === color.name} onClick={() => setColorName(c.name)}>
                <img src={imgSrc(c.image)} alt="" />
              </button>
            ))}
          </div>
          <dialog
            className="image-viewer" ref={viewer} aria-label="Full-size product image"
            onClick={(e) => { if (e.target === viewer.current) viewer.current.close(); }}
          >
            <button className="image-viewer-close" type="button" onClick={() => viewer.current.close()}>Close</button>
            <img src={imgSrc(color.image)} alt={`${p.name} in ${color.name}`} />
          </dialog>
        </div>

        <div>
          <h1>{p.name}</h1>
          <div className="stars" style={{ margin: "8px 0" }}><Stars rating={p.rating} reviews={p.reviews} /></div>
          <p className="lead">{p.desc}. Free delivery on orders over $50, with 30 days to return.</p>
          <p className="big-price">{money(p.price)} <small>or {money(monthly)}/month</small></p>
          <hr />
          <h2>Choose a color</h2>
          <div className="swatches" role="group" aria-label="Color">
            {colors.map((c) => (
              <button key={c.name} type="button" style={{ background: c.hex }} aria-label={c.name} aria-pressed={c.name === color.name} onClick={() => setColorName(c.name)} />
            ))}
          </div>
          <div className="buy-row">
            <div className="qty" role="group" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(10, q + 1))}>+</button>
            </div>
            <button className="btn primary" type="button" disabled={buyState === "saving"} onClick={() => handleCart(true)}>{labels("Buy Now")[buyState]}</button>
            <button className="btn" type="button" disabled={addState === "saving"} onClick={() => handleCart(false)}>{labels("Add to Cart")[addState]}</button>
          </div>
          <div className="perks">
            <div className="perk">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11" /><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2" /><circle cx="7" cy="18" r="2" /><path d="M9 18h6" /><circle cx="17" cy="18" r="2" /></svg></span>
              <div><strong>Free Delivery</strong><span>Enter your postal code for delivery availability</span></div>
            </div>
            <div className="perk">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg></span>
              <div><strong>Return Delivery</strong><span>Free 30-day returns on unused items</span></div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="r-title">
        <h2 className="section-title" id="r-title">You May Also Like</h2>
        <div className="grid">{related.map((x) => <ProductCard key={x.id} product={x} />)}</div>
      </section>
    </div>
  );
}
