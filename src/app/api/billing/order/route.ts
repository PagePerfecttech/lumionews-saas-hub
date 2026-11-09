import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRazorpayClient, cleanRazorpayCredential } from "@/lib/razorpay";
import { verifyBillingSessionToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let tenant: any = null;
  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = body.sessionToken?.trim();
    const licenseKey = body.licenseKey?.trim();
    const domain = body.domain?.trim();

    // 1. Resolve tenant via secure sessionToken, licenseKey, or domain
    if (sessionToken) {
      const decoded = verifyBillingSessionToken(sessionToken);
      if (decoded?.tenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: decoded.tenantId } });
      }
    }

    if (!tenant && licenseKey) {
      tenant = await prisma.tenant.findUnique({ where: { licenseKey } });
    }

    if (!tenant && domain) {
      const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
      tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { domain: cleanDomain },
            { domain: { contains: cleanDomain, mode: "insensitive" } },
            { siteUrl: { contains: cleanDomain, mode: "insensitive" } },
          ],
        },
      });
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found or session has expired. Please reload from your CMS." },
        { status: 404 }
      );
    }

    // 2. Validate Razorpay credentials (with automatic sanitization of quotes / formatting)
    const key_id = cleanRazorpayCredential(process.env.RAZORPAY_KEY_ID);
    const key_secret = cleanRazorpayCredential(process.env.RAZORPAY_KEY_SECRET);

    if (!key_id || !key_secret || key_id.includes("your_") || key_secret.includes("your_")) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured in Vercel environment variables for SaaS Hub (app.smsinfotek.in). Please add active keys in Vercel.",
          paymentLink: tenant.razorpayPaymentLink || null,
        },
        { status: 500 }
      );
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to initialize Razorpay payment client. Please check API credentials.",
          paymentLink: tenant.razorpayPaymentLink || null,
        },
        { status: 500 }
      );
    }

    // 3. Construct clean order parameters complying with Razorpay constraints
    const amount = Math.max(Math.round(Number(tenant.amount) || 49900), 100);
    const currency = (tenant.currency || "INR").toUpperCase();
    const receipt = `rcpt_${tenant.id.slice(-6)}_${Date.now()}`.slice(0, 40);

    const notes: Record<string, string> = {
      tenantId: String(tenant.id).slice(0, 40),
      domain: String(tenant.domain).slice(0, 100),
      planName: String(tenant.planName || "Subscription").slice(0, 100),
    };

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: key_id,
      tenantName: tenant.name,
      ownerEmail: tenant.ownerEmail || "",
      ownerPhone: tenant.ownerPhone || "",
      paymentLink: tenant.razorpayPaymentLink || null,
    });
  } catch (err: any) {
    const rzpErr = err?.error || err;
    const rzpDesc =
      rzpErr?.description ||
      rzpErr?.message ||
      err?.message ||
      (typeof err === "string" ? err : "Failed to create Razorpay order");

    console.error("[Billing Order API Error]:", rzpDesc, err);

    let diagnosticMessage = `Razorpay Error: ${rzpDesc}`;
    if (String(rzpDesc).toLowerCase().includes("authentication failed")) {
      diagnosticMessage =
        "Razorpay Error: Authentication failed. The API Key ID and Secret in Vercel environment variables for SaaS Hub (app.smsinfotek.in) do not match or are expired in your Razorpay Dashboard. Check /api/billing/diagnostic for details.";
    }

    return NextResponse.json(
      {
        success: false,
        error: diagnosticMessage,
        rawError: rzpDesc,
        paymentLink: tenant?.razorpayPaymentLink || null,
      },
      { status: 500 }
    );
  }
}
