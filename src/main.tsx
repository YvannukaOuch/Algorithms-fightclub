import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadPreferences } from '@/app/preferences'
import App from './App.tsx'
import './index.css'

loadPreferences()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
