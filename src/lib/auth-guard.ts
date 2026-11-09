import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "hub_admin_session";

/**
 * Checks if a Master Password is set in the environment.
 * If not set, authentication is optional (with a dashboard warning).
 */
export function isHubAuthRequired(): boolean {
  return Boolean(process.env.HUB_ADMIN_PASSWORD?.trim());
}

/**
 * Computes an HMAC signature of the password to serve as a session token.
 */
export function generateSessionToken(password: string): string {
  const secret = process.env.AUTH_SECRET || "lumio-saas-master-control-secret-salt-2026";
  return crypto.createHmac("sha256", secret).update(`hub_session:${password}`).digest("hex");
}

/**
 * Verifies if the request or current cookie contains a valid Super Admin session.
 */
export async function isAuthenticated(): Promise<boolean> {
  if (!isHubAuthRequired()) {
    return true; // Not configured yet, allow open access with warning banner
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const expectedToken = generateSessionToken(process.env.HUB_ADMIN_PASSWORD!.trim());
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

/**
 * Verifies authentication for API route handlers (from NextRequest).
 */
export function verifyApiAuth(req: NextRequest): boolean {
  if (!isHubAuthRequired()) {
    return true;
  }

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearerKey = authHeader.slice(7).trim();
    if (bearerKey === process.env.HUB_ADMIN_PASSWORD?.trim()) {
      return true;
    }
  }

  // 2. Check cookie
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieToken) return false;

  const expectedToken = generateSessionToken(process.env.HUB_ADMIN_PASSWORD!.trim());
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

export { COOKIE_NAME };

