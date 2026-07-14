# คู่มือ Deploy ขึ้น Production

ระบบนี้มี **4 ส่วน** + ฐานข้อมูล Supabase (มีอยู่แล้ว) แผนการ deploy:

| ส่วน | โฮสต์ | repo / โฟลเดอร์ |
|------|-------|------------------|
| POS API (Express + Socket.io) | **Render** (web service, Node) | `pos-system` → `apps/api` |
| POS Web (Next.js) | **Vercel** | `pos-system` → `apps/web` |
| Analytics API (FastAPI) | **Render** (web service, Python) | `pos-analytics` → `apps/analytics-api` |
| Analytics Web (Next.js) | **Vercel** | `pos-analytics` → `apps/analytics-web` |
| Database | **Supabase** (มีอยู่แล้ว) | — |

> ลำดับที่แนะนำ: deploy **API ก่อน** (จะได้ URL) → deploy **Web** (ใส่ URL ของ API) → ย้อนกลับไปตั้ง CORS/WEB_URL ของ API ให้ชี้มาที่ URL ของ Web → redeploy

---

## 0. เตรียมก่อน
- push โค้ดทั้ง 2 repo (`pos-system`, `pos-analytics`) ขึ้น GitHub
- สมัคร [Render](https://render.com) + [Vercel](https://vercel.com) (ล็อกอินด้วย GitHub ได้)
- มี Supabase connection string อยู่แล้ว (Pooled `:6543` + Direct `:5432`)

---

## 1. POS API → Render
1. Render Dashboard → **New → Blueprint** → เลือก repo `pos-system` → จะอ่าน `render.yaml` ให้อัตโนมัติ (service ชื่อ `pos-api`)
2. กรอก Environment variables (ดูคีย์ทั้งหมดใน `apps/api/.env.example`):
   - `DATABASE_URL` = Supabase **pooled** (`...:6543/postgres?pgbouncer=true`)
   - `DIRECT_URL` = Supabase **direct** (`...:5432/postgres`)
   - `JWT_SECRET` = สุ่มสตริงยาว ≥ 16 ตัว
   - `WEB_URL` = (ใส่ทีหลังหลังได้ URL ของ POS Web) ชั่วคราวใส่ `https://example.com`
   - `STRIPE_SECRET_KEY` = `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` = (ใส่ทีหลัง ดูข้อ 6)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` = (สำหรับเก็บรูปสินค้าถาวร — ดูข้อ 6.5)
3. Deploy → รอจน health check `/health` เขียว → **คัดลอก URL** (เช่น `https://pos-api.onrender.com`)

> Build command/Start command ถูกตั้งไว้แล้วใน `render.yaml`:
> build = `npm install && npm run build --workspace=apps/api` (รัน `prisma generate` อัตโนมัติผ่าน postinstall),
> start = `npm run start --workspace=apps/api`

---

## 2. Analytics API → Render
1. Render → **New → Blueprint** → เลือก repo `pos-analytics` (อ่าน `render.yaml`, service `analytics-api`)
2. Environment (ดู `apps/analytics-api/.env.example`):
   - `DATABASE_URL` = Supabase **direct** (`...:5432/postgres`)
   - `GEMINI_API_KEY`, (ถ้ามี) `OPENROUTER_API_KEY`
   - `CORS_ORIGINS` = (ใส่ทีหลัง) ชั่วคราว `https://example.com`
3. Deploy → รอ `/health` เขียว → **คัดลอก URL** (เช่น `https://analytics-api.onrender.com`)

> Python 3.11 ถูกล็อกไว้แล้ว (`PYTHON_VERSION=3.11.9`) เพื่อให้ prophet/pandas ติดตั้งจาก wheel ได้

---

## 3. POS Web → Vercel
1. Vercel → **Add New → Project** → เลือก repo `pos-system`
2. **Root Directory** = `apps/web` (สำคัญมาก เพราะเป็น monorepo)
3. Framework = Next.js (ตรวจอัตโนมัติ)
4. Environment Variables (ดู `apps/web/.env.example`):
   - `NEXT_PUBLIC_API_URL` = `https://pos-api.onrender.com/api`  ← มี `/api` ต่อท้าย
   - `NEXT_PUBLIC_ANALYTICS_API` = `https://analytics-api.onrender.com`
   - `NEXT_PUBLIC_ANALYTICS_URL` = (ใส่ทีหลังหลังได้ URL ของ Analytics Web)
   - (ไม่บังคับ) `NEXT_PUBLIC_SOCKET_URL` = `https://pos-api.onrender.com` — realtime; ถ้าไม่ตั้งจะเดาจาก `NEXT_PUBLIC_API_URL` ให้เอง
5. Deploy → **คัดลอก URL** (เช่น `https://pos-web.vercel.app`)

> ⚠️ ค่า `NEXT_PUBLIC_*` ถูกฝังตอน **build** — ถ้าแก้/เพิ่มทีหลัง ต้อง **Redeploy** ถึงจะมีผล
> อาการเมื่อลืมตั้ง `NEXT_PUBLIC_API_URL`: เว็บที่ deploy จะยิง API ไป `http://localhost:4000`
> → `ERR_CONNECTION_REFUSED` ตอนล็อกอิน + `websocket error` รัว ๆ

---

## 4. Analytics Web → Vercel
1. Vercel → **Add New → Project** → เลือก repo `pos-analytics`
2. **Root Directory** = `apps/analytics-web`
3. Environment Variables:
   - `NEXT_PUBLIC_ANALYTICS_API` = `https://analytics-api.onrender.com`
4. Deploy → **คัดลอก URL** (เช่น `https://analytics-web.vercel.app`)

---

## 5. เชื่อม URL กลับ (สำคัญ — ไม่งั้น CORS บล็อก)
ตอนนี้รู้ URL ครบแล้ว ย้อนกลับไปแก้:
- **Render `pos-api`** → `WEB_URL` = `https://pos-web.vercel.app` (คั่น comma ได้ถ้ามีหลายโดเมน) → Save (Render redeploy ให้เอง)
- **Render `analytics-api`** → `CORS_ORIGINS` = `https://analytics-web.vercel.app,https://pos-web.vercel.app` → Save
- **Vercel `pos-web`** → `NEXT_PUBLIC_ANALYTICS_URL` = `https://analytics-web.vercel.app` → **Redeploy** (ค่า NEXT_PUBLIC ฝังตอน build จึงต้อง redeploy)

---

## 6. Stripe live + Webhook (เงินจริง)
1. Stripe Dashboard → ปิด **Test mode** → ทำ **Activate account** ให้ครบ → **Settings → Payment methods** → เปิด **PromptPay**
2. **Developers → API keys** → คัดลอก `sk_live_...` → ใส่เป็น `STRIPE_SECRET_KEY` ของ Render `pos-api`
3. **Developers → Webhooks → Add endpoint**:
   - URL = `https://pos-api.onrender.com/api/payments/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - สร้างเสร็จ คัดลอก **Signing secret** (`whsec_...`) → ใส่เป็น `STRIPE_WEBHOOK_SECRET` ของ Render `pos-api` → Save

---

## 6.5 Supabase Storage (เก็บรูปสินค้าถาวร — แนะนำให้ทำ)
ไม่ทำขั้นนี้ก็ deploy ได้ แต่รูปสินค้าจะหายทุกครั้งที่ redeploy เพราะดิสก์ Render เป็น ephemeral
1. Supabase Dashboard → **Settings → API** → คัดลอก:
   - **Project URL** (เช่น `https://napyjovegudrpirqdujn.supabase.co`)
   - **service_role** key (อยู่ใต้ "Project API keys" — กด reveal; **ลับมาก อย่าเอาไปใส่ฝั่ง frontend**)
2. ไป Render → `pos-api` → **Environment** → เพิ่ม:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   → Save (redeploy อัตโนมัติ)
3. bucket ชื่อ `product-images` (แบบ public) จะถูก **สร้างให้อัตโนมัติ** ตอนอัปโหลดรูปแรก
   - (ถ้าอยากสร้างเอง: Supabase → Storage → New bucket → ชื่อ `product-images` → ติ๊ก Public)
4. เทสต์: ไปหน้า Products → เพิ่มสินค้า → อัปโหลดรูป → รูปต้องโชว์ และ URL ขึ้นต้นด้วย `https://...supabase.co/storage/...`

---

## 7. ตรวจหลัง deploy (checklist)
- [ ] เปิด `https://pos-web.vercel.app` → login ได้
- [ ] สร้างออเดอร์ + จ่ายเงินสด → สำเร็จ
- [ ] จ่าย PromptPay → QR ขึ้น (ไม่มีกล่องเหลือง = อยู่ live) → สแกนจ่ายจริง → บิลปิดอัตโนมัติ
- [ ] เปิด `https://analytics-web.vercel.app` → เห็นข้อมูลยอดขาย
- [ ] realtime: เปิด POS + KDS 2 จอ → สั่งออเดอร์ → ขึ้นที่ KDS ทันที (ทดสอบ Socket.io)

---

## ⚠️ ข้อควรรู้ / ข้อจำกัด
1. **Render free plan หลับเมื่อไม่มีทราฟฟิก** (cold start ~50 วิ) — สำหรับร้านที่เปิดทั้งวันและใช้ realtime แนะนำอัปเป็น **Starter ($7/เดือน/service)** ทั้ง 2 API
2. **รูปสินค้า** — รองรับ Supabase Storage แล้ว (ดูข้อ "Supabase Storage" ด้านล่าง) ถ้าตั้ง env ครบ รูปจะเก็บถาวรบน cloud ไม่หายตอน redeploy. ถ้าไม่ตั้ง จะ fallback เก็บลงดิสก์ Render (ephemeral — รูปหายตอน redeploy เหมาะกับทดสอบเท่านั้น)
3. **Schema ฐานข้อมูล** อยู่บน Supabase อยู่แล้ว — deploy นี้ไม่รัน migration อัตโนมัติ ถ้าแก้ schema ภายหลังให้รัน `prisma db push` จากเครื่อง local ชี้ไปที่ `DIRECT_URL`
4. **ความลับทั้งหมด** (Stripe/DB/JWT/Gemini) ใส่ในหน้า dashboard ของ Render/Vercel เท่านั้น — ไฟล์ `.env` ถูก gitignore ไว้แล้ว อย่า commit ค่าจริง
