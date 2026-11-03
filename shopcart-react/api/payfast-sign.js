// POST /api/payfast-sign   { orderId }   Authorization: Bearer <Firebase ID token>
// Checks the order, then returns the signed fields the browser posts to PayFast.
import { getAdmin } from "./_lib/firebaseAdmin.js";
import { processUrl, signature, siteUrl, verifyOrderTotal, zarAmount } from "./_lib/payfast.js";

const MIN_ZAR = 5; // PayFast's minimum payment

function bodyOf(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body || {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const { PAYFAST_MERCHANT_ID: merchantId, PAYFAST_MERCHANT_KEY: merchantKey, PAYFAST_PASSPHRASE: passphrase } = process.env;
  if (!merchantId || !merchantKey) {
    console.error("PayFast environment variables are missing.");
    return res.status(500).json({ error: "PayFast is not set up on the server yet." });
  }

  try {
    const admin = getAdmin();

    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Please sign in and try again." });
    let uid;
    try { uid = (await admin.auth().verifyIdToken(token)).uid; }
    catch { return res.status(401).json({ error: "Your session has expired. Please sign in again." }); }

    const { orderId } = bodyOf(req);
    if (typeof orderId !== "string" || !/^[-\w]{1,40}$/.test(orderId)) return res.status(400).json({ error: "Missing order." });

    const orderRef = admin.database().ref(`orders/${orderId}`);
    const order = (await orderRef.get()).val();
    if (!order || order.userId !== uid) return res.status(404).json({ error: "Order not found." });
    if (order.paymentMethod !== "payfast") return res.status(400).json({ error: "This order was not placed with PayFast." });
    if ((order.status || "pending") !== "pending") return res.status(409).json({ error: "This order has already been paid or closed." });

    const check = await verifyOrderTotal(order);
    if (!check.ok) return res.status(409).json({ error: check.error });
    const amount = zarAmount(check.total);
    if (Number(amount) < MIN_ZAR) return res.status(400).json({ error: `PayFast needs a payment of at least R${MIN_ZAR}.` });

    // Remember what we asked PayFast for, so the confirmation can be checked against it.
    await orderRef.update({ payfastAmount: Number(amount) });

    const base = siteUrl(req);
    const [first = "", ...rest] = String(order.customerName || "").trim().split(/\s+/);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerEmail || "") ? order.customerEmail : "";

    // PayFast signs fields in exactly this order, so the browser must post them in it too.
    const fields = [
      ["merchant_id", merchantId],
      ["merchant_key", merchantKey],
      ["return_url", `${base}/checkout?payfast=success`],
      ["cancel_url", `${base}/checkout?payfast=cancelled`],
      ["notify_url", `${base}/api/payfast-itn`],
      ["name_first", first.slice(0, 100)],
      ["name_last", rest.join(" ").slice(0, 100)],
      ["email_address", email],
      ["m_payment_id", orderId],
      ["amount", amount],
      ["item_name", `Shopcart order ${orderId}`.slice(0, 100)],
    ].filter(([, v]) => String(v).trim() !== "");

    fields.push(["signature", signature(fields, passphrase, { forRequest: true })]);
    return res.status(200).json({ action: processUrl(), fields });
  } catch (error) {
    console.error("payfast-sign failed:", error);
    return res.status(500).json({ error: "Could not start the PayFast payment. Please try again." });
  }
}
