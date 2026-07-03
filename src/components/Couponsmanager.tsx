import { useState, useEffect } from "react";
import { ref, get, set, push, remove, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────
export type CouponType =
  | "massage_20"
  | "clubhouse_10"
  | "padel_30min"
  | "dropin_20";

export type CouponUsageType = "single" | "multi" | "per_member";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  usageType: CouponUsageType;
  description: string;
  terms: string;
  expiresAt: number | null;
  active: boolean;
  createdAt: number;
  createdBy?: string;
  usageCount: number;
  maxUses?: number | null; // null = unlimited for multi-use
  redemptions?: Record<string, CouponRedemption>;
}

export interface CouponRedemption {
  uid: string;
  memberName: string;
  memberEmail: string;
  redeemedAt: number;
  couponCode: string;
  couponType: CouponType;
}

// ── Coupon type metadata ──────────────────────────────────────────────────────
export const COUPON_TYPES: Record<
  CouponType,
  { label: string; icon: string; desc: string; terms: string; color: string }
> = {
  massage_20: {
    label: "20% off Sports Massage",
    icon: "💆",
    desc: "20% off a sports massage with Belinda Visser",
    terms: "Selected items only. No additional discounts can be applied.",
    color: "hsl(263 85% 58%)",
  },
  clubhouse_10: {
    label: "10% off Clubhouse",
    icon: "☕",
    desc: "10% off all food and coffees at the Two Rivers Clubhouse",
    terms: "Selected items only. No additional discounts can be applied.",
    color: "hsl(38 92% 44%)",
  },
  padel_30min: {
    label: "30 min extra Padel",
    icon: "🏓",
    desc: "Extra 30 minutes playtime with free racquet hire at Africa Padel",
    terms: "On site only. Valid at Africa Padel MK2R location.",
    color: "hsl(142 72% 37%)",
  },
  dropin_20: {
    label: "20% off Drop-In Visit",
    icon: "🏋",
    desc: "20% off a drop-in visit at MK2R",
    terms: "Cannot be combined with any other offer or membership discount.",
    color: "hsl(20 100% 50%)",
  },
};

const USAGE_LABELS: Record<CouponUsageType, { label: string; desc: string }> = {
  single: {
    label: "Single-use",
    desc: "One code, one member, used once then expired",
  },
  multi: {
    label: "Multi-use",
    desc: "One code, any member can use it (optionally capped)",
  },
  per_member: {
    label: "Per-member",
    desc: "Each member can use this code once",
  },
};

// ── Shared styles (matches Admin.tsx) ─────────────────────────────────────────
const inp: any = {
  width: "100%",
  background: "hsl(var(--secondary))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  padding: "10px 14px",
  color: "hsl(var(--foreground))",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};

const lbl: any = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "hsl(var(--muted-foreground))",
  display: "block",
  marginBottom: 6,
};

