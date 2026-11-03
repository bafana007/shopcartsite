import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { auth, updateEmail, updatePassword } from "../lib/firebase.js";
import { CURRENCIES } from "../lib/catalog.js";

export default function Profile() {
  const { user, profile, loading, saveProfile, signOutCurrentUser } = useAuth();
  const { currency, setCurrency, toast } = useShop();

  const [form, setForm] = useState({ name: "", email: "", address: "", password: "", currency });
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // fill the form once the account data has loaded
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: user.name || "", email: user.email || "", address: profile.address || "", currency }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile.address, user?.name]);

  if (loading) return <main className="container"><p className="notice" style={{ padding: "60px 0" }}>Loading your account…</p></main>;
  if (!user) return <Navigate to="/login" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function handleSave() {
    const name = form.name.trim();
    const email = form.email.trim();
    const address = form.address.trim();
    if (!name || !email) { setNotice("Name and email are required."); return; }
    setNotice("Saving…");
    try {
      await saveProfile({ name, email, address });
      const authUser = auth.currentUser;
      if (authUser && email !== authUser.email) await updateEmail(authUser, email);
      if (form.password) await updatePassword(authUser, form.password);
      setCurrency(CURRENCIES[form.currency] ? form.currency : "ZAR");
      setForm((f) => ({ ...f, password: "" }));
      setNotice("Profile saved.");
      toast("Profile updated");
      setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      console.error("Could not save profile:", error);
      setNotice("Could not save profile. " + (error.message || ""));
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try { await signOutCurrentUser(); }
    catch (error) {
      console.error("Could not sign out:", error);
      setNotice("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <main className="container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>My Profile</span></nav>
      <section className="profile-section" aria-labelledby="profile-title">
        <header className="profile-heading">
          <p className="profile-eyebrow">ACCOUNT</p>
          <h1 id="profile-title">Account settings</h1>
          <p>Manage your profile, delivery details, shopping preferences, and security.</p>
        </header>
        <form className="profile-settings" noValidate onSubmit={(e) => e.preventDefault()}>
          <section className="settings-group" aria-labelledby="profile-details-title">
            <div className="settings-group-heading"><h2 id="profile-details-title">Personal details</h2><p>Your name and sign-in email.</p></div>
            <div className="settings-fields">
              <label className="field"><span>Full Name</span><input type="text" placeholder="Type here" autoComplete="name" required value={form.name} onChange={set("name")} /></label>
              <label className="field"><span>Email Address</span><input type="email" placeholder="you@example.com" autoComplete="email" required value={form.email} onChange={set("email")} /></label>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="delivery-settings-title">
            <div className="settings-group-heading"><h2 id="delivery-settings-title">Delivery</h2><p>Used to prefill checkout.</p></div>
            <div className="settings-fields">
              <label className="field"><span>Default Delivery Address</span><input type="text" placeholder="Street, city, postal code" autoComplete="street-address" value={form.address} onChange={set("address")} /></label>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="shopping-settings-title">
            <div className="settings-group-heading"><h2 id="shopping-settings-title">Shopping preferences</h2><p>Choose how prices appear across Shopcart on this browser.</p></div>
            <div className="settings-fields">
              <label className="field"><span>Display Currency</span>
                <select className="profile-select" value={form.currency} onChange={set("currency")}>
                  {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.label}</option>)}
                </select>
              </label>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="security-settings-title">
            <div className="settings-group-heading"><h2 id="security-settings-title">Security</h2><p>Leave the password blank to keep it unchanged.</p></div>
            <div className="settings-fields">
              <label className="field"><span>New Password</span><input type="password" placeholder="Enter a new password" autoComplete="new-password" value={form.password} onChange={set("password")} /></label>
            </div>
          </section>
          <footer className="profile-settings-footer">
            <p className="notice" role="status">{notice}</p>
            <div className="profile-actions">
              <button className="btn outline" type="button" disabled={signingOut} onClick={handleSignOut}>Sign Out</button>
              <button className="btn primary" type="button" onClick={handleSave}>Save Settings</button>
            </div>
          </footer>
        </form>
      </section>
    </main>
  );
}
