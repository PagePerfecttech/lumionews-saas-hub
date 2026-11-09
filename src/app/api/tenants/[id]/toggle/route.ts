import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchRemoteSync } from "@/lib/remote-fleet";

export const dynamic = "force-dynamic";

/**
 * POST /api/tenants/[id]/toggle
 * Instantly toggles a client newspaper site's status (ACTIVE <-> SUSPENDED)
 * or updates their lockScope (ADMIN_ONLY <-> FULL_SITE).
 * Dispatches an HMAC-signed synchronization webhook to the client site in real time (< 100ms).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const tenant = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const newStatus = body.status || (tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
    const lockScope = body.lockScope || tenant.lockScope;
    const suspensionReason =
      body.suspensionReason ||
      (newStatus === "SUSPENDED" ? "Account suspended by platform management" : null);

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        status: newStatus,
        lockScope,
        suspensionReason,
      },
    });

    // Dispatches remote sync to client site
    const dispatchResult = await dispatchRemoteSync(tenant.siteUrl, tenant.clientSecret, {
      status: newStatus,
      planId: updated.planId,
      planName: updated.planName,
      amount: updated.amount,
      validUntil: updated.validUntil?.toISOString() || null,
      lockScope: updated.lockScope,
      paymentUrl: updated.razorpayPaymentLink,
      suspensionReason,
      features: updated.features,
    });

    return NextResponse.json({
      success: true,
      tenant: updated,
      dispatchResult,
      message: `Tenant ${updated.name} is now ${newStatus}. Remote sync ${dispatchResult.success ? "delivered" : "failed to deliver"}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

