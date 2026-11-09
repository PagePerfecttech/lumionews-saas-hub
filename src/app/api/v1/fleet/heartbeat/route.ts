import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyClientSignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/fleet/heartbeat
 * Handshake and telemetry endpoint periodically pinged by client newspaper sites (every 6h or on boot).
 * Verifies HMAC signature, stores live telemetry (article count, version),
 * and returns active license status, plan features, and lock commands.
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

    const payload = JSON.parse(rawBody);

    // Automatic expiration checks
    let currentStatus = tenant.status;
    const now = new Date();
    if (tenant.validUntil && tenant.validUntil < now && tenant.status === "ACTIVE") {
      // Overdue: Give 72h grace period if not already past due
      const graceEnd = new Date(tenant.validUntil.getTime() + 72 * 60 * 60 * 1000);
      if (now < graceEnd) {
        currentStatus = "GRACE_PERIOD";
      } else {
        currentStatus = "SUSPENDED";
      }
    }

    // Update telemetry in database
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lastHeartbeatAt: now,
        status: currentStatus,
        articleCount: payload.stats?.articlesCount ?? tenant.articleCount,
        userCount: payload.stats?.usersCount ?? tenant.userCount,
        installedVersion: payload.installedVersion || tenant.installedVersion,
      },
    });

    return NextResponse.json({
      success: true,
      status: currentStatus,
      planId: tenant.planId,
      planName: tenant.planName,
      amount: tenant.amount,
      currency: tenant.currency,
      validUntil: tenant.validUntil,
      gracePeriodEnd: tenant.gracePeriodEnd,
      lockScope: tenant.lockScope,
      paymentUrl: tenant.razorpayPaymentLink,
      suspensionReason: tenant.suspensionReason,
      features: tenant.features,
    });
  } catch (err: any) {
    console.error("[Fleet Heartbeat Error]:", err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

