import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/big-shoulders-display/500'
import '@fontsource/big-shoulders-display/600'
import '@fontsource/big-shoulders-display/700'
import '@fontsource/big-shoulders-display/800'
import '@fontsource/big-shoulders-display/900'
import './index.css'
import { DataProvider } from './data'
import { App } from './App'
import { applyTheme, resolveTheme, storedThemeChoice } from './lib/theme'
import { isNative } from './lib/platform'
import { registerSW } from 'virtual:pwa-register'

// The offline service worker is for the browser version only.
if (!isNative) registerSW({ immediate: true })

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
