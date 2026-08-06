import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  auth,
  fetchUser,
  saveUser,
  onAuthStateChanged,
  signOut as fbSignOut,
  db,
  ref,
  onValue,
} from "@/lib/firebase";

// ── Gym contract tier ─────────────────────────────────────────────────────────
// This can ONLY be set by a gym admin, once a physical/signed contract exists.
// It is NEVER defaulted or auto-assigned by the app — that's the whole point:
// the app has no way of knowing a contract was signed, only the gym does.
// `undefined` means "no gym contract on file yet" — NOT "basic tier".
export type GymMembershipTier =
  | "u18"
  | "hybrid_12m"
  | "hybrid_6m"
  | "hybrid_m2m"
  | "unlimited_12m"
  | "unlimited_6m"
  | "unlimited_m2m";

// ── App subscription tier ─────────────────────────────────────────────────────
// This is self-service, set automatically on signup, and controls app-only
// features (push notifications, community chat, AI credits, PayFast billing
// for app extras). Nothing to do with the gym contract above.
export type AppMembershipTier = "basic" | "silver" | "gold";

export interface MK2User {
  uid: string;
  email: string;
  name: string;
  goal: string;
  level: string;
  color: string;
  workouts: any[];
  bookings: any[];
  weights: any[];
  checkIns: any[];
  points: number;
  createdAt: number;
  /** Gym contract tier. Unset until a gym admin assigns it — see GymMembershipTier. */
  membership?: GymMembershipTier;
  /** App subscription tier. Defaults to "basic" on signup — see AppMembershipTier. */
  appMembership: AppMembershipTier;
  gender?: "male" | "female";
  termsAcceptedAt?: number;
  termsVersion?: string;
  classCredits: number;
  lastGoldTopUp?: string;
  aiCredits: Record<string, number>;
}

const normalizeUser = (data: any): MK2User => ({
  ...data,
  workouts: Array.isArray(data.workouts) ? data.workouts : [],
  bookings: Array.isArray(data.bookings) ? data.bookings : [],
  weights: Array.isArray(data.weights) ? data.weights : [],
  checkIns: Array.isArray(data.checkIns) ? data.checkIns : [],
  points: data.points ?? 0,
  createdAt: data.createdAt ?? Date.now(),
  // Gym contract: leave untouched. Do NOT default this to "basic" or any
  // other value — an unset membership correctly means "no contract yet",
  // and only a gym admin (via the admin panel) should ever set it.
  membership: data.membership ?? undefined,
  // App subscription: this is the one that's safe to default, since it's
  // just the free tier of the app itself, not a gym commitment.
  appMembership: data.appMembership ?? "basic",
  classCredits: data.classCredits ?? 0,
  lastGoldTopUp: data.lastGoldTopUp ?? undefined,
  gender: data.gender ?? undefined,
});

/**
 * True only once a gym admin has assigned a contract tier.
 * Use this — not `!!user.membership` inline — anywhere "is this person
 * a paying gym member" needs to be checked, so the meaning stays obvious
 * at call sites.
 */
export function hasGymContract(user: MK2User | null): boolean {
  return Boolean(user?.membership);
}

interface ToastData {
  msg: string;
  type: string;
  onTap?: () => void;
}

interface AuthContextType {
  user: MK2User | null;
  booting: boolean;
  setUser: (user: MK2User | null) => void;
  updateUser: (user: MK2User) => Promise<void>;
  logout: () => Promise<void>;
  toast: (
    msg: string,
    type?: "success" | "error" | "info",
    onTap?: () => void,
  ) => void;
  toastData: ToastData | null;
  clearToast: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MK2User | null>(null);
  const [booting, setBooting] = useState(true);
  const [toastData, setToastData] = useState<ToastData | null>(null);

  // ── Auth state listener ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const data = await fetchUser(fbUser.uid);
        if (data) {
          const normalized = normalizeUser(data);
          setUser(normalized);
          // Backfill: if this record predates appMembership (or is a brand
          // new signup doc that never went through normalizeUser before),
          // persist the normalized shape once so the admin panel and any
          // direct DB reads see appMembership immediately, not just this
          // in-memory session. This never touches `membership` — only
          // fields that are safe to auto-fill.
          if (data.appMembership === undefined) {
            saveUser(fbUser.uid, normalized).catch(() => {});
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setBooting(false);
    });
    return () => unsub();
  }, []);

  // ── Real-time aiQuota listener ────────────────────────────────────────────
  // Keeps the quota display in sync across all AI screens without needing
  // a full user reload after each call. Patches only aiQuota on the user
  // object so nothing else is disrupted.
  useEffect(() => {
    if (!user?.uid) return;
    const quotaRef = ref(db, `mk2_users/${user.uid}/aiQuota`);
    const unsub = onValue(quotaRef, (snap) => {
      const aiQuota = snap.val();
      setUser((prev) => {
        if (!prev) return prev;
        // Only update if the value actually changed to avoid unnecessary renders
        const prevQuota = (prev as any).aiQuota;
        if (
          prevQuota?.used === aiQuota?.used &&
          prevQuota?.month === aiQuota?.month
        ) {
          return prev;
        }
        return { ...prev, aiQuota };
      });
    });
    return () => unsub();
  }, [user?.uid]);

  const updateUser = useCallback(async (u: MK2User) => {
    const normalized = normalizeUser(u);
    await saveUser(u.uid, normalized);
    setUser(normalized);
  }, []);

  const logout = useCallback(async () => {
    await fbSignOut(auth);
    setUser(null);
  }, []);

  const toast = useCallback(
    (msg: string, type: string = "info", onTap?: () => void) => {
      setToastData({ msg, type, onTap });
    },
    [],
  );

  const clearToast = useCallback(() => setToastData(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        booting,
        setUser,
        updateUser,
        logout,
        toast,
        toastData,
        clearToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

