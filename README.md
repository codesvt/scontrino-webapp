# Scontrino WebApp

KI-gestützte Familien-Buchhaltung. Belegfotos hochladen → KI analysiert (OpenAI GPT-4o-mini) → manuell verbuchen.

## Entwickeln

```sh
# Backend (Port 8000)
cd backend
cp .env.example .env          # OPENAI_API_KEY eintragen
uv run uvicorn api:app --reload

# Frontend (Port 3000, proxy /api → localhost:8000)
cd frontend
npm run dev
```

Dann `http://localhost:3000` öffnen.

## Bauen & Produktion

### Einmaliger Build

```sh
docker compose build
```

### Starten

```sh
export OPENAI_API_KEY=sk-...
docker compose up -d
```

App läuft auf `http://localhost:8000`, API-Doku unter `http://localhost:8000/docs`.

Die SQLite-Datenbank (`buchhaltung.db`) liegt in einem Docker-Volume (`buchhaltung_data`) und bleibt bei Updates erhalten.

### Update

```sh
git pull
docker compose build
docker compose up -d
```

## Deployment auf dem Heimserver (Portainer)

1. Auf GitHub → Repository `scontrino-webapp` erstellen und Code pushen.
2. Auf dem Server einen Ordner für die Docker-Konfiguration anlegen (z.B. `/opt/scontrino-webapp`).
3. `docker-compose.yml` dorthin kopieren.
4. `.env`-Datei mit `OPENAI_API_KEY=sk-...` anlegen.
5. In Portainer → **Stacks** → **Add stack** → Git-Repository verbinden, `main`-Branch, Pfad zur `docker-compose.yml`.
6. Portainer deployed automatisch und kann bei neuen Commits manuell oder per Webhook aktualisieren.

## Branches

- `main` – Produktion (stable)
- `develop` – Entwicklung/Testen

## Technologie

| Komponente | Technologie |
|------------|-------------|
| Backend    | Python 3.12, FastAPI, SQLite |
| Frontend   | React 19, Vite 6, TypeScript 5.8 |
| KI         | OpenAI GPT-4o-mini |
| Container  | Docker (Multi-Stage) |
