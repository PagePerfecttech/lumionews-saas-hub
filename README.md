# Lumio SaaS Master Control Plane & Fleet Hub

The **Central Super Admin Hub** is the master control plane for your white-label newspaper SaaS business. It provides centralized fleet management, remote kill-switch execution, 1-click passwordless Master SSO entry into client CMS portals, and automated recurring billing via Razorpay.

---

## 🌟 Capabilities

1. **Live Fleet Management**:
   - Real-time directory of all newspaper clients (e.g. `acps.smsinfotek.in`).
   - Telemetry sync (articles published, active editorial staff, health heartbeat).
   - Subscription countdown timer (e.g. "Expires in 18 days" or "Overdue by 3 days").

2. **Instant Remote Kill-Switch (Freeze / Unfreeze)**:
   - Toggle **`[🔒 Freeze / 🟢 Unfreeze]`** with a single click.
   - Central Hub dispatches an asymmetric `HMAC-SHA256` webhook to the client's site (`POST /api/saas/sync`).
   - The client site locks down `/admin/*` in **< 100ms** while keeping public articles online for readers (soft lock) or full site (hard lock).

3. **1-Click Master SSO Entry**:
   - Click **`CMS Login ⚡`** on any client row in the table.
   - Generates a cryptographically signed token and opens the client's CMS directly in a new tab as an authorized Super Admin without needing client passwords.

4. **Razorpay Recurring Subscriptions**:
   - Integrated webhook handler (`POST /api/webhooks/razorpay`).
   - Listens to `subscription.charged`, logs the invoice, advances expiration by +30 days, and automatically unfreezes the client site.
   - On `payment.failed`, initiates a 72-hour grace period and shows a payment reminder banner in the client's CMS.

---

## 🚀 Running Locally

```bash
cd apps/saas-hub
bun install
bun run db:push
bun run dev
```
Open [http://localhost:3005](http://localhost:3005) to view your Master Control Plane.

---

## 🌐 Deploying to Vercel (Independent Deployment)

You can deploy this control hub on Vercel as an independent project:

1. In the Vercel Dashboard, click **Add New Project** and select this repository.
2. In **Root Directory**, set: `apps/saas-hub`.
3. Configure Environment Variables:
   ```env
   # PostgreSQL database for the SaaS Hub
   DATABASE_URL="postgres://..."

   # Razorpay API Credentials for subscriptions
   RAZORPAY_KEY_ID="rzp_live_..."
   RAZORPAY_KEY_SECRET="..."
   RAZORPAY_WEBHOOK_SECRET="..."
   ```
4. Click **Deploy**. Your control hub will be live at `https://hub.yourdomain.com`!

---

## 🔗 Connecting a Client Newspaper Site

1. In the Control Plane, click **"+ Register New Newspaper Client"**.
2. Enter the publication name (e.g. `Andhra Chronicle`) and domain (e.g. `acps.smsinfotek.in`).
3. Select their plan (₹499/mo Website Basic, ₹599/mo Pro with ePaper, or ₹999/mo Bundle with Mobile App).
4. Click **Provision Client**.
5. Copy the generated 3 environment variables:
   ```env
   SAAS_HUB_URL="https://hub.yourdomain.com"
   SAAS_LICENSE_KEY="ln_live_..."
   SAAS_CLIENT_SECRET="sec_..."
   ```
6. Paste these 3 variables into the client's Vercel deployment and redeploy. The client site is now fully under your centralized control!

