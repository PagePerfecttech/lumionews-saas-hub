import crypto from "crypto";
import Razorpay from "razorpay";

let razorpayInstance: Razorpay | null = null;

export function getRazorpayClient(): Razorpay | null {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!key_id || !key_secret) {
    return null;
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id,
      key_secret,
    });
  }

  return razorpayInstance;
}

/**
 * Validates the authenticity of a Razorpay webhook payload using the shared webhook secret.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Creates or fetches a recurring subscription link for the client.
 */
export async function createSubscriptionPaymentLink(params: {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerPhone: string;
  amount: number; // in paise (e.g. 49900 = ₹499)
  planName: string;
}): Promise<{ paymentUrl: string | null; error?: string }> {
  const client = getRazorpayClient();
  if (!client) {
    return {
      paymentUrl: null,
      error: "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured on the Central Hub.",
    };
  }

  try {
    // Generate a payment link with recurring invoice support
    const paymentLink: any = await client.paymentLink.create({
      amount: params.amount,
      currency: "INR",
      accept_partial: false,
      description: `Monthly Subscription for ${params.tenantName} - ${params.planName}`,
      customer: {
        name: params.tenantName,
        email: params.ownerEmail,
        contact: params.ownerPhone.replace(/[^\d+]/g, ""),
      },
      notify: {
        sms: true,
        email: true,
      },
      reminder_enable: true,
      notes: {
        tenantId: params.tenantId,
        platform: "LumioNews SaaS Fleet",
      },
    });

    return { paymentUrl: paymentLink.short_url || null };
  } catch (err: any) {
    console.error("[Razorpay Link Creation Error]:", err?.message);
    return { paymentUrl: null, error: err?.message || "Razorpay API error" };
  }
}

