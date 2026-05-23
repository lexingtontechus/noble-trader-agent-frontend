"use client";

import { useState, useEffect } from "react";
import { UserProfile, useUser } from "@clerk/nextjs";
import ClerkAuthPanel from "@/components/auth/ClerkAuthPanel";
import ConfigPanel from "@/components/admin/ConfigPanel";

export default function AdminPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [roleInfo, setRoleInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("config");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    async function checkRole() {
      try {
        const res = await fetch("/api/auth/role");
        if (res.ok) {
          const data = await res.json();
          setRoleInfo(data);
        } else {
          setRoleInfo({ role: "unauthenticated", isAdmin: false });
        }
      } catch {
        setRoleInfo({ role: "unauthenticated", isAdmin: false });
      } finally {
        setLoading(false);
      }
    }

    checkRole();
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="alert alert-warning max-w-md">
          <span>Sign in to access this page.</span>
        </div>
      </div>
    );
  }

  if (roleInfo && !roleInfo.isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="card bg-base-100 shadow-xl max-w-md">
          <div className="card-body items-center text-center">
            <h2 className="text-xl font-bold text-error">Access Denied</h2>
            <p className="text-base-content/60 mt-2">
              You do not have admin privileges to view this page.
            </p>
            <p className="text-xs text-base-content/40 mt-1">
              Current role: <span className="font-mono">{roleInfo.role}</span>
            </p>
            <p className="text-xs text-base-content/40">
              Ask an admin to set your role in Clerk private metadata.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      {/* Role badge */}
      {roleInfo && (
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">Admin</span>
          <span className="text-xs text-base-content/50">
            Role: {roleInfo.role}
          </span>
        </div>
      )}

      {/* Tab navigation */}
      <div role="tablist" className="tabs tabs-bordered">
        <button
          role="tab"
          className={`tab ${activeTab === "config" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("config")}
        >
          Runtime Config
        </button>
        <button
          role="tab"
          className={`tab ${activeTab === "auth" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("auth")}
        >
          Auth Diagnostics
        </button>
        <button
          role="tab"
          className={`tab ${activeTab === "profile" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Account Settings
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "config" && <ConfigPanel />}

      {activeTab === "auth" && <ClerkAuthPanel />}

      {activeTab === "profile" && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-3xl">
            <UserProfile
              routing="hash"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "bg-base-100 shadow-xl border border-base-300",
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
