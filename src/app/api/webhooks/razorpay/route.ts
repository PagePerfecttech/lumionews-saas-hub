import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { dispatchRemoteSync } from "@/lib/remote-fleet";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/razorpay & /api/webhook/razorpay
 * Health-check endpoint for browser tests and uptime monitoring.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Razorpay Webhook Listener",
    endpoints: [
      "/api/webhook/razorpay",
      "/api/webhooks/razorpay",
    ],
    configured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/webhooks/razorpay & /api/webhook/razorpay
 * Listens to Razorpay payment events, automatically updates tenant subscriptions,
 * creates invoice logs, and dispatches real-time remote unlock or freeze webhooks to client sites.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // Verify webhook authenticity
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid && process.env.NODE_ENV === "production") {
      return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const payload = event.payload;

    console.log(`[Razorpay Webhook Received] Event: ${eventType}`);

    // Extract tenant identifier from notes or subscription
    const paymentEntity = payload.payment?.entity;
    const subscriptionEntity = payload.subscription?.entity;
    const tenantId =
      paymentEntity?.notes?.tenantId ||
      subscriptionEntity?.notes?.tenantId;

    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    } else if (subscriptionEntity?.id) {
      tenant = await prisma.tenant.findFirst({ where: { razorpaySubId: subscriptionEntity.id } });
    } else if (paymentEntity?.email) {
      tenant = await prisma.tenant.findFirst({ where: { ownerEmail: paymentEntity.email } });
    }

    if (!tenant) {
      console.warn("[Razorpay Webhook] Tenant could not be matched for event:", eventType);
      return NextResponse.json({ success: true, message: "Webhook received but tenant unmatched" });
    }

    // 1. Payment Captured or Recurring Subscription Charged
    if (eventType === "payment.captured" || eventType === "subscription.charged") {
      const now = new Date();
      // Calculate new expiration: 30 days from current validUntil (if in future) or from today
      const currentExpiry = tenant.validUntil && tenant.validUntil > now ? tenant.validUntil : now;
      const newValidUntil = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

      const amount = paymentEntity?.amount || subscriptionEntity?.plan_amount || tenant.amount;
      const paymentId = paymentEntity?.id || null;

      // Update tenant status to ACTIVE and push expiration forward
      const updatedTenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          status: "ACTIVE",
          validUntil: newValidUntil,
          gracePeriodEnd: null,
          suspensionReason: null,
        },
      });

      // Log invoice record
      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          amount,
          currency: "INR",
          status: "PAID",
          razorpayPaymentId: paymentId,
          billingPeriod: now.toLocaleString("default", { month: "long", year: "numeric" }),
          paidAt: now,
        },
      });

      // Dispatches instant remote unlock to the client newspaper site
      await dispatchRemoteSync(tenant.siteUrl, tenant.clientSecret, {
        status: "ACTIVE",
        planId: updatedTenant.planId,
        planName: updatedTenant.planName,
        amount: updatedTenant.amount,
        validUntil: updatedTenant.validUntil.toISOString(),
        lockScope: updatedTenant.lockScope,
        features: updatedTenant.features,
      });

      console.log(`[Tenant Unlocked]: ${tenant.name} extended until ${newValidUntil.toISOString()}`);
    }

    // 2. Payment Failed (e.g. UPI balance insufficient or card declined)
    else if (eventType === "payment.failed") {
      const now = new Date();
      const graceEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours grace period

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          status: "GRACE_PERIOD",
          gracePeriodEnd: graceEnd,
          suspensionReason: "Automatic payment debit failed. Grace period active.",
        },
      });

      // Notify client site to show grace period warning banner in CMS
      await dispatchRemoteSync(tenant.siteUrl, tenant.clientSecret, {
        status: "GRACE_PERIOD",
        gracePeriodEnd: graceEnd.toISOString(),
        suspensionReason: "Automatic payment debit failed. Please renew your subscription.",
        paymentUrl: tenant.razorpayPaymentLink,
      });
    }

    // 3. Subscription Halted or Explicitly Cancelled
    else if (eventType === "subscription.halted" || eventType === "subscription.cancelled") {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          status: "SUSPENDED",
          suspensionReason: "Recurring payment mandate halted or cancelled.",
        },
      });

      // Dispatches instant remote freeze to client newspaper site
      await dispatchRemoteSync(tenant.siteUrl, tenant.clientSecret, {
        status: "SUSPENDED",
        suspensionReason: "Subscription payment mandate was cancelled. CMS access paused.",
        lockScope: tenant.lockScope,
        paymentUrl: tenant.razorpayPaymentLink,
      });

      console.log(`[Tenant Suspended]: ${tenant.name} remote lock executed.`);
    }

    return NextResponse.json({ success: true, processed: eventType });
  } catch (err: any) {
    console.error("[Razorpay Webhook Error]:", err?.message);
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}

