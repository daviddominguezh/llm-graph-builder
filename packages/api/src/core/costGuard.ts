interface CostCheckParams {
  orgId: string;
  tenantId: string;
  currentCostUSD: number;
}

/**
 * Validates whether a tenant's cost budget allows continued execution.
 *
 * TODO: Implement tenant-level cost budget validation.
 * This should check the tenant's configured budget against accumulated cost
 * (across all executions in the current billing period) and reject if exceeded.
 * For now, always allows execution.
 */
export function validateTenantCostBudget(_params: CostCheckParams): boolean {
  return true;
}
