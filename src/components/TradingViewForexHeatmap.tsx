import React, { useEffect, useRef, memo, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';

interface TradingViewForexHeatmapProps {
  currencies?: string[];
  width?: string | number;
  height?: string | number;
  isTransparent?: boolean;
}

// Devises principales par défaut pour éviter la surcharge
const DEFAULT_CURRENCIES = [
  "EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD", "CNY",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF"
];

const TradingViewForexHeatmap: React.FC<TradingViewForexHeatmapProps> = ({
  currencies = DEFAULT_CURRENCIES,
  width = "100%",
  height = 600,
  isTransparent = true
}) => {
  const container = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  // Mémoriser la configuration pour éviter les re-renders inutiles
  const widgetConfig = useMemo(() => ({
    colorTheme: theme === 'dark' ? "dark" : "light",
    isTransparent,
    locale: "en",
    currencies: currencies.length > 0 ? currencies : DEFAULT_CURRENCIES,
    width: typeof width === 'number' ? width : "100%",
    height: typeof height === 'number' ? height : 600
  }), [currencies, width, height, isTransparent, theme]);

  useEffect(() => {
    if (!container.current || !widgetContainerRef.current) return;

    // Nettoyage complet avant de créer un nouveau script
    const cleanup = () => {
      // Supprimer tous les scripts existants
      const existingScripts = container.current?.querySelectorAll('script[src*="forex-heat-map"]');
      existingScripts?.forEach(script => {
        script.remove();
      });

      // Nettoyer le conteneur du widget
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = '';
      }

      // Nettoyer les iframes créées par TradingView
      const iframes = container.current?.querySelectorAll('iframe');
      iframes?.forEach(iframe => {
        iframe.remove();
      });
    };

    cleanup();

    // Créer le nouveau script
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify(widgetConfig);
    
    scriptRef.current = script;
    
    // Attacher le script au conteneur
    if (container.current) {
      container.current.appendChild(script);
    }

    return () => {
      cleanup();
      scriptRef.current = null;
    };
  }, [widgetConfig]);

  return (
    <div className="w-full">
      <div className="tradingview-widget-container" ref={container}>
        <div 
          className="tradingview-widget-container__widget" 
          ref={widgetContainerRef}
        ></div>
        <div className="tradingview-widget-copyright mt-2 text-xs text-muted-foreground text-center">
          <a 
            href="https://www.tradingview.com/markets/currencies/cross-rates-overview-heat-map/" 
            rel="noopener nofollow" 
            target="_blank"
            className="text-primary hover:underline"
          >
            <span className="text-blue-600 dark:text-blue-400">Forex Heatmap</span>
          </a>
          <span className="text-muted-foreground"> by TradingView</span>
        </div>
      </div>
    </div>
  );
};

export default memo(TradingViewForexHeatmap);

