import { useState, useEffect } from "react";
import { getLedger, addManualEntry, deleteLedgerEntry } from "../api";
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

export default function Ledger({ benutzer }: { benutzer: string }) {
  const { tokens: t } = useTheme();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<"datum" | "erstellt">("datum");
  const [showManual, setShowManual] = useState(false);
  const [mDatum, setMDatum] = useState(new Date().toISOString().slice(0, 10));
  const [mBetrag, setMBetrag] = useState("");
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
    const header = ["Datum", "Betrag", "Kategorie", "Notiz", "Benutzer"];
    const rows = entries.map((e) => [
      e.datum,
      e.gesamtbetrag.toFixed(2),
      e.kategorie,
      e.notiz,
      e.benutzer,
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

  const sorted = [...entries].sort((a, b) => {
    if (sortField === "erstellt") {
      return b.erstellt.localeCompare(a.erstellt);
    }
    return b.datum.localeCompare(a.datum) || b.id - a.id;
  });

  async function handleManual() {
    try {
      const betrag = parseFloat(mBetrag) || 0;
      if (betrag <= 0) return;
      await addManualEntry({
        datum: mDatum,
        betrag,
        kategorie: mKat,
        notiz: mNotiz,
        benutzer,
      });
      setShowManual(false);
      setMBetrag("");
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
          CSV Export
        </button>
        <button
          onClick={() => setShowManual(!showManual)}
          style={{ ...btnSecondary(t), marginLeft: "0.5rem" }}
        >
          Manuelle Buchung
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
                type="text"
                inputMode="decimal"
                value={mBetrag}
                onChange={(e) => setMBetrag(e.target.value)}
                placeholder="0.00"
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
            disabled={!mBetrag || parseFloat(mBetrag) <= 0}
            style={{ ...btnPrimary(t), color: "#fff" }}
          >
            Speichern
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: t.text }}>Summe: {summe.toFixed(2)} €</strong>
        <span style={{ color: t.textMuted }}>({entries.length} Buchungen)</span>
        <span style={{ color: t.border, margin: "0 0.25rem" }}>|</span>
        <label style={{ fontSize: "0.8rem", color: t.textMuted, display: "flex", alignItems: "center", gap: "0.3rem" }}>
          sortieren nach
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as "datum" | "erstellt")}
            style={{
              padding: "0.15rem 0.3rem",
              border: `1px solid ${t.borderInput}`,
              borderRadius: 3,
              fontSize: "0.75rem",
              background: t.bg,
              color: t.text,
            }}
          >
            <option value="datum">Datum</option>
            <option value="erstellt">Erstelldatum</option>
          </select>
        </label>
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
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Person</th>
              <th style={{ textAlign: "left", padding: "0.4rem" }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr
                key={e.id}
                style={{ borderBottom: `1px solid ${t.borderLight}` }}
              >
                <td style={{ padding: "0.3rem 0.4rem" }}>{fmt(e.datum)}</td>
                <td style={{ padding: "0.3rem 0.4rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {e.gesamtbetrag.toFixed(2)} €
                </td>
                <td style={{ padding: "0.3rem 0.4rem" }}>{e.kategorie}</td>
                <td style={{ padding: "0.3rem 0.4rem", color: t.textMuted }}>
                  {e.notiz || "—"}
                </td>
                <td style={{ padding: "0.3rem 0.4rem", fontSize: "0.8rem" }}>
                  {e.benutzer}
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
