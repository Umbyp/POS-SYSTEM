'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone,
  Mail,
  Bell,
  Laptop,
  Copy,
  Download,
  RefreshCw,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { announcePayment, isVoiceAvailable } from '@/lib/voice';

type Channel = 'android' | 'noti' | 'ios' | 'mac';

export function SmsWebhookSetup() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>('android');
  const [testInput, setTestInput] = useState({
    message: 'K-PLUS:Receive THB1,250.00 from MR. SOMSAK J. Balance THB12,345.00',
    subject: 'K-PLUS Notify',
    body: 'Dear customer, Receive THB1,250.00 from MR. SOMSAK J. on 10/05/2025 14:23. Balance THB12,345.00',
  });
  const [voiceOn, setVoiceOn] = useState(
    typeof window !== 'undefined' && localStorage.getItem('voice-announce') !== '0'
  );
  const [voiceLang, setVoiceLang] = useState<'th' | 'en'>(
    typeof window !== 'undefined'
      ? ((localStorage.getItem('voice-lang') as 'th' | 'en') || 'th')
      : 'th'
  );

  const { data: tokenData } = useQuery({
    queryKey: ['sms-webhook-token'],
    queryFn: () => api.get('/payments/sms-webhook/token').then((r) => r.data),
  });

  const rotate = useMutation({
    mutationFn: () => api.post('/payments/sms-webhook/rotate-token').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-webhook-token'] });
      toast.success('Token generated');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to generate token'),
  });

  const parseTest = useMutation({
    mutationFn: (payload: any) =>
      api.post('/payments/sms-webhook/parse-test', payload).then((r) => r.data),
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const webhookUrl = tokenData?.token
    ? `${apiBase}/payments/sms-webhook/${tokenData.token}`
    : '';

  const copy = (text: string, label = 'Copied') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem('voice-announce', next ? '1' : '0');
    if (next) announcePayment(123, voiceLang);
  };

  const changeLang = (lang: 'th' | 'en') => {
    setVoiceLang(lang);
    localStorage.setItem('voice-lang', lang);
    if (voiceOn) announcePayment(123, lang);
  };

  const runTest = () => {
    if (channel === 'ios') {
      parseTest.mutate({ subject: testInput.subject, body: testInput.body });
    } else {
      parseTest.mutate({ message: testInput.message });
    }
  };

  // Apps Script template — placeholder substitution at render time
  const appsScript = `// Gmail → POS Payment Webhook
// 1) script.google.com → New Project → paste this code
// 2) Replace WEBHOOK_URL below with your URL
// 3) In Gmail: create a Filter for bank emails → apply label "PaymentInbox"
// 4) Add a time-based trigger: Run "forwardPaymentEmails" every 5 minutes

const WEBHOOK_URL = '${webhookUrl || 'PASTE-YOUR-WEBHOOK-URL-HERE'}';
const LABEL_NAME = 'PaymentInbox';

function forwardPaymentEmails() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    Logger.log('Label "' + LABEL_NAME + '" not found — create it in Gmail first');
    return;
  }
  const threads = label.getThreads(0, 20);
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      if (msg.isUnread()) {
        const payload = {
          subject: msg.getSubject(),
          body: msg.getPlainBody(),
          from: msg.getFrom(),
          receivedAt: msg.getDate().toISOString(),
        };
        try {
          const res = UrlFetchApp.fetch(WEBHOOK_URL, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
          });
          Logger.log('Forwarded: ' + msg.getSubject() + ' → ' + res.getResponseCode());
          msg.markRead();
        } catch (err) {
          Logger.log('Error: ' + err);
        }
      }
    }
    // Remove label so processed threads aren't picked up again
    thread.removeLabel(label);
  }
}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-success" />
          Bank Payment Webhook (Voice + Auto-verify)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Voice settings */}
        <div className="border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {voiceOn ? (
                <Volume2 className="w-4 h-4 text-success" />
              ) : (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">Voice announcement</span>
            </div>
            <button
              onClick={toggleVoice}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                voiceOn
                  ? 'bg-success/15 text-success'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {voiceOn ? 'ON' : 'OFF'}
            </button>
          </div>
          {voiceOn && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => changeLang('th')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${
                  voiceLang === 'th'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                ไทย (Thai)
              </button>
              <button
                onClick={() => changeLang('en')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${
                  voiceLang === 'en'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                English
              </button>
            </div>
          )}
          {!isVoiceAvailable() && (
            <p className="text-[10px] text-warning mt-2">
              ⚠️ Voice not supported in this browser. Try Chrome, Edge, or Safari.
            </p>
          )}
        </div>

        {/* Webhook URL */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium">Webhook URL</label>
            {!tokenData?.token && (
              <Button
                size="sm"
                onClick={() => rotate.mutate()}
                disabled={rotate.isPending}
              >
                {rotate.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Generate'
                )}
              </Button>
            )}
          </div>
          {tokenData?.token ? (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 h-9 bg-input border border-border rounded-lg px-3 text-xs font-mono"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(webhookUrl, 'Webhook URL copied')}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm('Generate a new token? Old webhook URL will stop working.')) {
                      rotate.mutate();
                    }
                  }}
                  disabled={rotate.isPending}
                  title="Rotate token"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No webhook configured yet. Click "Generate" to create one.
            </p>
          )}
        </div>

        {/* Channel tabs */}
        <div>
          <label className="text-sm font-medium mb-2 block">Setup guide</label>
          <div className="flex gap-1 p-1 bg-muted rounded-lg mb-3 overflow-x-auto">
            <ChannelTab
              active={channel === 'android'}
              onClick={() => setChannel('android')}
              icon={<Smartphone className="w-3.5 h-3.5" />}
              label="Android SMS"
            />
            <ChannelTab
              active={channel === 'noti'}
              onClick={() => setChannel('noti')}
              icon={<Bell className="w-3.5 h-3.5" />}
              label="Android Noti"
            />
            <ChannelTab
              active={channel === 'ios'}
              onClick={() => setChannel('ios')}
              icon={<Mail className="w-3.5 h-3.5" />}
              label="iOS Email"
            />
            <ChannelTab
              active={channel === 'mac'}
              onClick={() => setChannel('mac')}
              icon={<Laptop className="w-3.5 h-3.5" />}
              label="Mac"
            />
          </div>

          {channel === 'android' && <AndroidGuide webhookUrl={webhookUrl} />}
          {channel === 'noti' && <NotificationListenerGuide webhookUrl={webhookUrl} />}
          {channel === 'ios' && (
            <IOSGuide
              webhookUrl={webhookUrl}
              appsScript={appsScript}
              onCopy={(t) => copy(t, 'Script copied')}
            />
          )}
          {channel === 'mac' && <MacGuide webhookUrl={webhookUrl} />}
        </div>

        {/* Parser test */}
        <div className="border-t border-border pt-4">
          <label className="text-sm font-medium mb-1.5 block">
            Test parser
            <span className="text-xs text-muted-foreground font-normal ml-2">
              Try a sample {channel === 'ios' ? 'email' : 'SMS'}
            </span>
          </label>
          {channel === 'ios' ? (
            <div className="space-y-2">
              <input
                value={testInput.subject}
                onChange={(e) => setTestInput({ ...testInput, subject: e.target.value })}
                placeholder="Subject"
                className="w-full h-9 bg-input border border-border rounded-lg px-3 text-xs font-mono"
              />
              <textarea
                value={testInput.body}
                onChange={(e) => setTestInput({ ...testInput, body: e.target.value })}
                rows={3}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs font-mono"
                placeholder="Email body..."
              />
            </div>
          ) : (
            <textarea
              value={testInput.message}
              onChange={(e) => setTestInput({ ...testInput, message: e.target.value })}
              rows={3}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs font-mono"
              placeholder="K-PLUS:Receive THB1,250.00 from MR. SOMSAK J..."
            />
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={runTest}
            disabled={parseTest.isPending}
          >
            {parseTest.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : null}
            Test parse
          </Button>
          {parseTest.data && (
            <div
              className={`mt-2 p-2.5 rounded-lg text-xs border ${
                parseTest.data.parsed
                  ? 'bg-success/10 border-success/30'
                  : 'bg-warning/10 border-warning/30'
              }`}
            >
              {parseTest.data.parsed ? (
                <>
                  <div className="flex items-center gap-1.5 font-medium text-success mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Parsed successfully
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>
                      Amount:{' '}
                      <strong className="text-foreground tabular-nums">
                        ฿{Number(parseTest.data.parsed.amount).toLocaleString()}
                      </strong>
                    </li>
                    {parseTest.data.parsed.bank && (
                      <li>
                        Bank:{' '}
                        <strong className="text-foreground">{parseTest.data.parsed.bank}</strong>
                      </li>
                    )}
                    {parseTest.data.parsed.senderName && (
                      <li>
                        Sender:{' '}
                        <strong className="text-foreground">
                          {parseTest.data.parsed.senderName}
                        </strong>
                      </li>
                    )}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      announcePayment(Number(parseTest.data.parsed.amount), voiceLang)
                    }
                  >
                    <Volume2 className="w-3.5 h-3.5 mr-1" /> Test voice
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-warning">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Could not parse as a payment {channel === 'ios' ? 'email' : 'SMS'}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NotificationListenerGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-2">
      <div className="bg-warning/10 border border-warning/30 rounded p-2">
        <p className="text-foreground font-medium mb-1">
          💡 Use this when your bank's email or SMS doesn't include the amount
        </p>
        <p className="text-muted-foreground">
          Some banks (esp. K-Bank "K-Plus" privacy mode, SCB) send notifications
          like <em>"เกิดรายการในบัญชี โปรดตรวจสอบในแอป"</em> with no amount. The fix:
          read the <strong>app's push notification</strong> directly — those{' '}
          <em>always</em> contain the amount.
        </p>
      </div>

      <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
        <li>
          Install one of these free Android apps that forward notifications to a webhook:
          <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-[11px]">
            <li>
              <strong className="text-foreground">Notification Forwarder</strong> (by lucky-apps,
              free, on Play Store)
            </li>
            <li>
              <strong className="text-foreground">Macrodroid</strong> (free with limits, very
              powerful — use the "Notification" trigger + "HTTP Request" action)
            </li>
            <li>
              <strong className="text-foreground">Tasker + AutoNotification</strong> (paid, most
              flexible)
            </li>
          </ul>
        </li>
        <li>
          Grant the app <strong>Notification Access</strong> permission (Android Settings → Apps
          → Special access → Notification access).
        </li>
        <li>
          Configure a rule to listen for notifications from your bank app
          (com.kasikorn.kplus, com.scb.phone, com.bbl.mobilebanking, etc.)
        </li>
        <li>
          Set the action to POST to your webhook URL with JSON body:
          <pre className="mt-1.5 p-2 bg-card border border-border rounded font-mono text-[10px] leading-tight overflow-x-auto">
            {`{"message":"%notification_text%","from":"%app_name%"}`}
          </pre>
          (replace <code>%notification_text%</code> with whatever placeholder your app uses for
          the notification body)
        </li>
        <li>
          Test by transferring 1 baht to your account → notification should appear in app →
          POS should announce the amount.
        </li>
      </ol>

      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
        💡 This works even when SMS/email lacks the amount, because the bank app's own push
        notification (the one that appears on the lock screen) always includes it.
      </p>
    </div>
  );
}

function AndroidGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-2">
      <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
        <li>
          Install <strong className="text-foreground">SMS Forwarder</strong> from Google Play
          (free, by Bogdan Kovalev) on an Android phone that receives bank SMS.
        </li>
        <li>
          In the app → <strong>Senders</strong> → add: KBANK, SCB, BBL, BAY, TTB
          (any bank that sends you SMS).
        </li>
        <li>
          <strong>Endpoints</strong> → New Endpoint → Type: <code>URL</code>
        </li>
        <li>
          Paste the webhook URL above. Method: <code>POST</code>, Content-Type:{' '}
          <code>application/json</code>
        </li>
        <li>
          Body template (paste this exactly):
          <pre className="mt-1.5 p-2 bg-card border border-border rounded font-mono text-[10px] leading-tight overflow-x-auto">
            {`{"message":"%text%","from":"%from%","receivedAt":"%sentStamp%"}`}
          </pre>
        </li>
        <li>Save → enable forwarding. Done!</li>
      </ol>
      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
        💡 The phone needs to stay on with SIM inserted to receive bank SMS.
        Keep it charging at the counter.
      </p>
    </div>
  );
}

function IOSGuide({
  webhookUrl,
  appsScript,
  onCopy,
}: {
  webhookUrl: string;
  appsScript: string;
  onCopy: (s: string) => void;
}) {
  const [showScript, setShowScript] = useState(false);
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-3">
      <div>
        <div className="font-medium text-foreground mb-1">
          iOS can't forward SMS — use Gmail instead
        </div>
        <p className="text-muted-foreground">
          Most Thai banks (K-Bank, SCB, BBL, etc.) can send <strong>email</strong> notifications
          when money arrives. We forward those emails via Google Apps Script.
        </p>
      </div>

      <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
        <li>
          In your bank app, enable <strong>email notifications</strong> for incoming transfers
          (settings vary by bank — search "email alert" or "ตั้งค่าแจ้งเตือนอีเมล").
        </li>
        <li>
          Send all bank notifications to a <strong>Gmail account</strong>.
        </li>
        <li>
          In Gmail → <strong>Settings → Filters</strong> → Create filter for emails
          from your bank (e.g. <code>From: noreply@kasikornbank.com</code>) → apply label{' '}
          <code className="bg-card px-1 rounded">PaymentInbox</code>.
        </li>
        <li>
          Open{' '}
          <a
            href="https://script.google.com"
            target="_blank"
            rel="noopener"
            className="text-primary hover:underline"
          >
            script.google.com
          </a>{' '}
          → New project → paste the script below.
        </li>
        <li>
          Save → Run the function <code>forwardPaymentEmails</code> once to grant permissions.
        </li>
        <li>
          Triggers (clock icon on left) → Add Trigger → function:{' '}
          <code>forwardPaymentEmails</code>, every <strong>5 minutes</strong>. Save.
        </li>
      </ol>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-medium text-foreground">Apps Script code</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setShowScript((s) => !s)}>
              {showScript ? 'Hide' : 'Show'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCopy(appsScript)}>
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            <a
              href="/apps-script/gmail-payment-forwarder.gs"
              download="gmail-payment-forwarder.gs"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium px-3 h-8 border border-border bg-card hover:bg-card-hover transition-colors text-xs"
            >
              <Download className="w-3 h-3 mr-1" /> .gs file
            </a>
          </div>
        </div>
        {showScript && (
          <pre className="p-2 bg-card border border-border rounded font-mono text-[10px] leading-tight overflow-x-auto max-h-64 overflow-y-auto">
            {appsScript}
          </pre>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
        💡 The script polls every 5 min — payments will be announced within 5 minutes of arrival.
        For faster, install SMS Forwarder on a cheap Android phone instead (~1 sec).
      </p>
    </div>
  );
}

function MacGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-2">
      <p className="text-muted-foreground">
        If you have a Mac always on at the shop, enable <strong>Messages in iCloud</strong> on
        both your iPhone and the Mac. The Mac will receive every SMS sent to your iPhone,
        including bank notifications.
      </p>
      <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
        <li>
          iPhone → <strong>Settings → Messages → Text Message Forwarding</strong> → enable for your
          Mac.
        </li>
        <li>
          On Mac, install a small forwarding script (e.g. using AppleScript + folder action on
          ~/Library/Messages/) — or use{' '}
          <a
            href="https://github.com/macmade/imessage-exporter"
            target="_blank"
            rel="noopener"
            className="text-primary hover:underline"
          >
            imessage-exporter
          </a>{' '}
          + cron to POST new messages to the webhook.
        </li>
        <li>
          For a simpler setup, consider a cheap Android phone instead (~1,500 baht).
        </li>
      </ol>
      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
        💡 This is the most complex option. Most shops do better with Android SMS Forwarder.
      </p>
    </div>
  );
}
