import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import './index.css'
import { DataProvider } from './data'
import { App } from './App'
import { applyTheme, resolveTheme, storedThemeChoice } from './lib/theme'

// Before the first paint, so the app never flashes the wrong theme.
applyTheme(resolveTheme(storedThemeChoice()))

// Ask Android to protect this app's storage from automatic cleanup, every launch (not only after a seal).
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
)
