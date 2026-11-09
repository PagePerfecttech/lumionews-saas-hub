import crypto from "crypto";
import Razorpay from "razorpay";

/**
 * Sanitizes Razorpay credentials by removing surrounding quotes,
 * escaped quotes, carriage returns, newlines, and whitespace.
 * Fixes common Vercel copy-paste mistakes where quotes are preserved.
 */
export function cleanRazorpayCredential(val?: string | null): string {
  if (!val) return "";
  let clean = String(val).trim();
  // Strip outer quotes like "key" or 'key' or \"key\"
  clean = clean.replace(/^(["'`]|\\")+|(["'`]|\\")+$/g, "").trim();
  // Strip control characters, carriage returns, newlines
  clean = clean.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, "");
  return clean;
}

export function getRazorpayClient(customKeyId?: string, customKeySecret?: string): Razorpay | null {
  const key_id = cleanRazorpayCredential(customKeyId || process.env.RAZORPAY_KEY_ID);
  const key_secret = cleanRazorpayCredential(customKeySecret || process.env.RAZORPAY_KEY_SECRET);

  if (!key_id || !key_secret || key_id.includes("your_") || key_secret.includes("your_")) {
    return null;
  }

  // Create a fresh client instance to avoid stale cached credentials in warm serverless lambdas
  return new Razorpay({
    key_id,
    key_secret,
  });
}

/**
 * Validates the authenticity of a Razorpay checkout payment signature using RAZORPAY_KEY_SECRET.
 * expectedSignature = HMAC_SHA256(order_id + "|" + payment_id, secret)
 */
export function verifyRazorpayPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = cleanRazorpayCredential(process.env.RAZORPAY_KEY_SECRET);
  if (!secret || !params.signature || !params.orderId || !params.paymentId) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(params.signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Validates the authenticity of a Razorpay webhook payload using the shared webhook secret.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null): boolean {
  const webhookSecret = cleanRazorpayCredential(process.env.RAZORPAY_WEBHOOK_SECRET);
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
    const desc = err?.error?.description || err?.message || "Razorpay API error";
    console.error("[Razorpay Link Creation Error]:", desc);
    return { paymentUrl: null, error: desc };
  }
}
