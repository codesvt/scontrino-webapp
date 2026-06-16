"""
database.py – SQLite-Datenbankschicht für die Familien-Buchhaltung.
Datenbankpfad konfigurierbar via Umgebungsvariable DB_PATH (siehe .env).
"""

import hashlib
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "buchhaltung.db"),
)


@contextmanager
def _verbindung():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        logger.exception("Datenbankfehler – Transaktion zurückgerollt")
        raise
    finally:
        conn.close()


def _bild_hash(bild_bytes: bytes) -> str:
    return hashlib.sha256(bild_bytes).hexdigest()


def _spalten_existieren(tabelle: str, spalten: List[str]) -> Dict[str, bool]:
    with _verbindung() as conn:
        cursor = conn.execute(f"PRAGMA table_info({tabelle})")
        vorhandene = {row["name"] for row in cursor.fetchall()}
    return {s: s in vorhandene for s in spalten}


def init_db() -> None:
    with _verbindung() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS belege_roh (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dateiname   TEXT NOT NULL,
                timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
                status      TEXT DEFAULT 'offen',
                ki_json     TEXT NOT NULL,
                bild_blob   BLOB NOT NULL,
                bild_hash   TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS hauptbuch (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                datum           TEXT NOT NULL,
                gesamtbetrag    REAL NOT NULL,
                kategorie       TEXT NOT NULL,
                beleg_roh_id    INTEGER REFERENCES belege_roh(id) ON DELETE SET NULL,
                notiz           TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS hauptbuch_positionen (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                hauptbuch_id    INTEGER NOT NULL
                                REFERENCES hauptbuch(id) ON DELETE CASCADE,
                betrag          REAL NOT NULL,
                kategorie       TEXT NOT NULL
            )
        """)

    migrationen = [
        ("belege_roh", "bild_hash", "ALTER TABLE belege_roh ADD COLUMN bild_hash TEXT"),
        ("hauptbuch", "beleg_roh_id", "ALTER TABLE hauptbuch ADD COLUMN beleg_roh_id INTEGER REFERENCES belege_roh(id) ON DELETE SET NULL"),
        ("hauptbuch", "notiz", "ALTER TABLE hauptbuch ADD COLUMN notiz TEXT DEFAULT ''"),
    ]
    for tabelle, spalte, sql in migrationen:
        spalten_status = _spalten_existieren(tabelle, [spalte])
        if not spalten_status[spalte]:
            try:
                with _verbindung() as conn:
                    conn.execute(sql)
                logger.info("Migration: Spalte '%s' zu Tabelle '%s' hinzugefügt", spalte, tabelle)
            except Exception:
                logger.exception("Migration fehlgeschlagen: %s", sql)

    with _verbindung() as conn:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_belege_roh_hash ON belege_roh(bild_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_belege_roh_status ON belege_roh(status)")
    logger.info("Datenbank initialisiert: %s", DB_PATH)


def speichere_roh_beleg(
    dateiname: str, ki_daten_dict: Dict[str, Any], bild_bytes: bytes
) -> int:
    with _verbindung() as conn:
        cursor = conn.execute(
            "INSERT INTO belege_roh (dateiname, ki_json, bild_blob, bild_hash) VALUES (?, ?, ?, ?)",
            (dateiname, json.dumps(ki_daten_dict, ensure_ascii=False), bild_bytes, _bild_hash(bild_bytes)),
        )
        neue_id = cursor.lastrowid
        if neue_id is None:
            raise RuntimeError("Konnte keine ID für neuen Beleg erhalten")
        logger.info("Rohbeleg gespeichert: id=%d, datei=%s", neue_id, dateiname)
    return neue_id


def prüfe_existiert_in_posteingang(bild_bytes: bytes) -> Optional[int]:
    such_hash = _bild_hash(bild_bytes)
    with _verbindung() as conn:
        row = conn.execute(
            "SELECT id, dateiname, timestamp FROM belege_roh WHERE bild_hash = ? AND status = 'offen' ORDER BY timestamp DESC LIMIT 1",
            (such_hash,),
        ).fetchone()
    if row:
        logger.info("Dublette gefunden: hash=%s, existierende id=%d, datei=%s", such_hash[:12], row["id"], row["dateiname"])
        return row["id"]
    return None


def hole_offene_belege() -> List[Tuple[int, str, Dict[str, Any], bytes]]:
    with _verbindung() as conn:
        rows = conn.execute(
            "SELECT id, dateiname, ki_json, bild_blob "
            "FROM belege_roh WHERE status = 'offen' ORDER BY timestamp ASC"
        ).fetchall()
    return [(r["id"], r["dateiname"], json.loads(r["ki_json"]), r["bild_blob"]) for r in rows]


def loesche_roh_beleg(beleg_roh_id: int) -> None:
    with _verbindung() as conn:
        row = conn.execute("SELECT status FROM belege_roh WHERE id = ?", (beleg_roh_id,)).fetchone()
        if not row:
            return
        if row["status"] == "verbucht":
            raise ValueError(
                f"Beleg {beleg_roh_id} ist bereits verbucht. "
                "Bitte über das Hauptbuch löschen."
            )
        conn.execute("DELETE FROM belege_roh WHERE id = ?", (beleg_roh_id,))
        logger.info("Rohbeleg gelöscht: id=%d", beleg_roh_id)


def prüfe_duplikat(datum: str, gesamtbetrag: float) -> Optional[Dict[str, Any]]:
    with _verbindung() as conn:
        row = conn.execute(
            "SELECT id, datum, gesamtbetrag, kategorie "
            "FROM hauptbuch WHERE datum = ? AND ABS(gesamtbetrag - ?) < 0.005",
            (datum, gesamtbetrag),
        ).fetchone()
    if row:
        return {key: row[key] for key in ["id", "datum", "gesamtbetrag", "kategorie"]}
    return None


def verbuche_eintrag(
    beleg_roh_id: Optional[int],
    datum: str,
    betrag: float,
    kategorie: str,
    notiz: str = "",
    positionen: Optional[List[Dict[str, Any]]] = None,
) -> None:
    with _verbindung() as conn:
        cursor = conn.execute(
            "INSERT INTO hauptbuch (datum, gesamtbetrag, kategorie, beleg_roh_id, notiz) VALUES (?, ?, ?, ?, ?)",
            (datum, betrag, kategorie, beleg_roh_id, notiz),
        )
        hauptbuch_id = cursor.lastrowid

        if positionen:
            for pos in positionen:
                conn.execute(
                    "INSERT INTO hauptbuch_positionen (hauptbuch_id, betrag, kategorie) "
                    "VALUES (?, ?, ?)",
                    (hauptbuch_id, float(pos["betrag"]), pos["kategorie"]),
                )

        if beleg_roh_id is not None:
            conn.execute("UPDATE belege_roh SET status = 'verbucht', bild_blob = X'' WHERE id = ?", (beleg_roh_id,))

        logger.info("Eintrag verbucht: id=%d, datum=%s, betrag=%.2f, kategorie=%s", hauptbuch_id, datum, betrag, kategorie)


def hole_hauptbuch_daten() -> List[Tuple[int, str, float, str, Optional[int], str]]:
    with _verbindung() as conn:
        rows = conn.execute(
            "SELECT id, datum, gesamtbetrag, kategorie, beleg_roh_id, notiz "
            "FROM hauptbuch ORDER BY datum DESC, id DESC"
        ).fetchall()
    return [(r["id"], r["datum"], r["gesamtbetrag"], r["kategorie"], r["beleg_roh_id"], r["notiz"]) for r in rows]


def hole_beleg_bild(beleg_roh_id: int) -> Optional[bytes]:
    with _verbindung() as conn:
        row = conn.execute("SELECT bild_blob FROM belege_roh WHERE id = ?", (beleg_roh_id,)).fetchone()
    return row["bild_blob"] if row else None


def loesche_hauptbuch_eintrag(hauptbuch_id: int, loesche_beleg: bool = True) -> None:
    with _verbindung() as conn:
        row = conn.execute("SELECT beleg_roh_id FROM hauptbuch WHERE id = ?", (hauptbuch_id,)).fetchone()
        beleg_roh_id = row["beleg_roh_id"] if row else None

        conn.execute("DELETE FROM hauptbuch WHERE id = ?", (hauptbuch_id,))

        if loesche_beleg and beleg_roh_id is not None:
            conn.execute("DELETE FROM belege_roh WHERE id = ?", (beleg_roh_id,))

        logger.info("Hauptbucheintrag gelöscht: id=%d, beleg_mitgelöscht=%s", hauptbuch_id, loesche_beleg and beleg_roh_id is not None)


init_db()
