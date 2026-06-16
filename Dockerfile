# ============================================================
# Stage 1: Frontend bauen (Node)
# ============================================================
FROM node:22-alpine AS frontend
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Backend + Serving (Python)
# ============================================================
FROM python:3.12-slim

WORKDIR /app

# Backend-Abhängigkeiten
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend-Code
COPY backend/ .

# Gebautes Frontend aus Stage 1
COPY --from=frontend /build/frontend/dist /app/frontend/dist

ENV FRONTEND_DIR=/app/frontend/dist

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
