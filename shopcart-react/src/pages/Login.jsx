import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import {
  isAdminAccount,
  registerAccount,
  setAdmin,
  signInAccount,
  signOutAccount,
  trackFormSubmission,
  writeUserText,
} from "../lib/firebase.js";

/* Only allow redirects to routes inside this app */
const safeNext = (value) => (value && value.startsWith("/") && !value.startsWith("//") ? value : null);

const SIGNIN_ERRORS = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Authentication.",
  "auth/invalid-api-key": "Firebase Authentication is not configured correctly. Check the VITE_FIREBASE_* values in your environment settings, then restart or redeploy the app.",
  "auth/api-key-not-valid": "Firebase Authentication is not configured correctly. Check the VITE_FIREBASE_* values in your environment settings, then restart or redeploy the app.",
};
const SIGNUP_ERRORS = {
  "auth/email-already-in-use": "An account already uses this email. Sign in instead.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Authentication.",
  "auth/configuration-not-found": "Firebase Authentication is not configured for this project.",
  "auth/unauthorized-domain": "Add this site host to Firebase Authentication's authorized domains.",
  "auth/network-request-failed": "Firebase could not connect. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a while, then try again.",
  "auth/invalid-api-key": "The Firebase API key is invalid. Check the project configuration.",
};

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin, signOutCurrentUser } = useAuth();
  const { toast } = useShop();

  const adminMode = params.get("mode") === "admin";
  const adminRequest = params.get("adminRequest") === "true";
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const creating = !adminMode && mode === "signup";

  const [signin, setSignin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState({ name: "", email: "", password: "" });
  const [signinNote, setSigninNote] = useState("Your password is handled securely by Firebase Authentication.");
  const [signupNote, setSignupNote] = useState("Your password is handled securely by Firebase Authentication.");

  useEffect(() => { if (params.get("mode") === "signup") setMode("signup"); }, [params]);

  const showAccount = !!user && (!adminMode || isAdmin);

  async function handleSignin(e) {
    e.preventDefault();
    const email = signin.email.trim();
    const { password } = signin;
    if (!email || !password) { setSigninNote("Enter your email and password."); return; }
    setSigninNote(adminMode ? "Verifying administrator account..." : "Signing in...");
    try {
      const credential = await signInAccount(email, password);
      if (adminMode) {
        let authorized = false;
        try {
          authorized = await isAdminAccount(credential.user.uid);
          if (!authorized && credential.user.email?.toLowerCase() === "admin@gmail.com") {
            await setAdmin(credential.user.uid, true);
            authorized = await isAdminAccount(credential.user.uid);
          }
        } catch (adminCheckError) {
          console.error("Could not read administrator access marker:", adminCheckError);
          await signOutCurrentUser().catch(() => {});
          const details = `${adminCheckError?.code || ""} ${adminCheckError?.message || ""}`.toLowerCase();
          setSigninNote(details.includes("permission")
            ? "Realtime Database denied the admin lookup. Publish database.rules.json and verify the database URL."
            : "Could not reach Realtime Database. Check that it is enabled and the configured database URL is correct.");
          return;
        }
        if (!authorized) {
          await signOutCurrentUser().catch(() => {});
          setSigninNote("This account is not authorized. An existing administrator must approve it.");
          return;
        }
      }
      const profileName = credential.user.displayName || email.split("@")[0];
      await writeUserText(credential.user.uid, { name: profileName, email: credential.user.email || email })
        .catch((error) => console.error("Could not save profile text to Realtime Database:", error));
      trackFormSubmission(credential.user.uid, "signin", { email, adminMode }).catch(() => {});
      const admin = await isAdminAccount(credential.user.uid).catch(() => false);
      navigate(next || (admin ? "/admin" : "/shop"));
    } catch (error) {
      setSigninNote(SIGNIN_ERRORS[error.code] || (adminMode
        ? "Could not verify administrator access. Check Realtime Database setup and rules."
        : "Could not authenticate. Check your connection and Firebase settings."));
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const name = signup.name.trim();
    const email = signup.email.trim();
    const { password } = signup;
    if (!name || !email || !password) { setSignupNote("Enter your name, email, and password."); return; }
    const bootstrapAdmin = adminRequest && email.toLowerCase() === "admin@gmail.com";
    if (email.toLowerCase() === "admin@gmail.com" && !bootstrapAdmin) {
      setSignupNote("This administrator account must be created by the Firebase project owner.");
      return;
    }
    setSignupNote("Creating your account...");
    try {
      const created = await registerAccount(name, email, password);
      await writeUserText(created.uid, { name, email: created.email || email })
        .catch((error) => console.error("Could not save profile text to Realtime Database:", error));
      if (bootstrapAdmin) {
        await setAdmin(created.uid, true);
        navigate("/admin");
        return;
      }
      trackFormSubmission(created.uid, "signup", { name, email }).catch(() => {});
      if (adminRequest) {
        await signOutAccount();
        setSignupNote("Account created and profile saved. An existing administrator must approve access before you can open the dashboard.");
        return;
      }
      navigate(next || "/shop");
    } catch (error) {
      console.error("Could not create account:", error);
      const details = String(error?.message || error || "No error details returned").slice(0, 180);
      setSignupNote(SIGNUP_ERRORS[error?.code]
        || `Could not create the account (${error?.code || details}). Check your connection and Firebase settings.`);
    }
  }

  return (
    <main className="container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Sign in</span></nav>
      <div className="auth">
        <section aria-label="Account access">
          <div className={`auth-slider${creating ? " signup-mode" : ""}${adminMode ? " admin-mode" : ""}`}>
            <input className="auth-mode-input" id="auth-mode-signin" type="radio" name="auth-mode" value="signin" checked={!creating} onChange={() => setMode("signin")} />
            <input className="auth-mode-input" id="auth-mode-signup" type="radio" name="auth-mode" value="signup" checked={creating} onChange={() => setMode("signup")} />
            {!showAccount && (
            <div className="auth-mode-switch">
              <span className="auth-mode-indicator" aria-hidden="true" />
              <label className="auth-mode-button" htmlFor="auth-mode-signin">Sign in</label>
              <label className="auth-mode-button" htmlFor="auth-mode-signup">Create account</label>
            </div>
            )}

            {!showAccount && (
            <div className="auth-forms">
              <section className="auth-form auth-signin" aria-labelledby="signin-title" aria-hidden={creating}>
                <h2 id="signin-title">{adminMode ? "Administrator sign in" : "Welcome back"}</h2>
                <p className="sub">{adminMode ? "Sign in with an authorized administrator account." : "Sign in to sync your cart, wishlist, and orders."}</p>
                <form onSubmit={handleSignin} noValidate inert={creating ? "" : undefined}>
                  <label className="field"><span>Email</span>
                    <input type="email" placeholder="you@example.com" autoComplete="email" required value={signin.email} onChange={(e) => setSignin({ ...signin, email: e.target.value })} /></label>
                  <label className="field"><span>Password</span>
                    <input type="password" placeholder="Your password" autoComplete="current-password" required value={signin.password} onChange={(e) => setSignin({ ...signin, password: e.target.value })} /></label>
                  <button className="btn primary block" type="submit">Sign in</button>
                  <p className="notice" role="status">{signinNote}</p>
                </form>
                {adminMode && (
                  <p className="auth-admin-link">Need an admin account? <Link to="/login?mode=signup&adminRequest=true">Create admin account</Link></p>
                )}
              </section>

              <section className="auth-form auth-signup" aria-labelledby="signup-title" aria-hidden={!creating}>
                <h2 id="signup-title">Create account</h2>
                <p className="sub">A Shopcart account keeps your cart and wishlist in sync.</p>
                {adminRequest && <p className="notice">Demo mode: registering admin@gmail.com grants administrator access immediately. Do not use this shortcut in production.</p>}
                <form onSubmit={handleSignup} noValidate inert={!creating ? "" : undefined}>
                  <label className="field"><span>Name</span>
                    <input type="text" placeholder="Your name" autoComplete="name" required value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} /></label>
                  <label className="field"><span>Email</span>
                    <input type="email" placeholder="you@example.com" autoComplete="email" required value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} /></label>
                  <label className="field"><span>Password</span>
                    <input type="password" placeholder="At least 6 characters" autoComplete="new-password" required value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} /></label>
                  <button className="btn primary block" type="submit">Create account</button>
                  <p className="notice" role="status">{signupNote}</p>
                </form>
              </section>
            </div>
            )}
          </div>

          {!showAccount && (
            <p className="auth-admin-link">
              {adminMode
                ? <><span>Customer?</span> <Link to="/login">Return to customer sign in</Link></>
                : <><span>Administrator?</span> <Link to="/login?mode=admin">Sign in here</Link></>}
            </p>
          )}

          {showAccount && (
            <div>
              <h2>Your account</h2>
              <p className="sub">Signed in as <strong>{user.name}</strong>{isAdmin && <span className="role-badge">Admin</span>}</p>
              <div className="session-info">
                <p><strong>Session:</strong> This browser tab is tracked.</p>
                <p><strong>Last sign-in:</strong> <span>{user.lastSignInTime ? new Date(user.lastSignInTime).toLocaleString() : "—"}</span></p>
              </div>
              <Link className="btn primary block" to="/shop">Continue shopping</Link>
              <button className="btn block" type="button" style={{ marginTop: 10 }} onClick={() => signOutCurrentUser().catch((e) => console.error("Could not sign out:", e))}>Sign out</button>
              <button className="btn outline block" type="button" style={{ marginTop: 8 }}
                onClick={() => toast("To sign out of all devices, go to Firebase Console > Authentication > Users > Revoke refresh tokens for this user.", { duration: 4000 })}>
                Sign out everywhere (requires re-auth)
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
