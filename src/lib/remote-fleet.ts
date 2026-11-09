import { signPayload, createMasterSsoToken } from "./crypto";

export interface RemoteSyncPayload {
  status: string;
  planId?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  validUntil?: string | null;
  gracePeriodEnd?: string | null;
  lockScope?: string;
  paymentUrl?: string | null;
  suspensionReason?: string | null;
  features?: any;
}

/**
 * Dispatches an instant remote synchronization webhook to the client's website.
 * Used to immediately freeze (SUSPENDED) or unfreeze (ACTIVE) the client instance.
 */
export async function dispatchRemoteSync(
  siteUrl: string,
  clientSecret: string,
  payload: RemoteSyncPayload
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const cleanUrl = siteUrl.replace(/\/+$/, "");
    const endpoint = `${cleanUrl}/api/saas/sync`;

    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now();
    const signature = signPayload(rawBody, timestamp, clientSecret);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": String(timestamp),
        "X-Signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, status: res.status, error: text || `HTTP ${res.status}` };
    }

    return { success: true, status: res.status };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to reach client site" };
  }
}

/**
 * Generates the full 1-click Master SSO URL for the given tenant.
 */
export function generateMasterSsoUrl(siteUrl: string, clientSecret: string, adminEmail?: string): string {
  const cleanUrl = siteUrl.replace(/\/+$/, "");
  const token = createMasterSsoToken(clientSecret, adminEmail);
  return `${cleanUrl}/api/auth/master-sso?token=${token}&redirect=/admin`;
}

