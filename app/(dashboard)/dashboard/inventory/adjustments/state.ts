export type StockAdjustmentActionState = {
  success: boolean;
  message: string;
  submittedAt: number;
  uncertain?: boolean;
  items?: { productId: string; stockBefore: number; stockAfter: number; delta: number }[];
};

export const initialStockAdjustmentState: StockAdjustmentActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};
