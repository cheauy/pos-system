# Storefront order confirmation email

Set these server-only environment variables locally and in your deployment:

```env
RESEND_API_KEY=your_resend_api_key
ORDER_EMAIL_FROM=Melody Clothing <orders@your-verified-domain.com>
```

Verify the sender domain in Resend before sending customer receipts. See https://resend.com/docs/api-reference/emails/send-email.
Use a public NEXT_PUBLIC_ROOT_DOMAIN and NEXT_PUBLIC_SITE_URL in production so receipt links work on customer devices.
Restart the server after changing environment variables. Never use NEXT_PUBLIC_ for the email API key.

Checkout requires a valid email and attempts a receipt only after the order transaction succeeds. Receipts include the WEB tracking ID, total, tracking link, and store confirmation guidance. Provider requests use an idempotency key and retry transient failures once. A send failure does not roll back the order; the success screen tells the customer to save the tracking ID. Missing configuration is reported as unavailable, never as sent. The checkout email is used for the receipt and is not persisted to the orders table.
