"use client";

import { UserProfile } from "@clerk/nextjs";
import ClerkAuthPanel from "@/components/auth/ClerkAuthPanel";

export default function AdminPage() {
  return (
    <div className="space-y-8 py-8">
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
