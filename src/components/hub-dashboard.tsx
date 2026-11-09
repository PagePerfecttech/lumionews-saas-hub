"use client";

import { useState, useMemo } from "react";

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
  features?: any;
  createdAt: string;
  _count?: { invoices: number };
}

export interface PackagePlanItem {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPrice: number;
  annualPrice?: number | null;
  currency?: string;
  isPopular?: boolean;
  isActive?: boolean;
  features?: any;
}

export interface InvoiceItem {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  razorpayPaymentId?: string | null;
  razorpayInvoiceId?: string | null;
  billingPeriod: string;
  paidAt?: string | null;
  createdAt: string;
  tenant?: { name: string; domain: string };
}

export function HubDashboard({
  initialTenants,
  initialPlans = [],
  initialInvoices = [],
  initialMrrPaise = 0,
  authWarning = false,
  hubUrl = "https://app.smsinfotek.in",
}: {
  initialTenants: TenantItem[];
  initialPlans?: PackagePlanItem[];
  initialInvoices?: InvoiceItem[];
  initialMrrPaise?: number;
  authWarning?: boolean;
  hubUrl?: string;
}) {
  const [tenants, setTenants] = useState<TenantItem[]>(initialTenants);
  const [plans, setPlans] = useState<PackagePlanItem[]>(initialPlans);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(initialInvoices);

  // Active Main Navigation Tab
  const [activeTab, setActiveTab] = useState<"FLEET" | "PACKAGES" | "INVOICES" | "SYSTEM">("FLEET");

  // Filtering & Search
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "TRIAL" | "GRACE_PERIOD" | "SUSPENDED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Freeze/Lock Confirmation Modal
  const [freezeModalTenant, setFreezeModalTenant] = useState<TenantItem | null>(null);
  const [freezeScope, setFreezeScope] = useState<"ADMIN_ONLY" | "FULL_SITE">("ADMIN_ONLY");
  const [freezeReason, setFreezeReason] = useState("Subscription payment overdue or account suspended by administrator.");

  // Edit Tenant Drawer Modal
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  // View .env Modal
  const [envModalData, setEnvModalData] = useState<{
    tenantName: string;
    domain: string;
    licenseKey: string;
    envContent: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Webhook Health Test State
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Razorpay API Credentials Diagnostic State
  const [testingApiKeys, setTestingApiKeys] = useState(false);
  const [apiKeysTestResult, setApiKeysTestResult] = useState<{
    success: boolean;
    message: string;
    recommendation?: string;
    details?: any;
  } | null>(null);

  const effectiveHubUrl = (hubUrl && !hubUrl.includes("saasnews.vercel.app") ? hubUrl : "https://app.smsinfotek.in").replace(/\/+$/, "");

  const handleTestApiKeys = async () => {
    setTestingApiKeys(true);
    setApiKeysTestResult(null);
    try {
      const res = await fetch("/api/billing/diagnostic");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authenticated) {
        setApiKeysTestResult({
          success: true,
          message: `Active & Authenticated! Mode: ${data.keyId?.mode || "LIVE"} (${data.keyId?.prefix || ""}...), Key Length: ${data.keyId?.length || 0}`,
          recommendation: data.recommendation,
          details: data,
        });
      } else {
        setApiKeysTestResult({
          success: false,
          message: data.razorpayApiCheck?.errorSummary || "Authentication failed with Razorpay API",
          recommendation: data.recommendation || "Check your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel.",
          details: data,
        });
      }
    } catch (e: any) {
      setApiKeysTestResult({
        success: false,
        message: e?.message || "Failed to contact diagnostic endpoint",
      });
    } finally {
      setTestingApiKeys(false);
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch("/api/webhooks/razorpay");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok") {
        setWebhookTestResult({
          success: true,
          message: `Webhook listener is LIVE at ${effectiveHubUrl}/api/webhooks/razorpay (Secret configured: ${data.configured ? "Yes" : "Waiting for RAZORPAY_WEBHOOK_SECRET"})`,
        });
      } else {
        setWebhookTestResult({
          success: false,
          message: data.error || `HTTP ${res.status}`,
        });
      }
    } catch (e: any) {
      setWebhookTestResult({
        success: false,
        message: e?.message || "Failed to reach endpoint",
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  // New Client Form State
  const initialFormState = {
    name: "",
    nameLocal: "",
    domain: "",
    siteUrl: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    planId: "website_basic",
    amount: "49900",
    billingCycle: "monthly",
    // Infrastructure
    databaseUrl: "",
    directUrl: "",
    r2AccountId: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2BucketName: "",
    r2PublicUrl: "",
    // Branding & Integrations
    primaryColor: "#C41E3A",
    themeColor: "#0F172A",
    accentColor: "#E11D48",
    geminiApiKey: "",
    googleAdsenseId: "",
    onesignalAppId: "",
    // Feature Overrides
    enableEpaper: false,
    enableMobileApi: false,
    enableYouTubeSync: true,
    enableLiveTv: true,
    enableMandiRates: true,
    enablePreciousMetals: true,
    enablePolls: true,
    enableStringers: true,
  };

  const [formData, setFormData] = useState(initialFormState);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Filtered tenants calculation
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesFilter = filter === "ALL" ? true : t.status === filter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.domain.toLowerCase().includes(q) ||
        t.ownerName?.toLowerCase().includes(q) ||
        t.licenseKey?.toLowerCase().includes(q) ||
        t.ownerPhone?.includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [tenants, filter, searchQuery]);

  // Aggregate Metrics
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.status === "ACTIVE").length;
  const trialTenants = tenants.filter((t) => t.status === "TRIAL").length;
  const suspendedTenants = tenants.filter((t) => t.status === "SUSPENDED" || t.status === "PAST_DUE").length;
  const activeMrr = Math.round(
    tenants
      .filter((t) => t.status === "ACTIVE")
      .reduce((acc, t) => acc + (t.amount || 49900), 0) / 100
  );

  // Copy helper
  const copyToClipboard = (text: string, key = "default") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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

  // Instant Freeze / Unfreeze Remote Kill-Switch
  const handleToggleFreeze = async (tenant: TenantItem, action: "FREEZE" | "UNFREEZE") => {
    const newStatus = action === "FREEZE" ? "SUSPENDED" : "ACTIVE";
    setActionLoading(`freeze-${tenant.id}`);

    try {
      const res = await fetch(`/api/tenants/${tenant.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          lockScope: freezeScope,
          suspensionReason: action === "FREEZE" ? freezeReason : null,
        }),
      });

      const data = await res.json();
      if (data?.success && data?.tenant) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenant.id ? { ...t, ...data.tenant } : t))
        );
        setFreezeModalTenant(null);
      } else {
        alert(`Failed to update tenant status: ${data?.error}`);
      }
    } catch (err: any) {
      alert(`Error updating tenant: ${err?.message}`);
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
          licenseKey: tenant.licenseKey,
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

  // Open Edit Drawer
  const handleOpenEdit = (tenant: TenantItem) => {
    setEditingTenant(tenant);
    setEditFormData({
      name: tenant.name,
      ownerName: tenant.ownerName,
      ownerEmail: tenant.ownerEmail,
      ownerPhone: tenant.ownerPhone,
      planId: tenant.planId,
      planName: tenant.planName,
      amount: tenant.amount,
      validUntil: tenant.validUntil ? new Date(tenant.validUntil).toISOString().split("T")[0] : "",
      razorpayPaymentLink: tenant.razorpayPaymentLink || "",
      features: tenant.features || {},
    });
  };

  // Save Tenant Edits
  const handleSaveEdit = async () => {
    if (!editingTenant) return;
    setActionLoading("save-edit");

    try {
      const res = await fetch(`/api/tenants/${editingTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });

      const data = await res.json();
      if (data?.success && data?.tenant) {
        setTenants((prev) =>
          prev.map((t) => (t.id === editingTenant.id ? { ...t, ...data.tenant } : t))
        );
        setEditingTenant(null);
      } else {
        alert(`Update failed: ${data?.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Create New Tenant & Generate .env
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    const selectedPlan = plans.find((p) => p.code === formData.planId);
    const planName = selectedPlan?.name || "Website Basic (₹499/mo)";
    const planAmount = selectedPlan?.monthlyPrice || Number(formData.amount) || 49900;

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          amount: planAmount,
          planName,
          features: {
            enableEpaper: formData.planId !== "website_basic" || formData.enableEpaper,
            enableMobileApi: formData.planId === "web_app_bundle" || formData.enableMobileApi,
            enableYouTubeSync: formData.enableYouTubeSync,
            enableLiveTv: formData.enableLiveTv,
            enableMandiRates: formData.enableMandiRates,
            enablePreciousMetals: formData.enablePreciousMetals,
            enablePolls: formData.enablePolls,
            enableStringers: formData.enableStringers,
          },
        }),
      });

      const data = await res.json();
      if (data?.success && data?.tenant) {
        setTenants((prev) => [data.tenant, ...prev]);
        setRegisterModalOpen(false);
        setEnvModalData({
          tenantName: data.tenant.name,
          domain: data.tenant.domain,
          licenseKey: data.tenant.licenseKey,
          envContent: data.envContent,
        });
        setFormData(initialFormState);
        setWizardStep(1);
      } else {
        setCreateError(data?.error || "Failed to provision client.");
      }
    } catch (err: any) {
      setCreateError(err?.message || "Internal server error.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const calculateDaysRemaining = (validUntil: string) => {
    if (!validUntil) return "Lifetime";
    const diff = new Date(validUntil).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)}d Overdue`;
    if (days === 0) return "Expires Today";
    return `${days}d Left`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Security Warning Banner if HUB_ADMIN_PASSWORD is not set */}
      {authWarning && (
        <div style={{
          background: "linear-gradient(90deg, #92400e, #78350f)",
          borderBottom: "1px solid rgba(245, 158, 11, 0.4)",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#fef3c7",
          fontSize: "13px",
          fontWeight: 500,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>⚠️</span>
            <span>
              <strong>Production Warning:</strong> <code>HUB_ADMIN_PASSWORD</code> is not set in environment variables.
              Set this in your Vercel Project Settings to prevent unauthorized access.
            </span>
          </div>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#ffffff", textDecoration: "underline", fontSize: "12px" }}
          >
            Configure in Vercel &rarr;
          </a>
        </div>
      )}

      {/* Top Navbar */}
      <header style={{
        background: "rgba(13, 17, 27, 0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e293b",
        padding: "14px 32px",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          {/* Brand & Node Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 18,
              color: "#ffffff",
              boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)",
            }}>
              L
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.01em" }}>
                  LUMIO SAAS MASTER HUB
                </h1>
                <span style={{
                  fontSize: 11,
                  background: "rgba(34, 197, 94, 0.12)",
                  color: "#4ade80",
                  border: "1px solid rgba(34, 197, 94, 0.25)",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
                  {hubUrl.replace(/^https?:\/\//, "")}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                Multi-Tenant Fleet Control • Remote Kill-Switch • Razorpay Recurring Engine
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4, background: "#0a0e1a", padding: "4px", borderRadius: 10, border: "1px solid #1e293b" }}>
            <button
              onClick={() => setActiveTab("FLEET")}
              style={{
                background: activeTab === "FLEET" ? "#1e293b" : "transparent",
                color: activeTab === "FLEET" ? "#f8fafc" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Fleet Directory ({totalTenants})
            </button>
            <button
              onClick={() => setActiveTab("PACKAGES")}
              style={{
                background: activeTab === "PACKAGES" ? "#1e293b" : "transparent",
                color: activeTab === "PACKAGES" ? "#f8fafc" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Packages & Pricing
            </button>
            <button
              onClick={() => setActiveTab("INVOICES")}
              style={{
                background: activeTab === "INVOICES" ? "#1e293b" : "transparent",
                color: activeTab === "INVOICES" ? "#f8fafc" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Billing & Invoices
            </button>
            <button
              onClick={() => setActiveTab("SYSTEM")}
              style={{
                background: activeTab === "SYSTEM" ? "#1e293b" : "transparent",
                color: activeTab === "SYSTEM" ? "#f8fafc" : "#94a3b8",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Webhooks & Setup
            </button>
          </nav>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                setWizardStep(1);
                setRegisterModalOpen(true);
              }}
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                color: "#ffffff",
                border: "none",
                padding: "9px 18px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Register Client & Issue License
            </button>

            {!authWarning && (
              <button
                onClick={handleLogout}
                title="Sign out of Super Admin"
                style={{
                  background: "#1e293b",
                  color: "#94a3b8",
                  border: "1px solid #334155",
                  padding: "9px 14px",
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px" }}>
        {/* ========================================================================= */}
        {/* TAB 1: FLEET DIRECTORY & REMOTE CONTROL                                    */}
        {/* ========================================================================= */}
        {activeTab === "FLEET" && (
          <div>
            {/* KPI Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
              {/* Fleet Capacity */}
              <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Registered Publications
                </span>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#f8fafc", marginTop: 4 }}>
                  {totalTenants}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Client newspaper portals managed
                </div>
              </div>

              {/* Active Subscriptions */}
              <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Active & Unlocked
                </span>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#22c55e", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  {activeTenants}
                  <span style={{ fontSize: 13, background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", padding: "2px 8px", borderRadius: 9999 }}>
                    Online
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Full CMS & frontend active
                </div>
              </div>

              {/* Active MRR */}
              <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Monthly Recurring Revenue
                </span>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#818cf8", marginTop: 4 }}>
                  ₹{activeMrr.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Projected monthly recurring billings
                </div>
              </div>

              {/* Suspended / Frozen */}
              <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 20px" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Suspended / Frozen
                </span>
                <div style={{ fontSize: 32, fontWeight: 800, color: suspendedTenants > 0 ? "#ef4444" : "#94a3b8", marginTop: 4 }}>
                  {suspendedTenants}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {suspendedTenants > 0 ? "Remote kill-switch active" : "Zero suspended clients"}
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{
              background: "#0d1322",
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}>
              {/* Status Filters */}
              <div style={{ display: "flex", gap: 6 }}>
                {(["ALL", "ACTIVE", "TRIAL", "GRACE_PERIOD", "SUSPENDED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    style={{
                      background: filter === s ? "#1e293b" : "transparent",
                      color: filter === s ? "#f8fafc" : "#94a3b8",
                      border: filter === s ? "1px solid #334155" : "1px solid transparent",
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {s === "ALL" ? "All Clients" : s.replace("_", " ")}
                  </button>
                ))}
              </div>

              {/* Search Field */}
              <div style={{ position: "relative", minWidth: 280 }}>
                <input
                  type="text"
                  placeholder="Search by publication, domain, license key..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#080c14",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "8px 12px 8px 34px",
                    color: "#f8fafc",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <svg
                  width="15"
                  height="15"
                  fill="none"
                  stroke="#64748b"
                  viewBox="0 0 24 24"
                  style={{ position: "absolute", left: 11, top: 10 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Client Fleet Data Table */}
            <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              {filteredTenants.length === 0 ? (
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📰</div>
                  <h3 style={{ margin: "0 0 6px", color: "#f8fafc", fontSize: 16 }}>No clients found</h3>
                  <p style={{ margin: "0 0 18px", fontSize: 13 }}>
                    {tenants.length === 0
                      ? "Get started by registering your first white-label news client."
                      : "No clients match your filter criteria."}
                  </p>
                  {tenants.length === 0 && (
                    <button
                      onClick={() => {
                        setWizardStep(1);
                        setRegisterModalOpen(true);
                      }}
                      style={{
                        background: "#4f46e5",
                        color: "#fff",
                        border: "none",
                        padding: "10px 18px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      + Register First Client
                    </button>
                  )}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#0a0e1a", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <th style={{ padding: "14px 20px" }}>Publication & Domain</th>
                      <th style={{ padding: "14px 16px" }}>License Key</th>
                      <th style={{ padding: "14px 16px" }}>Package Plan</th>
                      <th style={{ padding: "14px 16px" }}>Status</th>
                      <th style={{ padding: "14px 16px" }}>Validity</th>
                      <th style={{ padding: "14px 16px" }}>Heartbeat / Telemetry</th>
                      <th style={{ padding: "14px 20px", textAlign: "right" }}>Remote Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((t) => {
                      const isSuspended = t.status === "SUSPENDED" || t.status === "PAST_DUE";
                      const daysLeft = calculateDaysRemaining(t.validUntil);

                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: "1px solid #131b2e",
                            background: isSuspended ? "rgba(239, 68, 68, 0.03)" : "transparent",
                            transition: "background 0.15s",
                          }}
                        >
                          {/* Publication & Domain */}
                          <td style={{ padding: "16px 20px" }}>
                            <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>
                              {t.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                              <a
                                href={t.siteUrl.startsWith("http") ? t.siteUrl : `https://${t.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#60a5fa", textDecoration: "none", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                              >
                                {t.domain}
                                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                              {t.ownerPhone && (
                                <span style={{ color: "#475569", fontSize: 11 }}>• {t.ownerPhone}</span>
                              )}
                            </div>
                          </td>

                          {/* License Key */}
                          <td style={{ padding: "16px 16px" }}>
                            <div
                              onClick={() => copyToClipboard(t.licenseKey, `lic-${t.id}`)}
                              title="Click to copy license key"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                background: "#080c14",
                                border: "1px solid #1e293b",
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontFamily: "monospace",
                                fontSize: 11,
                                color: copiedKey === `lic-${t.id}` ? "#4ade80" : "#cbd5e1",
                                cursor: "pointer",
                              }}
                            >
                              <span>{t.licenseKey}</span>
                              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </td>

                          {/* Package Plan */}
                          <td style={{ padding: "16px 16px" }}>
                            <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 13 }}>
                              ₹{(t.amount / 100).toLocaleString("en-IN")}<span style={{ fontSize: 11, color: "#64748b" }}>/mo</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                              {t.planName.replace(/\(.*\)/, "").trim()}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: "16px 16px" }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 9px",
                              borderRadius: 9999,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                t.status === "ACTIVE"
                                  ? "rgba(34, 197, 94, 0.12)"
                                  : isSuspended
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(234, 179, 8, 0.15)",
                              color:
                                t.status === "ACTIVE"
                                  ? "#4ade80"
                                  : isSuspended
                                  ? "#f87171"
                                  : "#facc15",
                              border: `1px solid ${
                                t.status === "ACTIVE"
                                  ? "rgba(34, 197, 94, 0.25)"
                                  : isSuspended
                                  ? "rgba(239, 68, 68, 0.3)"
                                  : "rgba(234, 179, 8, 0.3)"
                              }`,
                            }}>
                              <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background:
                                  t.status === "ACTIVE"
                                    ? "#22c55e"
                                    : isSuspended
                                    ? "#ef4444"
                                    : "#eab308",
                              }}></span>
                              {t.status}
                            </span>
                            {isSuspended && t.lockScope && (
                              <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                                Scope: {t.lockScope.replace("_", " ")}
                              </div>
                            )}
                          </td>

                          {/* Validity */}
                          <td style={{ padding: "16px 16px" }}>
                            <div style={{ fontWeight: 600, color: daysLeft.includes("Overdue") ? "#ef4444" : "#e2e8f0" }}>
                              {daysLeft}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {t.validUntil ? new Date(t.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                            </div>
                          </td>

                          {/* Telemetry / Heartbeat */}
                          <td style={{ padding: "16px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: t.lastHeartbeatAt ? "#34d399" : "#64748b" }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.lastHeartbeatAt ? "#10b981" : "#475569" }}></span>
                              {t.lastHeartbeatAt ? "Connected" : "No heartbeat"}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                              {t.articleCount} articles • {t.userCount} users
                            </div>
                          </td>

                          {/* Action Controls */}
                          <td style={{ padding: "16px 20px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                              {/* 1-Click Master SSO */}
                              <button
                                onClick={() => handleLaunchSso(t)}
                                disabled={actionLoading === `sso-${t.id}`}
                                title="Login directly into client CMS as Super Admin"
                                style={{
                                  background: "#1e1b4b",
                                  color: "#a5b4fc",
                                  border: "1px solid rgba(165, 180, 252, 0.2)",
                                  padding: "6px 10px",
                                  borderRadius: 7,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                ⚡ SSO
                              </button>

                              {/* View / Copy .env */}
                              <button
                                onClick={() => handleViewEnv(t)}
                                title="View generated .env template for Vercel"
                                style={{
                                  background: "#0f172a",
                                  color: "#cbd5e1",
                                  border: "1px solid #1e293b",
                                  padding: "6px 10px",
                                  borderRadius: 7,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                📄 .env
                              </button>

                              {/* Instant Kill-Switch: Freeze / Unfreeze */}
                              {isSuspended ? (
                                <button
                                  onClick={() => handleToggleFreeze(t, "UNFREEZE")}
                                  disabled={actionLoading === `freeze-${t.id}`}
                                  style={{
                                    background: "rgba(34, 197, 94, 0.15)",
                                    color: "#4ade80",
                                    border: "1px solid rgba(34, 197, 94, 0.3)",
                                    padding: "6px 12px",
                                    borderRadius: 7,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  🔓 Unfreeze
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setFreezeModalTenant(t);
                                    setFreezeScope("ADMIN_ONLY");
                                  }}
                                  style={{
                                    background: "rgba(239, 68, 68, 0.12)",
                                    color: "#f87171",
                                    border: "1px solid rgba(239, 68, 68, 0.25)",
                                    padding: "6px 12px",
                                    borderRadius: 7,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  🔒 Freeze
                                </button>
                              )}

                              {/* Edit Drawer Trigger */}
                              <button
                                onClick={() => handleOpenEdit(t)}
                                title="Edit client details or plan"
                                style={{
                                  background: "#1e293b",
                                  color: "#94a3b8",
                                  border: "none",
                                  padding: "6px 8px",
                                  borderRadius: 7,
                                  cursor: "pointer",
                                }}
                              >
                                ⚙️
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PACKAGES & PRICING MANAGEMENT                                      */}
        {/* ========================================================================= */}
        {activeTab === "PACKAGES" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>
                  Subscription Packages & Tier Management
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
                  Configure your standard tiers (₹499/mo Website Basic, ₹599/mo ePaper Pro, ₹999/mo Full Newsroom Bundle).
                </p>
              </div>
            </div>

            {/* Plans Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 36 }}>
              {plans.map((p) => {
                const feats = (p.features as any) || {};

                return (
                  <div
                    key={p.code}
                    style={{
                      background: "#0d1322",
                      border: p.isPopular ? "2px solid #6366f1" : "1px solid #1e293b",
                      borderRadius: 14,
                      padding: "24px",
                      position: "relative",
                      boxShadow: p.isPopular ? "0 0 30px rgba(99, 102, 241, 0.15)" : "none",
                    }}
                  >
                    {p.isPopular && (
                      <span style={{
                        position: "absolute",
                        top: -12,
                        right: 20,
                        background: "linear-gradient(135deg, #6366f1, #a855f7)",
                        color: "#ffffff",
                        padding: "3px 12px",
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                      }}>
                        MOST POPULAR
                      </span>
                    )}

                    <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>{p.name}</h3>
                    <p style={{ margin: "0 0 16px", fontSize: 12, color: "#94a3b8", minHeight: 36 }}>{p.description}</p>

                    <div style={{ marginBottom: 20 }}>
                      <span style={{ fontSize: 32, fontWeight: 900, color: "#f8fafc" }}>
                        ₹{(p.monthlyPrice / 100).toLocaleString("en-IN")}
                      </span>
                      <span style={{ fontSize: 13, color: "#64748b" }}> / month</span>
                      {p.annualPrice && (
                        <div style={{ fontSize: 11, color: "#10b981", marginTop: 2, fontWeight: 600 }}>
                          Or ₹{(p.annualPrice / 100).toLocaleString("en-IN")}/year (2 months free)
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                        Included Features
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9, fontSize: 13, color: "#cbd5e1" }}>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#22c55e" }}>✓</span> White-label Web Portal & CMS
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: feats.enableEpaper ? "#22c55e" : "#64748b" }}>
                            {feats.enableEpaper ? "✓" : "✕"}
                          </span>
                          <span style={{ color: feats.enableEpaper ? "#cbd5e1" : "#64748b" }}>
                            Interactive Digital ePaper Engine
                          </span>
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: feats.enableMobileApi ? "#22c55e" : "#64748b" }}>
                            {feats.enableMobileApi ? "✓" : "✕"}
                          </span>
                          <span style={{ color: feats.enableMobileApi ? "#cbd5e1" : "#64748b" }}>
                            Reporter & Consumer Mobile Apps (Android/iOS)
                          </span>
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#22c55e" }}>✓</span> Live TV Streaming Embed
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#22c55e" }}>✓</span> YouTube Auto-Import & Shorts
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#22c55e" }}>✓</span> Mandi Crop & Bullion Rates
                        </li>
                        <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#22c55e" }}>✓</span> Remote Kill-Switch & SSO Integration
                        </li>
                      </ul>
                    </div>

                    <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #1e293b" }}>
                      <div style={{ fontSize: 11, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                        <span>Plan Code: <code>{p.code}</code></span>
                        <span>{tenants.filter((t) => t.planId === p.code).length} active clients</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Standalone Add-ons Catalog */}
            <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 14, padding: "24px" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                Modular Add-Ons Catalog
              </h3>
              <p style={{ margin: "0 0 18px", fontSize: 13, color: "#94a3b8" }}>
                Add-on features that can be enabled individually for clients on top of any basic package.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 10, padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>ePaper Pro Module</div>
                    <span style={{ color: "#6366f1", fontWeight: 800, fontSize: 13 }}>₹199/mo</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    Enables PDF upload, edition management, page clipping, and reader archive.
                  </p>
                </div>

                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 10, padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>Mobile Apps Bundle</div>
                    <span style={{ color: "#6366f1", fontWeight: 800, fontSize: 13 }}>₹499/mo</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    Expo mobile backends for field journalists and Android/iOS consumer app.
                  </p>
                </div>

                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 10, padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>WhatsApp News Broadcast</div>
                    <span style={{ color: "#6366f1", fontWeight: 800, fontSize: 13 }}>₹299/mo</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    Automated push of breaking headlines directly into subscriber WhatsApp channels.
                  </p>
                </div>

                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 10, padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>AI Auto-Rewrite & SEO</div>
                    <span style={{ color: "#6366f1", fontWeight: 800, fontSize: 13 }}>₹399/mo</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    Google Gemini 2.5 Flash pipeline for automated Telugu grammar check and SEO tagging.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: BILLING & INVOICES                                                 */}
        {/* ========================================================================= */}
        {activeTab === "INVOICES" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>
                  Billing & Payment Ledger
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
                  Real-time synchronization with Razorpay recurring subscriptions.
                </p>
              </div>
            </div>

            <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              {invoices.length === 0 ? (
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
                  <h3 style={{ margin: "0 0 6px", color: "#f8fafc", fontSize: 16 }}>No billing transactions yet</h3>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Invoices will automatically appear here when Razorpay charges subscription cycles or when clients pay.
                  </p>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#0a0e1a", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                      <th style={{ padding: "14px 20px" }}>Client</th>
                      <th style={{ padding: "14px 16px" }}>Billing Period</th>
                      <th style={{ padding: "14px 16px" }}>Amount</th>
                      <th style={{ padding: "14px 16px" }}>Status</th>
                      <th style={{ padding: "14px 16px" }}>Razorpay Payment ID</th>
                      <th style={{ padding: "14px 20px", textAlign: "right" }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: "1px solid #131b2e" }}>
                        <td style={{ padding: "16px 20px" }}>
                          <div style={{ fontWeight: 700, color: "#f8fafc" }}>{inv.tenant?.name || "Client"}</div>
                          <div style={{ fontSize: 12, color: "#60a5fa" }}>{inv.tenant?.domain}</div>
                        </td>
                        <td style={{ padding: "16px 16px", color: "#cbd5e1" }}>{inv.billingPeriod}</td>
                        <td style={{ padding: "16px 16px", fontWeight: 700, color: "#f8fafc" }}>
                          ₹{(inv.amount / 100).toLocaleString("en-IN")}
                        </td>
                        <td style={{ padding: "16px 16px" }}>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: inv.status === "PAID" ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                            color: inv.status === "PAID" ? "#4ade80" : "#facc15",
                          }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ padding: "16px 16px", fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>
                          {inv.razorpayPaymentId || "Manual / Trial"}
                        </td>
                        <td style={{ padding: "16px 20px", textAlign: "right", color: "#64748b", fontSize: 12 }}>
                          {new Date(inv.createdAt).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SYSTEM & WEBHOOK CONFIG                                            */}
        {/* ========================================================================= */}
        {activeTab === "SYSTEM" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
            {/* Razorpay Webhook Instructions */}
            <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 14, padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                  R
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                    Razorpay Webhook Setup
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                    Configure automatic renewal and freeze triggers
                  </p>
                </div>
              </div>

              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 16 }}>
                In your Razorpay Dashboard (<strong>Settings &rarr; Webhooks</strong>), click <strong>Add New Webhook</strong> and configure:
              </p>

              {/* API Keys Live Authenticator */}
              <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 10, padding: "16px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
                      Razorpay API Credentials (RAZORPAY_KEY_ID &amp; RAZORPAY_KEY_SECRET)
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>
                      Validates whether your Vercel API keys can create orders and accept live payments.
                    </p>
                  </div>
                  <button
                    onClick={handleTestApiKeys}
                    disabled={testingApiKeys}
                    style={{
                      background: testingApiKeys ? "#334155" : "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      cursor: testingApiKeys ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {testingApiKeys ? "Verifying with Razorpay..." : "Test Razorpay Keys"}
                  </button>
                </div>

                {apiKeysTestResult && (
                  <div style={{
                    fontSize: 12,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: apiKeysTestResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    color: apiKeysTestResult.success ? "#34d399" : "#fca5a5",
                    border: `1px solid ${apiKeysTestResult.success ? "#10b981" : "#ef4444"}`,
                    marginTop: 10,
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {apiKeysTestResult.success ? "✓ " : "✕ "}
                      {apiKeysTestResult.message}
                    </div>
                    {apiKeysTestResult.recommendation && (
                      <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5, marginTop: 4 }}>
                        <strong>Action Needed:</strong> {apiKeysTestResult.recommendation}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
                  Webhook Endpoint URL
                </label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={`${effectiveHubUrl}/api/webhooks/razorpay`}
                    style={{ flex: 1, background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", color: "#f8fafc", fontFamily: "monospace", fontSize: 12 }}
                  />
                  <button
                    onClick={() => copyToClipboard(`${effectiveHubUrl}/api/webhooks/razorpay`, "rp-wh")}
                    style={{ background: "#1e293b", color: "#f8fafc", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    {copiedKey === "rp-wh" ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={handleTestWebhook}
                    disabled={testingWebhook}
                    style={{ background: "#0284c7", color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: testingWebhook ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}
                  >
                    {testingWebhook ? "Testing..." : "Test Endpoint"}
                  </button>
                </div>
                {webhookTestResult && (
                  <div style={{
                    fontSize: 12,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: webhookTestResult.success ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: webhookTestResult.success ? "#34d399" : "#f87171",
                    border: `1px solid ${webhookTestResult.success ? "#10b981" : "#ef4444"}`,
                    marginBottom: 10,
                  }}>
                    {webhookTestResult.message}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                <strong>Events to Enable:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 4 }}>
                  <li><code>payment.captured</code> (Auto-renews subscription for 30 days)</li>
                  <li><code>subscription.charged</code> (Extends subscription period)</li>
                  <li><code>payment.failed</code> (Sends client warning & grace window)</li>
                  <li><code>subscription.cancelled</code> (Immediately triggers remote freeze)</li>
                </ul>
              </div>
            </div>

            {/* Architecture Handshake & Heartbeat */}
            <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 14, padding: "24px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                Cryptographic Handshake & Kill-Switch
              </h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                How the SaaS Hub protects and commands client instances:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12, color: "#cbd5e1" }}>
                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>
                    1. Telemetry Heartbeat (Every 6h)
                  </div>
                  <div style={{ color: "#94a3b8" }}>
                    Client newspaper pings <code>/api/v1/fleet/heartbeat</code> signed with HMAC-SHA256. If expired, Hub instructs client to suspend.
                  </div>
                </div>

                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>
                    2. Instant Push Kill-Switch (&lt; 100ms)
                  </div>
                  <div style={{ color: "#94a3b8" }}>
                    When you click Freeze in this Hub, an HMAC push hits <code>https://[client-domain]/api/saas/sync</code>, locking the CMS immediately.
                  </div>
                </div>

                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>
                    3. Ephemeral Master SSO Link
                  </div>
                  <div style={{ color: "#94a3b8" }}>
                    Clicking &quot;⚡ SSO&quot; generates a 5-minute single-use cryptographic token, letting you log in as Super Admin into any client CMS without passwords.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: REGISTER CLIENT & GENERATE .ENV WIZARD                           */}
      {/* ========================================================================= */}
      {registerModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: 20,
        }}>
          <div style={{
            background: "#0d1322",
            border: "1px solid #1e293b",
            borderRadius: 16,
            width: "100%",
            maxWidth: 720,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
          }}>
            {/* Wizard Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
                  Register Client & Issue License
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  Step {wizardStep} of 3: {wizardStep === 1 ? "Publication & Owner Info" : wizardStep === 2 ? "Package & Features" : "Database & Storage"}
                </p>
              </div>
              <button
                onClick={() => setRegisterModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Stepper Indicator */}
            <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#080c14" }}>
              <div
                onClick={() => setWizardStep(1)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: wizardStep === 1 ? "#6366f1" : "#64748b",
                  borderBottom: wizardStep === 1 ? "2px solid #6366f1" : "none",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                1. Publication
              </div>
              <div
                onClick={() => setWizardStep(2)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: wizardStep === 2 ? "#6366f1" : "#64748b",
                  borderBottom: wizardStep === 2 ? "2px solid #6366f1" : "none",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                2. Package Plan
              </div>
              <div
                onClick={() => setWizardStep(3)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: wizardStep === 3 ? "#6366f1" : "#64748b",
                  borderBottom: wizardStep === 3 ? "2px solid #6366f1" : "none",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                3. Database & .env
              </div>
            </div>

            {/* Wizard Body */}
            <form onSubmit={handleCreateTenant} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                {createError && (
                  <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
                    {createError}
                  </div>
                )}

                {/* STEP 1: Publication Profile */}
                {wizardStep === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                          Publication English Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Andhra Chronicle"
                          value={formData.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              name: val,
                              domain: prev.domain || `${val.toLowerCase().replace(/[^a-z0-9]/g, "")}.smsinfotek.in`,
                              siteUrl: prev.siteUrl || `https://${val.toLowerCase().replace(/[^a-z0-9]/g, "")}.smsinfotek.in`,
                            }));
                          }}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                          Local Regional Title (Telugu/Hindi)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. ఆంధ్ర క్రానికల్"
                          value={formData.nameLocal}
                          onChange={(e) => setFormData({ ...formData, nameLocal: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                          Client Domain / Subdomain *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. acps.smsinfotek.in"
                          value={formData.domain}
                          onChange={(e) => {
                            const dom = e.target.value;
                            setFormData({
                              ...formData,
                              domain: dom,
                              siteUrl: `https://${dom.replace(/^https?:\/\//, "")}`,
                            });
                          }}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                          Full Production Site URL *
                        </label>
                        <input
                          type="url"
                          required
                          placeholder="https://acps.smsinfotek.in"
                          value={formData.siteUrl}
                          onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>
                        Client Owner & Billing Contact
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Owner Name</label>
                          <input
                            type="text"
                            placeholder="John Doe"
                            value={formData.ownerName}
                            onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                            style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Owner Email *</label>
                          <input
                            type="email"
                            required
                            placeholder="publisher@domain.com"
                            value={formData.ownerEmail}
                            onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                            style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Phone / WhatsApp</label>
                          <input
                            type="tel"
                            placeholder="+919876543210"
                            value={formData.ownerPhone}
                            onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                            style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Package Selection */}
                {wizardStep === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
                      Select Subscription Package Tier
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      {plans.map((p) => (
                        <div
                          key={p.code}
                          onClick={() => setFormData({ ...formData, planId: p.code, amount: String(p.monthlyPrice) })}
                          style={{
                            background: formData.planId === p.code ? "rgba(99, 102, 241, 0.15)" : "#080c14",
                            border: formData.planId === p.code ? "2px solid #6366f1" : "1px solid #1e293b",
                            borderRadius: 12,
                            padding: "16px",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#818cf8", margin: "6px 0" }}>
                            ₹{(p.monthlyPrice / 100).toLocaleString("en-IN")}<span style={{ fontSize: 12, color: "#64748b" }}>/mo</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{p.description}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", marginBottom: 10 }}>
                        Active Module Permissions for this Client
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={formData.planId !== "website_basic" || formData.enableEpaper}
                            onChange={(e) => setFormData({ ...formData, enableEpaper: e.target.checked })}
                          />
                          ePaper Edition & Crop Engine
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={formData.planId === "web_app_bundle" || formData.enableMobileApi}
                            onChange={(e) => setFormData({ ...formData, enableMobileApi: e.target.checked })}
                          />
                          Reporter & Reader Mobile App API
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={formData.enableLiveTv}
                            onChange={(e) => setFormData({ ...formData, enableLiveTv: e.target.checked })}
                          />
                          Live TV Streaming Stream
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={formData.enableYouTubeSync}
                            onChange={(e) => setFormData({ ...formData, enableYouTubeSync: e.target.checked })}
                          />
                          YouTube Channel Sync & Shorts
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: Database & Infrastructure */}
                {wizardStep === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: 8, padding: "12px", fontSize: 12, color: "#a5b4fc" }}>
                      💡 <strong>Automated Vercel .env Generation:</strong> The system will automatically generate a complete production <code>.env</code> file containing unique cryptographic secrets, license key, and Cloudflare/Neon settings for this client.
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                        Client PostgreSQL Database URL (Neon / Supabase)
                      </label>
                      <input
                        type="text"
                        placeholder="postgresql://user:password@ep-sample.ap-southeast-1.aws.neon.tech/news_db?sslmode=require"
                        value={formData.databaseUrl}
                        onChange={(e) => setFormData({ ...formData, databaseUrl: e.target.value })}
                        style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 12px", color: "#f8fafc", fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }}
                      />
                      <span style={{ fontSize: 11, color: "#64748b" }}>Leave blank to use template placeholder to be filled later.</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Cloudflare R2 Account ID (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. 8f90c12e..."
                          value={formData.r2AccountId}
                          onChange={(e) => setFormData({ ...formData, r2AccountId: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 12, boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>R2 Public Media Domain (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. https://media.clientdomain.com"
                          value={formData.r2PublicUrl}
                          onChange={(e) => setFormData({ ...formData, r2PublicUrl: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 12, boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Primary Brand Color</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="color"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                            style={{ width: 36, height: 36, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer" }}
                          />
                          <input
                            type="text"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                            style={{ flex: 1, background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px", color: "#f8fafc", fontSize: 12 }}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Google Gemini API Key</label>
                        <input
                          type="password"
                          placeholder="AI Studio key"
                          value={formData.geminiApiKey}
                          onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 12, boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>Google AdSense ID</label>
                        <input
                          type="text"
                          placeholder="pub-xxxxxxxx"
                          value={formData.googleAdsenseId}
                          onChange={(e) => setFormData({ ...formData, googleAdsenseId: e.target.value })}
                          style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 12, boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Wizard Footer */}
              <div style={{ padding: "16px 24px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e1a" }}>
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => (s - 1) as any)}
                    style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    &larr; Back
                  </button>
                ) : <div></div>}

                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!formData.name || !formData.domain || !formData.siteUrl || !formData.ownerEmail) {
                        setCreateError("Please complete all required fields (*).");
                        return;
                      }
                      setCreateError(null);
                      setWizardStep((s) => (s + 1) as any);
                    }}
                    style={{ background: "#4f46e5", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Next: {wizardStep === 1 ? "Select Package" : "Database & .env"} &rarr;
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={createLoading}
                    style={{
                      background: createLoading ? "#475569" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#fff",
                      border: "none",
                      padding: "9px 22px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: createLoading ? "not-allowed" : "pointer",
                      boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                    }}
                  >
                    {createLoading ? "Provisioning Client..." : "✓ Complete & Generate .env"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW / COPY GENERATED .ENV MODAL                                 */}
      {/* ========================================================================= */}
      {envModalData && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 60,
          padding: 20,
        }}>
          <div style={{
            background: "#0d1322",
            border: "1px solid #1e293b",
            borderRadius: 16,
            width: "100%",
            maxWidth: 780,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9)",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
                    Production .env Configuration
                  </h2>
                  <span style={{ fontSize: 11, background: "rgba(99, 102, 241, 0.15)", color: "#a5b4fc", padding: "2px 8px", borderRadius: 9999, fontWeight: 600 }}>
                    {envModalData.domain}
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  Client: <strong>{envModalData.tenantName}</strong> • License Key: <code>{envModalData.licenseKey}</code>
                </p>
              </div>
              <button
                onClick={() => setEnvModalData(null)}
                style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Quick Action Banner */}
            <div style={{ background: "#080c14", borderBottom: "1px solid #1e293b", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Paste these directly into <strong>Vercel &rarr; Project Settings &rarr; Environment Variables</strong>.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => copyToClipboard(envModalData.licenseKey, "lic-only")}
                  style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {copiedKey === "lic-only" ? "✓ Copied Key!" : "Copy License Key"}
                </button>
                <button
                  onClick={() => copyToClipboard(envModalData.envContent, "env-all")}
                  style={{ background: "#4f46e5", color: "#ffffff", border: "none", padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {copiedKey === "env-all" ? "✓ Copied All .env!" : "1-Click Copy All for Vercel"}
                </button>
                <button
                  onClick={() => downloadEnvFile(envModalData.domain, envModalData.envContent)}
                  style={{ background: "#059669", color: "#ffffff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Download .env
                </button>
              </div>
            </div>

            {/* .env Content Viewer */}
            <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1, background: "#060911" }}>
              <pre style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                color: "#e2e8f0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}>
                {envModalData.envContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: FREEZE / KILL-SWITCH CONFIRMATION MODAL                          */}
      {/* ========================================================================= */}
      {freezeModalTenant && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 70,
          padding: 20,
        }}>
          <div style={{
            background: "#0d1322",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 16,
            width: "100%",
            maxWidth: 500,
            padding: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                🔒
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f8fafc" }}>
                  Remote Freeze Kill-Switch
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                  Target: <strong>{freezeModalTenant.name}</strong> ({freezeModalTenant.domain})
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 18 }}>
              This will dispatch an instant cryptographic command to lock the client&apos;s instance. Choose the freeze scope:
            </p>

            {/* Scope Selection */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              <label
                onClick={() => setFreezeScope("ADMIN_ONLY")}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: freezeScope === "ADMIN_ONLY" ? "rgba(99, 102, 241, 0.12)" : "#080c14",
                  border: freezeScope === "ADMIN_ONLY" ? "1px solid #6366f1" : "1px solid #1e293b",
                  padding: "12px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="freezeScope"
                  checked={freezeScope === "ADMIN_ONLY"}
                  onChange={() => setFreezeScope("ADMIN_ONLY")}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 13 }}>Lock Admin CMS Only (Recommended)</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Editors and stringers cannot log in or publish articles. Public newspaper site remains readable.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setFreezeScope("FULL_SITE")}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: freezeScope === "FULL_SITE" ? "rgba(239, 68, 68, 0.12)" : "#080c14",
                  border: freezeScope === "FULL_SITE" ? "1px solid #ef4444" : "1px solid #1e293b",
                  padding: "12px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="freezeScope"
                  checked={freezeScope === "FULL_SITE"}
                  onChange={() => setFreezeScope("FULL_SITE")}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 13 }}>Lock Entire Website (Nuclear)</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Redirects all visitors and editors to the suspension screen (<code>/suspended</code>).
                  </div>
                </div>
              </label>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>
                Reason for Suspension (Visible to Client Admin)
              </label>
              <textarea
                rows={2}
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 12, resize: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setFreezeModalTenant(null)}
                style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleFreeze(freezeModalTenant, "FREEZE")}
                style={{ background: "#ef4444", color: "#ffffff", border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Confirm & Freeze Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: EDIT TENANT / CUSTOM PRICING                                      */}
      {/* ========================================================================= */}
      {editingTenant && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 80,
        }}>
          <div style={{
            background: "#0d1322",
            borderLeft: "1px solid #1e293b",
            width: "100%",
            maxWidth: 480,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.8)",
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f8fafc" }}>Client Settings</h3>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>{editingTenant.name} ({editingTenant.domain})</p>
              </div>
              <button
                onClick={() => setEditingTenant(null)}
                style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "24px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>Publication Name</label>
                <input
                  type="text"
                  value={editFormData.name || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>Assigned Plan</label>
                  <select
                    value={editFormData.planId || "website_basic"}
                    onChange={(e) => {
                      const sel = plans.find((p) => p.code === e.target.value);
                      setEditFormData({
                        ...editFormData,
                        planId: e.target.value,
                        planName: sel?.name || "Website Basic",
                        amount: sel?.monthlyPrice || 49900,
                      });
                    }}
                    style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                  >
                    {plans.map((p) => (
                      <option key={p.code} value={p.code}>{p.name} (₹{(p.monthlyPrice / 100).toLocaleString("en-IN")})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>Custom Monthly Fee (₹)</label>
                  <input
                    type="number"
                    value={Math.round((editFormData.amount || 49900) / 100)}
                    onChange={(e) => setEditFormData({ ...editFormData, amount: Number(e.target.value) * 100 })}
                    style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>Subscription Expiry Date</label>
                <input
                  type="date"
                  value={editFormData.validUntil || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, validUntil: e.target.value })}
                  style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>
                  Razorpay Direct Payment Link (Optional Fallback)
                </label>
                <input
                  type="url"
                  placeholder="https://rzp.io/l/... or https://pages.razorpay.com/..."
                  value={editFormData.razorpayPaymentLink || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, razorpayPaymentLink: e.target.value })}
                  style={{ width: "100%", background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", color: "#f8fafc", fontSize: 13, boxSizing: "border-box" }}
                />
                <span style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "block" }}>
                  Clients can pay directly via this link if API order creation encounters credential errors.
                </span>
              </div>

              <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase" }}>
                  Module Permissions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editFormData.features?.enableEpaper ?? false}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        features: { ...(editFormData.features || {}), enableEpaper: e.target.checked },
                      })}
                    />
                    Enable ePaper Edition Engine
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editFormData.features?.enableMobileApi ?? false}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        features: { ...(editFormData.features || {}), enableMobileApi: e.target.checked },
                      })}
                    />
                    Enable Mobile Apps API (Reporter/Reader)
                  </label>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase" }}>
                  License Information
                </div>
                <div style={{ background: "#080c14", border: "1px solid #1e293b", borderRadius: 8, padding: "10px", fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>
                  <div>License: {editingTenant.licenseKey}</div>
                  <div style={{ marginTop: 4 }}>Secret: {editingTenant.clientSecret.slice(0, 10)}••••••••••••</div>
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "flex-end", gap: 10, background: "#0a0e1a" }}>
              <button
                onClick={() => setEditingTenant(null)}
                style={{ background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading === "save-edit"}
                style={{ background: "#4f46e5", color: "#ffffff", border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {actionLoading === "save-edit" ? "Saving..." : "Save & Sync to Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
