import logging
import os
import sqlite3
import threading
from datetime import datetime, timedelta

from database import DB_PATH

logger = logging.getLogger(__name__)

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")
RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))
BACKUP_INTERVAL_HOURS = int(os.environ.get("BACKUP_INTERVAL_HOURS", "24"))


def backup_database() -> str | None:
    os.makedirs(BACKUP_DIR, exist_ok=True)

    datestamp = datetime.now().strftime("%Y-%m-%d")
    backup_name = f"buchhaltung_{datestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_name)

    if os.path.exists(backup_path):
        logger.info("Backup für heute existiert bereits: %s", backup_path)
        return backup_path

    try:
        src_conn = sqlite3.connect(DB_PATH)
        src_conn.row_factory = sqlite3.Row
        dest_conn = sqlite3.connect(backup_path)

        with dest_conn:
            dest_conn.execute(
                "CREATE TABLE hauptbuch (id INTEGER PRIMARY KEY, datum TEXT NOT NULL, "
                "gesamtbetrag REAL NOT NULL, kategorie TEXT NOT NULL, "
                "beleg_roh_id INTEGER, notiz TEXT DEFAULT '', "
                "benutzer TEXT DEFAULT 'Walter', erstellt DATETIME DEFAULT '')"
            )
            rows = src_conn.execute(
                "SELECT datum, gesamtbetrag, kategorie, beleg_roh_id, notiz, benutzer, "
                "COALESCE(erstellt, '') as erstellt "
                "FROM hauptbuch ORDER BY id"
            ).fetchall()
            dest_conn.executemany(
                "INSERT INTO hauptbuch (datum, gesamtbetrag, kategorie, beleg_roh_id, notiz, benutzer, erstellt) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(r["datum"], r["gesamtbetrag"], r["kategorie"], r["beleg_roh_id"], r["notiz"], r["benutzer"], r["erstellt"]) for r in rows],
            )

        src_conn.close()
        dest_conn.close()

        logger.info("Backup erstellt: %s (%d Zeilen)", backup_path, len(rows))
    except Exception:
        logger.exception("Backup fehlgeschlagen")
        try:
            os.unlink(backup_path)
        except OSError:
            pass
        return None

    _raeume_alle_backups_auf()
    return backup_path


def _raeume_alle_backups_auf():
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    try:
        for entry in os.listdir(BACKUP_DIR):
            if not entry.startswith("buchhaltung_") or not entry.endswith(".db"):
                continue
            path = os.path.join(BACKUP_DIR, entry)
            mtime = datetime.fromtimestamp(os.path.getmtime(path))
            if mtime < cutoff:
                os.unlink(path)
                logger.info("Altes Backup gelöscht: %s", entry)
    except OSError:
        logger.exception("Fehler beim Aufräumen alter Backups")


class BackupScheduler:
    def __init__(self):
        self._timer: threading.Timer | None = None
        self._running = False

    def start(self, delay_seconds: int = 3600):
        if self._running:
            return
        self._running = True
        logger.info(
            "Backup-Scheduler gestartet (alle %d h, erstes Backup in %d s)",
            BACKUP_INTERVAL_HOURS, delay_seconds,
        )
        self._schedule(delay_seconds)

    def stop(self):
        self._running = False
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _schedule(self, delay: float):
        if not self._running:
            return
        self._timer = threading.Timer(delay, self._run_and_reschedule)
        self._timer.daemon = True
        self._timer.start()

    def _run_and_reschedule(self):
        backup_database()
        self._schedule(BACKUP_INTERVAL_HOURS * 3600)
