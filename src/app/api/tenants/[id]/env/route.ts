import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateClientEnv } from "@/lib/env-generator";
import { verifyApiAuth } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenants/[id]/env
 * Retrieves the generated .env configuration template for this tenant.
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

    let envContent = tenant.envTemplate;
    const envConfig = (tenant.envConfig as any) || {};

    // If template was not generated previously, generate it now
    if (!envContent) {
      const generated = generateClientEnv({
        name: tenant.name,
        domain: tenant.domain,
        siteUrl: tenant.siteUrl,
        hubUrl: req.nextUrl.origin,
        licenseKey: tenant.licenseKey,
        clientSecret: tenant.clientSecret,
        databaseUrl: envConfig.databaseUrl,
        directUrl: envConfig.directUrl,
        r2AccountId: envConfig.r2AccountId,
        r2AccessKeyId: envConfig.r2AccessKeyId,
        r2SecretAccessKey: envConfig.r2SecretAccessKey,
        r2BucketName: envConfig.r2BucketName,
        r2PublicUrl: envConfig.r2PublicUrl,
        primaryColor: envConfig.primaryColor,
        themeColor: envConfig.themeColor,
        accentColor: envConfig.accentColor,
        geminiApiKey: envConfig.geminiApiKey,
        googleAdsenseId: envConfig.googleAdsenseId,
        onesignalAppId: envConfig.onesignalAppId,
        authSecret: envConfig.authSecret,
        kycEncryptionKey: envConfig.kycEncryptionKey,
        cronSecret: envConfig.cronSecret,
      });

      envContent = generated.envContent;
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { envTemplate: envContent },
      });
    }

    return NextResponse.json({
      success: true,
      envContent,
      envConfig,
      tenantName: tenant.name,
      domain: tenant.domain,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

/**
 * PUT /api/tenants/[id]/env
 * Updates the deployment configuration and regenerates the .env template.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyApiAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const tenant = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const prevConfig = (tenant.envConfig as any) || {};
    const updatedConfig = { ...prevConfig, ...body };

    const generated = generateClientEnv({
      name: tenant.name,
      domain: tenant.domain,
      siteUrl: tenant.siteUrl,
      hubUrl: req.nextUrl.origin,
      licenseKey: tenant.licenseKey,
      clientSecret: tenant.clientSecret,
      databaseUrl: updatedConfig.databaseUrl,
      directUrl: updatedConfig.directUrl,
      r2AccountId: updatedConfig.r2AccountId,
      r2AccessKeyId: updatedConfig.r2AccessKeyId,
      r2SecretAccessKey: updatedConfig.r2SecretAccessKey,
      r2BucketName: updatedConfig.r2BucketName,
      r2PublicUrl: updatedConfig.r2PublicUrl,
      primaryColor: updatedConfig.primaryColor,
      themeColor: updatedConfig.themeColor,
      accentColor: updatedConfig.accentColor,
      geminiApiKey: updatedConfig.geminiApiKey,
      googleAdsenseId: updatedConfig.googleAdsenseId,
      onesignalAppId: updatedConfig.onesignalAppId,
      authSecret: updatedConfig.authSecret,
      kycEncryptionKey: updatedConfig.kycEncryptionKey,
      cronSecret: updatedConfig.cronSecret,
    });

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        envTemplate: generated.envContent,
        envConfig: updatedConfig,
      },
    });

    return NextResponse.json({
      success: true,
      envContent: generated.envContent,
      envConfig: updated.envConfig,
      message: "Environment template regenerated successfully",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

