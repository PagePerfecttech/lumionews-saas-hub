import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyApiAuth } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export const DEFAULT_PLANS = [
  {
    code: "website_basic",
    name: "Website Basic",
    description: "Full white-label responsive web portal, breaking news ticker, YouTube sync, Live TV & rates.",
    monthlyPrice: 49900, // ₹499
    annualPrice: 499900, // ₹4,999 (2 months free)
    isPopular: false,
    isActive: true,
    features: {
      enableEpaper: false,
      enableMobileApi: false,
      enableLiveTv: true,
      enableYouTubeSync: true,
      enableMandiRates: true,
      enablePreciousMetals: true,
      enablePolls: true,
      enableStringers: true,
    },
  },
  {
    code: "website_pro",
    name: "Website Pro + ePaper",
    description: "Includes everything in Basic plus high-resolution interactive digital ePaper edition with crop & share.",
    monthlyPrice: 59900, // ₹599
    annualPrice: 599900, // ₹5,999
    isPopular: true,
    isActive: true,
    features: {
      enableEpaper: true,
      enableMobileApi: false,
      enableLiveTv: true,
      enableYouTubeSync: true,
      enableMandiRates: true,
      enablePreciousMetals: true,
      enablePolls: true,
      enableStringers: true,
    },
  },
  {
    code: "web_app_bundle",
    name: "Newsroom Suite + Mobile Apps",
    description: "Complete media enterprise: Web Portal + ePaper + Journalist Reporter App + Consumer Mobile App (Android/iOS).",
    monthlyPrice: 99900, // ₹999
    annualPrice: 999900, // ₹9,999
    isPopular: false,
    isActive: true,
    features: {
      enableEpaper: true,
      enableMobileApi: true,
      enableLiveTv: true,
      enableYouTubeSync: true,
      enableMandiRates: true,
      enablePreciousMetals: true,
      enablePolls: true,
      enableStringers: true,
    },
  },
];

/**
 * GET /api/plans
 * Fetches all available subscription packages. Automatically seeds defaults if empty.
 */
export async function GET(req: NextRequest) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    let plans = await prisma.packagePlan.findMany({
      orderBy: { monthlyPrice: "asc" },
    });

    if (plans.length === 0) {
      // Auto seed default packages
      for (const p of DEFAULT_PLANS) {
        await prisma.packagePlan.create({ data: p });
      }
      plans = await prisma.packagePlan.findMany({
        orderBy: { monthlyPrice: "asc" },
      });
    }

    return NextResponse.json({ success: true, plans });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

/**
 * POST /api/plans
 * Creates or updates a subscription plan.
 */
export async function POST(req: NextRequest) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, name, description, monthlyPrice, annualPrice, isPopular, features } = body;

    if (!code || !name || monthlyPrice === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: code, name, monthlyPrice" },
        { status: 400 }
      );
    }

    const cleanCode = code.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");

    const plan = await prisma.packagePlan.upsert({
      where: { code: cleanCode },
      create: {
        code: cleanCode,
        name,
        description: description || null,
        monthlyPrice: Number(monthlyPrice),
        annualPrice: annualPrice ? Number(annualPrice) : null,
        isPopular: Boolean(isPopular),
        isActive: true,
        features: features || {},
      },
      update: {
        name,
        description: description || null,
        monthlyPrice: Number(monthlyPrice),
        annualPrice: annualPrice ? Number(annualPrice) : null,
        isPopular: Boolean(isPopular),
        features: features || {},
      },
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
