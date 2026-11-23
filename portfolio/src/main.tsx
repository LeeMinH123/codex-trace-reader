import { createRoot } from 'react-dom/client'
import '../../src/renderer/src/styles/theme.css'
import '../../src/renderer/src/styles/reading-flow.css'
import './styles/portfolio.css'
import { PortfolioApp } from './components/PortfolioApp'

createRoot(document.getElementById('root')!).render(<PortfolioApp />)
