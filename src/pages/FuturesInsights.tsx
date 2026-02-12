import { useState } from "react";
import { Layout } from "@/components/Layout";
import { DashboardHeader, type Breadcrumb, type ViewMode } from "@/components/dashboard/DashboardHeader";
import { FuturesPanel } from "@/components/dashboard/FuturesPanel";
import { OptionsPanel } from "@/components/dashboard/OptionsPanel";
import { VolatilityPanel } from "@/components/dashboard/VolatilityPanel";
import { CurrencySelector } from "@/components/dashboard/CurrencySelector";
import type { CurrencyData, FuturesContract } from "@/lib/api/barchart";

const FuturesInsights = () => {
  const [view, setView] = useState<ViewMode>("home");
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyData | null>(null);
  const [selectedFuture, setSelectedFuture] = useState<FuturesContract | null>(null);
  const [optionSymbol, setOptionSymbol] = useState<string>("");
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    { label: "Home", view: "home" },
  ]);

  const handleCurrencySelected = (currency: CurrencyData) => {
    setSelectedCurrency(currency);
    setSelectedFuture(null);
    setView("home");
    setBreadcrumbs([{ label: "Home", view: "home" }]);
  };

  const handleLoadFutures = () => {
    if (!selectedCurrency) return;
    setView("futures");
    setBreadcrumbs([
      { label: "Home", view: "home" },
      { label: `${selectedCurrency.symbol} Futures`, view: "futures", symbol: selectedCurrency.symbol },
    ]);
  };

  const handleLoadVolatility = () => {
    if (!selectedCurrency) return;
    setOptionSymbol(selectedCurrency.symbol);
    // We need a futures contract for vol panel; use currency symbol as fallback
    if (!selectedFuture) {
      setSelectedFuture({
        contract: selectedCurrency.symbol,
        month: "",
        last: selectedCurrency.last,
        change: selectedCurrency.change,
        percentChange: selectedCurrency.percentChange,
        open: "",
        high: selectedCurrency.high,
        low: selectedCurrency.low,
        volume: selectedCurrency.volume,
        openInterest: "",
        time: selectedCurrency.time,
      });
    }
    setView("volatility");
    setBreadcrumbs([
      { label: "Home", view: "home" },
      { label: `${selectedCurrency.symbol} Vol & Greeks`, view: "volatility" },
    ]);
  };

  const handleSelectFuture = (future: FuturesContract) => {
    setSelectedFuture(future);
    setView("options");
    setBreadcrumbs([
      { label: "Home", view: "home" },
      { label: `${selectedCurrency?.symbol || ""} Futures`, view: "futures", symbol: selectedCurrency?.symbol },
      { label: `${future.contract} Options`, view: "options", symbol: future.contract },
    ]);
  };

  const handleViewVolatility = (optSymbol: string) => {
    setOptionSymbol(optSymbol);
    setView("volatility");
    setBreadcrumbs([
      { label: "Home", view: "home" },
      { label: `${selectedCurrency?.symbol || ""} Futures`, view: "futures", symbol: selectedCurrency?.symbol },
      { label: `${selectedFuture?.contract} Options`, view: "options", symbol: selectedFuture?.contract },
      { label: `Vol & Greeks`, view: "volatility" },
    ]);
  };

  const handleBreadcrumbClick = (crumb: Breadcrumb) => {
    setView(crumb.view);
    if (crumb.view === "home") {
      setSelectedFuture(null);
      setBreadcrumbs([{ label: "Home", view: "home" }]);
    } else if (crumb.view === "futures") {
      setSelectedFuture(null);
      setBreadcrumbs(breadcrumbs.slice(0, 2));
    } else if (crumb.view === "options") {
      setBreadcrumbs(breadcrumbs.slice(0, 3));
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 max-w-[1600px]">
          {/* Currency selector + action buttons - always visible */}
          <div className="mb-6">
            <CurrencySelector
              selectedCurrency={selectedCurrency}
              onSelect={handleCurrencySelected}
              onLoadFutures={handleLoadFutures}
              onLoadVolatility={handleLoadVolatility}
            />
          </div>

          {view === "futures" && selectedCurrency && (
            <FuturesPanel currency={selectedCurrency} onSelect={handleSelectFuture} />
          )}
          {view === "options" && selectedFuture && (
            <OptionsPanel contract={selectedFuture} onViewVolatility={handleViewVolatility} />
          )}
          {view === "volatility" && selectedFuture && optionSymbol && (
            <VolatilityPanel contract={selectedFuture} optionSymbol={optionSymbol} />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FuturesInsights;
