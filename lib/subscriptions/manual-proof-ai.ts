import "server-only";

/**
 * Manual payment proof OCR/AI screening was intentionally disabled.
 * Manual Bank Transfer is reviewed by TENH administrators only.
 * This no-op export remains temporarily for compatibility with any stale build
 * output while source callers are removed.
 */
export async function analyzeManualPaymentProofSafely(_args: unknown) {
  return { status: "disabled" as const };
}
