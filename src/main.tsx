import './schemas/zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { chooseFirestoreCacheMode } from './lib/firebase/client';
import './styles/index.css';

void chooseFirestoreCacheMode().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
