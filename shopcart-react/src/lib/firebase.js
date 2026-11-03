import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  getDatabase,
  onDisconnect,
  ref,
  serverTimestamp as databaseServerTimestamp,
  set,
  update,
  get,
  push,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  onValue,
} from "firebase/database";

const env = import.meta.env;
// Client configuration comes from VITE_FIREBASE_* variables (Vercel > Settings > Environment Variables, or a local .env).
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};
if (!firebaseConfig.apiKey) console.error("Missing VITE_FIREBASE_* environment variables.");

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase initialization failed; running without Firebase backend:", e.message);
  app = null;
  auth = null;
  db = null;
}
export { auth };
const ORDER_PROGRESS = {
  pending: 10,
  confirmed: 35,
  shipped: 70,
  delivered: 100,
  cancelled: 0,
  refunded: 0,
};

export function getOrderProgress(status) {
  return ORDER_PROGRESS[String(status || "pending").toLowerCase()] ?? 10;
}

const authPersistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn("Could not enable local auth persistence:", error);
    })
  : Promise.resolve();

isSupported().then((supported) => {
  if (supported && app) getAnalytics(app);
}).catch(() => {});

export function watchAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

function requireAuth() {
  if (!auth) {
    const error = new Error("Firebase Authentication is unavailable. Check the VITE_FIREBASE_* environment variables.");
    error.code = "auth/invalid-api-key";
    throw error;
  }
  return auth;
}

export async function registerAccount(name, email, password) {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName: name }).catch((error) => {
    console.warn("Could not set the Auth display name:", error);
  });
  return credential.user;
}

export function signInAccount(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export function signOutAccount() {
  return signOut(auth);
}

// All user data now stored in Realtime Database under /users/{uid}
export async function readUserData(uid) {
  const snapshot = await get(ref(db, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export function writeUserData(uid, data) {
  const updates = {
    ...data,
    updatedAt: databaseServerTimestamp(),
  };
  return update(ref(db, `users/${uid}`), updates);
}

// Product catalog stored in Realtime Database
export async function readProducts() {
  const snapshot = await get(ref(db, "products"));
  if (!snapshot.exists()) return [];
  const products = [];
  snapshot.forEach((child) => {
    const val = child.val();
    if (val && typeof val.id === "number" && val.name && typeof val.price === "number") {
      products.push({ ...val, id: Number(child.key) || val.id });
    }
  });
  return products;
}

export function watchProducts(onUpdate, onError) {
  return onValue(ref(db, "products"), (snapshot) => {
    const products = [];
    snapshot.forEach((child) => {
      const val = child.val();
      if (val && typeof val.id === "number" && val.name && typeof val.price === "number") {
        products.push({ ...val, id: Number(child.key) || val.id });
      }
    });
    onUpdate(products);
  }, onError);
}

export async function writeProduct(product, initialCatalog = []) {
  const id = product.id ?? Date.now();
  const productRef = ref(db, "products");
  const snapshot = await get(productRef);
  const productData = {
    ...product,
    id,
    updatedAt: databaseServerTimestamp(),
  };

  if (snapshot.exists()) return set(ref(db, `products/${id}`), productData);

  const products = Object.fromEntries(initialCatalog.map((item) => [item.id, {
    ...item,
    updatedAt: databaseServerTimestamp(),
  }]));
  products[id] = productData;
  return update(productRef, products);
}

export async function deleteProduct(id, initialCatalog = []) {
  const productRef = ref(db, "products");
  const snapshot = await get(productRef);
  if (snapshot.exists()) return set(ref(db, `products/${id}`), null);

  const products = Object.fromEntries(initialCatalog
    .filter((product) => String(product.id) !== String(id))
    .map((product) => [product.id, {
      ...product,
      updatedAt: databaseServerTimestamp(),
    }]));
  return update(productRef, products);
}

// Orders stored in Realtime DB
export function writeOrder(order) {
  const orderRef = push(ref(db, "orders"));
  return set(orderRef, {
    ...order,
    status: order.status || "pending",
    progress: getOrderProgress(order.status),
    createdAt: databaseServerTimestamp(),
  }).then(() => orderRef.key);
}

export async function trackOrder(identifier) {
  // Search by userId (if identifier is uid) or by orderId
  const isUid = identifier.length > 10 && !identifier.includes("@");
  let snapshot;
  if (isUid) {
    snapshot = await get(query(ref(db, "orders"), orderByChild("userId"), equalTo(identifier)));
  } else if (identifier.includes("@")) {
    snapshot = await get(query(ref(db, "orders"), orderByChild("customerEmail"), equalTo(identifier)));
  } else {
    // Try direct order ID lookup
    const orderSnap = await get(ref(db, `orders/${identifier}`));
    if (orderSnap.exists()) return [{ id: identifier, ...orderSnap.val() }];
    return [];
  }
  const orders = [];
  snapshot.forEach((child) => {
    orders.push({ id: child.key, ...child.val() });
  });
  // Sort by createdAt descending
  return orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function watchUserOrders(uid, onUpdate, onError) {
  const ordersQuery = query(ref(db, "orders"), orderByChild("userId"), equalTo(uid));
  return onValue(ordersQuery, (snapshot) => {
    const orders = [];
    snapshot.forEach((child) => {
      orders.push({ id: child.key, ...child.val() });
    });
    onUpdate(orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  }, onError);
}

// User profile text in Realtime DB
export function writeUserText(uid, fields) {
  const profile = {};
  for (const key of ["name", "email", "address"]) {
    if (typeof fields[key] === "string") profile[key] = fields[key].trim();
  }
  profile.updatedAt = databaseServerTimestamp();
  return update(ref(db, `users/${uid}/profile`), profile);
}

// Admin check in Realtime DB
export async function isAdminAccount(uid) {
  const snapshot = await get(ref(db, `admins/${uid}`));
  return snapshot.val() === true;
}

// User sessions in Realtime DB
export async function startUserSession(uid, sessionId) {
  const sessionRef = ref(db, `userSessions/${uid}/${sessionId}`);
  const existing = await get(sessionRef);
  if (existing.exists()) {
    await update(sessionRef, {
      lastSeenAt: databaseServerTimestamp(),
      endedAt: null,
    });
  } else {
    await set(sessionRef, {
      startedAt: databaseServerTimestamp(),
      lastSeenAt: databaseServerTimestamp(),
    });
  }
  await onDisconnect(sessionRef).update({ endedAt: databaseServerTimestamp() });
}

export function touchUserSession(uid, sessionId) {
  return update(ref(db, `userSessions/${uid}/${sessionId}`), {
    lastSeenAt: databaseServerTimestamp(),
  });
}

export async function endUserSession(uid, sessionId) {
  const sessionRef = ref(db, `userSessions/${uid}/${sessionId}`);
  await onDisconnect(sessionRef).cancel();
  return update(sessionRef, { endedAt: databaseServerTimestamp() });
}

function sanitizeUserInput(value, depth = 0) {
  if (depth > 5) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeUserInput(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(password|passwd|secret|token|card(number)?|cvv|cvc)/i.test(key))
      .slice(0, 50)
      .map(([key, child]) => [key, sanitizeUserInput(child, depth + 1)]));
  }
  return null;
}

// Track user activity/input in Realtime DB
export function trackUserInput(uid, inputType, data) {
  const inputRef = push(ref(db, `userInputs/${uid}`));
  return set(inputRef, {
    type: inputType,
    data: sanitizeUserInput(data),
    timestamp: databaseServerTimestamp(),
  });
}

// Store search queries
export function trackSearch(uid, query) {
  return trackUserInput(uid, "search", { query });
}

// Store filter selections
export function trackFilter(uid, filters) {
  return trackUserInput(uid, "filter", { filters });
}

// Store form submissions
export function trackFormSubmission(uid, formName, formData) {
  return trackUserInput(uid, "form_submission", { formName, formData });
}

// Store page views
export function trackPageView(uid, page, referrer) {
  return trackUserInput(uid, "page_view", { page, referrer });
}

// Admin functions
export async function getAllUsers() {
  const snapshot = await get(ref(db, "users"));
  const users = [];
  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      const val = child.val();
      users.push({ uid: child.key, ...val });
    });
  }
  return users;
}

export async function getAllAdmins() {
  const snapshot = await get(ref(db, "admins"));
  const admins = [];
  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      if (child.val() === true) admins.push(child.key);
    });
  }
  return admins;
}

