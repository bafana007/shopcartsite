import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  endUserSession,
  isAdminAccount,
  readUserData,
  signOutAccount,
  startUserSession,
  touchUserSession,
  trackPageView,
  watchAuth,
  writeUserData,
  writeUserText,
} from "../lib/firebase.js";
import { useLocation } from "react-router-dom";

const AuthContext = createContext(null);

function getTabSessionId(uid) {
  const key = `shopcart:session:${uid}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
  } catch { /* ignore */ }
  const id = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(key, id); } catch { /* ignore */ }
  return id;
}
function clearTabSessionId(uid) {
  try { sessionStorage.removeItem(`shopcart:session:${uid}`); } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfileState] = useState({});
  const [loading, setLoading] = useState(true);
  const session = useRef({ uid: null, id: null });
  const location = useLocation();

  useEffect(() => {
    const stop = watchAuth(async (user) => {
      const prev = session.current;
      if (prev.uid && (!user || user.uid !== prev.uid)) {
        endUserSession(prev.uid, prev.id).catch((e) => console.error("Could not end previous user session:", e));
        clearTabSessionId(prev.uid);
        session.current = { uid: null, id: null };
      }

      setAuthUser(user);
      if (!user) {
        setIsAdmin(false);
        setProfileState({});
        setLoading(false);
        return;
      }

      setLoading(true); // hold route guards until the admin flag and profile are loaded
      const id = getTabSessionId(user.uid);
      session.current = { uid: user.uid, id };
      startUserSession(user.uid, id).catch((e) => console.error("Could not create user session:", e));

      const [admin, remote] = await Promise.all([
        isAdminAccount(user.uid).catch((e) => { console.error("Could not verify administrator access:", e); return false; }),
        readUserData(user.uid).catch((e) => { console.error("Could not load account data:", e); return null; }),
      ]);
      setIsAdmin(admin);
      setProfileState(remote?.profile || {});
      setLoading(false);
    });
    return stop;
  }, []);

  // Keep the per-tab session alive when the tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      const { uid, id } = session.current;
      if (!document.hidden && uid && id) {
        touchUserSession(uid, id).catch((e) => console.error("Could not update user session:", e));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Page-view tracking for signed-in users (replaces the old per-page script)
  useEffect(() => {
    if (!authUser) return;
    trackPageView(authUser.uid, location.pathname, document.referrer || "direct")
      .catch((e) => console.warn("Could not record page view:", e));
  }, [authUser, location.pathname]);

  const user = useMemo(() => (authUser ? {
    uid: authUser.uid,
    email: authUser.email,
    name: profile.name || authUser.displayName || authUser.email?.split("@")[0] || "Shopcart user",
    lastSignInTime: authUser.metadata?.lastSignInTime,
  } : null), [authUser, profile.name]);

  const setProfile = useCallback((next) => setProfileState((p) => ({ ...p, ...next })), []);

  const signOutCurrentUser = useCallback(async () => {
    const { uid, id } = session.current;
    if (uid && id) {
      try { await endUserSession(uid, id); } catch (e) { console.error("Could not end user session:", e); }
      clearTabSessionId(uid);
      session.current = { uid: null, id: null };
    }
    await signOutAccount();
  }, []);

  const saveProfile = useCallback(async (fields) => {
    if (!authUser) return;
    const next = { ...profile, ...fields };
    await writeUserData(authUser.uid, { profile: next });
    await writeUserText(authUser.uid, next).catch((e) => console.error("Could not save profile text:", e));
    setProfileState(next);
  }, [authUser, profile]);

  const value = useMemo(() => ({
    user, authUser, isAdmin, profile, loading, setProfile, saveProfile, signOutCurrentUser,
  }), [user, authUser, isAdmin, profile, loading, setProfile, saveProfile, signOutCurrentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

