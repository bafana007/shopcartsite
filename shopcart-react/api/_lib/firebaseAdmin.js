// Firebase Admin SDK, initialised from Vercel environment variables.
// The service-account JSON must NEVER be committed or bundled into the browser app.
import admin from "firebase-admin";

export function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set.");
    let credential;
    try {
      credential = JSON.parse(raw);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file, from { to }.");
    }
    // Some dashboards turn the \n inside the private key into literal backslash-n text.
    if (typeof credential.private_key === "string") {
      credential.private_key = credential.private_key.replace(/\\n/g, "\n");
    }
    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    if (!databaseURL) throw new Error("FIREBASE_DATABASE_URL is not set.");
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      databaseURL,
    });
  }
  return admin;
}
