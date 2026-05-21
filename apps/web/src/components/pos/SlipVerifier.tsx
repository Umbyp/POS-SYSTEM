'use client';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ScanLine,
  Image as ImageIcon,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';

export interface SlipVerifyResult {
  transRef: string;
  payload: string;
  amount: number;
  senderName: string;
  receiverName: string;
}

interface Props {
  expectedAmount: number;
  onVerified: (result: SlipVerifyResult) => void;
  onCleared: () => void;
}

interface ApiResponse {
  ok: boolean;
  reasons: string[];
  slip: {
    transRef: string;
    date: string;
    amount: number;
    sender: { accountName: string; bank: { short: string } };
    receiver: { accountName: string; bank: { short: string }; proxy?: string };
  };
  payload: string;
}

type Mode = 'live' | 'photo' | 'manual';

export function SlipVerifier({ expectedAmount, onVerified, onCleared }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>('live');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [manualPayload, setManualPayload] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ---------- Camera stream ----------
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        tick();
      }
    } catch (e: any) {
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Camera permission denied — allow it in your browser'
          : e.name === 'NotFoundError'
          ? 'No camera found on this device'
          : 'Cannot open camera: ' + e.message
      );
    }
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Auto-start when mode = live + cleanup
  useEffect(() => {
    if (mode === 'live' && !result) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, result]);

  // Scan loop — every animation frame
  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (qr?.data) {
      stopCamera();
      verify(qr.data);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  // ---------- Decode from uploaded image ----------
  const decodeQrFromImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 1200;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas error'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (!qr) return reject(new Error('No QR found in image — try a clearer photo'));
          resolve(qr.data);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // ---------- Verify with backend ----------
  const verify = async (payload: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse>('/payments/verify-slip', {
        payload,
        expectedAmount,
      });
      setResult(data);
      if (data.ok) {
        toast.success('✅ Slip verified');
        onVerified({
          transRef: data.slip.transRef,
          payload: data.payload,
          amount: data.slip.amount,
          senderName: data.slip.sender.accountName,
          receiverName: data.slip.receiver.accountName,
        });
      } else {
        toast.error('❌ Slip verification failed');
        onCleared();
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Slip verification failed';
      toast.error(msg);
      setResult({ ok: false, reasons: [msg], slip: {} as any, payload });
      onCleared();
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setLoading(true);
    try {
      const payload = await decodeQrFromImage(file);
      await verify(payload);
    } catch (e: any) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setManualPayload('');
    if (fileRef.current) fileRef.current.value = '';
    onCleared();
  };

  // ---------- Success view ----------
  if (result?.ok) {
    return (
      <div className="bg-success/10 border-2 border-success rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" />
          <span className="font-medium text-success">Slip verified</span>
        </div>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="tabular-nums font-medium">
              {formatCurrency(result.slip.amount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sender</span>
            <span className="font-medium truncate ml-2">
              {result.slip.sender.accountName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receiver</span>
            <span className="font-medium truncate ml-2">
              {result.slip.receiver.accountName}
            </span>
          </div>
          <div className="flex justify-between font-mono text-[10px]">
            <span className="text-muted-foreground">Ref</span>
            <span>{result.slip.transRef}</span>
          </div>
        </div>
        <button
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Verify another slip
        </button>
      </div>
    );
  }

  // ---------- Main UI ----------
  return (
    <div className="space-y-2">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg text-xs">
        <button
          onClick={() => setMode('live')}
          className={`flex-1 py-1.5 rounded ${
            mode === 'live' ? 'bg-card font-medium' : 'text-muted-foreground'
          }`}
        >
          <Video className="w-3 h-3 inline mr-1" /> Live scan
        </button>
        <button
          onClick={() => setMode('photo')}
          className={`flex-1 py-1.5 rounded ${
            mode === 'photo' ? 'bg-card font-medium' : 'text-muted-foreground'
          }`}
        >
          <ImageIcon className="w-3 h-3 inline mr-1" /> Slip image
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-1.5 rounded ${
            mode === 'manual' ? 'bg-card font-medium' : 'text-muted-foreground'
          }`}
        >
          <ScanLine className="w-3 h-3 inline mr-1" /> Paste
        </button>
      </div>

      {/* Live camera */}
      {mode === 'live' && (
        <div className="space-y-2">
          {cameraError ? (
            <div className="bg-danger/10 border border-danger/40 rounded-lg p-3 text-xs text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-danger mx-auto" />
              <p>{cameraError}</p>
              <Button size="sm" variant="outline" onClick={startCamera}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-square sm:aspect-video">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scanning frame overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-2/3 aspect-square">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary" />
                  {/* Scanning line */}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-primary animate-scan-line shadow-[0_0_8px_2px_rgba(124,77,255,0.8)]" />
                </div>
              </div>

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs flex items-center gap-1.5">
                {loading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : scanning ? (
                  <>
                    <Video className="w-3 h-3 animate-pulse text-primary" />
                    <span>Scanning — point QR at the camera</span>
                  </>
                ) : (
                  <span>Opening camera...</span>
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] text-center text-muted-foreground">
            💡 Ask the customer to open the slip in their banking app, then show the QR to the camera
          </p>
        </div>
      )}

      {/* Photo upload */}
      {mode === 'photo' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="w-full p-4 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center gap-2 text-sm"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <>
                <Camera className="w-6 h-6 text-primary" />
                <span className="font-medium">Take / choose slip photo</span>
                <span className="text-[10px] text-muted-foreground">
                  Works with screenshots from banking apps
                </span>
              </>
            )}
          </button>
        </>
      )}

      {/* Manual paste */}
      {mode === 'manual' && (
        <div className="space-y-2">
          <textarea
            value={manualPayload}
            onChange={(e) => setManualPayload(e.target.value)}
            placeholder="Paste slip QR payload..."
            className="w-full h-20 bg-input border border-border rounded-lg px-3 py-2 text-xs font-mono"
            disabled={loading}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={loading || manualPayload.length < 10}
            onClick={() => verify(manualPayload.trim())}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
          </Button>
        </div>
      )}

      {/* Error result */}
      {result && !result.ok && (
        <div className="bg-danger/10 border border-danger/40 rounded-lg p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-danger">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Verification failed</span>
          </div>
          <ul className="space-y-0.5 list-disc list-inside text-muted-foreground">
            {result.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-foreground underline mt-1"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
