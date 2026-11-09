import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyApiAuth } from "@/lib/auth-guard";
import { dispatchRemoteSync } from "@/lib/remote-fleet";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenants/[id]
 * Returns full details, invoices, and metrics for a single tenant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tenant });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

/**
 * PATCH /api/tenants/[id]
 * Updates a tenant's plan, billing dates, features, or owner contact.
 * Dispatches an instant HMAC sync to the client site.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const {
      name,
      ownerName,
      ownerEmail,
      ownerPhone,
      planId,
      planName,
      amount,
      validUntil,
      status,
      lockScope,
      features,
      suspensionReason,
      razorpayPaymentLink,
    } = body;

    const updatedFeatures = features ? { ...(tenant.features as any || {}), ...features } : tenant.features;

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(ownerName && { ownerName }),
        ...(ownerEmail && { ownerEmail }),
        ...(ownerPhone && { ownerPhone }),
        ...(planId && { planId }),
        ...(planName && { planName }),
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(validUntil && { validUntil: new Date(validUntil) }),
        ...(status && { status }),
        ...(lockScope && { lockScope }),
        ...(suspensionReason !== undefined && { suspensionReason }),
        ...(razorpayPaymentLink !== undefined && { razorpayPaymentLink: razorpayPaymentLink ? String(razorpayPaymentLink).trim() : null }),
        features: updatedFeatures,
      },
    });

    // Dispatch real-time sync webhook to client instance
    try {
      await dispatchRemoteSync(updated.siteUrl, updated.clientSecret, {
        status: updated.status,
        planId: updated.planId,
        planName: updated.planName,
        amount: updated.amount,
        validUntil: updated.validUntil?.toISOString() || null,
        lockScope: updated.lockScope,
        paymentUrl: updated.razorpayPaymentLink,
        suspensionReason: updated.suspensionReason,
        features: updated.features,
      });
    } catch (e: any) {
      console.warn("[Tenant Update] Remote sync dispatch warning:", e?.message);
    }

    return NextResponse.json({ success: true, tenant: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tenants/[id]
 * Removes a tenant registration from the Central Hub.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.tenant.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Tenant removed successfully." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
