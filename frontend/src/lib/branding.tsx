import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from './api';

export type Branding = {
  name: string; shortName: string; logoUrl: string | null; primaryColor: string; accentColor: string;
  timeZone: string; locale: string; supportEmail: string | null; features: Record<string, boolean>;
};
const fallback: Branding = { name: 'College LMS', shortName: 'LMS', logoUrl: null, primaryColor: '#4163F5', accentColor: '#0EAA9E', timeZone: 'Asia/Kolkata', locale: 'en-IN', supportEmail: null, features: {} };
const Ctx = createContext<Branding>(fallback);

// Applies the college's colours as CSS variables so every component re-themes centrally (white-label).
export function BrandingProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ['branding'], queryFn: () => get<Branding>('/settings/public'), staleTime: 10 * 60_000 });
  const b = q.data ?? fallback;
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', b.primaryColor);
    document.documentElement.style.setProperty('--brand-accent', b.accentColor);
    document.title = `ClassOrbit · ${b.name}`;
  }, [b.primaryColor, b.accentColor, b.name]);
  return <Ctx.Provider value={b}>{children}</Ctx.Provider>;
}
export const useBranding = () => useContext(Ctx);
export const featureOn = (b: Branding, key: string) => b.features[key] !== false;
