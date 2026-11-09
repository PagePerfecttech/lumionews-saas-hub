import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchRemoteSync } from "@/lib/remote-fleet";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey = body.licenseKey?.trim();

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: "License key is required" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { licenseKey },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    // If tenant was still active in the future, extend from validUntil; otherwise extend from now
    const baseDate = tenant.validUntil && tenant.validUntil > now ? tenant.validUntil : now;
    const newValidUntil = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Update tenant in SaaS Hub database
    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: "ACTIVE",
        validUntil: newValidUntil,
        gracePeriodEnd: null,
        suspensionReason: null,
      },
    });

    // Create an Invoice receipt
    const amount = Number(body.amount) || tenant.amount || 49900;
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        amount,
        currency: tenant.currency || "INR",
        status: "PAID",
        billingPeriod: now.toLocaleString("default", { month: "long", year: "numeric" }),
        paidAt: now,
      },
    }).catch((e) => console.warn("[Billing Renew] Invoice creation note:", e?.message));

    // Instant Real-time Unlock / Sync to the Client Newspaper Site
    if (tenant.siteUrl && tenant.clientSecret) {
      dispatchRemoteSync(tenant.siteUrl, tenant.clientSecret, {
        status: "ACTIVE",
        planId: tenant.planId,
        planName: tenant.planName,
        amount: tenant.amount,
        currency: tenant.currency,
        validUntil: newValidUntil.toISOString(),
        gracePeriodEnd: null,
        lockScope: tenant.lockScope,
        features: tenant.features,
      }).catch((syncErr) => {
        console.warn("[Billing Renew] Remote sync push notification note:", syncErr?.message);
      });
    }

    return NextResponse.json({
      success: true,
      message: "Subscription successfully renewed for 30 days.",
      status: "ACTIVE",
      validUntil: newValidUntil.toISOString(),
    });
  } catch (err: any) {
    console.error("[Billing Renew API Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

