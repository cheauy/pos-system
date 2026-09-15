export type GetStartedState = {
  success: boolean;
  message: string;
  destination?: string | null;
};

export const initialGetStartedState: GetStartedState = {
  success: false,
  message: "",
  destination: null,
};
