import { prisma } from "@/lib/db";
import { HubDashboard } from "@/components/hub-dashboard";
import { HubLoginView } from "@/components/hub-login";
import { isAuthenticated, isHubAuthRequired } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function HubHomePage() {
  const authed = await isAuthenticated();
  const authRequired = isHubAuthRequired();

  if (!authed) {
    return <HubLoginView />;
  }

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

  return (
    <HubDashboard
      initialTenants={initialTenants}
      authWarning={!authRequired}
    />
  );
}
