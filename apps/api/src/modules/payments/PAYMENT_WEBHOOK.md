# Payment Webhook — Bank Notification Forwarding

A free, self-hosted alternative to EasySlip for verifying PromptPay/bank transfers.

## How it works

```
Bank          Phone/Email       Forwarder           POS Backend            POS Frontend
 │                │                │                    │                        │
 │ payment SMS    │                │                    │                        │
 │───────────────►│                │                    │                        │
 │                │ trigger        │                    │                        │
 │                │───────────────►│                    │                        │
 │                │                │ POST JSON          │                        │
 │                │                │───────────────────►│                        │
 │                │                │                    │ parse + match order    │
 │                │                │                    │ store notification     │
 │                │                │                    │ emit socket event ────►│
 │                │                │                    │                        │ play 🔔
 │                │                │                    │                        │ speak amount
 │                │                │                    │                        │ toast
```

## Setup channels

| Channel | Latency | Cost | Reliability |
|---------|---------|------|------------|
| Android SMS Forwarder | ~1 sec | Free + cheap phone | ⭐⭐⭐⭐⭐ |
| Gmail Apps Script | ~5 min | Free | ⭐⭐⭐⭐ |
| Mac Messages + script | ~10 sec | Free if you have a Mac | ⭐⭐⭐ |

## Webhook payload formats

The endpoint `POST /api/payments/sms-webhook/:storeToken` accepts two shapes:

### SMS payload
```json
{
  "message": "K-PLUS:Receive THB1,250.00 from MR. SOMSAK J.",
  "from": "KBANK",
  "receivedAt": "2025-05-10T14:23:00Z"
}
```

### Email payload
```json
{
  "subject": "K-PLUS Notify",
  "body": "Dear customer, Receive THB1,250.00 from MR. SOMSAK J. ...",
  "from": "noreply@kasikornbank.com",
  "receivedAt": "2025-05-10T14:23:00Z"
}
```

Either format is parsed by the same logic. HTML bodies are stripped automatically.

## Supported banks

The parser ships with patterns for the most common Thai banks. New banks can be added by editing `apps/api/src/modules/payments/sms-parser.ts`.

- **K-Bank** (KBANK / K-Plus / Kasikorn)
- **SCB** (Siam Commercial Bank)
- **BBL** (Bangkok Bank / Bualuang)
- **BAY** (Krungsri)
- **TTB** (TMB Thanachart)
- **GSB** (Government Savings Bank)
- **KTB** (Krungthai)
- **UOB**, **CIMB**

## Order matching

When a notification arrives, the backend looks for an order in this store that:
- Has status `PENDING` or `PREPARING`
- Has `total` exactly matching the parsed amount
- Was created within the last 60 minutes

If found, the notification is linked to the order via `matchedOrderId`.
If not found, the notification is still stored and broadcast — the cashier can
match it to an order manually.

## Security

- Each store has its own random webhook token (`smsWebhookToken`) generated via
  `POST /api/payments/sms-webhook/rotate-token`
- The token is part of the URL — it's essentially a shared secret
- Rotating the token invalidates the old webhook URL immediately
- The endpoint is intentionally public (no JWT) so SMS forwarder apps can call
  it without authentication

## Frontend behavior

The POS dashboard listens to the `payment:received` Socket.io event and:
1. Plays the cash register sound (`playCashRegister()`)
2. Announces the amount via Web Speech API (`announcePayment()`)
3. Shows a toast with the matched order number (if any)
4. Invalidates orders + dashboard queries if a match was made

Voice settings (ON/OFF, Thai/English) are stored per-device in `localStorage`.

## Files

- `sms-parser.ts` — parser for SMS + email body
- `sms-webhook.routes.ts` — public webhook + authenticated management endpoints
- `apps/web/public/apps-script/gmail-payment-forwarder.gs` — Apps Script template
- `apps/web/src/lib/voice.ts` — Web Speech API wrapper
- `apps/web/src/components/settings/SmsWebhookSetup.tsx` — Settings UI
