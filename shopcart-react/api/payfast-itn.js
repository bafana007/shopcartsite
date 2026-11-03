// POST /api/payfast-itn   Called by PayFast's servers when a payment changes state.
// This is the only place an order becomes "confirmed". The browser's return page proves nothing.
import { getAdmin } from "./_lib/firebaseAdmin.js";
import { pfEncode, safeEqual, signature, validateUrl } from "./_lib/payfast.js";

const CONFIRMED_PROGRESS = 35; // matches the "Confirmed" step in the order tracker

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length) return Buffer.concat(chunks).toString("utf8");
  // Some runtimes parse the body before the handler runs.
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return new URLSearchParams(req.body).toString();
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Use POST.");
  const { PAYFAST_MERCHANT_ID: merchantId, PAYFAST_PASSPHRASE: passphrase } = process.env;
  if (!merchantId) { console.error("PAYFAST_MERCHANT_ID is not set."); return res.status(500).send("Not configured."); }

  try {
    const entries = [...new URLSearchParams(await rawBody(req)).entries()];
    if (!entries.length) return res.status(400).send("Empty request.");
    const data = Object.fromEntries(entries);
    const unsigned = entries.filter(([key]) => key !== "signature");

    // 1. The signature must match (proves the data was not altered).
    if (!data.signature || !safeEqual(signature(unsigned, passphrase, { forRequest: false }), data.signature)) {
      console.warn("ITN rejected: bad signature");
      return res.status(400).send("Bad signature.");
    }

    // 2. It must be for our merchant account.
    if (data.merchant_id !== merchantId) { console.warn("ITN rejected: wrong merchant"); return res.status(400).send("Wrong merchant."); }

    // 3. PayFast itself must confirm it sent this data.
    const check = await fetch(validateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: unsigned.map(([key, value]) => `${key}=${pfEncode(value)}`).join("&"),
    });
    if (!check.ok || (await check.text()).trim() !== "VALID") { console.warn("ITN rejected: PayFast did not confirm it"); return res.status(400).send("Not confirmed."); }

    // 4. It must be for a real order, for the amount we asked for.
    const orderId = String(data.m_payment_id || "");
    if (!/^[-\w]{1,40}$/.test(orderId)) return res.status(400).send("Bad order.");
    const orderRef = getAdmin().database().ref(`orders/${orderId}`);
    const order = (await orderRef.get()).val();
    if (!order || order.paymentMethod !== "payfast") return res.status(400).send("Unknown order.");
    if (!Number.isFinite(order.payfastAmount) || Math.abs(Number(data.amount_gross) - order.payfastAmount) > 0.01) {
      console.warn(`ITN rejected: amount ${data.amount_gross} does not match order ${orderId}`);
      return res.status(400).send("Amount mismatch.");
    }

    // 5. Only a COMPLETE payment confirms the order, and only if it is still pending.
    const status = String(data.payment_status || "");
    const updates = { paymentStatus: status.slice(0, 20) };
    if (status === "COMPLETE" && (order.status || "pending") === "pending") {
      Object.assign(updates, {
        status: "confirmed",
        progress: CONFIRMED_PROGRESS,
        statusUpdatedAt: Date.now(),
        payfastPaymentId: String(data.pf_payment_id || "").slice(0, 40),
      });
    }
    await orderRef.update(updates);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("payfast-itn failed:", error);
    return res.status(500).send("Error."); // PayFast retries on a non-200 response
  }
}
