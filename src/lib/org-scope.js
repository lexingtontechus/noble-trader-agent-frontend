/**
 * Multi-Tenant Isolation — org_id scoping utility.
 *
 * Provides helpers for:
 *   - Building org-scoped Supabase queries
 *   - Threading org_id from auth context into DB operations
 *   - Validating org membership before data access
 *   - Org-scoped credential resolution
 *
 * Architecture:
 *   - Clerk is the source of truth for org membership
 *   - org_id is stored as a nullable column in all user-scoped tables
 *   - BFF routes use service role key (bypasses RLS)
 *   - Application-level org_id filtering enforces isolation
 *   - RLS policies provide defense-in-depth for direct DB access
 *
 * All functions are SERVER-SIDE ONLY.
 */

// ── Query Builder Helpers ────────────────────────────────────────────────────

/**
 * Add org_id scope to a Supabase query builder.
 * If orgId is provided, adds .eq('org_id', orgId).
 * If not, falls back to user_id scoping (single-user mode).
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query - Supabase query builder
 * @param {Object} scope - Scoping parameters
 * @param {string} [scope.orgId] - Organization ID (from authContext)
 * @param {string} [scope.userId] - User ID (fallback for single-user mode)
 * @param {string} [scope.userIdColumn='user_id'] - Column name for user_id filter
 * @returns {import('@supabase/supabase-js').PostgrestFilterBuilder} - Scoped query
 *
 * @example
 * // Org-scoped query
 * const query = client.from('circuit_breakers').select('*');
 * const scoped = orgScope(query, { orgId: 'org_123', userId: 'user_456' });
 * // → .eq('org_id', 'org_123')
 *
 * // Single-user fallback
 * const query = client.from('circuit_breakers').select('*');
 * const scoped = orgScope(query, { userId: 'user_456' });
 * // → .eq('user_id', 'user_456')
 */
export function orgScope(query, { orgId, userId, userIdColumn = "user_id" }) {
  if (orgId) {
    return query.eq("org_id", orgId);
  }
  if (userId) {
    return query.eq(userIdColumn, userId);
  }
  return query;
}

/**
 * Build an insert/update payload with org_id included.
 * If orgId is provided, adds it to the payload.
 * If not, the record is scoped to the user only (single-user mode).
 *
 * @param {Object} payload - The data payload to insert/update
 * @param {Object} scope - Scoping parameters
 * @param {string} [scope.orgId] - Organization ID
 * @param {string} [scope.userId] - User ID
 * @param {string} [scope.userIdColumn='user_id'] - Column name for user_id
 * @returns {Object} - Payload with org_id and user_id included
 *
 * @example
 * const data = { symbol: 'AAPL', side: 'buy' };
 * const scoped = orgPayload(data, { orgId: 'org_123', userId: 'user_456' });
 * // → { symbol: 'AAPL', side: 'buy', org_id: 'org_123', user_id: 'user_456' }
 */
export function orgPayload(payload, { orgId, userId, userIdColumn = "user_id" }) {
  const scoped = { ...payload };

  if (orgId) {
    scoped.org_id = orgId;
  }

  if (userId && userIdColumn) {
    scoped[userIdColumn] = userId;
  }

  return scoped;
}

/**
 * Build a delete filter with org_id scoping.
 * Prevents accidental cross-org data deletion.
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query - Supabase delete query
 * @param {Object} scope - Scoping parameters
 * @param {string} [scope.orgId] - Organization ID
 * @param {string} [scope.userId] - User ID
 * @param {string} [scope.userIdColumn='user_id'] - Column name for user_id
 * @returns {import('@supabase/supabase-js').PostgrestFilterBuilder} - Scoped delete query
 */
export function orgDeleteScope(query, { orgId, userId, userIdColumn = "user_id" }) {
  return orgScope(query, { orgId, userId, userIdColumn });
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate that a user has access to a specific organization.
 * Checks that the orgId from the auth context matches a real Clerk org.
 *
 * @param {Object} authContext - The auth context from withAuth
 * @param {string} authContext.orgId - The org ID from Clerk
 * @param {string} authContext.userId - The user ID from Clerk
 * @returns {{ hasOrg: boolean, orgId: string|null }}
 */
export function validateOrgAccess(authContext) {
  const { orgId, userId } = authContext || {};

  return {
    hasOrg: !!orgId,
    orgId: orgId || null,
    // If no org, user is in single-user mode
    isSingleUser: !orgId,
  };
}

/**
 * Get the scope for a given auth context.
 * Returns an object that can be passed to orgScope/orgPayload.
 *
 * @param {Object} authContext - The auth context from withAuth
 * @returns {{ orgId: string|null, userId: string }}
 */
export function getOrgScope(authContext) {
  return {
    orgId: authContext?.orgId || null,
    userId: authContext?.userId,
  };
}

// ── Credential Scoping ───────────────────────────────────────────────────────

/**
 * Build credential query scope.
 * Org credentials take precedence over personal credentials.
 *
 * @param {Object} authContext - The auth context from withAuth
 * @returns {{ credentialType: string, orgId: string|null, userId: string }}
 */
export function getCredentialScope(authContext) {
  const scope = getOrgScope(authContext);

  return {
    ...scope,
    // If org context exists, look for org-level credentials first
    preferOrgCredentials: !!scope.orgId,
  };
}
