import { useState, useEffect } from 'react';
import { useCompanySettings } from './useCompanySettings';

/**
 * Hook to get and listen to base currency changes
 * Returns the current base currency from company settings
 */
export function useBaseCurrency(): string {
  const { companySettings } = useCompanySettings();
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    // Try to get from company settings first
    if (companySettings?.currency) {
      return companySettings.currency;
    }
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem('fxRiskManagerSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.company?.currency || 'USD';
      }
    } catch {
      // Ignore errors
    }
    return 'USD';
  });

  // Update when company settings change
  useEffect(() => {
    if (companySettings?.currency) {
      setBaseCurrency(companySettings.currency);
    }
  }, [companySettings?.currency]);

  // Listen to localStorage changes (from other tabs/components)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'fxRiskManagerSettings' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.company?.currency) {
            setBaseCurrency(parsed.company.currency);
          }
        } catch {
          // Ignore errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen to custom events (for same-tab updates)
    const handleCustomEvent = () => {
      try {
        const saved = localStorage.getItem('fxRiskManagerSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.company?.currency) {
            setBaseCurrency(parsed.company.currency);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    window.addEventListener('baseCurrencyChanged', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('baseCurrencyChanged', handleCustomEvent);
    };
  }, []);

  return baseCurrency;
}

