"use client";

import { useState, useEffect } from "react";
import Script from "next/script";

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
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(successNotice);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validUntilState, setValidUntilState] = useState<string | null>(tenant.validUntil);
  const [statusState, setStatusState] = useState<string>(tenant.status);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Razorpay) {
      setSdkReady(true);
    }
  }, []);

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

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      if ((window as any).Razorpay) return resolve(true);

      const existing = document.getElementById("razorpay-checkout-script");
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }

      const script = document.createElement("script");
      script.id = "razorpay-checkout-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayWithRazorpay = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Ensure Razorpay SDK is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !(window as any).Razorpay) {
        throw new Error("Unable to load Razorpay payment gateway. Please check your internet connection or ad-blocker.");
      }

      // 2. Request Server to create a Razorpay Order
      const orderRes = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: tenant.licenseKey,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.orderId) {
        throw new Error(orderData.error || "Failed to create payment order with Razorpay.");
      }

      // 3. Open official Razorpay Checkout modal
      const options = {
        key: orderData.keyId || razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "LumioNews SaaS Fleet",
        description: `Subscription Renewal - ${tenant.name} (${tenant.planName})`,
        order_id: orderData.orderId,
        prefill: {
          name: orderData.tenantName || tenant.name,
          email: orderData.ownerEmail || "",
          contact: orderData.ownerPhone || "",
        },
        notes: {
          licenseKey: tenant.licenseKey,
          domain: tenant.domain,
        },
        theme: {
          color: "#4f46e5",
        },
        handler: async function (res: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          // 4. Called ONLY after successful payment inside Razorpay modal!
          setVerifying(true);
          try {
            const verifyRes = await fetch("/api/billing/renew", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseKey: tenant.licenseKey,
                razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_signature: res.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setSuccess(true);
              setPaymentId(res.razorpay_payment_id);
              if (verifyData.validUntil) setValidUntilState(verifyData.validUntil);
              setStatusState("ACTIVE");
            } else {
              setError(verifyData.error || "Payment verification failed with server.");
            }
          } catch (err: any) {
            setError(err?.message || "Payment verification network error.");
          } finally {
            setLoading(false);
            setVerifying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (failedResp: any) {
        console.error("Razorpay Payment Failed:", failedResp);
        setError(failedResp.error?.description || "Payment failed or was cancelled.");
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      console.error("[Razorpay Trigger Error]:", err);
      setError(err?.message || "Failed to initiate Razorpay checkout.");
      setLoading(false);
    }
  };

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setSdkReady(true)}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Success Notification Banner */}
        {success && (
          <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid #10b981", borderRadius: 14, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>🎉</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#34d399" }}>
                Payment Verified &amp; Fleet Unlocked!
              </h3>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
              Your Razorpay payment has been verified. Subscription validity extended by 30 days until <strong>{validUntilState ? new Date(validUntilState).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }) : nextValidDate}</strong>.
            </p>
            {paymentId && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, fontFamily: "monospace" }}>
                Razorpay Payment ID: <span style={{ color: "#34d399" }}>{paymentId}</span>
              </div>
            )}
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
            <strong>Payment Notice:</strong> {error}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Primary: Trigger Razorpay Checkout modal */}
              <button
                onClick={handlePayWithRazorpay}
                disabled={loading || verifying}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  background: loading || verifying ? "#334155" : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 800,
                  padding: "16px 24px",
                  borderRadius: 12,
                  border: "none",
                  cursor: loading || verifying ? "not-allowed" : "pointer",
                  boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.4)",
                  transition: "all 0.2s",
                }}
              >
                <span>
                  {verifying
                    ? "⏳ Verifying Razorpay Payment..."
                    : loading
                    ? "🚀 Opening Razorpay Checkout..."
                    : `💳 Pay ${formattedAmount} via Razorpay`}
                </span>
              </button>

              {/* Secondary Fallback: Razorpay Payment Link if tenant has one */}
              {paymentLink && (
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Or alternatively: </span>
                  <a
                    href={paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: "#38bdf8",
                      textDecoration: "underline",
                      fontWeight: 600,
                    }}
                  >
                    Open Standalone Razorpay Payment Link &rarr;
                  </a>
                </div>
              )}
            </div>

            {/* Security Guarantee */}
            <div style={{ marginTop: 22, textAlign: "center", fontSize: 11, color: "#64748b" }}>
              🔒 Secured by Razorpay &bull; HMAC-SHA256 Cryptographic Verification &bull; Lumionews Master Control Plane
            </div>
          </div>
        </div>

        {/* Invoice History */}
        {tenant.invoices && tenant.invoices.length > 0 && (
          <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 14, padding: "20px 24px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>
              Payment History &amp; Verified Invoices
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>Invoice ID</th>
                    <th style={{ padding: "8px 12px" }}>Period</th>
                    <th style={{ padding: "8px 12px" }}>Amount</th>
                    <th style={{ padding: "8px 12px" }}>Razorpay ID</th>
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
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#38bdf8", fontSize: 11 }}>
                        {inv.razorpayPaymentId || "-"}
                      </td>
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
    </>
  );
}
