import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Cegah scroll mouse mengubah nilai pada input number saat scrolling halaman/modal
document.addEventListener('wheel', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') {
    e.target.blur();
  } else if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
