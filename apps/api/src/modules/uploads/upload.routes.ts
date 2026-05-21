/**
 * Image upload endpoint.
 *
 * Accepts multipart/form-data uploads (camera or file picker), resizes to a
 * max edge of 1024px, converts to WebP at quality 80, and stores under
 *   apps/api/uploads/products/<random>.webp
 *
 * Returns a URL path the frontend can use directly (e.g. "/uploads/products/abc.webp").
 *
 * Old images linked to a Product are NOT auto-deleted when the image is replaced
 * or the product is deleted — running a periodic cleanup is recommended once
 * the store has been live for a while.
 */
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';

const router = Router();

// Resolve uploads dir relative to the API root (apps/api/uploads)
// Works for both `ts-node-dev` (src/) and compiled `dist/` builds.
const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
const PRODUCTS_DIR = path.join(UPLOADS_ROOT, 'products');

async function ensureDirs() {
  await fs.mkdir(PRODUCTS_DIR, { recursive: true });
}
ensureDirs().catch((e) => console.error('[uploads] mkdir failed', e));

const MAX_BYTES = 10 * 1024 * 1024; // 10MB raw — we'll downsize aggressively
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype.toLowerCase())) {
      return cb(new Error('Unsupported file type — please upload JPG, PNG, WebP, or HEIC'));
    }
    cb(null, true);
  },
});

router.use(authMiddleware);

/**
 * POST /api/uploads/product-image
 * Form field: "image" (the uploaded file)
 * Returns: { url: "/uploads/products/<id>.webp", size, width, height }
 */
router.post(
  '/product-image',
  rbac('OWNER', 'ADMIN'),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'image file required (multipart field "image")' });
      }

      const filename = crypto.randomBytes(12).toString('hex') + '.webp';
      const outputPath = path.join(PRODUCTS_DIR, filename);

      const pipeline = sharp(req.file.buffer, { failOn: 'truncated' })
        .rotate() // honor EXIF orientation
        .resize({
          width: 1024,
          height: 1024,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 });

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      await fs.writeFile(outputPath, data);

      res.json({
        url: `/uploads/products/${filename}`,
        size: info.size,
        width: info.width,
        height: info.height,
      });
    } catch (e: any) {
      // sharp throws "Input buffer contains unsupported image format" for bad uploads
      if (/unsupported image format|Input buffer/i.test(String(e?.message))) {
        return res.status(400).json({ error: 'Could not read image — please try a different file' });
      }
      next(e);
    }
  }
);

/**
 * DELETE /api/uploads/product-image
 * Body: { url: "/uploads/products/<id>.webp" }
 * Removes the file. Best-effort: returns ok even if file already missing.
 */
router.delete('/product-image', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (typeof url !== 'string' || !url.startsWith('/uploads/products/')) {
      return res.status(400).json({ error: 'url must be a /uploads/products/* path' });
    }
    const filename = path.basename(url);
    // Guard against directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'invalid filename' });
    }
    const filepath = path.join(PRODUCTS_DIR, filename);
    await fs.unlink(filepath).catch(() => undefined);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

/** Path on disk where uploads are stored — exported so app.ts can serve them statically */
export const UPLOADS_DIR = UPLOADS_ROOT;
