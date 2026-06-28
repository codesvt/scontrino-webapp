# AGENTS.md

## Monorepo layout

- `backend/` — Python FastAPI (3.11+, uv + requirements.txt, SQLite)
- `frontend/` — React 19 + Vite 6 + TypeScript 5.8

## Start the app

```sh
# Backend (port 8000)
cd backend && uv run uvicorn api:app --reload

# Frontend (port 3000, proxies /api -> localhost:8000)
cd frontend && npm run dev
```

## Frontend build

```sh
npm run build   # tsc -b && vite build
```

## Noteworthy findings

- **API routes** (12 endpoints) — all implemented in `backend/api.py`. Routes: `/api/config`, `/api/upload`, `/api/receipts`, `/api/ledger`, `/api/export/csv`, plus sub-routes. FastAPI docs at `/docs`.
- **Database auto-initializes** — `database.py` calls `init_db()` at import time, creating `buchhaltung.db` with tables `belege_roh`, `hauptbuch`.
- **AI analysis** uses OpenAI `gpt-4o-mini` (set `OPENAI_API_KEY` in `.env`). Copy from `.env.example`.
- **UI and docs are in German** — all user-facing strings, categories, and comments.
- **`frontend/src/utils.ts` was removed** — it contained broken dead code that broke `tsc -b`. CSV export is handled in `Ledger.tsx` directly.
- **No tests, no linter/formatter config, no CI config** found.
- **Package managers**: `uv` (backend, has `uv.lock`), npm (frontend, has `package-lock.json`).
- **Kategorien** (20): defined in `frontend/src/components/Inbox.tsx:6` and `Ledger.tsx:11`. Backend receipt analysis uses a smaller subset (11 categories in `receipt_auditor.py`).
