import { useState } from 'react'
import { useTheme } from './theme'
import Upload from './components/Upload'
import Inbox from './components/Inbox'
import Ledger from './components/Ledger'

type Tab = 'upload' | 'inbox' | 'ledger'

export default function App() {
  const [tab, setTab] = useState<Tab>('upload')
  const { theme, tokens: t, toggle } = useTheme()

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upload', label: '📥 Belege hochladen' },
    { key: 'inbox', label: '📬 Posteingang' },
    { key: 'ledger', label: '📖 Hauptbuch' },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.5rem', background: t.bg, minHeight: '100vh', color: t.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>📊 Familien-Buchhaltung</h1>
        <button onClick={toggle} style={{
          padding: '0.3rem 0.7rem', border: `1px solid ${t.border}`, borderRadius: 6,
          background: t.bgCard, color: t.text, cursor: 'pointer', fontSize: '0.85rem',
        }}>
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: `2px solid ${t.border}` }}>
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: tab === tb.key ? t.activeTab : t.inactiveTab,
              color: t.text,
              borderBottom: tab === tb.key ? `2px solid ${t.primary}` : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontWeight: tab === tb.key ? 600 : 400,
              fontSize: '0.9rem',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && <Upload />}
      {tab === 'inbox' && <Inbox onTabChange={setTab} />}
      {tab === 'ledger' && <Ledger />}
    </div>
  )
}
