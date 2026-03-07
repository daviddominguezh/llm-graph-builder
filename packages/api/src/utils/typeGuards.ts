/**
 * Type guard to check if an unknown value is an Error instance
 * @param e - The unknown value to check
 * @returns True if the value is an Error instance
 */
export const isError = (e: unknown): e is Error => e instanceof Error;
