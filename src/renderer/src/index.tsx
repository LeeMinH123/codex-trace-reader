import { createRoot } from 'react-dom/client'
import { App } from './App'
import type { ReaderApi } from '../../shared/reader'
import './styles/theme.css'

declare global {
  interface Window { reader: ReaderApi }
}

createRoot(document.getElementById('root')!).render(<App />)
