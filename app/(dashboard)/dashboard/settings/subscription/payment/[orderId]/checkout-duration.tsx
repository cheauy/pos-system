'use client';

import { useFormStatus } from 'react-dom';
import { changePendingUpgradeDuration } from '../../actions';

export default function CheckoutDuration({orderId,months,canChange,canKeepExpiry}:{orderId:string;months:number;canChange:boolean;canKeepExpiry:boolean}) {
  return <form action={changePendingUpgradeDuration} className="mt-3">
    <input type="hidden" name="orderId" value={orderId}/>
    <DurationSelect key={months} months={months} canChange={canChange} canKeepExpiry={canKeepExpiry}/>
  </form>;
}
function DurationSelect({months,canChange,canKeepExpiry}:{months:number;canChange:boolean;canKeepExpiry:boolean}) {
  const {pending}=useFormStatus();
  return <><label htmlFor="checkout-addon-duration" className="sr-only">Add-on Duration</label><select id="checkout-addon-duration" name="termMonths" defaultValue={months} disabled={!canChange||pending} onChange={event=>event.currentTarget.form?.requestSubmit()} className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-2 focus:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-slate-900 dark:text-white">
    {canKeepExpiry&&<option value={0}>Keep current expiry</option>}
    <option value={1}>Add 1 month</option><option value={3}>Add 3 months</option><option value={6}>Add 6 months</option><option value={12}>Add 1 year</option>
  </select><p aria-live="polite" className="mt-2 text-xs text-blue-700 dark:text-blue-300">{pending?'Updating duration and total…':canChange?'Your total updates when you choose a duration.':'Duration is locked for this payment request.'}</p></>;
}
