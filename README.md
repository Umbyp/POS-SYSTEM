# POS System — Cloud-Based AI-Native POS

ระบบ Point of Sale แบบ cloud-based สำหรับร้านกาแฟ, ร้านอาหาร, ร้านค้าปลีก พร้อม realtime sync และ offline support

## 🚀 Quick Start

### 1. ติดตั้ง dependencies
```bash
# จาก root
npm install
```

หรือติดตั้งทีละ workspace:
```bash
cd apps/api && npm install
cd ../web && npm install
```

### 2. ตั้งค่า Database (Supabase)

ไปที่ https://supabase.com → New Project → คัดลอก connection strings

สร้างไฟล์ `apps/api/.env`:
```env
DATABASE_URL="postgresql://postgres.[ref]:[pwd]@aws-0-xxx.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[pwd]@aws-0-xxx.pooler.supabase.com:5432/postgres"
JWT_SECRET="$(openssl rand -hex 32)"
JWT_EXPIRES_IN="7d"
GOOGLE_CLIENT_ID=""
PORT=4000
NODE_ENV=development
WEB_URL=http://localhost:3000
```

> ถ้าจะใช้ Postgres local แทน:
> ```bash
> docker run -d --name pos-db -e POSTGRES_PASSWORD=pos -p 5432:5432 postgres:16
> # แล้วใช้: DATABASE_URL="postgresql://postgres:pos@localhost:5432/postgres"
> ```

### 3. รัน migration + seed
```bash
cd apps/api
npx prisma migrate dev --name init
npm run db:seed
```

หลังรัน seed จะได้ users:
```
Owner:   owner@pos.local   / admin1234
Admin:   admin@pos.local   / admin1234
Cashier: cashier@pos.local / admin1234
Kitchen: kitchen@pos.local / admin1234
```

### 4. ตั้งค่า Frontend
สร้าง `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

### 5. รันโปรเจกต์
```bash
# Terminal 1: Backend
cd apps/api
npm run dev
# → http://localhost:4000

