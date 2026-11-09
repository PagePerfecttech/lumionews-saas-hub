import { prisma } from "@/lib/db";
import { HubDashboard } from "@/components/hub-dashboard";
import { HubLoginView } from "@/components/hub-login";
import { isAuthenticated, isHubAuthRequired } from "@/lib/auth-guard";
import { DEFAULT_PLANS } from "@/app/api/plans/route";

export const dynamic = "force-dynamic";

export default async function HubHomePage() {
  const authed = await isAuthenticated();
  const authRequired = isHubAuthRequired();

  if (!authed) {
    return <HubLoginView />;
  }

  let initialTenants: any[] = [];
  let initialPlans: any[] = [];
  let initialInvoices: any[] = [];

  try {
    // 1. Fetch Tenants
    initialTenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    // 2. Fetch or Seed Package Plans
    initialPlans = await prisma.packagePlan.findMany({
      orderBy: { monthlyPrice: "asc" },
    });

    if (initialPlans.length === 0) {
      for (const plan of DEFAULT_PLANS) {
        await prisma.packagePlan.create({ data: plan }).catch(() => null);
      }
      initialPlans = await prisma.packagePlan.findMany({
        orderBy: { monthlyPrice: "asc" },
      });
    }

    // 3. Fetch Recent Invoices
    initialInvoices = await prisma.invoice.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        tenant: {
          select: { name: true, domain: true },
        },
      },
    });
  } catch (err: any) {
    console.warn("[Hub Home] Database query fallback (first time run):", err?.message);
    initialTenants = [];
    initialPlans = DEFAULT_PLANS;
    initialInvoices = [];
  }

  // Calculate MRR (Monthly Recurring Revenue)
  const activeMrrPaise = initialTenants
    .filter((t: any) => t.status === "ACTIVE")
    .reduce((acc: number, t: any) => acc + (t.amount || 49900), 0);

  return (
    <HubDashboard
      initialTenants={JSON.parse(JSON.stringify(initialTenants))}
      initialPlans={JSON.parse(JSON.stringify(initialPlans))}
      initialInvoices={JSON.parse(JSON.stringify(initialInvoices))}
      initialMrrPaise={activeMrrPaise}
      authWarning={!authRequired}
      hubUrl={process.env.NEXT_PUBLIC_APP_URL || "https://app.smsinfotek.in"}
    />
  );
}
