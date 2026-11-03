import { auth } from "./firebase.js";

/**
 * Asks our server for a signed PayFast payment, then sends the browser to PayFast.
 * Card details are entered on PayFast's own page, never on this site.
 */
export async function startPayfastPayment(orderId) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again to pay.");

  let res;
  try {
    res = await fetch("/api/payfast-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    throw new Error("Could not reach the payment server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && !data.error) throw new Error("The payment server was not found. Locally, run the site with `vercel dev` instead of `npm run dev`.");
  if (!res.ok) throw new Error(data.error || "Could not start the PayFast payment.");

  const form = document.createElement("form");
  form.method = "POST";
  form.action = data.action;
  for (const [name, value] of data.fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