# Terminal 2: Frontend
cd apps/web
npm run dev
# → http://localhost:3000
```

หรือรันพร้อมกันจาก root:
```bash
npm install -D concurrently
npm run dev
```

เปิด http://localhost:3000 → จะ redirect ไป `/pos` → ต้อง login ก่อน

---

## 📁 โครงสร้างโปรเจกต์

```
pos-system/
├── apps/
│   ├── api/                        # Backend (Express + Socket.io)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Database schema (14 models)
│   │   │   └── seed.ts             # Mock data
│   │   └── src/
│   │       ├── server.ts           # Entry point
│   │       ├── app.ts              # Express app
│   │       ├── socket.ts           # Socket.io
│   │       ├── config/             # env, prisma client
│   │       ├── middleware/         # auth, rbac, error, validate
│   │       ├── modules/            # Feature modules
│   │       │   ├── auth/           # Login, register, Google
│   │       │   ├── products/       # CRUD + categories
│   │       │   ├── orders/         # ⭐ Core: คำนวณ + ตัดสต็อก + realtime
│   │       │   ├── inventory/      # Stock, movements
│   │       │   ├── employees/      # Users + shifts
│   │       │   ├── reports/        # Analytics
│   │       │   └── tables/         # Restaurant tables
│   │       └── utils/              # JWT, logger, errors
│   │
│   └── web/                        # Frontend (Next.js 15)
│       └── src/
│           ├── app/
│           │   ├── (auth)/         # Login, Register pages
│           │   ├── (dashboard)/    # POS, Orders, etc + layout
│           │   ├── layout.tsx
│           │   ├── providers.tsx
│           │   └── globals.css
│           ├── components/
│           │   ├── ui/             # Button, Input, Card, Dialog, Badge
│           │   ├── layout/         # Sidebar, Topbar
│           │   └── pos/            # ProductGrid, Cart, PaymentDialog
│           ├── stores/             # Zustand (cart, auth)
│           ├── lib/                # api, socket, db (Dexie), utils
│           ├── hooks/              # useSocket, useOfflineQueue, useAuth
│           └── middleware.ts
└── package.json                    # Workspaces
```

---

## ⭐ Core Features

### POS Checkout
- ✅ Product grid + categories
- ✅ Search + barcode (กด F2 เพื่อ focus, หรือใช้ scanner ที่ส่ง keystroke)
- ✅ Cart (Zustand persist)
- ✅ ส่วนลด + ภาษี + service charge
- ✅ Payment: เงินสด, PromptPay, บัตรเครดิต, โอน

### Realtime
- ✅ Socket.io: order:created, kds:new, stock:updated, table:updated
- ✅ KDS อัปเดตอัตโนมัติ
- ✅ Multi-device sync

### Offline
- ✅ Queue ออเดอร์ใน IndexedDB (Dexie)
- ✅ Auto-sync เมื่อกลับมา online
- ✅ Topbar แสดงสถานะ + จำนวนรอ sync

### Auth + RBAC
- ✅ JWT, Google OAuth (optional)
- ✅ 4 roles: OWNER, ADMIN, CASHIER, KITCHEN
- ✅ Sidebar กรองเมนูตาม role

### Restaurant
- ✅ Table management (AVAILABLE/OCCUPIED/RESERVED)
- ✅ KDS แสดงเฉพาะ PENDING + เตือนสีแดงเกิน 15 นาที
- ✅ Dine-in / Takeaway / Delivery

---

## 🌐 API Endpoints

### Auth (`/api/auth`)
- `POST /login` — email+password
- `POST /register` — สร้างร้าน+เจ้าของใหม่
- `POST /google` — Google ID token
- `GET /me` — โปรไฟล์ปัจจุบัน

### Products (`/api/products`)
- `GET /` — list + filter (`q`, `categoryId`)
- `GET /:id`
- `GET /barcode/:code`
- `POST /` (ADMIN+)
- `PUT /:id` (ADMIN+)
- `DELETE /:id` (ADMIN+)
- `GET /categories`
- `POST /categories` (ADMIN+)

### Orders (`/api/orders`)
- `POST /` — สร้างออเดอร์ + ตัดสต็อก + emit realtime
- `GET /` — list with filter
- `GET /:id`
- `PATCH /:id/status` — KDS อัปเดตสถานะ
- `POST /:id/refund` (ADMIN+)

### Inventory, Employees, Reports, Tables
ดูในโค้ดของแต่ละ module

---

## 🚢 Deployment

### Backend → Render
1. New Web Service → connect repo
2. Root Directory: `apps/api`
3. Build: `npm install && npx prisma generate && npm run build`
4. Start: `node dist/server.js`
5. ใส่ env vars (DATABASE_URL, JWT_SECRET, WEB_URL=https://your.vercel.app)
6. รัน migration: Shell → `npx prisma migrate deploy`

### Frontend → Vercel
1. New Project → import
2. Root Directory: `apps/web`
3. ใส่ env vars (NEXT_PUBLIC_*)
4. Deploy

### Database → Supabase
- ไม่ต้อง deploy แยก (Supabase host ให้แล้ว)
- เปิด Backup เป็น daily
- ใช้ Connection Pooling URL ใน production

---

## 🛠 Stack ที่ใช้

**Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Zustand · TanStack Query · Framer Motion · socket.io-client · Dexie · @react-oauth/google

**Backend:** Node.js · Express 4 · Socket.io 4 · Prisma 5 · Zod · bcrypt · JWT · helmet · rate-limit · pino

**Database:** PostgreSQL (Supabase)

---

## 📝 TODO ต่อยอด

- [ ] Receipt PDF (`pdfkit`) + ESC/POS thermal printing
- [ ] QR PromptPay generator (EMVCo)
- [ ] Slip OCR สำหรับ verify การโอน
- [ ] e-Tax invoice (กรมสรรพากร)
- [ ] AI features: forecast ยอดขาย, suggest low-stock reorder
- [ ] Multi-store / chain support
- [ ] Mobile app (React Native + same backend)
- [ ] LINE integration สำหรับ notify ออเดอร์
- [ ] Loyalty / membership

---

## 🐛 Troubleshooting

**`Prisma can't connect to database`**
→ ตรวจ DATABASE_URL, ใช้ pooler URL ตอน runtime (port 6543), direct URL ตอน migrate (port 5432)

**`Socket.io ไม่เชื่อมต่อ`**
→ ตรวจ CORS (`WEB_URL` ใน backend) ตรงกับ origin จริง

**`JWT invalid`**
→ ตรวจ JWT_SECRET ต้องเหมือนกันทั้ง dev/prod (อย่าเปลี่ยนกลางคัน)

**`Build error: Module not found`**
→ ลบ `node_modules` + `.next` + `dist` แล้ว `npm install` ใหม่
