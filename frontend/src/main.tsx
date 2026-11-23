import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { BrandingProvider } from './lib/branding';
import { ToastProvider } from './components/ui';
import App from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry permission / not-found errors; retry transient failures twice.
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <BrandingProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrandingProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
