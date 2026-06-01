import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

/**
 * Supabase Storage — เก็บรูปสินค้าแบบถาวร (กันรูปหายตอน Render redeploy)
 *
 * ถ้าตั้งค่า SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → อัปโหลดขึ้น Supabase
 * ถ้าไม่ตั้ง → upload.routes จะ fallback ไปเก็บลงดิสก์ในเครื่อง (สำหรับ dev)
 */
let _client: SupabaseClient | null = null;

export const isStorageConfigured = () =>
  !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const bucket = () => env.SUPABASE_STORAGE_BUCKET || 'product-images';

function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

// สร้าง bucket (public) อัตโนมัติครั้งแรก — ถ้ามีอยู่แล้วจะ error เงียบ ๆ
let _bucketReady = false;
async function ensureBucket() {
  if (_bucketReady) return;
  await client()
    .storage.createBucket(bucket(), { public: true, fileSizeLimit: '10MB' })
    .catch(() => {});
  _bucketReady = true;
}

/** อัปโหลด buffer (webp) ขึ้น Supabase แล้วคืน public URL */
export async function uploadProductImage(
  buffer: Buffer,
  filename: string,
  contentType = 'image/webp'
): Promise<string> {
  await ensureBucket();
  const objectPath = `products/${filename}`;
  const { error } = await client()
    .storage.from(bucket())
    .upload(objectPath, buffer, {
      contentType,
      upsert: false,
      cacheControl: '604800', // cache 7 วัน (ชื่อไฟล์เป็น content-hash อยู่แล้ว)
    });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = client().storage.from(bucket()).getPublicUrl(objectPath);
  return data.publicUrl;
}

/** ตรวจว่า URL เป็นของ bucket เราหรือไม่ */
export function isOwnedStorageUrl(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${bucket()}/`);
}

/** ลบรูปออกจาก Supabase (best-effort). คืน true ถ้าเป็น URL ของ bucket เรา */
export async function deleteProductImage(url: string): Promise<boolean> {
  const marker = `/storage/v1/object/public/${bucket()}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const objectPath = url.slice(idx + marker.length);
  if (!objectPath) return false;
  await client().storage.from(bucket()).remove([objectPath]).catch(() => {});
  return true;
}
