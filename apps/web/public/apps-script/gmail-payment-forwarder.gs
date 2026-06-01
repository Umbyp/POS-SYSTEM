/**
 * Gmail → POS Payment Webhook Forwarder
 *
 * Setup:
 *   1. Open https://script.google.com → New Project → name it "POS Payment Forwarder"
 *   2. Paste this entire file into the editor
 *   3. Replace WEBHOOK_URL below with the one shown in POS → Settings
 *   4. In Gmail, create a Filter:
 *        Matches: From: noreply@kasikornbank.com (or your bank's email)
 *        Do this: Apply label "PaymentInbox"
 *      → Save. New bank emails will now be labeled automatically.
 *   5. Back in Apps Script:
 *        Save (disk icon) → Run "forwardPaymentEmails"
 *        Grant Gmail permissions when prompted
 *   6. Triggers (clock icon in left sidebar):
 *        Add Trigger
 *        - Function: forwardPaymentEmails
 *        - Event source: Time-driven
 *        - Type: Minutes timer
 *        - Interval: Every 5 minutes
 *        - Save
 *
 * Verify it works:
 *   - Run forwardPaymentEmails manually after a real payment arrives
 *   - Or use POS Settings → Test parse with a sample email
 *   - Check Apps Script "Executions" log for any errors
 *
 * Troubleshooting:
 *   - "Label not found" → create the "PaymentInbox" label in Gmail first
 *   - "Authorization required" → run the function once manually to grant access
 *   - No emails forwarded → verify your Gmail filter is actually applying the label
 *     (check Gmail web → click the label in the sidebar — emails should appear there)
 */

// === EDIT THIS ===
const WEBHOOK_URL = 'PASTE-YOUR-WEBHOOK-URL-HERE';
const LABEL_NAME = 'PaymentInbox';
// =================

function forwardPaymentEmails() {
  if (WEBHOOK_URL.indexOf('PASTE') === 0) {
    throw new Error('Replace WEBHOOK_URL with your actual webhook URL from POS Settings');
  }

  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    Logger.log('Label "' + LABEL_NAME + '" not found in Gmail. Create it via Settings → Labels → New label.');
    return;
  }

  const threads = label.getThreads(0, 50);
  let forwarded = 0;
  let skipped = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      if (!msg.isUnread()) {
        skipped++;
        continue;
      }
      const payload = {
        subject: msg.getSubject() || '',
        body: msg.getPlainBody() || '',
        from: msg.getFrom() || '',
        receivedAt: msg.getDate().toISOString(),
      };
      try {
        const res = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        if (code >= 200 && code < 300) {
          msg.markRead();
          forwarded++;
          Logger.log('✓ Forwarded: "' + payload.subject + '" → ' + code);
        } else {
          Logger.log('✗ Webhook returned ' + code + ' for "' + payload.subject + '"');
        }
      } catch (err) {
        Logger.log('✗ Error forwarding "' + payload.subject + '": ' + err);
      }
    }
    // Remove the label so processed threads don't get re-checked
    try {
      thread.removeLabel(label);
    } catch (e) {
      // ignore
    }
  }

  Logger.log('Done. Forwarded ' + forwarded + ', skipped ' + skipped);
}

/** Run this once manually to test the webhook connection without waiting for a real email */
function testWebhook() {
  if (WEBHOOK_URL.indexOf('PASTE') === 0) {
    throw new Error('Replace WEBHOOK_URL first');
  }
  const payload = {
    subject: 'K-PLUS Notify (TEST)',
    body: 'Dear customer, Receive THB1.00 from TEST USER on ' + new Date().toString() + '. Balance THB1,000.00',
    from: 'test@example.com',
    receivedAt: new Date().toISOString(),
  };
  const res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  Logger.log('Status: ' + res.getResponseCode());
  Logger.log('Response: ' + res.getContentText());
}
