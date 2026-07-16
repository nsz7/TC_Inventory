# TC Inventory

A tissue-culture sample inventory tracker. This repo is a pnpm monorepo containing:

- `artifacts/api-server` — Express + Drizzle ORM API server (runtime app).
- `lib/db` — Drizzle schema and Postgres client, shared by the server.
- `lib/api-zod` — Zod request/response validators (generated from `lib/api-spec/openapi.yaml`), shared by the server.
- `lib/api-client-react` / `lib/api-spec` — frontend API client & OpenAPI codegen config. Not needed to run the server.
- `scripts` — one-off scripts (`seed`, `hello`).

> **Note:** This repo currently contains only the backend. The `tc-inventory` React
> frontend and `mockup-sandbox` design tool referenced in the original Replit
> project were not copied into this repo, so there is no UI to build or serve
> yet — the API server runs standalone. If you add the frontend later under
> `artifacts/tc-inventory`, wire its build output into
> `artifacts/api-server` as static files so the whole app serves from one port
> (skip `mockup-sandbox` — it's a design tool, not part of the shipped app).

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later (LTS; tested with Node 22)
- [pnpm](https://pnpm.io/) 10.x — `npm install -g pnpm`
- A local [PostgreSQL](https://www.postgresql.org/) server (tested with Postgres 16)

## 1. Install dependencies

```bash
pnpm install
```

The first install will ask to approve `esbuild`'s native postinstall script:

```bash
pnpm approve-builds --all
```

## 2. Configure environment

Copy the example env file and edit `DATABASE_URL` for your local Postgres instance:

```bash
cp .env.example .env
```

`.env` (repo root):

```
DATABASE_URL=postgresql://tc_inventory:tc_inventory@localhost:5432/tc_inventory
PORT=3000
```

`PORT` is optional and defaults to `3000` if omitted.

If you don't already have a database and role, create one:

```bash
sudo -u postgres psql -c "CREATE ROLE tc_inventory WITH LOGIN PASSWORD 'tc_inventory';"
sudo -u postgres psql -c "CREATE DATABASE tc_inventory OWNER tc_inventory;"
```

## 3. Create the database tables

This pushes the Drizzle schema in `lib/db/src/schema` straight to `DATABASE_URL` (no migration files):

```bash
pnpm --filter @workspace/db run push
```

## 4. (Optional) Seed example data

Adds a few example samples and a transfer so the API has data to return:

```bash
pnpm --filter @workspace/scripts run seed
```

## 5. Build

```bash
pnpm run build
```

## 6. Start

```bash
pnpm --filter @workspace/api-server run start
```

The server listens on `http://localhost:3000` (or your configured `PORT`). Verify it's up:

```bash
curl http://localhost:3000/api/healthz
curl http://localhost:3000/api/samples
```

## Notes

- `pnpm --filter @workspace/db run push-force` force-pushes schema changes if `push` reports data-loss warnings it can't resolve interactively — only use this if you're fine dropping/altering existing data.
- `replit.txt`, `replitignore.txt`, `gitignore.txt`, `npmrc.txt` are leftover exports from the original Replit project (their dotfiles never made it into this repo). They aren't read by anything — real `.gitignore` / `.npmrc` files live at the repo root. Safe to ignore or delete.
