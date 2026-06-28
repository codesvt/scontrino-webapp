import { useState } from 'react'
import { useTheme } from './theme'
import Upload from './components/Upload'
import Inbox from './components/Inbox'
import Ledger from './components/Ledger'

type Tab = 'upload' | 'inbox' | 'ledger'

const BENUTZER_KEY = 'benutzer'

export default function App() {
  const [tab, setTab] = useState<Tab>('upload')
  const { theme, tokens: t, toggle } = useTheme()
  const [benutzer, setBenutzer] = useState<string>(() => {
    return localStorage.getItem(BENUTZER_KEY) || 'Walter'
  })

  function toggleBenutzer() {
    setBenutzer(prev => {
      const next = prev === 'Walter' ? 'Daniela' : 'Walter'
      localStorage.setItem(BENUTZER_KEY, next)
      return next
    })
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'inbox', label: 'Check' },
    { key: 'ledger', label: 'Data' },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.5rem', background: t.bg, minHeight: '100vh', color: t.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <h1 style={{ fontSize: '1.3rem', margin: 0, whiteSpace: 'nowrap' }}>Scontrino</h1>
        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
          <button onClick={toggleBenutzer} title="Benutzer wechseln" style={{
            padding: '0.25rem 0.5rem', border: `1px solid ${t.border}`, borderRadius: 6,
            background: t.bgCard, color: t.text, cursor: 'pointer', fontSize: '0.8rem',
            fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            aktiv: {benutzer}
          </button>
          <button onClick={toggle} title="Theme wechseln" style={{
            padding: '0.25rem 0.5rem', border: `1px solid ${t.border}`, borderRadius: 6,
            background: t.bgCard, color: t.text, cursor: 'pointer', fontSize: '0.8rem',
          }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', marginBottom: '1rem', borderBottom: `2px solid ${t.border}` }}>
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{
              flex: 1,
              padding: '0.5rem 0.3rem',
              border: 'none',
              background: tab === tb.key ? t.activeTab : t.inactiveTab,
              color: t.text,
              borderBottom: tab === tb.key ? `2px solid ${t.primary}` : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontWeight: tab === tb.key ? 600 : 400,
              fontSize: '0.85rem',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && <Upload benutzer={benutzer} />}
      {tab === 'inbox' && <Inbox onTabChange={setTab} />}
      {tab === 'ledger' && <Ledger benutzer={benutzer} />}
    </div>
  )
}
