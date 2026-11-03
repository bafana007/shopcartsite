import { createClient } from "@supabase/supabase-js";

// Project Settings > API: Project URL and the anon / publishable key.
// The anon key is safe in the browser ONLY because Row Level Security is on.
// Never put the service_role key in this site.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel > Settings > Environment Variables.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY environment variables.");

export let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("Supabase initialization failed; using the built-in catalog:", error);
  }
}
const BUCKET = "product-images";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

// One-time (per browser) sign-in to Supabase for write access.
// Firebase still handles the site's own login; this is only for catalog/image writes.
async function ensureAdminSession() {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (data.session) return;
  const email = window.prompt("Supabase admin email:");
  const password = email && window.prompt("Supabase admin password:");
  if (!email || !password) throw new Error("Supabase sign-in cancelled.");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function readProducts() {
  const { data, error } = await requireSupabase().from("products").select("*").order("id");
  if (error) throw error;
  return data;
}

export function watchProducts(onUpdate, onError) {
  const client = supabase;
  const load = () => readProducts().then(onUpdate).catch(onError);
  load();
  if (!client) return () => {};
  const channel = client
    .channel("products-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
    .subscribe();
  return () => client.removeChannel(channel);
}

export async function uploadProductImage(file) {
  await ensureAdminSession();
  const client = requireSupabase();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw error;
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Same call shape as the old Firebase helpers, so admin.js barely changes.
export async function writeProduct(product) {
  await ensureAdminSession();
  const client = requireSupabase();
  const { id, ...fields } = product;
  const row = { ...fields, updated_at: new Date().toISOString() };
  const { error } = id == null
    ? await client.from("products").insert(row)
    : await client.from("products").upsert({ id, ...row });
  if (error) throw error;
}

export async function deleteProduct(id) {
  await ensureAdminSession();
  const { error } = await requireSupabase().from("products").delete().eq("id", id);
  if (error) throw error;
}
