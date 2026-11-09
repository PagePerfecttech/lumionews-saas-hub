import { prisma } from "@/lib/db";
import { HubDashboard } from "@/components/hub-dashboard";

export const dynamic = "force-dynamic";

export default async function HubHomePage() {
  let initialTenants: any[] = [];
  try {
    initialTenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });
  } catch (err: any) {
    console.warn("[Hub Home] Database query fallback (first time run):", err?.message);
    initialTenants = [];
  }

  return <HubDashboard initialTenants={initialTenants} />;
}

