import { useShop } from "../context/ShopContext.jsx";

/* Price with superscript decimals, as used on product cards */
export default function Price({ value }) {
  const { formatMoney } = useShop();
  const f = formatMoney(value);
  return <>{f.symbol}{f.int}<sup>.{f.dec}</sup></>;
}
