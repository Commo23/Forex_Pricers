import { useState, useEffect } from 'react';

interface CompanySettings {
  name: string;
  currency: string;
  timezone: string;
  fiscalYearStart: string;
}

interface AppSettings {
  company: CompanySettings;
  risk: Record<string, unknown>;
  pricing: Record<string, unknown>;
  ui: Record<string, unknown>;
  notifications: Record<string, unknown>;
  data: Record<string, unknown>;
  fxExposures: Record<string, unknown>;
  hedgingInstruments: Record<string, unknown>;
}

const defaultSettings: AppSettings = {
  company: {
    name: "FX hedging - Risk Management Platform",
    currency: "USD",
    timezone: "Europe/Paris",
    fiscalYearStart: "01-01"
  },
  risk: {},
  pricing: {},
  ui: {},
  notifications: {},
  data: {},
  fxExposures: {},
  hedgingInstruments: {}
};

const DEFAULT_LOGO = "/fx-hedging-logo.png";

// --- LOGO CACHE (singleton, module scope) ---
let logoCache: string | null = null;
// --- COMPANY NAME CACHE (singleton, module scope) ---
let companyNameCache: string = defaultSettings.company.name;

class CompanySettingsEventEmitter {
  private listeners: (() => void)[] = [];

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  emit() {
    this.listeners.forEach(listener => listener());
  }
}

export const companySettingsEmitter = new CompanySettingsEventEmitter();

export function useCompanySettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [companyLogo, setCompanyLogoState] = useState<string | null>(() => {
    if (logoCache !== null) return logoCache;
    const savedLogo = localStorage.getItem('companyLogo');
    logoCache = savedLogo || null;
    return logoCache;
  });
  const [companyName, setCompanyName] = useState<string>(() => {
    // Utilise le cache si déjà chargé
    if (companyNameCache) return companyNameCache;
    const savedSettings = localStorage.getItem('fxRiskManagerSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (parsed.company && parsed.company.name) {
          companyNameCache = parsed.company.name;
          return companyNameCache;
        }
        } catch (error) {
          console.error('Error parsing saved settings:', error);
        }
    }
    companyNameCache = defaultSettings.company.name;
    return companyNameCache;
  });

  // Load settings from localStorage (une seule fois)
  useEffect(() => {
    const loadSettings = () => {
      const savedSettings = localStorage.getItem('fxRiskManagerSettings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings(prev => ({ ...prev, ...parsed }));
          if (parsed.company && parsed.company.name) {
            companyNameCache = parsed.company.name;
            setCompanyName(companyNameCache);
          }
        } catch (error) {
          console.error('Error loading company settings:', error);
        }
      }
      setIsLoaded(true);
    };
    loadSettings();
    // Subscribe to updates
    const unsubscribe = companySettingsEmitter.subscribe(() => {
      setUpdateTrigger(prev => prev + 1);
      loadSettings();
      setCompanyLogoState(logoCache);
      setCompanyName(companyNameCache);
    });
    return unsubscribe;
  }, []);

  // Parse company name to get parts before and after "-"
  const getCompanyNameParts = () => {
    const fullName = companyName;
    const dashIndex = fullName.indexOf(' - ');
    if (dashIndex === -1) {
      return {
        primaryName: fullName,
        secondaryName: ''
      };
    }
    return {
      primaryName: fullName.substring(0, dashIndex).trim(),
      secondaryName: fullName.substring(dashIndex + 3).trim()
    };
  };

  // Update company settings
  const updateCompanySettings = (updates: Partial<CompanySettings>) => {
    const newSettings = {
      ...settings,
      company: { ...settings.company, ...updates }
    };
    setSettings(newSettings);
    if (updates.name !== undefined) {
      companyNameCache = updates.name;
      setCompanyName(companyNameCache);
    }
    localStorage.setItem('fxRiskManagerSettings', JSON.stringify(newSettings));
    companySettingsEmitter.emit();
    
    // Emit custom event for base currency change (for same-tab updates)
    if (updates.currency !== undefined) {
      window.dispatchEvent(new CustomEvent('baseCurrencyChanged'));
    }
  };

  // Logo logic
  const getCompanyLogo = () => {
    return companyLogo || DEFAULT_LOGO;
  };

  const setCompanyLogo = (logoBase64: string) => {
    logoCache = logoBase64;
    setCompanyLogoState(logoBase64);
    localStorage.setItem('companyLogo', logoBase64);
    companySettingsEmitter.emit();
  };

  const resetCompanyLogo = () => {
    logoCache = null;
    setCompanyLogoState(null);
    localStorage.removeItem('companyLogo');
    companySettingsEmitter.emit();
  };

  return {
    companySettings: settings.company,
    getCompanyNameParts,
    updateCompanySettings,
    getCompanyLogo,
    setCompanyLogo,
    resetCompanyLogo,
    isLoaded
  };
}

export function getCompanyNameSync() {
  return companyNameCache;
} 