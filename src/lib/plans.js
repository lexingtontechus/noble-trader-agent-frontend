/**
 * Plan definitions — hardcoded single source of truth.
 *
 * Plan configs rarely change, so hardcoding avoids DB lookups on every
 * feature-gate check. User subscription STATE lives in Supabase
 * (user_subscriptions.plan), but the feature map is here.
 *
 * Hierarchy: free (0) → premium (1) → institutional (2)
 */

export const PLANS = {
  free: {
    key: "free",
    name: "Free",
    price: 0,
    priceLabel: "$0/mo",
    description: "Paper trading and basic analytics",
    level: 0,
    features: {
      paperTrading: true,
      liveTrading: false,
      backtestsPerDay: 5,
      regimeDetection: true,
      portfolioOptimization: false,
      realTimePL: false,
      priorityExecution: false,
      apiAccess: true,        // API keys available (30-day expiry, 1 key)
      apiKeyRotation: false,  // No rotation — must revoke & recreate
      customStrategies: false,
      multiTenant: false,
      dedicatedSupport: false,
    },
    limits: {
      backtestsPerDay: 5,
      symbolsWatchlist: 10,
      alertsPerDay: 20,
      apiCallsPerMinute: 10,
      apiKeysPerUser: 1,
      apiKeyExpiryDays: 30,
    },
  },
  premium: {
    key: "premium",
    name: "Premium",
    price: 49,
    priceLabel: "$49/mo",
    description: "Live trading, unlimited backtests, real-time analytics",
    level: 1,
    features: {
      paperTrading: true,
      liveTrading: true,
      backtestsPerDay: Infinity,
      regimeDetection: true,
      portfolioOptimization: true,
      realTimePL: true,
      priorityExecution: true,
      apiAccess: true,        // API keys available (permanent, 1 key)
      apiKeyRotation: true,   // Key rotation with 24hr grace period
      customStrategies: false,
      multiTenant: false,
      dedicatedSupport: false,
    },
    limits: {
      backtestsPerDay: Infinity,
      symbolsWatchlist: 100,
      alertsPerDay: 200,
      apiCallsPerMinute: 60,
      apiKeysPerUser: 1,
      apiKeyExpiryDays: null,  // Permanent
    },
  },
  institutional: {
    key: "institutional",
    name: "Institutional",
    price: null,
    priceLabel: "Custom",
    description: "Multi-tenant, API access, custom strategies, dedicated support",
    level: 2,
    features: {
      paperTrading: true,
      liveTrading: true,
      backtestsPerDay: Infinity,
      regimeDetection: true,
      portfolioOptimization: true,
      realTimePL: true,
      priorityExecution: true,
      apiAccess: true,        // API keys available (permanent, up to 5 keys)
      apiKeyRotation: true,   // Key rotation with 24hr grace period
      customStrategies: true,
      multiTenant: true,
      dedicatedSupport: true,
    },
    limits: {
      backtestsPerDay: Infinity,
      symbolsWatchlist: Infinity,
      alertsPerDay: Infinity,
      apiCallsPerMinute: 300,
      apiKeysPerUser: 5,
      apiKeyExpiryDays: null,  // Permanent
    },
  },
};

/** Plan hierarchy for numeric comparison */
export const PLAN_HIERARCHY = { free: 0, premium: 1, institutional: 2 };

/**
 * Check if a plan meets the minimum required plan level.
 * @param {string} userPlan - The user's current plan key
 * @param {string} requiredPlan - The minimum required plan key
 * @returns {boolean}
 */
export function hasPlanAccess(userPlan, requiredPlan) {
  const userLevel = PLAN_HIERARCHY[userPlan] ?? 0;
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Check if a specific feature is available on a plan.
 * @param {string} planKey - The plan key
 * @param {string} featureKey - The feature key (e.g., 'liveTrading')
 * @returns {boolean}
 */
export function hasFeature(planKey, featureKey) {
  const plan = PLANS[planKey];
  if (!plan) return false;
  return !!plan.features[featureKey];
}

/**
 * Get the limit value for a specific limit on a plan.
 * @param {string} planKey - The plan key
 * @param {string} limitKey - The limit key (e.g., 'backtestsPerDay')
 * @returns {number|Infinity}
 */
export function getLimit(planKey, limitKey) {
  const plan = PLANS[planKey];
  if (!plan) return 0;
  return plan.limits[limitKey] ?? 0;
}

/**
 * Get plan definition by key.
 * @param {string} planKey
 * @returns {object|null}
 */
export function getPlan(planKey) {
  return PLANS[planKey] || null;
}

/**
 * Get all plans as an array (useful for pricing tables).
 * @returns {object[]}
 */
export function getAllPlans() {
  return Object.values(PLANS);
}
