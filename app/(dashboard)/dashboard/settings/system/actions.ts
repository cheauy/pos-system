"use server";

export type AppearanceActionState = {
  success: boolean;
  message: string;
};

export async function updateAppearanceSettings(
  _previousState: AppearanceActionState,
  _formData: FormData,
): Promise<AppearanceActionState> {
  void _previousState;
  void _formData;

  return {
    success: false,
    message: "System settings are currently unavailable.",
  };
}
