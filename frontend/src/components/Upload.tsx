import { useState, useEffect, useRef } from 'react'
import { uploadFiles, getUploadStatus, cancelUpload } from '../api'
import { useTheme } from '../theme'
import type { UploadStatus } from '../types'

export default function Upload() {
  const { tokens: t } = useTheme()
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<UploadStatus | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!jobId) return
    const iv = setInterval(async () => {
      const s: UploadStatus = await getUploadStatus(jobId)
      setStatus(s)
      if (!s.running || s.cancelled) clearInterval(iv)
    }, 400)
    return () => clearInterval(iv)
  }, [jobId])

  async function handleStart() {
    if (files.length === 0) return
    const { jobId: jid } = await uploadFiles(files)
    setJobId(jid)
  }

  async function handleCancel() {
    if (jobId) await cancelUpload(jobId)
    setStatus(s => s ? { ...s, running: false, cancelled: true } : null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => /\.(jpg|jpeg|png)$/i.test(f.name))
    setFiles(prev => [...prev, ...dropped])
  }

  function reset() {
    setJobId(null)
    setStatus(null)
    setFiles([])
  }

  if (!jobId) {
    return (
      <div>
        <p style={{ marginBottom: '0.5rem', color: t.textSecondary }}>Wähle Fotos aus oder ziehe sie hierher.</p>
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          style={{
            border: `2px dashed ${dragging ? t.primary : t.borderSecondary}`,
            borderRadius: 8,
            padding: '2rem',
            textAlign: 'center',
            background: dragging ? t.bgDropHover : t.bgDrop,
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={e => setFiles(Array.from(e.target.files || []))}
          />
          {files.length === 0 ? (
            <p style={{ color: t.textLighter }}>📸 Bilder hierher ziehen oder klicken zum Auswählen</p>
          ) : (
            <p style={{ color: t.text }}><strong>{files.length}</strong> Datei(en) ausgewählt</p>
          )}
        </div>
        {files.length > 0 && (
          <>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: t.textMuted }}>
              {files.map(f => <div key={f.name}>📄 {f.name}</div>)}
            </div>
            <button onClick={handleStart} style={{ ...btnPrimary(t), color: '#fff' }}>
              ▶ {files.length} Belege verarbeiten
            </button>
          </>
        )}
      </div>
    )
  }

  const s = status
  const total = s?.total ?? 0
  const done = s?.done ?? 0
  const pct = total > 0 ? done / total : 0

  return (
    <div>
      {s?.running && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: t.textSecondary, marginBottom: '0.25rem' }}>
            📤 Verarbeitung läuft im Hintergrund – {done}/{total}
          </p>
          <div style={{ background: t.bgProgress, borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct * 100}%`, background: t.primary, height: '100%', transition: 'width 0.3s' }} />
          </div>
          <button onClick={handleCancel} style={{ ...btnSecondary(t), marginTop: '0.5rem' }}>⏹ Abbrechen</button>
        </div>
      )}
      {s?.apiBlocked && (
        <p style={{ color: t.danger, marginBottom: '0.5rem' }}>🛑 API-Tageslimit erreicht (429)</p>
      )}

      {s && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <Metric t={t} label="✅ Erfolgreich" value={s.erfolgreich} color={t.success} />
            <Metric t={t} label="🔁 Dubletten" value={s.dubletten} color={t.warning} />
            <Metric t={t} label="❌ Fehler" value={s.fehler} color={t.danger} />
          </div>
          <p style={{ fontSize: '0.85rem', color: t.textMuted, marginBottom: '0.5rem' }}>
            📬 {s.savedIds.length} Belege im Posteingang
          </p>
        </>
      )}

      {s?.results && Object.keys(s.results).length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1rem', color: t.text }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${t.border}` }}>
              <th style={{ textAlign: 'left', padding: '0.4rem' }}>Datei</th>
              <th style={{ textAlign: 'left', padding: '0.4rem', width: 50 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.4rem' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.results).map(([name, r]) => (
              <tr key={name} style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                <td style={{ padding: '0.3rem 0.4rem' }}>{name}</td>
                <td style={{ padding: '0.3rem 0.4rem' }}>
                  {r.status === 'success' ? '✅' : r.status === 'duplicate' ? '🔁' : '❌'}
                </td>
                <td style={{ padding: '0.3rem 0.4rem', color: r.status === 'error' ? t.danger : t.text }}>
                  {r.msg}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {s && !s.running && done === total && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {s.fehler > 0 && (
            <button onClick={reset} style={{ ...btnPrimary(t), color: '#fff' }}>
              🔁 Fehlgeschlagene erneut versuchen
            </button>
          )}
          <button onClick={reset} style={btnSecondary(t)}>
            ⬆️ Neue Belege hochladen
          </button>
        </div>
      )}
    </div>
  )
}

function Metric({ t, label, value, color }: { t: any; label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, padding: '0.5rem', background: t.bgCard, borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: t.textMuted }}>{label}</div>
    </div>
  )
}

const btnPrimary = (t: any): React.CSSProperties => ({
  padding: '0.5rem 1rem', border: 'none', borderRadius: 6,
  background: t.primary, color: '#fff', fontWeight: 600,
  cursor: 'pointer', fontSize: '0.9rem',
})
const btnSecondary = (t: any): React.CSSProperties => ({
  padding: '0.5rem 1rem', border: `1px solid ${t.borderSecondary}`, borderRadius: 6,
  background: t.bg, color: t.text, cursor: 'pointer', fontSize: '0.9rem',
})
