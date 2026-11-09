import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { dispatchRemoteSync } from "@/lib/remote-fleet";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey = body.licenseKey?.trim();
    const razorpayOrderId = body.razorpay_order_id?.trim();
    const razorpayPaymentId = body.razorpay_payment_id?.trim();
    const razorpaySignature = body.razorpay_signature?.trim();

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: "License key is required." },
        { status: 400 }
      );
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay payment verification parameters (order_id, payment_id, signature) are required. Direct unpaid renewals are not permitted.",
        },
        { status: 400 }
      );
    }

    // Cryptographically verify payment signature using RAZORPAY_KEY_SECRET
    const isAuthentic = verifyRazorpayPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isAuthentic) {
      console.error(`[Billing Renew] Invalid Razorpay signature: order=${razorpayOrderId}, payment=${razorpayPaymentId}`);
      return NextResponse.json(
        { success: false, error: "Razorpay payment verification failed: Invalid cryptographic signature" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { licenseKey },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found for the provided license key." },
        { status: 404 }
      );
    }

    // Check if this payment was already credited (idempotent / replay prevention)
    const existingInvoice = await prisma.invoice.findFirst({
      where: { razorpayPaymentId },
    });

    if (existingInvoice && existingInvoice.status === "PAID") {
      return NextResponse.json({
        success: true,
        message: "Payment was already verified and credited.",
        status: tenant.status,
        validUntil: tenant.validUntil ? tenant.validUntil.toISOString() : null,
        paymentId: razorpayPaymentId,
      });
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

    // Create an Invoice receipt tied to this real Razorpay payment
    const amount = Number(body.amount) || tenant.amount || 49900;
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        amount,
        currency: tenant.currency || "INR",
        status: "PAID",
        razorpayPaymentId,
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
      message: "Razorpay payment verified successfully. Subscription renewed for 30 days.",
      status: "ACTIVE",
      validUntil: newValidUntil.toISOString(),
      paymentId: razorpayPaymentId,
    });
  } catch (err: any) {
    console.error("[Billing Renew API Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
