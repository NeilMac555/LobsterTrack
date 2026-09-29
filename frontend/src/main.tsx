import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prerendered head tags (title, description, canonical, OG...) exist so
// crawlers that don't run JS get the right metadata. The app re-declares
// them through Helmet, which on React 19 hoists natively and does not
// dedupe, so drop the static copies first: one of each, before and after.
document.querySelectorAll('head [data-prerender]').forEach((el) => el.remove());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
