"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, useCallback } from "react";
import { PLANS, PLAN_HIERARCHY, hasPlanAccess, hasFeature, getLimit } from "@/lib/plans";

/**
 * usePlan — Reusable hook for plan-based feature gating.
 *
 * Reads the user's plan from Clerk `privateMetadata.plan` and
 * enriches it with the full plan definition from plans.js.
 * Falls back to "free" if not set.
 *
 * Also provides convenience methods for feature checks and limit lookups.
 *
 * @returns {{
 *   plan: string,
 *   planLevel: number,
 *   planDetails: object|null,
 *   isFree: boolean,
 *   isPremium: boolean,
 *   isInstitutional: boolean,
 *   isLoaded: boolean,
 *   canUseLive: boolean,
 *   hasFeature: (feature: string) => boolean,
 *   hasPlanAccess: (minPlan: string) => boolean,
 *   getLimit: (limit: string) => number,
 *   refreshPlan: () => void,
 * }}
 */
export function usePlan() {
  const { user, isLoaded } = useUser();
  const [serverPlan, setServerPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);

  // Read plan from Clerk privateMetadata (client-side, immediate)
  const clerkPlan = isLoaded
    ? (user?.privateMetadata?.plan || "free")
    : "free";

  // Also fetch from server for authoritative plan status (handles webhook delays)
  const fetchServerPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status");
      if (res.ok) {
        const data = await res.json();
        setServerPlan(data.plan || null);
      }
    } catch {
      // Server unreachable — use Clerk metadata as fallback
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      fetchServerPlan();
    }
  }, [isLoaded, fetchServerPlan]);

  // Server plan takes precedence (authoritative), then Clerk metadata, then "free"
  const plan = serverPlan || clerkPlan;
  const planLevel = PLAN_HIERARCHY[plan] ?? 0;
  const planDetails = PLANS[plan] || null;

  const isFree = plan === "free";
  const isPremium = plan === "premium";
  const isInstitutional = plan === "institutional";

  const canUseLive = planLevel >= PLAN_HIERARCHY.premium;

  return {
    plan,
    planLevel,
    planDetails,
    isFree,
    isPremium,
    isInstitutional,
    isLoaded: isLoaded && !planLoading,
    canUseLive,
    hasFeature: (feature) => hasFeature(plan, feature),
    hasPlanAccess: (minPlan) => hasPlanAccess(plan, minPlan),
    getLimit: (limit) => getLimit(plan, limit),
    refreshPlan: fetchServerPlan,
  };
}
