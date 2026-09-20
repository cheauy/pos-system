/** Only an explicit PostgreSQL statement/transaction rollback is a confirmed failure.
 * Transport, gateway, authentication and schema errors must retain a saved request ID:
 * a previous attempt may have committed before the response was lost.
 */
export function isConfirmedRollback(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(22|23|40)[0-9A-Z]{3}$/.test(code)
    || code === "P0001" || code === "P0002" || code === "P0003";
}
