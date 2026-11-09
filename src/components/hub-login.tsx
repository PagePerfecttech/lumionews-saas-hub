"use client";

import { useState } from "react";

export function HubLoginView() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed");
      }
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || "Invalid password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(ellipse at 50% 20%, #1e1b4b 0%, #090d16 70%)",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "rgba(15, 23, 42, 0.85)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        padding: "36px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(12px)",
      }}>
        {/* Hub Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <div style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "18px",
            color: "#ffffff",
          }}>
            L
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f8fafc" }}>Lumio SaaS Hub</h1>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Master Control Plane</p>
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 600, color: "#e2e8f0" }}>
            Super Admin Authentication
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
            Enter your Master Password to access client fleet management, billing controls, and kill switches.
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            marginBottom: "18px",
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#94a3b8", marginBottom: "6px" }}>
              Master Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              required
              autoFocus
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "#090d16",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "#475569" : "linear-gradient(135deg, #4f46e5, #7c3aed)",
              border: "none",
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {loading ? "Verifying..." : "Unlock Control Plane"}
          </button>
        </form>

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #1e293b", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "11px", color: "#475569" }}>
            Protected by HMAC-SHA256 Session Guards • Lumio SaaS Hub
          </p>
        </div>
      </div>
    </div>
  );
}
