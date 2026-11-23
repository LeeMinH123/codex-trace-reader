import { createRoot } from 'react-dom/client'
import '../../src/renderer/src/styles/theme.css'
import '../../src/renderer/src/styles/reading-flow.css'
import './portfolio.css'
import { PortfolioApp } from './PortfolioApp'

createRoot(document.getElementById('root')!).render(<PortfolioApp />)
