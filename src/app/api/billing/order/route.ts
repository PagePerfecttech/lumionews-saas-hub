import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRazorpayClient } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey = body.licenseKey?.trim();

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: "License key is required to create a payment order" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { licenseKey },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found for the specified license key" },
        { status: 404 }
      );
    }

    const key_id = process.env.RAZORPAY_KEY_ID?.trim();
    const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!key_id || !key_secret) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured in environment variables.",
        },
        { status: 500 }
      );
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return NextResponse.json(
        { success: false, error: "Failed to initialize Razorpay payment gateway." },
        { status: 500 }
      );
    }

    const amount = Number(tenant.amount) || 49900;
    const currency = tenant.currency || "INR";
    const receipt = `rcpt_${tenant.id.slice(0, 8)}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes: {
        tenantId: tenant.id,
        licenseKey: tenant.licenseKey,
        tenantName: tenant.name,
        domain: tenant.domain,
        planName: tenant.planName,
      },
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
    });
  } catch (err: any) {
    console.error("[Billing Order API Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create Razorpay order" },
      { status: 500 }
    );
  }
}
