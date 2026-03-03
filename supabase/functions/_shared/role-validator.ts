/**
 * role-validator.ts — Role hierarchy validation for RBAC.
 *
 * Provides utilities to fetch and validate user roles against
 * a strict hierarchy: owner > admin > moderator > user.
 *
 * Uses the get_user_role() SECURITY DEFINER function to avoid
 * RLS recursion issues.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "./logger.ts";

export type AppRole = "owner" | "admin" | "moderator" | "user";

const log = createLogger("role-validator");

const ROLE_HIERARCHY: Record<AppRole, number> = {
  owner: 1,
  admin: 2,
  moderator: 3,
  user: 4,
};

/**
 * Fetches the highest-priority role for a given user.
 * Falls back to 'user' if no role is assigned.
 */
export async function getUserRole(
  client: SupabaseClient,
  userId: string,
): Promise<AppRole> {
  const { data, error } = await client.rpc("get_user_role", {
    _user_id: userId,
  });

  if (error) {
    log.error("Failed to fetch user role", { userId, error: error.message });
    return "user";
  }

  return (data as AppRole) ?? "user";
}

/**
 * Validates that a user meets the minimum required role.
 * Throws an error if the user's role is insufficient.
 */
export async function requireRole(
  client: SupabaseClient,
  userId: string,
  requiredRole: AppRole,
): Promise<AppRole> {
  const userRole = await getUserRole(client, userId);
  const userLevel = ROLE_HIERARCHY[userRole] ?? 99;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;

  if (userLevel > requiredLevel) {
    throw new Error(
      `Insufficient permissions. Required: ${requiredRole}, current: ${userRole}`,
    );
  }

  return userRole;
}

/**
 * Checks if a role is valid within the hierarchy.
 */
export function isValidRole(role: string): role is AppRole {
  return role in ROLE_HIERARCHY;
}
