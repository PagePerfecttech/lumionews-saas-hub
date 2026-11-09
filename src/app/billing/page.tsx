import { prisma } from "@/lib/db";
import Link from "next/link";
import { BillingCheckoutClient } from "./checkout-client";
import { createBillingSessionToken, verifyBillingSessionToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

interface BillingPageProps {
  searchParams: Promise<{
    session?: string;
    token?: string;
    licenseKey?: string;
    d?: string;
    domain?: string;
    success?: string;
  }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const token = params.session?.trim() || params.token?.trim();
  const domainParam = params.d?.trim() || params.domain?.trim();
  const rawKey = params.licenseKey?.trim();

  let tenant: any = null;

  // 1. Resolve via secure short-lived session token (preferred, no secret leaked in URL)
  if (token) {
    const verified = verifyBillingSessionToken(token);
    if (verified?.tenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: verified.tenantId },
        include: { invoices: { take: 5, orderBy: { createdAt: "desc" } } },
      });
    }
  }

  // 2. Resolve via domain (public domain name, completely safe)
  if (!tenant && domainParam) {
    const cleanDomain = domainParam.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { domain: cleanDomain },
          { domain: { contains: cleanDomain, mode: "insensitive" } },
          { siteUrl: { contains: cleanDomain, mode: "insensitive" } },
        ],
      },
      include: { invoices: { take: 5, orderBy: { createdAt: "desc" } } },
    });
  }

  // 3. Fallback: resolve via legacy licenseKey (URL will be cleansed by client immediately)
  if (!tenant && rawKey) {
    tenant = await prisma.tenant.findUnique({
      where: { licenseKey: rawKey },
      include: { invoices: { take: 5, orderBy: { createdAt: "desc" } } },
    });
  }

  if (!tenant) {
    return (
      <div style={{ minHeight: "100vh", background: "#060911", color: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "sans-serif" }}>
        <div style={{ background: "#0d1322", border: "1px solid #1e293b", borderRadius: 16, padding: "32px", maxWidth: 480, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>
            ✕
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Subscription Not Found</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
            No active publication was found matching the provided session or domain. Please return to your newspaper CMS and click &quot;Renew / Pay Now&quot; again.
          </p>
          <a
            href="https://app.smsinfotek.in"
            style={{ display: "inline-block", background: "#1e293b", color: "#f8fafc", padding: "10px 20px", borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600 }}
          >
            Go to SaaS Hub Home &rarr;
          </a>
        </div>
      </div>
    );
  }

  // Create an opaque session token to replace raw keys in the URL
  const sessionToken = createBillingSessionToken(tenant.id, tenant.licenseKey);
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
  const paymentLink = tenant.razorpayPaymentLink || null;

  // Mask license key for UI so sensitive keys are never exposed in cleartext
  const maskedKey = tenant.licenseKey
    ? `${tenant.licenseKey.slice(0, 6)}••••••••${tenant.licenseKey.slice(-4)}`
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#060911", color: "#f8fafc", padding: "40px 20px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 16 }}>
              L
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>LumioNews SaaS Fleet</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Billing &amp; Subscription Portal</div>
            </div>
          </div>
          <a
            href={tenant.siteUrl ? `${tenant.siteUrl.replace(/\/+$/, "")}/admin/subscription` : "/"}
            style={{ color: "#94a3b8", textDecoration: "none", fontSize: 12, fontWeight: 600, padding: "6px 12px", border: "1px solid #1e293b", borderRadius: 6 }}
          >
            &larr; Return to {tenant.name} CMS
          </a>
        </div>

        {/* Client Billing Container */}
        <BillingCheckoutClient
          tenant={JSON.parse(JSON.stringify(tenant))}
          sessionToken={sessionToken}
          maskedKey={maskedKey}
          razorpayKeyId={razorpayKeyId}
          paymentLink={paymentLink}
          successNotice={params.success === "true"}
        />
      </div>
    </div>
  );
}
