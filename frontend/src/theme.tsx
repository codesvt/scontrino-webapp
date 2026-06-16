import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'

const light = {
  bg: '#fff',
  bgPage: '#fafafa',
  bgCard: '#f5f5f5',
  bgCard2: '#f9f9f9',
  bgDrop: '#fafafa',
  bgDropHover: '#e3f2fd',
  bgProgress: '#e0e0e0',
  text: '#333',
  textSecondary: '#555',
  textMuted: '#666',
  textLighter: '#888',
  border: '#ddd',
  borderLight: '#eee',
  borderInput: '#ccc',
  borderSecondary: '#bbb',
  primary: '#1976d2',
  primaryLight: '#e3f2fd',
  success: '#2e7d32',
  warning: '#f57c00',
  warningBadgeBg: '#fff3e0',
  warningBadgeText: '#e65100',
  danger: '#d32f2f',
  activeTab: '#fff',
  inactiveTab: '#f5f5f5',
}

const dark: ThemeTokens = {
  bg: '#121212',
  bgPage: '#1a1a1a',
  bgCard: '#2a2a2a',
  bgCard2: '#2d2d2d',
  bgDrop: '#1e1e1e',
  bgDropHover: '#1a2a3a',
  bgProgress: '#3a3a3a',
  text: '#e0e0e0',
  textSecondary: '#aaa',
  textMuted: '#999',
  textLighter: '#777',
  border: '#444',
  borderLight: '#333',
  borderInput: '#555',
  borderSecondary: '#555',
  primary: '#4a9eff',
  primaryLight: '#1a3050',
  success: '#4caf50',
  warning: '#ff9800',
  warningBadgeBg: '#3a2a10',
  warningBadgeText: '#ffb74d',
  danger: '#ef5350',
  activeTab: '#2a2a2a',
  inactiveTab: '#1e1e1e',
}

export type ThemeTokens = typeof light

const ThemeContext = createContext<{
  theme: Theme
  tokens: ThemeTokens
  toggle: () => void
}>({ theme: 'light', tokens: light, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme')
    return stored === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const tokens = theme === 'dark' ? dark : light
  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ theme, tokens, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
