import "server-only";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function enabled(value: string | undefined) {
  return TRUE_VALUES.has((value ?? "").trim().toLowerCase());
}

export type ManualPaymentConfig = {
  requestedEnabled: boolean;
  enabled: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl: string;
};

export function getManualPaymentConfig(): ManualPaymentConfig {
  const bankName = process.env.TENH_MANUAL_PAYMENT_BANK_NAME?.trim() ?? "";
  const accountName = process.env.TENH_MANUAL_PAYMENT_ACCOUNT_NAME?.trim() ?? "";
  const accountNumber = process.env.TENH_MANUAL_PAYMENT_ACCOUNT_NUMBER?.trim() ?? "";
  const qrImageUrl =
    process.env.TENH_MANUAL_PAYMENT_QR_IMAGE_URL?.trim() ||
    "/manual-payment-qr.jpg";
  const requestedEnabled = enabled(process.env.TENH_MANUAL_PAYMENT_ENABLED);

  return {
    requestedEnabled,
    enabled: requestedEnabled && Boolean(bankName && accountName && accountNumber),
    bankName,
    accountName,
    accountNumber,
    qrImageUrl,
  };
}
