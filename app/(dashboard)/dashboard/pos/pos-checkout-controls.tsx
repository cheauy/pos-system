'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { PaymentMethod, ShippingDetails } from './pos-workspace-types';
import { paymentHiddenForDelivery, paymentHiddenForWalkIn } from './pos-customer-helpers';
import s from './pos-workspace.module.css';

const METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'cod', label: 'Cash on delivery (COD)' },
  { id: 'deposit', label: 'Cash deposit' },
  { id: 'bank_transfer', label: 'Bank transfer — received' },
  { id: 'credit', label: 'Customer credit' },
  { id: 'split', label: 'Split payment' },
] as const;

/** UI replacement only: values and validation remain the existing payment engine's. */
export function PaymentMethodSelect({ value, onChange, total, hasCustomer, disabled = false, isWalkIn = false, isDelivery = false, splitPaymentEnabled = true, customerCreditEnabled = true }: {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  total: number;
  hasCustomer: boolean;
  disabled?: boolean;
  isWalkIn?: boolean;
  isDelivery?: boolean;
  splitPaymentEnabled?: boolean;
  customerCreditEnabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PaymentMethod>(value);
  const visibleMethods = METHODS.filter(option => (option.id !== 'split' || splitPaymentEnabled) && (option.id !== 'credit' || customerCreditEnabled) && !paymentHiddenForWalkIn(option.id, isWalkIn) && !paymentHiddenForDelivery(option.id, isDelivery));
  const chosen = visibleMethods.find(option => option.id === value) || visibleMethods[0] || METHODS[0];
  const reason = (method: PaymentMethod) => paymentHiddenForWalkIn(method, isWalkIn)
    ? 'Not available for in-store walk-in sales'
    : method === 'credit' && !hasCustomer
    ? 'Select a saved customer first'
    : method === 'split' && total < 0.02 ? 'Requires a total of at least 0.02 in the accounting currency' : '';
  const available = visibleMethods.filter(option => !reason(option.id));
  const optionId = (method: PaymentMethod) => `${id}-option-${method}`;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (disabled) { setOpen(false); return; }
    if (open && reason(active)) setActive(available[0]?.id || chosen.id);
  }, [disabled, open, active, total, hasCustomer, isWalkIn, isDelivery]);
  useEffect(() => {
    if (open) menu.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-method="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function choose(method: PaymentMethod) {
    if (disabled || reason(method)) return;
    if (method !== value) onChange(method);
    setOpen(false);
    trigger.current?.focus();
  }
  function reveal() {
    setActive(reason(value) ? available[0]?.id || chosen.id : value);
    typeahead.current = { text: '', at: 0 };
    setOpen(true);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const key = event.key;
    if (key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); return;
    }
    if (key === 'Tab') { setOpen(false); return; }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active); else reveal();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      let index = available.findIndex(option => option.id === (open ? active : value));
      if (key === 'Home') index = 0;
      else if (key === 'End') index = available.length - 1;
      else if (!open) index = index < 0 ? 0 : index;
      else index = Math.max(0, Math.min(available.length - 1, index + (key === 'ArrowDown' ? 1 : -1)));
      setActive(available[index]?.id || chosen.id); setOpen(true); return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = (now - typeahead.current.at < 650 ? typeahead.current.text : '') + key.toLowerCase();
      typeahead.current = { text, at: now };
      const match = available.find(option => option.label.toLowerCase().startsWith(text));
      if (match) { setActive(match.id); setOpen(true); }
    }
  }

  return <div className={s.paymentSelect} ref={root}>
    <label className={s.paymentLabel} id={`${id}-label`} htmlFor={`${id}-trigger`}>Payment method</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" role="combobox"
      aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-controls={`${id}-listbox`}
      aria-expanded={open} aria-activedescendant={open ? optionId(active) : undefined}
      className={`${s.paymentTrigger} ${open ? s.paymentTriggerOpen : ''}`} disabled={disabled}
      onKeyDown={keyboard} onClick={() => { if (open) setOpen(false); else reveal(); }}>
      <span className={s.paymentTriggerText}>{chosen.label}</span>
      <ChevronDown size={20} className={open ? s.paymentChevronOpen : undefined}/>
    </button>
    {open && !disabled && <div ref={menu} id={`${id}-listbox`} role="listbox"
      aria-labelledby={`${id}-label`} className={s.paymentMenu}>
      {visibleMethods.map(({ id: method, label }) => {
        const unavailable = reason(method);
        return <div key={method} id={optionId(method)} role="option" data-method={method}
          aria-selected={method === value} aria-disabled={Boolean(unavailable)}
          className={`${s.paymentOption} ${method === value ? s.selectedPaymentOption : ''} ${method === active ? s.activePaymentOption : ''}`}
          onPointerMove={() => { if (!unavailable) setActive(method); }}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(method)}>
          <span className={s.paymentOptionText}><span>{label}</span>{unavailable && <small>{unavailable}</small>}</span>
          {method === value && <Check size={21} className={s.paymentCheck}/>}
        </div>;
      })}
    </div>}
  </div>;
}

type Carrier = Exclude<ShippingDetails['carrier'], '' | undefined>;
const CARRIERS: ReadonlyArray<{ id: Carrier; name: string; image: string }> = [
  { id: 'grab', name: 'Grab', image: '/shipping%20type/Grab-logo.png' },
  { id: 'jt', name: 'J&T', image: '/shipping%20type/j%26t-logo.png' },
  { id: 'vet', name: 'VET', image: '/shipping%20type/vet-logo.png' },
  { id: 'other', name: 'Other', image: '/images/pos-carriers/other.svg' },
];

function CarrierImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? <span role="status" style={{fontSize:11,color:'#a63730'}}>Logo file unavailable</span> :
    <img src={src} width={132} height={60} alt="" aria-hidden="true" decoding="async" onError={() => setFailed(true)}/>;
}

export function CarrierCards({ value, onChange, disabled = false }: {
  value: ShippingDetails['carrier'];
  onChange: (value: Carrier) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className={`${s.carrierFieldset} ${s.fullWidth}`} disabled={disabled}>
    <legend>Shipping type <span aria-hidden="true">*</span></legend>
    <div className={s.carrierGrid}>
      {CARRIERS.map(carrier => <label key={carrier.id} className={s.carrierOption}>
        <input type="radio" name={`${id}-carrier`} value={carrier.id} aria-label={carrier.name}
          checked={value === carrier.id} onChange={() => onChange(carrier.id)}/>
        <span className={s.carrierTile}>
          <span className={s.carrierArtwork}><CarrierImage src={carrier.image}/></span>
          <strong>{carrier.name}</strong>
          <span className={s.carrierCheck} aria-hidden="true">{value === carrier.id && <Check size={12}/>}</span>
        </span>
      </label>)}
    </div>
  </fieldset>;
}