export async function getAllOrders() {
  const snapshot = await get(ref(db, "orders"));
  const orders = [];
  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      orders.push({ id: child.key, ...child.val() });
    });
  }
  return orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function watchAdminData(onUpdate, onError) {
  const data = { users: {}, orders: {}, admins: {} };
  const loaded = new Set();
  const subscriptions = Object.keys(data).map((path) => onValue(ref(db, path), (snapshot) => {
    data[path] = snapshot.val() || {};
    loaded.add(path);
    if (loaded.size === Object.keys(data).length) onUpdate({ ...data });
  }, onError));

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export function watchUserActivity(uid, onUpdate, onError) {
  const activityQuery = query(ref(db, `userInputs/${uid}`), orderByChild("timestamp"), limitToLast(100));
  return onValue(activityQuery, (snapshot) => {
    const activities = [];
    snapshot.forEach((child) => activities.push({ id: child.key, ...child.val() }));
    onUpdate(activities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
  }, onError);
}

export async function updateOrderStatus(orderId, status) {
  return update(ref(db, `orders/${orderId}`), {
    status,
    progress: getOrderProgress(status),
    statusUpdatedAt: databaseServerTimestamp(),
  });
}

export async function suspendUser(uid, suspended = true) {
  return update(ref(db, `users/${uid}`), {
    suspended,
    suspendedAt: suspended ? databaseServerTimestamp() : null,
  });
}

export async function deleteUser(uid) {
  const updates = {};
  updates[`users/${uid}`] = null;
  updates[`userSessions/${uid}`] = null;
  updates[`userInputs/${uid}`] = null;
  const ordersSnap = await get(query(ref(db, "orders"), orderByChild("userId"), equalTo(uid)));
  ordersSnap.forEach((child) => {
    updates[`orders/${child.key}`] = null;
  });
  return update(ref(db), updates);
}

export async function setAdmin(uid, isAdmin = true) {
  return set(ref(db, `admins/${uid}`), isAdmin ? true : null);
}

export async function getUserActivity(uid) {
  const snapshot = await get(query(ref(db, `userInputs/${uid}`), orderByChild("timestamp"), limitToLast(100)));
  const activities = [];
  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      activities.push({ id: child.key, ...child.val() });
    });
  }
  return activities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export { updateEmail, updatePassword };
