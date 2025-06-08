import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ValueContextProvider from './utils/value-provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ValueContextProvider>
      <App />
    </ValueContextProvider>
  </StrictMode>,
)
