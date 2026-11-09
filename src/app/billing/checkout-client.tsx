"use client";

import { useState } from "react";

interface InvoiceItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  razorpayPaymentId?: string | null;
  billingPeriod?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

interface TenantData {
  id: string;
  name: string;
  domain: string;
  siteUrl: string;
  licenseKey: string;
  planName: string;
  amount: number;
  currency: string;
  status: "ACTIVE" | "GRACE_PERIOD" | "SUSPENDED" | "TRIAL" | "TERMINATED" | "PAST_DUE";
  validUntil: string | null;
  razorpayPaymentLink?: string | null;
  invoices?: InvoiceItem[];
}

export function BillingCheckoutClient({
  tenant,
  razorpayKeyId,
  paymentLink,
  successNotice = false,
}: {
  tenant: TenantData;
  razorpayKeyId: string;
  paymentLink: string | null;
  successNotice?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(successNotice);
  const [error, setError] = useState<string | null>(null);
  const [validUntilState, setValidUntilState] = useState<string | null>(tenant.validUntil);
  const [statusState, setStatusState] = useState<string>(tenant.status);

  const formattedAmount = `₹${((tenant.amount || 49900) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  })}`;

  const currentValidDate = validUntilState
    ? new Date(validUntilState).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not Set / Expired";

  const nextValidDate = (() => {
    const base = validUntilState && new Date(validUntilState) > new Date()
      ? new Date(validUntilState)
      : new Date();
    const next = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    return next.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  })();

  const handleInstantRenew = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: tenant.licenseKey,
          amount: tenant.amount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        if (data.validUntil) setValidUntilState(data.validUntil);
        setStatusState("ACTIVE");
      } else {
        setError(data.error || "Payment verification failed. Please try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Success Notification Banner */}
      {success && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid #10b981", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>🎉</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#34d399" }}>
              Subscription Renewed &amp; Fleet Unlocked!
            </h3>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
            Your monthly subscription has been extended by 30 days until <strong>{validUntilState ? new Date(validUntilState).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : nextValidDate}</strong>. An instant synchronization signal was dispatched to your newspaper portal at <code>{tenant.domain}</code>.
          </p>
          <a
            href={tenant.siteUrl ? `${tenant.siteUrl.replace(/\/+$/, "")}/admin/subscription` : `https://${tenant.domain}/admin/subscription`}
            style={{ display: "inline-block", background: "#10b981", color: "#064e3b", fontWeight: 800, fontSize: 13, padding: "10px 18px", borderRadius: 8, textDecoration: "none" }}
          >
            Open {tenant.name} CMS &rarr;
          </a>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid #ef4444", borderRadius: 12, padding: "16px 20px", color: "#fca5a5", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Subscription Invoice Card */}
      <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.7)" }}>
        {/* Card Header */}
        <div style={{ padding: "24px 28px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#f8fafc" }}>
                {tenant.name}
              </h1>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 9999,
                background: statusState === "ACTIVE" ? "rgba(16, 185, 129, 0.15)" : statusState === "GRACE_PERIOD" ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: statusState === "ACTIVE" ? "#34d399" : statusState === "GRACE_PERIOD" ? "#fbbf24" : "#f87171",
              }}>
                {statusState}
              </span>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
              Target Domain: <code style={{ color: "#cbd5e1" }}>{tenant.domain}</code>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Due Today</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f8fafc" }}>{formattedAmount}</div>
          </div>
        </div>

        {/* Plan Breakdown */}
        <div style={{ padding: "24px 28px" }}>
          <div style={{ background: "#060911", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "#cbd5e1", fontWeight: 600, fontSize: 14 }}>Package Plan</span>
              <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14 }}>{tenant.planName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Current Valid Until</span>
              <span style={{ color: "#cbd5e1", fontSize: 13, fontFamily: "monospace" }}>{currentValidDate}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Extension Term</span>
              <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>+ 30 Days (until {nextValidDate})</span>
            </div>
            <div style={{ borderTop: "1px solid #1e293b", margin: "12px 0 10px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 15 }}>Total Payable (incl. all taxes)</span>
              <span style={{ color: "#f8fafc", fontWeight: 900, fontSize: 20 }}>{formattedAmount}</span>
            </div>
          </div>

          {/* Checkout Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {paymentLink && (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  background: "#0284c7",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 800,
                  padding: "14px 24px",
                  borderRadius: 10,
                  textDecoration: "none",
                  textAlign: "center",
                  boxShadow: "0 10px 25px -5px rgba(2, 132, 199, 0.4)",
                  cursor: "pointer",
                }}
              >
                <span>💳 Pay via Razorpay Online Link &rarr;</span>
              </a>
            )}

            <button
              onClick={handleInstantRenew}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: loading ? "#334155" : "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 800,
                padding: "14px 24px",
                borderRadius: 10,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 10px 25px -5px rgba(79, 70, 229, 0.4)",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Processing Renewal & Syncing..." : "⚡ Complete Renewal & Unlock Newspaper Fleet"}
            </button>
          </div>

          {/* Security & Verification Guarantee */}
          <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "#64748b" }}>
            🔒 Authenticated &amp; Enforced by Lumionews Master Control Plane &bull; HMAC-SHA256 Encrypted Sync
          </div>
        </div>
      </div>

      {/* Invoice History */}
      {tenant.invoices && tenant.invoices.length > 0 && (
        <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 14, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>
            Payment History &amp; Invoices
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Invoice ID</th>
                  <th style={{ padding: "8px 12px" }}>Period</th>
                  <th style={{ padding: "8px 12px" }}>Amount</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                  <th style={{ padding: "8px 12px" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {tenant.invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #060911" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#94a3b8" }}>{inv.id.slice(0, 8)}...</td>
                    <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{inv.billingPeriod || "Monthly"}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#f8fafc" }}>₹{((inv.amount || 49900) / 100).toFixed(2)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: "#34d399", fontWeight: 700, fontSize: 11 }}>{inv.status}</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#64748b" }}>
                      {new Date(inv.paidAt || inv.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

