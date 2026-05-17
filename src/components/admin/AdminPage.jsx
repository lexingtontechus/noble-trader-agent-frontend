"use client";

import { useState, useEffect } from "react";
import { UserProfile, useUser } from "@clerk/nextjs";
import ClerkAuthPanel from "@/components/auth/ClerkAuthPanel";

export default function AdminPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [roleInfo, setRoleInfo] = useState(null);
  const [loading, setLoading] = useState(true);

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
    <div className="space-y-8 py-8">
      {/* Role badge */}
      {roleInfo && (
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">Admin</span>
          <span className="text-xs text-base-content/50">
            Role: {roleInfo.role}
          </span>
        </div>
      )}

      {/* Clerk ↔ FastAPI Auth Diagnostics */}
      <ClerkAuthPanel />

      {/* User Profile Management */}
      <div className="flex flex-col items-center">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-primary">Account Settings</h2>
          <p className="text-base-content/60 mt-1">
            Manage your profile, security, and connected accounts
          </p>
        </div>
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
    </div>
  );
}
