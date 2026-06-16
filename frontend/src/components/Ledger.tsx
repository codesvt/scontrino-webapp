import { useState, useEffect } from "react";
import {
  getLedger,
  addManualEntry,
  deleteLedgerEntry,
} from "../api";
import { useTheme } from "../theme";
import type { LedgerEntry } from "../types";

const KATEGORIEN = [
  "Arbeitsnebenkosten",
  "Ausgehen/Freizeit",
  "Auto Nebenkosten",
  "Bekleidung/Schuhe/Accessoirs",
  "Energie/Strom",
  "Fotographie/Computer/Medien",
  "Garten/Aussenbereich",
  "Gas/Holz/Heizen",
  "Geschenke",
  "Haushaltswaren/Gebrauch",
  "Haushaltswaren/Verbrauch",
  "Hygiene",
  "Lebensmittel",
  "Medikamente/Sanitär/Gesundheit",
  "Sonstiges",
  "Sonstiges für Kinder",
  "Tanken",
  "Telefon",
  "Transport/Parken",
  "Versicherungen/Mitgliedsbeiträge",
];

function fmt(d: string) {
  const [j, m, t] = d.split("-");
  return `${t}.${m}.${j}`;
}

// Felder mit Komma, Anführungszeichen oder Zeilenumbruch müssen laut
// CSV-Spezifikation in Anführungszeichen gesetzt werden, sonst zerschießt
// z.B. eine Notiz mit Komma die Spaltenstruktur.
function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export default function Ledger() {
  const { tokens: t } = useTheme();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [mDatum, setMDatum] = useState(new Date().toISOString().slice(0, 10));
  const [mBetrag, setMBetrag] = useState(0);
  const [mKat, setMKat] = useState("Sonstiges");
  const [mNotiz, setMNotiz] = useState("");

  async function load() {
    setLoading(true);
    setEntries(await getLedger());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const summe = entries.reduce((a, e) => a + e.gesamtbetrag, 0);

  function handleExportCSV() {
    const header = ["Datum", "Betrag", "Kategorie", "Notiz"];
    const rows = entries.map((e) => [
      e.datum,
      e.gesamtbetrag.toFixed(2),
      e.kategorie,
      e.notiz,
    ]);

    const csvContent =
      "\ufeff" +
      [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "buchungen.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleManual() {
    try {
      await addManualEntry({
        datum: mDatum,
        betrag: mBetrag,
        kategorie: mKat,
        notiz: mNotiz,
      });
      setShowManual(false);
      setMBetrag(0);
      setMNotiz("");
      await load();
    } catch {}
  }

  async function handleDelete(id: number, mitBeleg: boolean) {
    await deleteLedgerEntry(id, mitBeleg);
    await load();
  }

  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <button onClick={handleExportCSV} style={btnSecondary(t)}>
          📄 CSV Export
        </button>
        <button
          onClick={() => setShowManual(!showManual)}
          style={{ ...btnSecondary(t), marginLeft: "0.5rem" }}
        >
          ➕ Manuelle Buchung
        </button>
      </div>

      {showManual && (
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1rem",
            background: t.bgCard2,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "0.5rem",
            }}
          >
            <div>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                Datum
              </label>
              <input
                type="date"
                value={mDatum}
                onChange={(e) => setMDatum(e.target.value)}
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                Betrag (€)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={mBetrag}
                onChange={(e) => setMBetrag(parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle(t), width: 120 }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                Kategorie
              </label>
              <select
                value={mKat}
                onChange={(e) => setMKat(e.target.value)}
                style={inputStyle(t)}
              >
                {KATEGORIEN.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                Notiz
              </label>
              <input
                type="text"
                value={mNotiz}
                onChange={(e) => setMNotiz(e.target.value)}
                placeholder="Optional"
                style={inputStyle(t)}
              />
            </div>
          </div>
          <button
            onClick={handleManual}
            disabled={mBetrag <= 0}
            style={{ ...btnPrimary(t), color: "#fff" }}
          >
            Speichern
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <strong style={{ color: t.text }}>Summe: {summe.toFixed(2)} €</strong>
        <span style={{ color: t.textMuted }}>
          ({entries.length} Buchungen)
        </span>
      </div>

      {loading ? (
        <p style={{ color: t.text }}>Lade…</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
            color: t.text,
          }}
        >
          <thead>
            <tr style={{ borderBottom: `2px solid ${t.border}` }}>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Datum</th>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Betrag</th>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>
                Kategorie
              </th>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Notiz</th>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                style={{ borderBottom: `1px solid ${t.borderLight}` }}
              >
                <td style={{ padding: "0.3rem 0.4rem" }}>{fmt(e.datum)}</td>
                <td style={{ padding: "0.3rem 0.4rem", fontWeight: 600 }}>
                  {e.gesamtbetrag.toFixed(2)} €
                </td>
                <td style={{ padding: "0.3rem 0.4rem" }}>{e.kategorie}</td>
                <td style={{ padding: "0.3rem 0.4rem", color: t.textMuted }}>
                  {e.notiz || "—"}
                </td>
                <td style={{ padding: "0.3rem 0.4rem" }}>
                  <button
                    onClick={() => handleDelete(e.id, true)}
                    style={btnDanger(t)}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inputStyle = (t: any): React.CSSProperties => ({
  padding: "0.35rem 0.5rem",
  border: `1px solid ${t.borderInput}`,
  borderRadius: 4,
  fontSize: "0.85rem",
  background: t.bg,
  color: t.text,
});
const btnSecondary = (t: any): React.CSSProperties => ({
  padding: "0.4rem 0.8rem",
  border: `1px solid ${t.borderSecondary}`,
  borderRadius: 6,
  background: t.bg,
  color: t.text,
  cursor: "pointer",
  fontSize: "0.85rem",
});
const btnPrimary = (t: any): React.CSSProperties => ({
  padding: "0.4rem 0.8rem",
  border: "none",
  borderRadius: 6,
  background: t.primary,
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.85rem",
});
const btnDanger = (t: any): React.CSSProperties => ({
  padding: "0.25rem 0.5rem",
  border: `1px solid ${t.danger}`,
  borderRadius: 4,
  background: t.bgCard,
  color: t.danger,
  cursor: "pointer",
  fontSize: "0.8rem",
});