function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  full = false,
}: any) {
  const s: any = {
    primary: { background: "hsl(20 100% 50%)", color: "#000", border: "none" },
    ghost: {
      background: "transparent",
      color: "hsl(20 100% 50%)",
      border: "1px solid hsl(20 100% 50%)",
    },
    danger: { background: "hsl(0 84% 51%)", color: "#fff", border: "none" },
    subtle: {
      background: "hsl(var(--secondary))",
      color: "hsl(var(--foreground))",
      border: "1px solid hsl(var(--border))",
    },
    green: {
      background: "hsl(142 72% 37%)",
      color: "#fff",
      border: "none",
    },
  }[variant];
  const pad: any = { sm: "6px 14px", md: "9px 20px", lg: "12px 28px" }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...s,
        padding: pad,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "var(--font-body)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: full ? "100%" : "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function generateCouponCode(prefix = "MK2R"): string {
  const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${part1}-${part2}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export function CouponsManager({
  toast,
}: {
  toast: (m: string, t?: string) => void;
}) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "active" | "expired" | "inactive"
  >("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const blank = {
    type: "dropin_20" as CouponType,
    usageType: "single" as CouponUsageType,
    code: generateCouponCode(),
    expiryDate: "",
    maxUses: "",
    active: true,
  };
  const [form, setForm] = useState(blank);

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(ref(db, "coupons"), (snap) => {
      if (!snap.exists()) {
        setCoupons([]);
        setLoading(false);
        return;
      }
      const list: Coupon[] = Object.entries(snap.val()).map(
        ([id, v]: [string, any]) => ({
          id,
          ...v,
          usageCount: Object.keys(v.redemptions ?? {}).length,
        }),
      );
      list.sort((a, b) => b.createdAt - a.createdAt);
      setCoupons(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Save coupon ───────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.code.trim()) return toast("Enter a coupon code", "error");
    setSaving(true);
    try {
      const meta = COUPON_TYPES[form.type];
      const payload: Omit<Coupon, "id" | "usageCount"> = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        usageType: form.usageType,
        description: meta.desc,
        terms: meta.terms,
        expiresAt: form.expiryDate
          ? new Date(form.expiryDate + "T23:59:59").getTime()
          : null,
        active: form.active,
        createdAt: Date.now(),
        maxUses:
          form.usageType === "multi" && form.maxUses
            ? parseInt(form.maxUses)
            : null,
        redemptions: {},
      };

      // Check for duplicate code
      const existing = coupons.find(
        (c) => c.code === payload.code && c.id !== undefined,
      );
      if (existing) {
        toast(`Code "${payload.code}" already exists`, "error");
        setSaving(false);
        return;
      }

      await push(ref(db, "coupons"), payload);
      toast("Coupon created ✓", "success");
      setShowForm(false);
      setForm({ ...blank, code: generateCouponCode() });
    } catch {
      toast("Save failed — try again", "error");
    }
    setSaving(false);
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (coupon: Coupon) => {
    await set(ref(db, `coupons/${coupon.id}/active`), !coupon.active);
    toast(coupon.active ? "Coupon deactivated" : "Coupon activated ✓", "info");
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const del = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`))
      return;
    await remove(ref(db, `coupons/${coupon.id}`));
    toast("Deleted", "info");
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const now = Date.now();
  const filtered = coupons.filter((c) => {
    const isExpired = c.expiresAt && c.expiresAt < now;
    if (filter === "active") return c.active && !isExpired;
    if (filter === "expired") return isExpired;
    if (filter === "inactive") return !c.active && !isExpired;
    return true;
  });

  const activeCount = coupons.filter(
    (c) => c.active && !(c.expiresAt && c.expiresAt < now),
  ).length;
  const totalRedemptions = coupons.reduce((s, c) => s + c.usageCount, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Coupons & Vouchers
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Create and manage reward coupons for members. Coupons can be redeemed
        in-app or at reception.
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total coupons", val: coupons.length, accent: false },
          { label: "Active", val: activeCount, accent: activeCount > 0 },
          {
            label: "Total redeemed",
            val: totalRedemptions,
            accent: false,
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "hsl(var(--secondary))",
              border: `1px solid hsl(var(--border))`,
              borderRadius: 12,
              padding: "14px 18px",
              borderLeft: s.accent ? "3px solid hsl(20 100% 50%)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: s.accent ? "hsl(20 100% 50%)" : "hsl(var(--foreground))",
                lineHeight: 1,
              }}
            >
              {loading ? "—" : s.val}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Coupon types reference */}
      <div
        style={{
          marginBottom: 20,
          padding: "14px 16px",
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
          Available Reward Types
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
            gap: 8,
          }}
        >
          {Object.entries(COUPON_TYPES).map(([key, meta]) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 12px",
                background: "hsl(var(--background))",
                borderRadius: 8,
                borderLeft: `3px solid ${meta.color}`,
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  {meta.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {meta.terms}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + Add button */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["active", "all", "inactive", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "capitalize",
                background:
                  filter === f ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
                color: filter === f ? "#000" : "hsl(var(--foreground))",
                border: filter === f ? "none" : "1px solid hsl(var(--border))",
                fontFamily: "var(--font-body)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={() => {
            setShowForm((v) => !v);
            setForm({ ...blank, code: generateCouponCode() });
          }}
        >
          {showForm ? "✕ Cancel" : "+ New Coupon"}
        </Btn>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
              New Coupon
            </div>

            {/* Reward type */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Reward Type *</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))",
                  gap: 8,
                }}
              >
                {Object.entries(COUPON_TYPES).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() =>
                      setForm((p) => ({ ...p, type: key as CouponType }))
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "var(--font-body)",
                      border: `1px solid ${form.type === key ? meta.color : "hsl(var(--border))"}`,
                      background:
                        form.type === key
                          ? `${meta.color}15`
                          : "hsl(var(--background))",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color:
                            form.type === key
                              ? meta.color
                              : "hsl(var(--foreground))",
                        }}
                      >
                        {meta.label}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Usage type */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Usage Type *</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(USAGE_LABELS).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        usageType: key as CouponUsageType,
                      }))
                    }
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      border: `1px solid ${form.usageType === key ? "hsl(20 100% 50%)" : "hsl(var(--border))"}`,
                      background:
                        form.usageType === key
                          ? "hsl(20 100% 50% / 0.1)"
                          : "transparent",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 12,
                        color:
                          form.usageType === key
                            ? "hsl(20 100% 50%)"
                            : "hsl(var(--foreground))",
                      }}
                    >
                      {meta.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        marginTop: 2,
                      }}
                    >
                      {meta.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Code + expiry + max uses */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={lbl}>Coupon Code *</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    style={{
                      ...inp,
                      flex: 1,
                      fontFamily: "monospace",
                      letterSpacing: "0.08em",
                    }}
                    value={form.code}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="MK2R-XXXX-XXXX"
                  />
                  <button
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        code: generateCouponCode(),
                      }))
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      cursor: "pointer",
                      fontSize: 14,
                      fontFamily: "var(--font-body)",
                    }}
                    title="Generate new code"
                  >
                    🔀
                  </button>
                </div>
              </div>

              <div>
                <label style={lbl}>Expiry Date (optional)</label>
                <input
                  style={inp}
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, expiryDate: e.target.value }))
                  }
                />
              </div>

              {form.usageType === "multi" && (
                <div>
                  <label style={lbl}>Max Uses (blank = unlimited)</label>
                  <input
                    style={inp}
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={form.maxUses}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, maxUses: e.target.value }))
                    }
                  />
                </div>
              )}

              <div>
                <label style={lbl}>Status</label>
                <select
                  style={inp}
                  value={form.active ? "true" : "false"}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      active: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">● Active</option>
                  <option value="false">○ Draft (inactive)</option>
                </select>
              </div>
            </div>

            {/* Preview */}
            <div
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: "hsl(var(--background))",
                border: `1px solid ${COUPON_TYPES[form.type].color}40`,
                borderLeft: `3px solid ${COUPON_TYPES[form.type].color}`,
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Preview
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>
                  {COUPON_TYPES[form.type].icon}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {COUPON_TYPES[form.type].label}
                  </div>
                  <div
                    style={{
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                      lineHeight: 1.5,
                    }}
                  >
                    {COUPON_TYPES[form.type].terms}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 14,
                    color: COUPON_TYPES[form.type].color,
                    letterSpacing: "0.05em",
                  }}
                >
                  {form.code || "MK2R-XXXX-XXXX"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "hsl(var(--secondary))",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  {USAGE_LABELS[form.usageType].label}
                </span>
                {form.expiryDate && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    Expires {form.expiryDate}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="primary" onClick={save} disabled={saving}>
                {saving ? "Creating…" : "Create Coupon"}
              </Btn>
              <Btn
                variant="subtle"
                onClick={() => {
                  setShowForm(false);
                  setForm({ ...blank, code: generateCouponCode() });
                }}
              >
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coupon list */}
      {loading ? (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: "hsl(var(--muted-foreground))",
            padding: "20px 0",
          }}
        >
          {filter === "active"
            ? "No active coupons — create one above."
            : "No coupons found."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((coupon) => {
            const meta = COUPON_TYPES[coupon.type];
            const isExpired = coupon.expiresAt && coupon.expiresAt < now;
            const isExpanded = expandedId === coupon.id;
            const redemptions = Object.entries(coupon.redemptions ?? {}).sort(
              ([, a]: any, [, b]: any) => b.redeemedAt - a.redeemedAt,
            );

            const isFull =
              coupon.usageType === "single" && coupon.usageCount >= 1;
            const isMaxed =
              coupon.maxUses != null && coupon.usageCount >= coupon.maxUses;

            return (
              <div
                key={coupon.id}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  overflow: "hidden",
                  borderLeft: `3px solid ${isExpired || !coupon.active || isFull || isMaxed ? "hsl(var(--border))" : meta.color}`,
                  opacity: isExpired || !coupon.active ? 0.75 : 1,
                }}
              >
                {/* Main row */}
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: `${meta.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "monospace",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {coupon.code}
                        </span>
                        {/* Status badges */}
                        {isExpired && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: "hsl(var(--secondary))",
                              color: "hsl(var(--muted-foreground))",
                              border: "1px solid hsl(var(--border))",
                            }}
                          >
                            Expired
                          </span>
                        )}
                        {!isExpired && !coupon.active && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: "hsl(var(--secondary))",
                              color: "hsl(var(--muted-foreground))",
                              border: "1px solid hsl(var(--border))",
                            }}
                          >
                            Inactive
                          </span>
                        )}
                        {(isFull || isMaxed) && coupon.active && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: "hsl(38 92% 44% / 0.12)",
                              color: "hsl(38 92% 44%)",
                            }}
                          >
                            Fully redeemed
                          </span>
                        )}
                        {coupon.active && !isExpired && !isFull && !isMaxed && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: `${meta.color}15`,
                              color: meta.color,
                            }}
                          >
                            ● Active
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "hsl(var(--muted-foreground))",
                          marginTop: 2,
                        }}
                      >
                        {meta.label} · {USAGE_LABELS[coupon.usageType].label} ·{" "}
                        {coupon.usageCount}
                        {coupon.maxUses != null
                          ? `/${coupon.maxUses}`
                          : ""}{" "}
                        redeemed
                        {coupon.expiresAt
                          ? ` · Expires ${new Date(coupon.expiresAt).toLocaleDateString("en-ZA")}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {redemptions.length > 0 && (
                      <Btn
                        variant="subtle"
                        size="sm"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : coupon.id)
                        }
                      >
                        {isExpanded
                          ? "▲ Hide"
                          : `▼ ${redemptions.length} redemption${redemptions.length !== 1 ? "s" : ""}`}
                      </Btn>
                    )}
                    <Btn
                      variant={coupon.active ? "subtle" : "green"}
                      size="sm"
                      onClick={() => toggleActive(coupon)}
                    >
                      {coupon.active ? "Deactivate" : "Activate"}
                    </Btn>
                    <Btn variant="danger" size="sm" onClick={() => del(coupon)}>
                      Delete
                    </Btn>
                  </div>
                </div>

                {/* Redemptions panel */}
                <AnimatePresence>
                  {isExpanded && redemptions.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{
                        borderTop: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                        padding: "12px 16px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: "hsl(var(--muted-foreground))",
                          marginBottom: 10,
                        }}
                      >
                        Redemptions ({redemptions.length})
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {redemptions.map(([rid, r]: any) => (
                          <div
                            key={rid}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              background: "hsl(var(--secondary))",
                              borderRadius: 8,
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: meta.color,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: "#fff",
                                  flexShrink: 0,
                                }}
                              >
                                {r.memberName?.[0]?.toUpperCase() ?? "?"}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>
                                  {r.memberName}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  {r.memberEmail}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "hsl(var(--muted-foreground))",
                              }}
                            >
                              {timeAgo(r.redeemedAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
