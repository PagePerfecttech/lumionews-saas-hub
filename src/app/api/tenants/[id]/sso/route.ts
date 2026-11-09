import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateMasterSsoUrl } from "@/lib/remote-fleet";
import { verifyApiAuth } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenants/[id]/sso
 * Generates an HMAC-signed ephemeral Master SSO link to log directly into the client's CMS.
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
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const ssoUrl = generateMasterSsoUrl(tenant.siteUrl, tenant.clientSecret, "superadmin@lumio.network");

    // Optional: if ?redirect=true, perform HTTP 302 redirect directly
    if (req.nextUrl.searchParams.get("redirect") === "true") {
      return NextResponse.redirect(ssoUrl);
    }

    return NextResponse.json({ success: true, ssoUrl });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

