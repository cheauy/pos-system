export type RegisterBusinessState = {
  success: boolean;
  message: string;
  requiresEmailConfirmation?: boolean;
  destination?: string | null;
};

export const initialRegisterBusinessState: RegisterBusinessState = {
  success: false,
  message: "",
  requiresEmailConfirmation: false,
  destination: null,
};
