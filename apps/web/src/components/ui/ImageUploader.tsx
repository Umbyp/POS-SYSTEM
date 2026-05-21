'use client';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Image as ImageIcon, X, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  /** Current value — either a "/uploads/..." path or external URL */
  value: string;
  onChange: (value: string) => void;
  /** Image preview aspect — default 1:1 */
  aspect?: 'square' | 'video';
}

export function ImageUploader({ value, onChange, aspect = 'square' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post('/uploads/product-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as { url: string; size: number; width: number; height: number };
    },
    onSuccess: (data) => {
      onChange(data.url);
      toast.success('Image uploaded');
    },
    onError: (e: any) => {
      const msg = e.response?.data?.error || e.message || 'Upload failed';
      toast.error(msg);
    },
  });

  const removeFile = useMutation({
    mutationFn: async (url: string) => api.delete('/uploads/product-image', { data: { url } }),
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }
    upload.mutate(file);
    // reset so picking the same file again triggers onChange
    e.target.value = '';
  };

  const clear = () => {
    // Best-effort delete from disk if we own this image
    if (value && value.startsWith('/uploads/')) {
      removeFile.mutate(value);
    }
    onChange('');
  };

  const preview = resolveImageUrl(value);
  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-video';

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {preview ? (
        <div className="relative group">
          <div
            className={`${aspectClass} rounded-lg overflow-hidden border border-border bg-muted relative`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {upload.isPending && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={clear}
              className="w-8 h-8 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-danger transition-colors"
              title="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cameraRef.current?.click()}
              disabled={upload.isPending}
            >
              <Camera className="w-4 h-4 mr-1" /> Re-take
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              <ImageIcon className="w-4 h-4 mr-1" /> Choose file
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={upload.isPending}
            className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <>
                <Camera className="w-6 h-6 text-primary" />
                <span className="text-xs font-medium">Take photo</span>
                <span className="text-[10px] text-muted-foreground">Mobile camera</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            <ImageIcon className="w-6 h-6 text-primary" />
            <span className="text-xs font-medium">Choose file</span>
            <span className="text-[10px] text-muted-foreground">JPG, PNG, WebP</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowUrlInput((s) => !s)}
        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <LinkIcon className="w-3 h-3" />
        {showUrlInput ? 'Hide URL input' : 'Or paste image URL'}
      </button>
      {showUrlInput && (
        <Input
          value={value.startsWith('http') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="text-xs"
        />
      )}
    </div>
  );
}
