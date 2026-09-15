export type RegisterAccountState = {
  success: boolean;
  message: string;
  requiresEmailConfirmation?: boolean;
  destination?: string | null;
};

export const initialRegisterAccountState: RegisterAccountState = {
  success: false,
  message: "",
  requiresEmailConfirmation: false,
  destination: null,
};
