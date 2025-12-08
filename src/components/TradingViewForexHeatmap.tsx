import React, { useEffect, useRef, memo } from 'react';
import { useTheme } from '@/hooks/useTheme';

interface TradingViewForexHeatmapProps {
  currencies?: string[];
  width?: string | number;
  height?: string | number;
  isTransparent?: boolean;
}

const TradingViewForexHeatmap: React.FC<TradingViewForexHeatmapProps> = ({
  currencies = [
    "EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD", "CNY",
    "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "HRK",
    "RUB", "TRY", "BRL", "MXN", "ARS", "CLP", "COP", "PEN", "ZAR",
    "EGP", "MAD", "NGN", "KES", "INR", "PKR", "IDR", "THB", "MYR",
    "SGD", "PHP", "VND", "KRW", "HKD", "TWD"
  ],
  width = "100%",
  height = 600,
  isTransparent = true
}) => {
  const container = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!container.current) return;

    // Clean up existing script
    const existingScript = container.current.querySelector('script[src*="forex-heat-map"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Clear widget container
    const widgetContainer = container.current.querySelector('.tradingview-widget-container__widget');
    if (widgetContainer) {
      widgetContainer.innerHTML = '';
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "colorTheme": theme === 'dark' ? "dark" : "light",
      "isTransparent": isTransparent,
      "locale": "en",
      "currencies": currencies,
      "width": typeof width === 'number' ? width : "100%",
      "height": typeof height === 'number' ? height : 600
    });

    container.current.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (container.current && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [currencies, width, height, isTransparent, theme]);

  return (
    <div className="w-full">
      <div className="tradingview-widget-container" ref={container}>
        <div className="tradingview-widget-container__widget"></div>
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

