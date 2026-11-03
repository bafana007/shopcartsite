import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useShop } from "../context/ShopContext.jsx";
import { imgSrc } from "../lib/catalog.js";
import Price from "./Price.jsx";
import Stars from "./Stars.jsx";

export default function ProductCard({ product: p }) {
  const { wishlist, toggleWish, addToCart, toast } = useShop();
  const wished = wishlist.includes(p.id);
  const [status, setStatus] = useState("idle"); // idle | saving | added | error
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleAdd() {
    setStatus("saving");
    try {
      const result = await addToCart(p.id, 1, p.color);
      setStatus("added");
      toast(result.databaseSaved ? "Cart saved to your account" : "Added on this device. Sign in to sync your cart.");
    } catch (error) {
      console.error("Could not add item to cart:", error);
      setStatus("error");
    } finally {
      timer.current = setTimeout(() => setStatus("idle"), 1600);
    }
  }

  const label = { idle: "Add to Cart", saving: "Saving…", added: "Added", error: "Try Again" }[status];

  return (
    <article className="card">
      <div className="card-img">
        <Link to={`/product/${p.id}`} aria-label={`View ${p.name}`}>
          <img src={imgSrc(p.image)} alt={p.name} loading="lazy" />
        </Link>
        <button
          className="wish"
          type="button"
          aria-label={`Add ${p.name} to wishlist`}
          aria-pressed={wished}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWish(p.id); }}
        >
          <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.7 1.1 5.6 3.2C13.9 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.500 16.400 12 21 12 21z" /></svg>
        </button>
      </div>
      <div className="card-row">
        <Link to={`/product/${p.id}`}>{p.name}</Link>
        <span className="price"><Price value={p.price} /></span>
      </div>
      <p className="card-desc">{p.desc}</p>
      <div className="stars"><Stars rating={p.rating} reviews={p.reviews} /></div>
      <button
        className={`btn add${status === "added" ? " added" : ""}`}
        type="button"
        disabled={status === "saving" || status === "added"}
        onClick={handleAdd}
      >
        {label}
      </button>
    </article>
  );
}
