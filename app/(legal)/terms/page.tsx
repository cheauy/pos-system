import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Draft terms of service for Tenh-POS, a brand of HONG PHIRUN.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>These draft terms describe the use of Tenh-POS, a brand of HONG PHIRUN, for POS, inventory, business management and online ordering.</p>
      <h2>Your account and business</h2>
      <p>Provide accurate account and business information, protect your sign-in credentials and grant staff access only when authorized. You must have permission to manage the business and any information you enter into the service.</p>
      <h2>Acceptable use</h2>
      <p>Use Tenh-POS lawfully. Do not attempt unauthorized access, disrupt the service or upload unlawful content. Businesses are responsible for their products, prices, taxes, customer communications and fulfillment obligations.</p>
      <h2>Subscriptions and payments</h2>
      <p>Review the plan, price, billing period and payment details shown before purchasing or renewing a subscription. Contact <a href="mailto:hongphirun@tenh-pos.com">hongphirun@tenh-pos.com</a> about billing, cancellation or refund questions.</p>
      <h2>Orders placed with stores</h2>
      <p>Stores using Tenh-POS manage their own product listings, orders, delivery, returns and customer service. Contact the relevant store about an order or its purchase conditions.</p>
      <h2>Your records and service access</h2>
      <p>Check business records for accuracy and keep copies of information you need. Access to features depends on your plan, account permissions and business status. Contact support if access is interrupted or you need help retrieving records.</p>
      <h2>Privacy and deletion</h2>
      <p>Read our <Link href="/privacy">Privacy Policy</Link> for information about data handling and our <Link href="/data-deletion">Data deletion</Link> page to request removal of information.</p>
      <h2>Contact</h2>
      <p>Questions about these draft terms can be sent to <a href="mailto:hongphirun@tenh-pos.com">hongphirun@tenh-pos.com</a>. Operator details are listed below.</p>
    </>
  );
}
