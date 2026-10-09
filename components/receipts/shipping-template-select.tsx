"use client";
import { SHIPPING_TEMPLATES, SHIPPING_TEMPLATE_GROUPS, type ShippingTemplateId, type NamedShippingTemplate } from '@/lib/receipts/shipping-templates';

export default function ShippingTemplateSelect({ value, onChange, className = '', disabled = false, customTemplates=[] }: {
  value: ShippingTemplateId; onChange: (value: ShippingTemplateId) => void; className?: string; disabled?: boolean;customTemplates?:NamedShippingTemplate[];
}) {
  return <label className="block min-w-0 text-sm font-semibold">Select Template
    <select aria-label="Select shipping template" value={value} disabled={disabled} onChange={event => onChange(event.target.value as ShippingTemplateId)} className={className}>
      <option value="custom">Custom Template</option>
      {customTemplates.length>0&&<optgroup label="Saved custom templates">{customTemplates.map(template=><option key={template.id} value={`custom:${template.id}`} data-i18n-ignore="true">{template.name}</option>)}</optgroup>}
      {SHIPPING_TEMPLATE_GROUPS.map(group => <optgroup key={group.language} label={group.label}>
        {SHIPPING_TEMPLATES.filter(template => template.language === group.language).map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
      </optgroup>)}
    </select>
  </label>;
}
