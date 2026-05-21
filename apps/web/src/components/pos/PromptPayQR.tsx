'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, AlertCircle } from 'lucide-react';
import { generatePromptPayPayload, formatPromptPayId } from '@/lib/promptpay';
import { formatCurrency } from '@/lib/format';

interface Props {
  promptpayId: string;
  amount: number;
  merchantName?: string;
}

export function PromptPayQR({ promptpayId, amount, merchantName }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!promptpayId) {
      setError('ยังไม่ได้ตั้งค่า PromptPay ID — ตั้งใน Settings');
      setLoading(false);
      return;
    }
    try {
      const payload = generatePromptPayPayload({ promptpayId, amount });
      QRCode.toDataURL(payload, {
        width: 320,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      })
        .then((url) => {
          setQrDataUrl(url);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [promptpayId, amount]);

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-xl p-6 text-center">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-2" />
        <p className="text-danger text-sm">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-muted rounded-xl p-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 flex flex-col items-center">
      {/* Header with Thai QR brand */}
      <div className="w-full text-center mb-2">
        <div className="inline-flex items-center gap-2 bg-[#1e3a8a] text-white px-4 py-1 rounded text-xs font-bold">
          THAI QR PAYMENT
        </div>
      </div>

      {/* PromptPay logo + ID */}
      <div className="w-full flex items-center justify-between px-2 mb-2">
        <div className="text-[#003478] font-bold text-sm">
          พร้อมเพย์<br />
          <span className="text-[10px] font-normal">PromptPay</span>
        </div>
        <div className="text-right text-xs text-gray-600">
          {merchantName && <div className="font-medium">{merchantName}</div>}
          <div className="font-mono">{formatPromptPayId(promptpayId)}</div>
        </div>
      </div>

      {/* QR Code */}
      <img src={qrDataUrl} alt="PromptPay QR" className="w-full max-w-[280px]" />

      {/* Amount */}
      <div className="mt-3 text-center">
        <div className="text-xs text-gray-500">จำนวนเงิน</div>
        <div className="text-2xl font-bold text-gray-900 tabular-nums">
          {formatCurrency(amount)}
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mt-2 text-center px-2">
        สแกนผ่าน Mobile Banking App ทุกธนาคาร
      </p>
    </div>
  );
}
