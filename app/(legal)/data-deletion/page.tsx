import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to request deletion of your Tenh-POS account or personal data.",
};

export default function DataDeletionPage() {
  return (
    <>
      <h1>Data deletion</h1>
      <p>You can request deletion of your Tenh-POS account or personal information by contacting HONG PHIRUN, the operator of Tenh-POS.</p>
      <h2>How to submit a request</h2>
      <ol>
        <li>Email <a href="mailto:hongphirun@tenh-pos.com?subject=Tenh-POS%20data%20deletion%20request">hongphirun@tenh-pos.com</a> with the subject &ldquo;Tenh-POS data deletion request&rdquo;.</li>
        <li>Include your account email, business or store name and store URL, if available.</li>
        <li>Describe whether you want to delete your account, particular personal information or business data you are authorized to manage.</li>
      </ol>
      <p>Do not send passwords, authentication codes or full payment card details.</p>
      <h2>Verification and scope</h2>
      <p>Requests require verification of identity and authority over the affected account or business. We may ask for information needed to confirm ownership and clarify the requested scope before taking action. Sending an email does not automatically delete data.</p>
      <h2>Business and order records</h2>
      <p>Deleting shared business records can affect other users. If your request concerns an order placed with a store using Tenh-POS, contact that store as well so it can address records it manages.</p>
      <h2>Retention and response</h2>
      <p>Some records may need to be retained for accounting, security, dispute resolution or legal obligations, and copies may remain in backups until they expire. Ask for confirmation of what can be removed, any retention limits and the expected completion time for your request.</p>
      <h2>Need help?</h2>
      <p>Call <a href="tel:+85516729281">+855 16 729 281</a> or email <a href="mailto:hongphirun@tenh-pos.com">hongphirun@tenh-pos.com</a> for help with a deletion request.</p>
    </>
  );
}
