import { useState, useEffect } from "react";
import {
  getReceipts,
  getReceiptImageUrl,
  bookReceipt,
  deleteReceipt,
  checkDuplicate,
} from "../api";
import { useTheme } from "../theme";
import type { Receipt } from "../types";

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

const KAT_MAP: Record<string, string> = {
  "Ausgehen/Freizeit": "Ausgehen/Freizeit",
  "Bekleidung/Schuhe/Accessoirs": "Bekleidung/Schuhe/Accessoirs",
  "Garten/Aussenbereich": "Garten/Aussenbereich",
  "Gas/Holz/Heizen": "Gas/Holz/Heizen",
  "Haushaltswaren/Verbrauch": "Haushaltswaren/Verbrauch",
  Hygiene: "Hygiene",
  Lebensmittel: "Lebensmittel",
  "Medikamente/Sanitär/Gesundheit": "Medikamente/Sanitär/Gesundheit",
  Tanken: "Tanken",
  "Transport/Parken": "Transport/Parken",
  Sonstiges: "Sonstiges",
};

function vater(ki: string) {
  return KAT_MAP[ki] || "Sonstiges";
}

function fmt(d: string | null) {
  if (!d) return "";
  const [j, m, t] = d.split("-");
  return `${t}.${m}.${j}`;
}

