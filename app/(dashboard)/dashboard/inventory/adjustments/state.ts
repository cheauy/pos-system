export type StockAdjustmentActionState = {
  success: boolean;
  message: string;
  submittedAt: number;
};

export const initialStockAdjustmentState: StockAdjustmentActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};
