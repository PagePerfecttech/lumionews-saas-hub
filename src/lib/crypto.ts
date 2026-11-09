import crypto from "crypto";

export function generateLicenseKey(): string {
  return `ln_live_${crypto.randomBytes(16).toString("hex")}`;
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

