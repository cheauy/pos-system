export type UserActionState = {
  success: boolean;
  message: string;
};

export const initialUserActionState: UserActionState = {
  success: false,
  message: "",
};

export type UserStatusActionState = {
  success: boolean;
  message: string;
};

export const initialUserStatusActionState: UserStatusActionState = {
  success: false,
  message: "",
};