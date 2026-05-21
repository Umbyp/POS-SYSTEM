'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, RefreshCw, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { analyticsApi } from '@/lib/api';
import { useAuth } from '@/stores/auth.store';

export function AIInsightsWidget() {
  const user = useAuth((s) => s.user);
  const storeId = user?.storeId;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);

  // ดึง insights ที่ generate ไว้แล้ว
  const { data: insights = [], isLoading, refetch } = useQuery({
    queryKey: ['ai-insights', storeId],
    queryFn: () =>
      analyticsApi
        .get('/api/insights', { params: { store_id: storeId } })
        .then((r) => r.data)
        .catch(() => []),
    enabled: !!storeId,
    refetchInterval: 5 * 60_000,
  });

  // Re-generate ใหม่
  const regen = useMutation({
    mutationFn: () =>
      analyticsApi.post(`/api/insights/generate?store_id=${storeId}`).then((r) => r.data),
    onSuccess: () => refetch(),
  });

  // ถาม AI (streaming)
  const ask = async () => {
    if (!question.trim() || !storeId) return;
    setStreaming(true);
    setAnswer('');
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_ANALYTICS_API || 'http://localhost:8000'}/api/chat/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, message: question, history: [] }),
        }
      );
      if (!response.body) throw new Error('No stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setAnswer(full);
      }
    } catch (e: any) {
      setAnswer(`ไม่สามารถเชื่อมต่อ AI Analytics ได้ — ตรวจว่ารัน pos-analytics service ที่ port 8000 หรือไม่`);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" /> AI Insights
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => regen.mutate()}
            disabled={regen.isPending}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="วิเคราะห์ใหม่"
          >
            {regen.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Insights list */}
      {isLoading ? (
        <div className="shimmer h-16 rounded-lg" />
      ) : insights.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-2">
            ยังไม่มี AI insights หรือ analytics service ปิดอยู่
          </p>
          <button
            onClick={() => regen.mutate()}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            disabled={regen.isPending}
          >
            {regen.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            สร้าง insights ใหม่
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
          {insights.slice(0, 5).map((ins: any) => (
            <div
              key={ins.id}
              className={`p-2.5 rounded-lg text-sm border ${
                ins.severity === 'CRITICAL' ? 'border-danger/40 bg-danger/5' :
                ins.severity === 'WARNING' ? 'border-warning/40 bg-warning/5' :
                ins.severity === 'GOOD' ? 'border-success/40 bg-success/5' :
                'border-border bg-muted/30'
              }`}
            >
              <div className="font-medium text-sm mb-0.5">{ins.title}</div>
              {ins.description && (
                <div className="text-xs text-muted-foreground">{ins.description}</div>
              )}
              {ins.recommendation && (
                <div className="text-xs mt-1 text-primary">💡 {ins.recommendation}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ask AI */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">ถาม AI</span>
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !streaming && ask()}
            placeholder="ถาม เช่น วันนี้ขายดีไหม? พรุ่งนี้ต้องสั่งอะไร?"
            className="flex-1 h-9 bg-input border border-border rounded-lg px-3 text-sm"
            disabled={streaming}
          />
          <button
            onClick={ask}
            disabled={streaming || !question.trim()}
            className="px-3 h-9 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        {answer && (
          <div className="mt-2 p-2.5 rounded-lg bg-muted/30 border border-border text-sm whitespace-pre-wrap">
            {answer}
            {streaming && <span className="inline-block w-1 h-3 bg-primary animate-pulse ml-1" />}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        ใช้ pos-analytics service ที่ port 8000 ·{' '}
        <a
          href="http://localhost:3001"
          target="_blank"
          className="text-primary hover:underline inline-flex items-center gap-0.5"
        >
          เปิด Analytics Dashboard <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </p>
    </div>
  );
}
