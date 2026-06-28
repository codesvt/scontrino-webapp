"""
receipt_auditor.py – KI-Beleganalyse via OpenAI GPT-4o-mini.
"""

import base64
import io
import logging
import os
from typing import List, Optional

from dotenv import load_dotenv
from openai import OpenAI, APIStatusError, RateLimitError
from PIL import Image
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

load_dotenv()

logger = logging.getLogger(__name__)


def _ist_wiederholbarer_fehler(e: Exception) -> bool:
    if isinstance(e, APIStatusError):
        if e.status_code == 503:
            return True
    fehler = str(e)
    if "503" in fehler or "SERVICE_UNAVAILABLE" in fehler:
        return True
    if any(w in fehler.upper() for w in ["TIMEOUT", "DEADLINE", "CONNECTION"]):
        return True
    return False


def _vor_wiederholung(retry_state) -> None:
    logger.warning(
        "Fireworks-API temporär nicht verfügbar (Versuch %d/3). "
        "Nächster Versuch in %s Sekunden...",
        retry_state.attempt_number,
        retry_state.next_action.sleep,
    )


def _bild_zu_base64(pil_bild: Image.Image) -> str:
    buffer = io.BytesIO()
    if pil_bild.mode in ("RGBA", "P"):
        pil_bild = pil_bild.convert("RGB")
    pil_bild.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


class AusreisserArtikel(BaseModel):
    artikel_raw: str = Field(
        description="Der exakte, rohe Text des Artikels aus dem Beleg."
    )
    vorgeschlagene_kategorie: str = Field(
        description=(
            "Kategorie-Vorschlag. Erlaubte Werte: "
            "Ausgehen/Freizeit, Bekleidung/Schuhe/Accessoirs, Garten/Aussenbereich, "
            "Gas/Holz/Heizen, Haushaltswaren/Verbrauch, Hygiene, Lebensmittel, "
            "Medikamente/Sanitär/Gesundheit, Tanken, Transport/Parken, Sonstiges"
        )
    )


class BelegAnalyseErgebnis(BaseModel):
    datum: Optional[str] = Field(
        default=None,
        description="Das Einkaufsdatum im Format JJJJ-MM-TT (z.B. 2026-01-31).",
    )
    gesamtbetrag: Optional[float] = Field(
        default=None,
        description="Der finale, gezahlte Gesamtbetrag (Brutto) des Belegs.",
    )
    hauptkategorie: str = Field(
        default="Lebensmittel",
        description="Primäre Hauptkategorie basierend auf dem Geschäftstyp.",
    )
    alarm: bool = Field(
        description="True, wenn einzelne Artikel signifikant vom Kontext abweichen."
    )
    ausreisser: List[AusreisserArtikel] = Field(
        default=[],
        description="Artikel, die nicht zur Hauptkategorie passen.",
    )
    notiz_vorschlag: Optional[str] = Field(
        default=None,
        description="Kompakter Notiz-Vorschlag (max. 7 Wörter) auf Deutsch als "
        "Erinnerungsstütze. Geschäftsname (kurz), Ort und gekaufte Produkte/Kategorie "
        "nennen. Bei Restaurantbesuchen reicht Händler + Ort + Anlass (z.B. "
        "'Mittagessen') – kein detailliertes Menü. Ortsnamen immer auf Deutsch.",
    )


