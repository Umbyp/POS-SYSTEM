# Database migrations

This project uses **Prisma Migrate** (`prisma/migrations/`). Until July 2026 it
used `prisma db push` with no migration history, which let the production DB
drift silently from the schema (missing columns/tables caused 500s that only
surfaced weeks later). Migrations fix that: every schema change is a reviewed,
versioned SQL file that deploys apply automatically and identically everywhere.

## Everyday workflow

Change `schema.prisma`, then:

```bash
cd apps/api
npx prisma migrate dev --name describe_your_change   # creates + applies locally
```

Commit the generated folder under `prisma/migrations/`. CI and every deploy run
`prisma migrate deploy`, which applies only the not-yet-applied migrations.

## One-time baseline of an existing database

`0_init` is a baseline that represents the whole schema as it already existed on
running databases. Existing DBs must be told it's **already applied** (so Migrate
records it without trying to re-create tables that are already there). The local
dev DB has already been baselined. **Production still needs it** — do this once,
in order:

1. **Sync prod to the current schema first.** Run the catch-up SQL (the block
   adding `Table.occupiedAt`, `OrderItem.createdAt`, the `Order` index, and the
   `SelfOrderRequest` / `BillCallRequest` tables) in the Supabase SQL Editor.
   After this, prod matches `0_init` exactly.

2. **Mark the baseline as applied on prod** (records history, runs no SQL):

   ```bash
   cd apps/api
   DATABASE_URL="<prod-DATABASE_URL>" DIRECT_URL="<prod-DIRECT_URL>" \
     npx prisma migrate resolve --applied 0_init
   # verify:
   DATABASE_URL="<prod-DATABASE_URL>" npx prisma migrate status
   ```

3. **Only then** wire deploys to run migrations. In `render.yaml`, change the API
   `buildCommand` to run `migrate deploy` after install:

   ```yaml
   buildCommand: rm -f package-lock.json && npm install && npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run build --workspace=apps/api
   ```

   > Do **not** make this change before step 2 — with no baseline recorded,
   > `migrate deploy` would try to create tables that already exist and fail the
   > deploy.

After this, new migrations reach production automatically on the next deploy.
