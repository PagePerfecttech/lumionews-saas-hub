import { NextRequest, NextResponse } from "next/server";
import { generateSessionToken, COOKIE_NAME } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const adminPassword = process.env.HUB_ADMIN_PASSWORD?.trim();

    if (!adminPassword) {
      return NextResponse.json({
        success: false,
        error: "HUB_ADMIN_PASSWORD is not configured on this server.",
      }, { status: 500 });
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json({
        success: false,
        error: "Invalid Super Admin password.",
      }, { status: 401 });
    }

    const sessionToken = generateSessionToken(adminPassword);
    const response = NextResponse.json({ success: true, message: "Authenticated successfully." });

    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

