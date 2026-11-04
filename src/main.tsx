import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import MobileNotice from './components/MobileNotice.tsx';
// Counts site visits for Vercel → Analytics (no cookies, no personal data)
import { Analytics } from '@vercel/analytics/react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MobileNotice />
    <Analytics />
  </StrictMode>,
);
