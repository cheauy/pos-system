export const alertKinds = {
  update: { label: 'New update', style: 'border-sky-200 bg-sky-50 text-sky-950', dot: 'bg-sky-500' },
  notice: { label: 'Notice', style: 'border-blue-200 bg-blue-50 text-blue-950', dot: 'bg-blue-600' },
  maintenance: { label: 'Maintenance', style: 'border-amber-200 bg-amber-50 text-amber-950', dot: 'bg-orange-500' },
  important: { label: 'Important', style: 'border-rose-200 bg-rose-50 text-rose-950', dot: 'bg-rose-500' },
} as const;

export type UpdateAlert = {
  id: string;
  kind: keyof typeof alertKinds;
  title: string;
  message: string;
  button_label: string | null;
  button_link: string | null;
  expires_at: string | null;
};
export type AlertHistory = UpdateAlert & { created_at: string; ended_at: string | null; is_live: boolean };

export function validateAlert(input: {
  kind: string; title: string; message: string; buttonLabel: string; buttonLink: string; expiresAt: string | null;
}) {
  if (!Object.hasOwn(alertKinds, input.kind)) return 'Choose an alert type.';
  if (!input.title.trim() || input.title.trim().length > 120) return 'Enter a title up to 120 characters.';
  if (!input.message.trim() || input.message.trim().length > 1500) return 'Enter a message up to 1,500 characters.';
  if (Boolean(input.buttonLabel.trim()) !== Boolean(input.buttonLink.trim())) return 'Enter both a button label and link, or leave both empty.';
  if (input.buttonLabel.trim().length > 40) return 'Keep the button label under 40 characters.';
  if (input.buttonLink.trim() && (input.buttonLink.trim().length > 500 || !/^\/dashboard([/?#][A-Za-z0-9_/?#=&.~-]*)?$/.test(input.buttonLink.trim()))) return 'Use a workspace link beginning with /dashboard.';
  if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now())) return 'Choose an end time in the future.';
  return null;
}
