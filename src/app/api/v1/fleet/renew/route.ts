import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyClientSignature } from "@/lib/crypto";
import { createSubscriptionPaymentLink } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/fleet/renew
 * Renewal request endpoint called by client newspaper admin dashboard.
 * Verifies HMAC signature, validates tenant, and provides or generates
 * an active Razorpay payment link for subscription extension.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const licenseKey = req.headers.get("x-license-key");
    const timestamp = req.headers.get("x-timestamp");
    const signature = req.headers.get("x-signature");

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: "Missing X-License-Key header" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { licenseKey },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Invalid license key. Tenant not registered in Central Hub." },
        { status: 403 }
      );
    }

    // Verify cryptographic signature
    const isValid = verifyClientSignature(rawBody, timestamp, signature, tenant.clientSecret);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid HMAC signature or expired timestamp" },
        { status: 401 }
      );
    }

    let paymentUrl = tenant.razorpayPaymentLink;

    // If no payment link exists yet, try to generate one via Razorpay
    if (!paymentUrl) {
      const linkRes = await createSubscriptionPaymentLink({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ownerEmail: tenant.ownerEmail,
        ownerPhone: tenant.ownerPhone,
        amount: tenant.amount,
        planName: tenant.planName,
      });

      if (linkRes.paymentUrl) {
        paymentUrl = linkRes.paymentUrl;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { razorpayPaymentLink: paymentUrl },
        });
      }
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paymentUrl || null,
      planId: tenant.planId,
      planName: tenant.planName,
      amount: tenant.amount,
      currency: tenant.currency,
      validUntil: tenant.validUntil,
      status: tenant.status,
    });
  } catch (err: any) {
    console.error("[Fleet Renew Error]:", err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
