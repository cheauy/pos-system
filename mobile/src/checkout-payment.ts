function amount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 99999999900) throw new Error('Enter a valid payment amount.');
  return cents;
}

export function checkoutPayment(method: string, total: number, received: string, splitMethods: [string,string] = ['cash','bank_transfer']) {
  const due = Math.round(total * 100);
  if (!Number.isFinite(total) || total < 0 || !Number.isSafeInteger(due)) throw new Error('Refresh the sale total.');
  const tenders: { method: 'cash' | 'bank_transfer' | 'other'; amount: number; reference: string }[] = [];
  if (method === 'cod') return { amountPaid: 0, paymentsConfirmed: false, tenders };
  if (method === 'bank_transfer') return { amountPaid: total, paymentsConfirmed: true, tenders };
  if (!['cash', 'deposit', 'split'].includes(method)) throw new Error('Choose a supported payment method.');
  const paid = amount(received);
  if (method === 'cash' && paid < due) throw new Error('Cash received is less than the total.');
  if (['deposit', 'split'].includes(method) && (paid <= 0 || paid >= due)) throw new Error('Enter an amount greater than zero and less than the total.');
  if (method === 'split') {
    if(splitMethods.length!==2||splitMethods[0]===splitMethods[1]||splitMethods.some(value=>!['cash','bank_transfer','other'].includes(value))) throw new Error('Choose two different payment methods.');
    tenders.push({ method: splitMethods[0] as 'cash'|'bank_transfer'|'other', amount: paid / 100, reference: '' }, { method: splitMethods[1] as 'cash'|'bank_transfer'|'other', amount: (due - paid) / 100, reference: '' });
    return { amountPaid: total, paymentsConfirmed: true, tenders };
  }
  return { amountPaid: paid / 100, paymentsConfirmed: false, tenders };
}