export default function Inbox({
  onTabChange,
}: {
  onTabChange: (t: "ledger") => void;
}) {
  const { tokens: t } = useTheme();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<
    Record<
      number,
      { datum: string; gesamtbetrag: number; kategorie: string } | null
    >
  >({});
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const r = await getReceipts();
      setReceipts(r);

      const dupMap: Record<
        number,
        { datum: string; gesamtbetrag: number; kategorie: string } | null
      > = {};
      for (const rec of r) {
        const d = rec.kiDaten.datum;
        if (d) {
          try {
            const result = await checkDuplicate(
              rec.id,
              d,
              rec.kiDaten.gesamtbetrag,
            );
            if (result.duplicate) dupMap[rec.id] = result.treffer!;
          } catch {}
        }
      }
      setDuplicates(dupMap);
    } catch {
      setError("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <p style={{ color: t.text }}>Lade Posteingang…</p>;
  if (error) return <p style={{ color: t.danger }}>{error}</p>;

  if (receipts.length === 0) {
    return (
      <div>
        <p style={{ color: t.success, fontWeight: 600 }}>
          🎉 Posteingang leer – alle Belege sind verbucht!
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginBottom: "0.4rem", color: t.textSecondary }}>
        <strong>{receipts.length}</strong> Belege warten auf Freigabe.
      </p>
      <p
        style={{
          marginBottom: "0.75rem",
          fontSize: "0.8rem",
          color: t.warning,
          background: t.warningBadgeBg,
          padding: "0.4rem 0.6rem",
          borderRadius: 4,
        }}
      >
        ⚠️ Beim Verbuchen werden die hinterlegten Bilder aus dem System
        gelöscht.
      </p>
      {receipts.map((r) => (
        <ReceiptCard
          key={r.id}
          t={t}
          receipt={r}
          duplicate={duplicates[r.id] ?? null}
          onAction={() => load()}
          onTabChange={onTabChange}
          onViewImage={setViewerImage}
        />
      ))}

      {viewerImage && (
        <ImageViewer url={viewerImage} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
}

function ReceiptCard({
  receipt,
  duplicate,
  t,
  onAction,
  onTabChange,
  onViewImage,
}: {
  receipt: Receipt;
  t: any;
  duplicate: { datum: string; gesamtbetrag: number; kategorie: string } | null;
  onAction: () => void;
  onTabChange: (t: "ledger") => void;
  onViewImage: (url: string) => void;
}) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [expanded, setExpanded] = useState(false);
  const [betrag, setBetrag] = useState(receipt.kiDaten.gesamtbetrag);
  const [kat, setKat] = useState(vater(receipt.kiDaten.hauptkategorie));
  const [notiz, setNotiz] = useState("");
  const [datum, setDatum] = useState(receipt.kiDaten.datum || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleBook() {
    setBusy(true);
    setMsg("");
    try {
      const d = datum || new Date().toISOString().slice(0, 10);
      await bookReceipt(receipt.id, {
        datum: d,
        betrag,
        kategorie: kat,
        notiz,
      });
      setMsg("✅ Verbucht!");
      onAction();
    } catch (e: any) {
      setMsg("❌ " + (e.message || "Fehler"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setMsg("");
    try {
      await deleteReceipt(receipt.id);
      setMsg("🗑️ Gelöscht");
      onAction();
    } catch (e: any) {
      setMsg("❌ " + (e.message || "Fehler"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        marginBottom: "0.75rem",
        overflow: "hidden",
        background: t.bg,
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "0.6rem 1rem",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: t.bgCard2,
          color: t.text,
        }}
      >
        <span>
          <strong>📄 {receipt.dateiname}</strong>
          {duplicate && (
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.75rem",
                background: t.warningBadgeBg,
                color: t.warningBadgeText,
                padding: "0.15rem 0.5rem",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              ⚠️ bereits verbucht ({fmt(duplicate.datum)} ·{" "}
              {duplicate.gesamtbetrag.toFixed(2)}€ · {duplicate.kategorie})
            </span>
          )}
        </span>
        <span style={{ color: t.textLighter }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div
          style={{
            padding: "1rem",
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "0 0 auto" }}>
            {receipt.hatBild && isDesktop ? (
              <img
                src={getReceiptImageUrl(receipt.id)}
                alt={receipt.dateiname}
                onClick={() => onViewImage(getReceiptImageUrl(receipt.id))}
                style={{
                  width: 300,
                  borderRadius: 4,
                  border: `1px solid ${t.borderLight}`,
                  cursor: "pointer",
                }}
              />
            ) : receipt.hatBild ? (
              <button
                onClick={() => onViewImage(getReceiptImageUrl(receipt.id))}
                style={{
                  padding: "0.4rem 0.8rem",
                  border: `1px solid ${t.borderSecondary}`,
                  borderRadius: 6,
                  background: t.bgCard,
                  color: t.text,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                }}
              >
                🔍 Beleg ansehen
              </button>
            ) : null}
          </div>
          <div style={{ flex: "1 1 300px" }}>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                  📅 Datum
                </label>
                <input
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  style={{ ...inputStyle(t), width: 150 }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                  💶 Betrag (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={betrag}
                  onChange={(e) => setBetrag(parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle(t), width: 120 }}
                />
              </div>
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                📂 Kategorie
              </label>
              <select
                value={kat}
                onChange={(e) => setKat(e.target.value)}
                style={{ ...inputStyle(t), width: "100%" }}
              >
                {KATEGORIEN.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.8rem", color: t.textMuted }}>
                📝 Notiz
              </label>
              <input
                type="text"
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="Optional"
                style={{ ...inputStyle(t), width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleBook}
                disabled={busy || betrag <= 0}
                style={{ ...btn, background: t.primary, color: "#fff" }}
              >
                💾 Verbuchen
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                style={{
                  ...btn,
                  background: t.bgCard,
                  color: t.danger,
                  border: `1px solid ${t.danger}`,
                }}
              >
                🗑️ Löschen
              </button>
            </div>
            {msg && (
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: t.text,
                }}
              >
                {msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        cursor: "pointer",
        padding: "1rem 1rem 2rem",
        overflow: "auto",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "fixed",
          top: "0.75rem",
          right: "1rem",
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "0.4rem 0.8rem",
          fontSize: "1.2rem",
          cursor: "pointer",
          zIndex: 10000,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
      <img
        src={url}
        alt="Beleg"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 400,
          width: "100%",
          objectFit: "contain",
          borderRadius: 4,
        }}
      />
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
const btn: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
};