class BelegAuditor:
    """Analysiert Kassenbon-Bilder mit der OpenAI API (GPT-4o-mini)."""

    KI_HAUPTKATEGORIEN = [
        "Ausgehen/Freizeit",
        "Bekleidung/Schuhe/Accessoirs",
        "Garten/Aussenbereich",
        "Gas/Holz/Heizen",
        "Hygiene",
        "Lebensmittel",
        "Medikamente/Sanitär/Gesundheit",
        "Tanken",
        "Transport/Parken",
        "Sonstiges",
    ]

    AUSREISSER_KATEGORIEN = KI_HAUPTKATEGORIEN + ["Haushaltswaren/Verbrauch"]

    def __init__(self, modell_name: str = "gpt-4o-mini"):
        self.modell_name = modell_name
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "Umgebungsvariable 'OPENAI_API_KEY' nicht gefunden.\n"
                "Erstelle eine .env-Datei im Projektordner:\n"
                "  OPENAI_API_KEY=dein_key_hier\n\n"
                "Key erhältlich unter: https://platform.openai.com/api-keys"
            )
        self.client = OpenAI(api_key=api_key)

    def _erstelle_prompt(self) -> str:
        kategorien_str = ", ".join(self.KI_HAUPTKATEGORIEN)
        ausreisser_str = ", ".join(self.AUSREISSER_KATEGORIEN)
        return f"""
Du bist ein präziser Buchhaltungsexperte. Analysiere das Kassenbon-Bild nach diesen strengen Regeln:

## 1. HAUPTKATEGORIE BESTIMMEN
Bestimme die Hauptkategorie anhand des Geschäftstyps:
- Supermarkt, Lebensmittelladen, Metzgerei, Bäckerei → "Lebensmittel"
- Restaurant, Café, Bar, Pizzeria, Berghütte, Imbiss, Mensa → "Ausgehen/Freizeit"
- Apotheke → "Medikamente/Sanitär/Gesundheit"
- Tankstelle (Hauptzweck: Treibstoff) → "Tanken"
- Brennstoff-/Holzhändler → "Gas/Holz/Heizen"
- Kleidungsgeschäft, Schuhgeschäft → "Bekleidung/Schuhe/Accessoirs"
- Gartencenter → "Garten/Aussenbereich"
- Parkhaus, Busticket, Bahn, Taxi → "Transport/Parken"
- **Bei JEDER Unsicherheit über den Geschäftstyp → zwingend "Sonstiges"**

Erlaubte Hauptkategorien: {kategorien_str}

## 2. DATUM & BETRAG EXTRAHIEREN
- Gesamtbetrag: Der finale gezahlte Brutto-Betrag (Saldo/Total/Summe).
- Datum: Format JJJJ-MM-TT. Zweistellige Jahresangaben (z.B. "26") = 2026.
- Falls kein Datum lesbar → null zurückgeben.
- Falls kein Gesamtbetrag lesbar → null zurückgeben.
- notiz_vorschlag: Maximal 7 Wörter auf Deutsch als kompakte
  Erinnerungsstütze. Bei Lebensmittelgeschäften genügen Händler und Ort.
  Bei Fachgeschäften (Apotheke, Baumarkt, Elektronik, etc.) gehören
  Geschäftsname, Ort und gekaufte Produkte/Abteilung dazu. Bei
  Restaurantbesuchen reicht Händler + Ort + Anlass (z.B. 'Mittagessen')
  – kein detailliertes Menü. WICHTIG: Ortsnamen immer auf Deutsch
  (Brixen, Bozen, Meran – NIEMALS Bolzano, Merano etc.). Falls nicht
  eindeutig → null zurückgeben.

## 3. AUSREISSER ERKENNEN (nur bei echten Mischeinkäufen)
Setze "alarm" = true und liste Ausreißer NUR wenn ALLE Bedingungen zutreffen:
1. Artikel gehört klar zu einer ANDEREN Kategorie als die Hauptkategorie
2. Artikel ist eindeutig lesbar (nicht abgekürzt oder unleserlich)
3. Kategorie-Zuordnung ist ZWEIFELSFREI (kein Raten!)

Ausreißer-Kategorien (nur bei absoluter Sicherheit):
- "Hygiene": Körperpflege, Zahnpflege, Haarpflege, Damenpflege, Babyartikel
- "Haushaltswaren/Verbrauch": Reinigungsmittel, Mülltüten, Küchenrollen, Alufolie,
  Frischhaltefolie, Geschirrspülmittel, WC-Reiniger, Waschmittel, Putztücher,
  Schwämme, Backpapier, Haushaltshandschuhe, Spülbürsten
- Andere Kategorien: nur wenn der Artikel 100% eindeutig ist

**STRIKTE FALLBACK-REGEL**: Bei JEDER Unsicherheit → "Sonstiges". NIEMALS raten.

Erlaubte Ausreißer-Kategorien: {ausreisser_str}
"""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception(_ist_wiederholbarer_fehler),
        reraise=True,
        before_sleep=_vor_wiederholung,
    )
    def _aufruf_mit_retry(self, pil_bild: Image.Image) -> Optional[BelegAnalyseErgebnis]:
        base64_str = _bild_zu_base64(pil_bild)
        antwort = self.client.chat.completions.create(
            model=self.modell_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self._erstelle_prompt()},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_str}"},
                        },
                    ],
                }
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "BelegAnalyseErgebnis",
                    "schema": BelegAnalyseErgebnis.model_json_schema(),
                },
            },
            temperature=0.0,
            max_tokens=2000,
        )
        text = antwort.choices[0].message.content
        if not text:
            return None
        return BelegAnalyseErgebnis.model_validate_json(text)

    def pruefe_beleg_direkt(
        self, pil_bild: Image.Image
    ) -> Optional[BelegAnalyseErgebnis]:
        """
        Analysiert ein PIL-Bild direkt (für Streamlit).
        Wiederholt bei transienten Fehlern (503, Timeout) automatisch.
        Wirft RuntimeError("API_LIMIT_REACHED") bei HTTP 429.
        """
        try:
            return self._aufruf_mit_retry(pil_bild)
        except RateLimitError:
            raise RuntimeError("API_LIMIT_REACHED")
        except Exception as e:
            fehler = str(e)
            if "429" in fehler or "RESOURCE_EXHAUSTED" in fehler:
                raise RuntimeError("API_LIMIT_REACHED")
            raise
