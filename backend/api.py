import csv as csv_module
import io
import logging
import os
import threading
import uuid
from typing import Any, Dict, List, Tuple

from PIL import Image
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from database import (
    hole_offene_belege, hole_beleg_bild, loesche_roh_beleg,
    loesche_hauptbuch_eintrag, prüfe_duplikat,
    prüfe_existiert_in_posteingang, speichere_roh_beleg,
    verbuche_eintrag, hole_hauptbuch_daten,
    hole_roh_beleg_benutzer,
)
from receipt_auditor import BelegAuditor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KATEGORIEN = [
    "Arbeitsnebenkosten", "Ausgehen/Freizeit", "Auto Nebenkosten",
    "Bekleidung/Schuhe/Accessoirs", "Energie/Strom", "Fotographie/Computer/Medien",
    "Garten/Aussenbereich", "Gas/Holz/Heizen", "Geschenke",
    "Haushaltswaren/Gebrauch", "Haushaltswaren/Verbrauch", "Hygiene",
    "Lebensmittel", "Medikamente/Sanitär/Gesundheit", "Sonstiges",
    "Sonstiges für Kinder", "Tanken", "Telefon", "Transport/Parken",
    "Versicherungen/Mitgliedsbeiträge",
]

KAT_MAP: Dict[str, str] = {
    "Ausgehen/Freizeit": "Ausgehen/Freizeit",
    "Bekleidung/Schuhe/Accessoirs": "Bekleidung/Schuhe/Accessoirs",
    "Garten/Aussenbereich": "Garten/Aussenbereich",
    "Gas/Holz/Heizen": "Gas/Holz/Heizen",
    "Haushaltswaren/Verbrauch": "Haushaltswaren/Verbrauch",
    "Hygiene": "Hygiene",
    "Lebensmittel": "Lebensmittel",
    "Medikamente/Sanitär/Gesundheit": "Medikamente/Sanitär/Gesundheit",
    "Tanken": "Tanken",
    "Transport/Parken": "Transport/Parken",
    "Sonstiges": "Sonstiges",
}

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

auditor = BelegAuditor()


def _ki_dict_aus_ergebnis(ergebnis) -> dict:
    return {
        "datum": ergebnis.datum,
        "gesamtbetrag": ergebnis.gesamtbetrag,
        "hauptkategorie": ergebnis.hauptkategorie,
        "alarm": ergebnis.alarm,
        "ausreisser": [
            {"artikel_raw": a.artikel_raw, "vorgeschlagene_kategorie": a.vorgeschlagene_kategorie}
            for a in ergebnis.ausreisser
        ],
        "notiz_vorschlag": ergebnis.notiz_vorschlag,
    }


def _process_uploads(job_id: str, files: List[Tuple[str, bytes]], benutzer: str = "Walter"):
    for filename, contents in files:
        with _jobs_lock:
            if _jobs[job_id]["cancelled"]:
                _jobs[job_id]["running"] = False
                return

        try:
            if not contents:
                raise ValueError("Leere Datei")

            pil_image = Image.open(io.BytesIO(contents))

            existing_id = prüfe_existiert_in_posteingang(contents)
            if existing_id is not None:
                with _jobs_lock:
                    _jobs[job_id]["results"][filename] = {
                        "status": "duplicate",
                        "msg": f"Bereits vorhanden (ID {existing_id})",
                        "id": existing_id,
                    }
                    _jobs[job_id]["dubletten"] += 1
                    _jobs[job_id]["done"] += 1
                continue

            ergebnis = auditor.pruefe_beleg_direkt(pil_image)
            if ergebnis is None:
                raise ValueError("KI-Analyse ergab kein Ergebnis")

            ki_dict = _ki_dict_aus_ergebnis(ergebnis)
            neue_id = speichere_roh_beleg(filename, ki_dict, contents, benutzer)

            with _jobs_lock:
                _jobs[job_id]["results"][filename] = {
                    "status": "success",
                    "msg": f"Analysiert: {ergebnis.gesamtbetrag:.2f}€ - {ergebnis.hauptkategorie}",
                    "id": neue_id,
                }
                _jobs[job_id]["erfolgreich"] += 1
                _jobs[job_id]["savedIds"].append(neue_id)
                _jobs[job_id]["done"] += 1

        except RuntimeError as e:
            msg = str(e)
            if "API_LIMIT_REACHED" in msg:
                with _jobs_lock:
                    _jobs[job_id]["apiBlocked"] = True
                    _jobs[job_id]["running"] = False
                return
            with _jobs_lock:
                _jobs[job_id]["results"][filename] = {
                    "status": "error", "msg": msg, "id": None,
                }
                _jobs[job_id]["fehler"] += 1
                _jobs[job_id]["done"] += 1

        except Exception as e:
            with _jobs_lock:
                _jobs[job_id]["results"][filename] = {
                    "status": "error", "msg": str(e), "id": None,
                }
                _jobs[job_id]["fehler"] += 1
                _jobs[job_id]["done"] += 1

    with _jobs_lock:
        _jobs[job_id]["running"] = False


