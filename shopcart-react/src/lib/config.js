// PayPal Client ID (developer.paypal.com > Apps & Credentials). Public by design.
// NEVER put the PayPal Secret in this app. Use the Sandbox ID while testing.
// Set VITE_PAYPAL_CLIENT_ID in Vercel > Settings > Environment Variables (or a local .env file).
export const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;
if (!PAYPAL_CLIENT_ID) console.error("Missing VITE_PAYPAL_CLIENT_ID environment variable.");

// PayPal cannot receive South African rand and catalog prices are stored in USD,
// so PayPal payments are charged in US dollars.
export const PAYPAL_CURRENCY = "USD";
