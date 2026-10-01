/** Shared by printer settings, the batch printer and saved-order printouts. */
export const SHIPPING_LABEL_SIZES = [
  { id: '80x50', width: 80, height: 50, label: '80 × 50 mm' },
  { id: '100x100', width: 100, height: 100, label: '100 × 100 mm' },
  { id: '100x150', width: 100, height: 150, label: '100 × 150 mm' },
] as const;
export type ShippingLabelSize = typeof SHIPPING_LABEL_SIZES[number]['id'];
export const SHIPPING_TEMPLATES = [
  { id: 'en-classic', language: 'en', layout: 'classic', name: 'Classic', description: 'Clear boxed sections with recipient details and an order QR code.' },
  { id: 'en-courier', language: 'en', layout: 'courier', name: 'Courier — Auto layout', description: 'Three paper-size layouts: compact and square with QR on the right; portrait with QR below the details.' },
  { id: 'km-classic', language: 'km', layout: 'classic', name: 'Classic — ខ្មែរ', description: 'Khmer field labels with clear boxed sections.' },
  { id: 'km-courier', language: 'km', layout: 'courier', name: 'Courier — ខ្មែរ · Auto layout', description: 'Reference-style Khmer layouts for 80 × 50, 100 × 100 and 100 × 150 mm. Portrait uses a centered header and QR below the details.' },
] as const;
export type ShippingTemplateId = typeof SHIPPING_TEMPLATES[number]['id'];
export const SHIPPING_TEMPLATE_GROUPS = [
  { language: 'en', label: 'English Templates' },
  { language: 'km', label: 'Khmer Templates' },
] as const;
export function shippingLabelSize(value: unknown) {
  return SHIPPING_LABEL_SIZES.find(size => size.id === value) ?? SHIPPING_LABEL_SIZES[2];
}
export function shippingTemplate(value: unknown) {
  // Legacy stores have no template key; do not silently change their language.
  return SHIPPING_TEMPLATES.find(template => template.id === value) ?? SHIPPING_TEMPLATES[0];
}
export function isShippingTemplate(value: unknown): value is ShippingTemplateId {
  return SHIPPING_TEMPLATES.some(template => template.id === value);
}
export const SHIPPING_VISIBILITY_FLAGS = ['store_name', 'store_address', 'store_phone', 'phone', 'order_number', 'cod', 'item_count', 'barcode'] as const;
export const SHIPPING_EXTRA_FLAGS = ['date', 'linear_barcode', 'logo', 'footer'] as const;
/** Validate persisted JSON without breaking settings saved before templates existed. */
export function validateShippingSettings(value: unknown): Record<string, string | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shipping settings.');
  const settings = value as Record<string, unknown>;
  if (!SHIPPING_LABEL_SIZES.some(size => size.id === settings.shipping_label_size)) throw new Error('Invalid shipping label size.');
  if (settings.shipping_template != null && !isShippingTemplate(settings.shipping_template)) throw new Error('Choose a valid shipping template.');
  const result: Record<string, string | boolean> = {
    shipping_label_size: String(settings.shipping_label_size),
    shipping_template: shippingTemplate(settings.shipping_template).id,
  };
  for (const flag of SHIPPING_VISIBILITY_FLAGS) {
    const key = `shipping_show_${flag}`;
    if (typeof settings[key] !== 'boolean') throw new Error('Invalid shipping visibility setting.');
    result[key] = settings[key];
  }
  for (const flag of SHIPPING_EXTRA_FLAGS) {
    const key = `shipping_show_${flag}`;
    if (settings[key] != null && typeof settings[key] !== 'boolean') throw new Error('Invalid shipping visibility setting.');
    result[key] = settings[key] !== false;
  }
  return result;
}
