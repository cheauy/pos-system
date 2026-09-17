export type BusinessChangeReviewState = {
  success: boolean;
  message: string;
  reviewedAt: number | null;
};

export const initialBusinessChangeReviewState: BusinessChangeReviewState = {
  success: false,
  message: "",
  reviewedAt: null,
};
