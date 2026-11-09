import crypto from "crypto";

export function generateLicenseKey(): string {
  const hex = crypto.randomBytes(8).toString("hex").toUpperCase();
  const p1 = hex.slice(0, 4);
  const p2 = hex.slice(4, 8);
  const p3 = hex.slice(8, 12);
  const p4 = hex.slice(12, 16);
  return `LN-LIVE-${p1}-${p2}-${p3}-${p4}`;
}

export function generateClientSecret(): string {
  return `sec_${crypto.randomBytes(24).toString("hex")}`;
}

export function signPayload(body: string, timestamp: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${body}:${timestamp}`)
    .digest("hex");
}

export function verifyClientSignature(
  body: string,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!timestamp || !signature || !secret) return false;

  const parsedTs = parseInt(timestamp, 10);
  if (isNaN(parsedTs) || Math.abs(Date.now() - parsedTs) > 5 * 60 * 1000) {
    return false; // Reject replay attacks older than 5m
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(`${body}:${timestamp}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(computed, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Creates a short-lived Master SSO token for 1-click login into any client CMS.
 */
export function createMasterSsoToken(clientSecret: string, email = "superadmin@lumio.network", name = "SaaS Super Admin"): string {
  const payload = {
    iss: "saas_master_hub",
    email,
    name,
    exp: Date.now() + 5 * 60 * 1000, // 5 minutes valid
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(payloadB64)
    .digest("hex");

  return `${payloadB64}.${signature}`;
}

/**
 * Creates a secure, opaque billing session token so that raw license keys
 * are NEVER exposed in browser URLs, history, or access logs.
 */
export function createBillingSessionToken(tenantId: string, licenseKey: string): string {
  const secret = process.env.AUTH_SECRET || "lumio-billing-session-secret-2026";
  const payload = {
    t: tenantId,
    k: licenseKey,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days valid
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("hex");
  return `${data}.${sig}`;
}

/**
 * Verifies and decodes a secure billing session token.
 */
export function verifyBillingSessionToken(token: string): { tenantId: string; licenseKey: string } | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const secret = process.env.AUTH_SECRET || "lumio-billing-session-secret-2026";
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // Expired
    }
    return { tenantId: payload.t, licenseKey: payload.k };
  } catch {
    return null;
  }
}