@app.get("/api/config")
async def get_config():
    return {"kategorien": KATEGORIEN, "kategorieMapping": KAT_MAP}


@app.post("/api/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    benutzer: str = Form("Walter"),
):
    job_id = str(uuid.uuid4())
    total = len(files)

    with _jobs_lock:
        _jobs[job_id] = {
            "total": total,
            "done": 0,
            "running": True,
            "apiBlocked": False,
            "cancelled": False,
            "erfolgreich": 0,
            "dubletten": 0,
            "fehler": 0,
            "results": {},
            "savedIds": [],
            "benutzer": benutzer,
        }

    file_data: List[Tuple[str, bytes]] = []
    for f in files:
        contents = await f.read()
        file_data.append((f.filename or "unbekannt", contents))

    thread = threading.Thread(target=_process_uploads, args=(job_id, file_data, benutzer), daemon=True)
    thread.start()

    return {"jobId": job_id, "total": total}


@app.get("/api/upload/{job_id}")
async def get_upload_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job nicht gefunden")
    return job


@app.post("/api/upload/{job_id}/cancel")
async def cancel_upload(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job:
            job["cancelled"] = True
            job["running"] = False
    return {"status": "cancelled"}


@app.get("/api/receipts")
async def get_receipts():
    belege = hole_offene_belege()
    return [
        {
            "id": id_,
            "dateiname": dateiname,
            "kiDaten": ki_dict,
            "hatBild": bild_blob is not None,
            "benutzer": benutzer,
        }
        for id_, dateiname, ki_dict, bild_blob, benutzer in belege
    ]


@app.get("/api/receipts/{receipt_id}/image")
async def get_receipt_image(receipt_id: int):
    bild = hole_beleg_bild(receipt_id)
    if bild is None:
        raise HTTPException(404, "Bild nicht gefunden")
    return Response(content=bild, media_type="image/jpeg")


@app.post("/api/receipts/{receipt_id}/book")
async def book_receipt(receipt_id: int, data: dict):
    datum = data.get("datum")
    betrag = data.get("betrag")
    kategorie = data.get("kategorie")
    notiz = data.get("notiz", "")
    positionen = data.get("positionen")
    if not datum or betrag is None or not kategorie:
        raise HTTPException(400, "datum, betrag und kategorie sind erforderlich")
    benutzer = hole_roh_beleg_benutzer(receipt_id)
    verbuche_eintrag(receipt_id, datum, float(betrag), kategorie, notiz, benutzer, positionen=positionen)
    return {"status": "ok"}


@app.delete("/api/receipts/{receipt_id}")
async def delete_receipt(receipt_id: int):
    try:
        loesche_roh_beleg(receipt_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"status": "deleted"}


@app.get("/api/receipts/{receipt_id}/duplicate-check")
async def duplicate_check(receipt_id: int, datum: str, betrag: float):
    treffer = prüfe_duplikat(datum, betrag)
    if treffer:
        return {"duplicate": True, "treffer": treffer}
    return {"duplicate": False, "treffer": None}


@app.get("/api/ledger")
async def get_ledger():
    daten = hole_hauptbuch_daten()
    return [
        {
            "id": id_,
            "datum": datum,
            "gesamtbetrag": gesamtbetrag,
            "kategorie": kategorie,
            "belegRohId": beleg_roh_id,
            "notiz": notiz,
            "benutzer": benutzer,
            "erstellt": erstellt,
        }
        for id_, datum, gesamtbetrag, kategorie, beleg_roh_id, notiz, benutzer, erstellt in daten
    ]


@app.post("/api/ledger/manual")
async def add_manual_entry(data: dict):
    datum = data.get("datum")
    betrag = data.get("betrag")
    kategorie = data.get("kategorie")
    notiz = data.get("notiz", "")
    benutzer = data.get("benutzer", "Walter")
    if not datum or betrag is None or not kategorie:
        raise HTTPException(400, "datum, betrag und kategorie sind erforderlich")
    verbuche_eintrag(None, datum, float(betrag), kategorie, notiz, benutzer)
    return {"status": "ok"}


@app.delete("/api/ledger/{entry_id}")
async def delete_ledger_entry(entry_id: int, mit_beleg: bool = True):
    loesche_hauptbuch_eintrag(entry_id, loesche_beleg=mit_beleg)
    return {"status": "deleted"}


@app.get("/api/export/csv")
async def export_csv():
    daten = hole_hauptbuch_daten()
    output = io.StringIO()
    writer = csv_module.writer(output)
    writer.writerow(["ID", "Datum", "Gesamtbetrag", "Kategorie", "Beleg Roh ID", "Notiz", "Benutzer", "Erstellt"])
    for row in daten:
        writer.writerow(row)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hauptbuch_export.csv"},
    )


frontend_dir = os.environ.get("FRONTEND_DIR")
if frontend_dir:
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    logger.info("Frontend-Statics mounted from %s", frontend_dir)
