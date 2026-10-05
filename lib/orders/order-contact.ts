type CustomerContact = { name?: string | null; phone?: string | null; address?: string | null };

/** Linked customer data is current; guest contact is used when no customer record remains. */
export function orderContact(order: {
  guest_name?: string | null; guest_phone?: string | null; guest_address?: string | null;
  customers?: CustomerContact | CustomerContact[] | null;
}) {
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  return {
    name: customer ? customer.name ?? '' : order.guest_name ?? '',
    phone: customer ? customer.phone ?? '' : order.guest_phone ?? '',
    address: customer ? customer.address ?? '' : order.guest_address ?? '',
  };
}
