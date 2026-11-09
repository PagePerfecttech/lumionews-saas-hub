import { NextResponse } from "next/server";
import { cleanRazorpayCredential } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/diagnostic
 * Diagnoses Razorpay API configuration, checks for formatting issues
 * (such as surrounding quotes or whitespace in Vercel env vars),
 * and executes a live test against Razorpay's API to verify credentials.
 */
export async function GET() {
  const rawKeyId = process.env.RAZORPAY_KEY_ID || "";
  const rawKeySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const rawWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  const cleanKeyId = cleanRazorpayCredential(rawKeyId);
  const cleanKeySecret = cleanRazorpayCredential(rawKeySecret);
  const cleanWebhookSecret = cleanRazorpayCredential(rawWebhookSecret);

  const hadQuotes =
    rawKeyId.includes('"') ||
    rawKeyId.includes("'") ||
    rawKeySecret.includes('"') ||
    rawKeySecret.includes("'");

  const hadWhitespace =
    rawKeyId !== rawKeyId.trim() ||
    rawKeySecret !== rawKeySecret.trim() ||
    /[\r\n\t]/.test(rawKeyId) ||
    /[\r\n\t]/.test(rawKeySecret);

  const isConfigured = Boolean(
    cleanKeyId &&
    cleanKeySecret &&
    !cleanKeyId.includes("your_") &&
    !cleanKeySecret.includes("your_")
  );

  let razorpayStatus = 0;
  let razorpayResponse: any = null;
  let authenticated = false;
  let errorSummary = "";

  if (isConfigured) {
    try {
      const authHeader = Buffer.from(`${cleanKeyId}:${cleanKeySecret}`).toString("base64");
      const testRes = await fetch("https://api.razorpay.com/v1/payments?count=1", {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
        cache: "no-store",
      });

      razorpayStatus = testRes.status;
      razorpayResponse = await testRes.json().catch(() => ({}));

      if (testRes.ok) {
        authenticated = true;
      } else {
        errorSummary = razorpayResponse?.error?.description || `HTTP ${testRes.status}`;
      }
    } catch (err: any) {
      errorSummary = err?.message || "Failed to reach Razorpay servers";
    }
  }

  let recommendation = "";
  if (!isConfigured) {
    recommendation =
      "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in Vercel environment variables. Go to Vercel -> lumionews-saas-hub -> Settings -> Environment Variables and add active keys.";
  } else if (authenticated) {
    recommendation =
      "Razorpay API credentials are fully authenticated and working in Live/Test mode!";
  } else if (errorSummary.toLowerCase().includes("authentication failed")) {
    recommendation =
      "Razorpay rejected the API key or secret. Possible causes: 1) Key ID and Secret do not match (e.g. newly generated secret wasn't copied, or Live ID was paired with Test Secret). 2) In Razorpay Dashboard (dashboard.razorpay.com), go to Account & Settings -> API Keys and generate a fresh key pair, then update both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel.";
  } else {
    recommendation = `Razorpay returned an error: ${errorSummary}. Please review permissions in your Razorpay Dashboard.`;
  }

  return NextResponse.json({
    status: authenticated ? "ok" : "misconfigured",
    authenticated,
    keyId: {
      configured: Boolean(cleanKeyId),
      prefix: cleanKeyId.slice(0, 9), // e.g. "rzp_live_" or "rzp_test_"
      length: cleanKeyId.length,
      mode: cleanKeyId.startsWith("rzp_live_")
        ? "LIVE"
        : cleanKeyId.startsWith("rzp_test_")
        ? "TEST"
        : "UNKNOWN",
    },
    keySecret: {
      configured: Boolean(cleanKeySecret),
      length: cleanKeySecret.length,
      preview: cleanKeySecret.length > 6
        ? `${cleanKeySecret.slice(0, 3)}••••••••${cleanKeySecret.slice(-3)}`
        : "not set",
    },
    webhookSecret: {
      configured: Boolean(cleanWebhookSecret),
      length: cleanWebhookSecret.length,
    },
    formattingIssuesDetected: {
      hadQuotes,
      hadWhitespace,
      automaticallyCleanedByServer: true,
    },
    razorpayApiCheck: {
      httpStatus: razorpayStatus,
      authenticated,
      errorSummary: errorSummary || null,
    },
    recommendation,
    timestamp: new Date().toISOString(),
  });
}
