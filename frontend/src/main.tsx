import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './lib/i18n'
import './styles/globals.css'

const platformText = `${navigator.platform} ${navigator.userAgent}`
document.documentElement.dataset.platform = /Macintosh|Mac OS X|MacIntel/i.test(platformText)
  ? 'macos'
  : /Windows|Win32|Win64/i.test(platformText)
    ? 'windows'
    : 'other'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)
