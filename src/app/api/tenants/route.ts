import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLicenseKey, generateClientSecret } from "@/lib/crypto";
import { createSubscriptionPaymentLink } from "@/lib/razorpay";
import { generateClientEnv } from "@/lib/env-generator";
import { verifyApiAuth } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenants
 * Lists all registered client newspaper tenants with metrics.
 */
export async function GET(req: NextRequest) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    return NextResponse.json({ success: true, tenants });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

/**
 * POST /api/tenants
 * Provisions a new client newspaper tenant, generates unique license keys and HMAC secrets,
 * provisions initial Razorpay billing link, and generates .env config for client's Vercel deployment.
 */
export async function POST(req: NextRequest) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const {
      name,
      nameLocal,
      domain,
      siteUrl,
      ownerName,
      ownerEmail,
      ownerPhone,
      planId = "website_basic",
      planName = "Website Basic (₹499/mo)",
      amount = 49900, // ₹499 in paise
      features = {},

      // Client Deployment .env Inputs
      databaseUrl,
      directUrl,
      r2AccountId,
      r2AccessKeyId,
      r2SecretAccessKey,
      r2BucketName,
      r2PublicUrl,
      primaryColor,
      themeColor,
      accentColor,
      geminiApiKey,
      googleAdsenseId,
      onesignalAppId,
    } = body;

    if (!name || !domain || !siteUrl || !ownerEmail) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: name, domain, siteUrl, ownerEmail" },
        { status: 400 }
      );
    }

    const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    const cleanUrl = siteUrl.replace(/\/+$/, "");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const licenseKey = generateLicenseKey();
    const clientSecret = generateClientSecret();

    // Default 30-day initial validity period
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const mergedFeatures = {
      enableEpaper: features.enableEpaper ?? false,
      enableMobileApi: features.enableMobileApi ?? false,
      enableYouTubeSync: features.enableYouTubeSync ?? true,
      enableLiveTv: features.enableLiveTv ?? true,
      enableMandiRates: features.enableMandiRates ?? true,
      enablePreciousMetals: features.enablePreciousMetals ?? true,
      enablePolls: features.enablePolls ?? true,
      enableStringers: features.enableStringers ?? true,
    };

    // Generate Complete Production .env Template for Vercel
    const hubOrigin = req.nextUrl.origin;
    const generatedEnv = generateClientEnv({
      name,
      nameLocal,
      domain: cleanDomain,
      siteUrl: cleanUrl,
      hubUrl: hubOrigin,
      licenseKey,
      clientSecret,
      databaseUrl,
      directUrl,
      r2AccountId,
      r2AccessKeyId,
      r2SecretAccessKey,
      r2BucketName,
      r2PublicUrl,
      primaryColor,
      themeColor,
      accentColor,
      geminiApiKey,
      googleAdsenseId,
      onesignalAppId,
    });

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: `${slug}-${Math.floor(1000 + Math.random() * 9000)}`,
        domain: cleanDomain,
        siteUrl: cleanUrl,
        ownerName: ownerName || name,
        ownerEmail,
        ownerPhone: ownerPhone || "",
        licenseKey,
        clientSecret,
        status: "ACTIVE",
        lockScope: "ADMIN_ONLY",
        planId,
        planName,
        amount: Number(amount) || 49900,
        currency: "INR",
        validUntil,
        features: mergedFeatures,
        envTemplate: generatedEnv.envContent,
        envConfig: {
          databaseUrl,
          directUrl,
          r2AccountId,
          r2AccessKeyId,
          r2SecretAccessKey,
          r2BucketName,
          r2PublicUrl,
          primaryColor,
          themeColor,
          accentColor,
          geminiApiKey,
          googleAdsenseId,
          onesignalAppId,
          authSecret: generatedEnv.authSecret,
          kycEncryptionKey: generatedEnv.kycEncryptionKey,
          cronSecret: generatedEnv.cronSecret,
        },
      },
    });

    // Attempt to generate Razorpay Payment Link
    let paymentUrl = null;
    try {
      const rpRes = await createSubscriptionPaymentLink({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ownerEmail: tenant.ownerEmail,
        ownerPhone: tenant.ownerPhone,
        amount: tenant.amount,
        planName: tenant.planName,
      });
      if (rpRes.paymentUrl) {
        paymentUrl = rpRes.paymentUrl;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { razorpayPaymentLink: paymentUrl },
        });
      }
    } catch (e: any) {
      console.warn("[Tenant Creation] Razorpay link generation skipped:", e?.message);
    }

    return NextResponse.json({
      success: true,
      tenant: {
        ...tenant,
        razorpayPaymentLink: paymentUrl,
      },
      envContent: generatedEnv.envContent,
    });
  } catch (err: any) {
    console.error("[Tenant Provisioning Error]:", err?.message);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

