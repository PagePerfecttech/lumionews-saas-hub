"use client";

import { useState } from "react";

export interface TenantItem {
  id: string;
  name: string;
  slug: string;
  domain: string;
  siteUrl: string;
  licenseKey: string;
  clientSecret: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  status: "ACTIVE" | "TRIAL" | "GRACE_PERIOD" | "PAST_DUE" | "SUSPENDED" | "TERMINATED";
  lockScope: "ADMIN_ONLY" | "FULL_SITE";
  suspensionReason?: string | null;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  validUntil: string;
  gracePeriodEnd?: string | null;
  razorpayPaymentLink?: string | null;
  lastHeartbeatAt?: string | null;
  articleCount: number;
  userCount: number;
  installedVersion?: string | null;
  envTemplate?: string | null;
  envConfig?: any;
  _count?: { invoices: number };
}

export function HubDashboard({ initialTenants }: { initialTenants: TenantItem[] }) {
  const [tenants, setTenants] = useState<TenantItem[]>(initialTenants);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "GRACE_PERIOD" | "SUSPENDED">("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardTab, setWizardTab] = useState<"PROFILE" | "DATABASE" | "BRANDING">("PROFILE");
  const [envModalData, setEnvModalData] = useState<{
    tenantName: string;
    domain: string;
    envContent: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New Client Form State
  const initialFormState = {
    // 1. Profile
    name: "",
    nameLocal: "",
    domain: "",
    siteUrl: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    planId: "website_basic",
    amount: "49900",

    // 2. Database & Storage (.env)
    databaseUrl: "",
    directUrl: "",
    r2AccountId: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2BucketName: "",
    r2PublicUrl: "",

    // 3. Branding & Integrations (.env)
    primaryColor: "#C41E3A",
    themeColor: "#0F172A",
    accentColor: "#E11D48",
    geminiApiKey: "",
    googleAdsenseId: "",
    onesignalAppId: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Computed Metrics
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.status === "ACTIVE").length;
  const suspendedTenants = tenants.filter((t) => t.status === "SUSPENDED" || t.status === "PAST_DUE").length;
  const mrrTotal = tenants
    .filter((t) => t.status === "ACTIVE")
    .reduce((acc, t) => acc + (t.amount || 49900), 0);

  const filteredTenants = tenants.filter((t) => {
    if (filter === "ALL") return true;
    if (filter === "ACTIVE") return t.status === "ACTIVE";
    if (filter === "GRACE_PERIOD") return t.status === "GRACE_PERIOD" || t.status === "PAST_DUE";
    if (filter === "SUSPENDED") return t.status === "SUSPENDED";
    return true;
  });

  // Toggle Remote Suspension (Freeze / Unfreeze)
  const handleToggleStatus = async (tenant: TenantItem) => {
    const nextStatus = tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setActionLoading(`toggle-${tenant.id}`);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data?.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
        );
      } else {
        alert(`Failed to update status: ${data?.error}`);
      }
    } catch {
      alert("Failed to communicate with Central Hub API.");
    } finally {
      setActionLoading(null);
    }
  };

  // Launch Master SSO 1-Click Login
  const handleLaunchSso = async (tenant: TenantItem) => {
    setActionLoading(`sso-${tenant.id}`);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/sso`);
      const data = await res.json();
      if (data?.success && data?.ssoUrl) {
        window.open(data.ssoUrl, "_blank", "noopener,noreferrer");
      } else {
        alert(`Master SSO failed: ${data?.error}`);
      }
    } catch {
      alert("Error generating Master SSO session.");
    } finally {
      setActionLoading(null);
    }
  };

  // View / Fetch Stored .env Template
  const handleViewEnv = async (tenant: TenantItem) => {
    setActionLoading(`env-${tenant.id}`);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/env`);
      const data = await res.json();
      if (data?.success && data?.envContent) {
        setEnvModalData({
          tenantName: tenant.name,
          domain: tenant.domain,
          envContent: data.envContent,
        });
      } else {
        alert(`Failed to load .env template: ${data?.error}`);
      }
    } catch {
      alert("Error retrieving .env template.");
    } finally {
      setActionLoading(null);
    }
  };

  // Create New Tenant & Generate .env
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    const planNameMap: Record<string, string> = {
      website_basic: "Website Basic (₹499/mo)",
      website_pro: "Website Pro + ePaper (₹599/mo)",
      web_app_bundle: "Web + Mobile App Bundle (₹999/mo)",
    };

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          planName: planNameMap[formData.planId] || "Website Plan",
          features: {
            enableEpaper: formData.planId !== "website_basic",
            enableMobileApi: formData.planId === "web_app_bundle",
            enableYouTubeSync: true,
            enableLiveTv: true,
          },
        }),
      });
      const data = await res.json();
      if (data?.success && data?.tenant) {
        setTenants((prev) => [data.tenant, ...prev]);
        setModalOpen(false);
        setEnvModalData({
          tenantName: data.tenant.name,
          domain: data.tenant.domain,
          envContent: data.envContent,
        });
        setFormData(initialFormState);
        setWizardTab("PROFILE");
      } else {
        setCreateError(data?.error || "Failed to provision tenant.");
      }
    } catch (err: any) {
      setCreateError(err?.message || "Internal server error.");
    } finally {
      setCreateLoading(false);
    }
  };

  // 1-Click Copy All .env
  const copyEnvToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // Download .env file
  const downloadEnvFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.env`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const calculateDaysRemaining = (validUntil: string) => {
    const diff = new Date(validUntil).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Expires today";
    return `${days}d left`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", padding: "32px 40px", maxWidth: 1440, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)", color: "#fff", fontWeight: 900, fontSize: 15, padding: "5px 10px", borderRadius: 8, letterSpacing: "0.05em" }}>
              LUMIO HUB
            </div>
            <span style={{ fontSize: 13, background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "3px 10px", borderRadius: 9999, fontWeight: 700 }}>
              Fleet Connected &bull; Active
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            Master Super Admin Control Plane
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#94a3b8" }}>
            Centrally register clients, generate complete Vercel .env templates, manage subscriptions, and remotely freeze/unlock sites.
          </p>
        </div>

        <button
          onClick={() => {
            setWizardTab("PROFILE");
            setModalOpen(true);
          }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#4f46e5", color: "#fff", border: "none", padding: "12px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 14px rgba(79, 70, 229, 0.35)", transition: "all 0.15s" }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Register Client & Generate .env
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginBottom: 32 }}>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "20px 22px" }}>
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>Total Newspaper Fleet</span>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#f9fafb", marginTop: 8 }}>{totalTenants}</div>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Registered client portals</span>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "20px 22px" }}>
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>Active Subscriptions</span>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#10b981", marginTop: 8 }}>{activeTenants}</div>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Full CMS & website active</span>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "20px 22px" }}>
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>Suspended / Overdue</span>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#ef4444", marginTop: 8 }}>{suspendedTenants}</div>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Locked from writing news</span>
        </div>

        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "20px 22px" }}>
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>Monthly Recurring Revenue</span>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#38bdf8", marginTop: 8 }}>
            ₹{Math.round(mrrTotal / 100).toLocaleString("en-IN")}
          </div>
          <span style={{ fontSize: 12, color: "#6b7280" }}>ARR: ₹{Math.round((mrrTotal * 12) / 100).toLocaleString("en-IN")}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, borderBottom: "1px solid #1f2937", paddingBottom: 14 }}>
        {[
          { key: "ALL", label: `All Tenants (${totalTenants})` },
          { key: "ACTIVE", label: `Active (${activeTenants})` },
          { key: "GRACE_PERIOD", label: `Past Due / Grace (${tenants.filter(t => t.status === "GRACE_PERIOD" || t.status === "PAST_DUE").length})` },
          { key: "SUSPENDED", label: `Suspended (${tenants.filter(t => t.status === "SUSPENDED").length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              background: filter === tab.key ? "#1f2937" : "transparent",
              color: filter === tab.key ? "#fff" : "#94a3b8",
              border: "none",
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fleet Table */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, overflow: "hidden" }}>
        {filteredTenants.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#6b7280" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#9ca3af", margin: 0 }}>No clients found in this view</p>
            <p style={{ fontSize: 13, margin: "6px 0 20px" }}>Click &quot;Register Client & Generate .env&quot; to provision your first newspaper client.</p>
            <button
              onClick={() => setModalOpen(true)}
              style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              + Register First Client
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0b0f19", borderBottom: "1px solid #1f2937", color: "#9ca3af", textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>
                <th style={{ padding: "14px 20px" }}>Publication & Owner</th>
                <th style={{ padding: "14px 16px" }}>Domain & Deployment</th>
                <th style={{ padding: "14px 16px" }}>Plan & Price</th>
                <th style={{ padding: "14px 16px" }}>Status</th>
                <th style={{ padding: "14px 16px" }}>Cycle Expiry</th>
                <th style={{ padding: "14px 16px" }}>Telemetry</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Remote Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => {
                const isSuspended = t.status === "SUSPENDED";
                const isGrace = t.status === "GRACE_PERIOD" || t.status === "PAST_DUE";
                const daysRemainingText = calculateDaysRemaining(t.validUntil);

                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #1f2937", background: isSuspended ? "rgba(239, 68, 68, 0.03)" : "transparent" }}>
                    {/* Publication & Owner */}
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{t.ownerName} &bull; {t.ownerEmail}</div>
                      {t.ownerPhone && (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{t.ownerPhone}</div>
                      )}
                    </td>

                    {/* Domain & Deployment */}
                    <td style={{ padding: "16px 16px" }}>
                      <a
                        href={t.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {t.domain}
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        Lock Scope: <strong style={{ color: t.lockScope === "FULL_SITE" ? "#f87171" : "#94a3b8" }}>{t.lockScope}</strong>
                      </div>
                    </td>

                    {/* Plan & Price */}
                    <td style={{ padding: "16px 16px" }}>
                      <div style={{ fontWeight: 700, color: "#f1f5f9" }}>₹{Math.round(t.amount / 100)} / mo</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{t.planName}</div>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: "16px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          background: isSuspended
                            ? "rgba(239, 68, 68, 0.15)"
                            : isGrace
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(16, 185, 129, 0.15)",
                          color: isSuspended ? "#f87171" : isGrace ? "#fbbf24" : "#34d399",
                          border: `1px solid ${isSuspended ? "rgba(239, 68, 68, 0.3)" : isGrace ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                        }}
                      >
                        {t.status}
                      </span>
                    </td>

                    {/* Cycle Expiry */}
                    <td style={{ padding: "16px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{daysRemainingText}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {new Date(t.validUntil).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Telemetry */}
                    <td style={{ padding: "16px 16px" }}>
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                        <strong>{t.articleCount}</strong> articles &bull; <strong>{t.userCount}</strong> staff
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        {t.lastHeartbeatAt ? `Ping: ${new Date(t.lastHeartbeatAt).toLocaleTimeString()}` : "No heartbeat yet"}
                      </div>
                    </td>

                    {/* Remote Actions */}
                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {/* View .env Template */}
                        <button
                          onClick={() => handleViewEnv(t)}
                          disabled={actionLoading === `env-${t.id}`}
                          title="View and copy complete Vercel .env file template"
                          style={{ background: "#064e3b", color: "#6ee7b7", border: "1px solid #059669", padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          .env Template
                        </button>

                        {/* 1-Click Master SSO Entry */}
                        <button
                          onClick={() => handleLaunchSso(t)}
                          disabled={actionLoading === `sso-${t.id}`}
                          title="Log in to client CMS as Super Admin without password"
                          style={{ background: "#312e81", color: "#a5b4fc", border: "1px solid #4338ca", padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          CMS Login
                        </button>

                        {/* Remote Freeze / Unfreeze Switch */}
                        <button
                          onClick={() => handleToggleStatus(t)}
                          disabled={actionLoading === `toggle-${t.id}`}
                          title={isSuspended ? "Unfreeze client site and restore CMS access" : "Immediately freeze CMS administrative access"}
                          style={{
                            background: isSuspended ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                            color: isSuspended ? "#34d399" : "#f87171",
                            border: `1px solid ${isSuspended ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                            padding: "6px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {actionLoading === `toggle-${t.id}` ? "..." : isSuspended ? "🟢 Unfreeze" : "🔒 Freeze"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Register New Client & Generate .env Wizard */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "28px 26px", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, borderBottom: "1px solid #1f2937", paddingBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Client Onboarding & .env Generator</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>
                  Fill in the client details to provision their tenant and generate their complete Vercel `.env` configuration.
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 22, cursor: "pointer" }}>&times;</button>
            </div>

            {/* Wizard Steps Navigation */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "#090d16", padding: 6, borderRadius: 10, border: "1px solid #1f2937" }}>
              <button
                type="button"
                onClick={() => setWizardTab("PROFILE")}
                style={{
                  flex: 1,
                  background: wizardTab === "PROFILE" ? "#4f46e5" : "transparent",
                  color: wizardTab === "PROFILE" ? "#fff" : "#9ca3af",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                1. Profile & Plan
              </button>
              <button
                type="button"
                onClick={() => setWizardTab("DATABASE")}
                style={{
                  flex: 1,
                  background: wizardTab === "DATABASE" ? "#4f46e5" : "transparent",
                  color: wizardTab === "DATABASE" ? "#fff" : "#9ca3af",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                2. DB & Storage (.env)
              </button>
              <button
                type="button"
                onClick={() => setWizardTab("BRANDING")}
                style={{
                  flex: 1,
                  background: wizardTab === "BRANDING" ? "#4f46e5" : "transparent",
                  color: wizardTab === "BRANDING" ? "#fff" : "#9ca3af",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                3. Branding & AI (Optional)
              </button>
            </div>

            <form onSubmit={handleCreateTenant}>
              {/* TAB 1: PROFILE & SUBSCRIPTION */}
              {wizardTab === "PROFILE" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Publication Name (English) <span style={{ color: "#f87171" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Andhra Chronicle"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Native Title (Telugu/Regional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. ఆంధ్ర క్రానికల్"
                        value={formData.nameLocal}
                        onChange={(e) => setFormData({ ...formData, nameLocal: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Domain / Hostname <span style={{ color: "#f87171" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. acps.smsinfotek.in"
                        value={formData.domain}
                        onChange={(e) => {
                          const dom = e.target.value.trim();
                          setFormData({
                            ...formData,
                            domain: dom,
                            siteUrl: dom ? `https://${dom}` : "",
                            r2BucketName: dom ? `${dom.replace(/[^a-z0-9]/gi, "-")}-media` : "",
                            r2PublicUrl: dom ? `https://media.${dom}` : "",
                          });
                        }}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Live Website Full URL <span style={{ color: "#f87171" }}>*</span>
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="https://acps.smsinfotek.in"
                        value={formData.siteUrl}
                        onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Client Owner Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Ravi Kumar"
                        value={formData.ownerName}
                        onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Owner Email Address <span style={{ color: "#f87171" }}>*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="editor@andhrachronicle.in"
                        value={formData.ownerEmail}
                        onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        WhatsApp / Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder="+919876543210"
                        value={formData.ownerPhone}
                        onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Monthly Subscription Tier
                      </label>
                      <select
                        value={formData.planId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const amt = id === "website_basic" ? "49900" : id === "website_pro" ? "59900" : "99900";
                          setFormData({ ...formData, planId: id, amount: amt });
                        }}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      >
                        <option value="website_basic">Website Basic (₹499 / month)</option>
                        <option value="website_pro">Website Pro + ePaper (₹599 / month)</option>
                        <option value="web_app_bundle">Web + Mobile App Bundle (₹999 / month)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => setWizardTab("DATABASE")}
                      style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Next: Database & Storage &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: DATABASE & STORAGE */}
              {wizardTab === "DATABASE" && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                      Client PostgreSQL Database URL (`DATABASE_URL`)
                    </label>
                    <input
                      type="text"
                      placeholder="postgresql://user:pass@ep-cool.ap-southeast-1.aws.neon.tech/news_db?sslmode=require"
                      value={formData.databaseUrl}
                      onChange={(e) => setFormData({ ...formData, databaseUrl: e.target.value })}
                      style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                    />
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      Tip: Neon, Supabase, or Railway connection string. If left blank, a placeholder will be placed in the template.
                    </span>
                  </div>

                  <div style={{ borderTop: "1px solid #1f2937", paddingTop: 14, marginTop: 14, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>Cloudflare R2 Media Storage</span>
                    <span style={{ fontSize: 12, color: "#6b7280", display: "block", marginTop: 2 }}>
                      Allows infinite image & PDF uploads without server disk bloat or bandwidth fees.
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        R2 Account ID (`R2_ACCOUNT_ID`)
                      </label>
                      <input
                        type="text"
                        placeholder="32-char Cloudflare account ID"
                        value={formData.r2AccountId}
                        onChange={(e) => setFormData({ ...formData, r2AccountId: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        R2 Access Key ID (`R2_ACCESS_KEY_ID`)
                      </label>
                      <input
                        type="text"
                        placeholder="R2 S3 API token ID"
                        value={formData.r2AccessKeyId}
                        onChange={(e) => setFormData({ ...formData, r2AccessKeyId: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        R2 Secret Access Key (`R2_SECRET_ACCESS_KEY`)
                      </label>
                      <input
                        type="password"
                        placeholder="R2 Secret Token"
                        value={formData.r2SecretAccessKey}
                        onChange={(e) => setFormData({ ...formData, r2SecretAccessKey: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        R2 Bucket Name (`R2_BUCKET_NAME`)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. client-news-media"
                        value={formData.r2BucketName}
                        onChange={(e) => setFormData({ ...formData, r2BucketName: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                      R2 Public URL (`R2_PUBLIC_URL`)
                    </label>
                    <input
                      type="url"
                      placeholder="https://pub-xyz.r2.dev or https://media.clientnews.com"
                      value={formData.r2PublicUrl}
                      onChange={(e) => setFormData({ ...formData, r2PublicUrl: e.target.value })}
                      style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => setWizardTab("PROFILE")}
                      style={{ background: "#1f2937", color: "#9ca3af", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      &larr; Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardTab("BRANDING")}
                      style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Next: Branding & AI &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: BRANDING & INTEGRATIONS */}
              {wizardTab === "BRANDING" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Primary Brand Color (`NEXT_PUBLIC_PRIMARY_COLOR`)
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="color"
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          style={{ width: 40, height: 40, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent" }}
                        />
                        <input
                          type="text"
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          style={{ flex: 1, background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Theme Background (`NEXT_PUBLIC_THEME_COLOR`)
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="color"
                          value={formData.themeColor}
                          onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                          style={{ width: 40, height: 40, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent" }}
                        />
                        <input
                          type="text"
                          value={formData.themeColor}
                          onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                          style={{ flex: 1, background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                      Google Gemini API Key (`GEMINI_API_KEY`)
                    </label>
                    <input
                      type="text"
                      placeholder="AIzaSy... (from https://aistudio.google.com)"
                      value={formData.geminiApiKey}
                      onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                      style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        Google AdSense ID (`GOOGLE_ADSENSE_ID`)
                      </label>
                      <input
                        type="text"
                        placeholder="ca-pub-1234567890"
                        value={formData.googleAdsenseId}
                        onChange={(e) => setFormData({ ...formData, googleAdsenseId: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                        OneSignal App ID (`ONESIGNAL_APP_ID`)
                      </label>
                      <input
                        type="text"
                        placeholder="UUID from onesignal.com"
                        value={formData.onesignalAppId}
                        onChange={(e) => setFormData({ ...formData, onesignalAppId: e.target.value })}
                        style={{ width: "100%", background: "#090d16", border: "1px solid #374151", color: "#fff", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ background: "rgba(79, 70, 229, 0.1)", border: "1px solid rgba(79, 70, 229, 0.25)", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚡ Auto-Generated Cryptographic Secrets</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#cbd5e1" }}>
                      `AUTH_SECRET`, `NEXTAUTH_SECRET`, `KYC_ENCRYPTION_KEY`, `CRON_SECRET`, `SAAS_LICENSE_KEY`, and `SAAS_CLIENT_SECRET` will be cryptographically generated and inserted into the `.env` template automatically.
                    </p>
                  </div>

                  {createError && (
                    <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                      {createError}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => setWizardTab("DATABASE")}
                      style={{ background: "#1f2937", color: "#9ca3af", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      &larr; Back
                    </button>
                    <button
                      type="submit"
                      disabled={createLoading}
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: createLoading ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)" }}
                    >
                      {createLoading ? "Provisioning & Generating .env..." : "🚀 Provision Client & Generate .env"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal: Full Generated .env Template Display */}
      {envModalData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 20 }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, maxWidth: 840, width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", padding: "26px 28px", color: "#fff", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)" }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, borderBottom: "1px solid #1f2937", paddingBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    VERCEL .ENV READY
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{envModalData.domain}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                  Production .env Configuration: {envModalData.tenantName}
                </h2>
              </div>
              <button
                onClick={() => setEnvModalData(null)}
                style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 24, cursor: "pointer", padding: "0 6px" }}
              >
                &times;
              </button>
            </div>

            {/* Instruction Tip */}
            <div style={{ background: "#0b0f19", border: "1px solid #1e293b", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <span>
                <strong>Vercel 1-Click Paste:</strong> In your client&apos;s Vercel Dashboard &rarr; <strong>Settings &rarr; Environment Variables</strong>, simply click the first field and press <kbd style={{ background: "#1f2937", padding: "2px 6px", borderRadius: 4, color: "#f1f5f9" }}>Ctrl + V</kbd>. Vercel will automatically populate all variables at once!
              </span>
            </div>

            {/* .env Code Block */}
            <pre
              style={{
                flex: 1,
                background: "#050811",
                border: "1px solid #1e293b",
                borderRadius: 10,
                padding: "16px 18px",
                fontSize: 12,
                color: "#38bdf8",
                overflowY: "auto",
                overflowX: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {envModalData.envContent}
            </pre>

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, borderTop: "1px solid #1f2937", paddingTop: 16 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Stored securely in SaaS Hub &bull; Re-accessible anytime
              </span>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => downloadEnvFile(envModalData.domain.replace(/[^a-z0-9]/gi, "-"), envModalData.envContent)}
                  style={{ background: "#1f2937", color: "#e2e8f0", border: "1px solid #374151", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download .env File
                </button>

                <button
                  type="button"
                  onClick={() => copyEnvToClipboard(envModalData.envContent)}
                  style={{
                    background: copied ? "#10b981" : "#4f46e5",
                    color: "#fff",
                    border: "none",
                    padding: "10px 22px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    boxShadow: "0 4px 14px rgba(79, 70, 229, 0.35)",
                    transition: "all 0.15s",
                  }}
                >
                  {copied ? (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied All Variables!
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy All .env for Vercel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
