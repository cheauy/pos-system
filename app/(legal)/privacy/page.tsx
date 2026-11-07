import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Draft privacy policy for Tenh-POS, a brand of HONG PHIRUN.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Tenh-POS is a brand of HONG PHIRUN. This draft describes how information is handled when you use our POS, inventory and online ordering services.</p>
      <h2>Information used by the service</h2>
      <p>Depending on the features you use, information may include account and contact details, business and staff details, customer and delivery information, products, inventory, orders, sales records and files you upload. Cookies and browser storage support sign-in and preferences such as language and appearance.</p>
      <h2>How information is used</h2>
      <p>Information is used to provide the features you request, manage accounts and business access, process orders and subscriptions, maintain business records and respond to support requests.</p>
      <h2>Service providers and business access</h2>
      <p>Providing these services involves hosting, authentication, storage and payment providers. Business owners and authorized staff can access information according to their permissions. When you order from a store using Tenh-POS, that store receives the information needed to manage your order and should be contacted about its own privacy practices.</p>
      <h2>Retention and your choices</h2>
      <p>Retention depends on the type of information, the operation of the service and applicable recordkeeping requirements. Contact us to ask about access, corrections or retention for your information. To request removal, follow the <Link href="/data-deletion">data deletion instructions</Link>.</p>
      <h2>Contact</h2>
      <p>For privacy questions, email <a href="mailto:hongphirun@tenh-pos.com">hongphirun@tenh-pos.com</a> or use the operator contact details below.</p>
    </>
  );
}
