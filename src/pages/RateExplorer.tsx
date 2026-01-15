import { useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useRateData } from "@/hooks/useRateData";
import { RATE_INDICES, FuturesData } from "@/lib/rate-explorer/rateIndices";
import { IRS_INDICES } from "@/lib/rate-explorer/irsIndices";
import { DashboardHeader } from "@/components/rate-explorer/DashboardHeader";
import { RateCard } from "@/components/rate-explorer/RateCard";
import { EditableRateTable } from "@/components/rate-explorer/EditableRateTable";
import { RateCurveChart } from "@/components/rate-explorer/RateCurveChart";
import { IRSDashboard } from "@/components/rate-explorer/IRSDashboard";
import { BootstrappingDashboard } from "@/components/rate-explorer/BootstrappingDashboard";
import { BondsDashboard } from "@/components/rate-explorer/BondsDashboard";
import { GovBondsBootstrapping } from "@/components/rate-explorer/GovBondsBootstrapping";
import { AllCurvesBootstrapping } from "@/components/rate-explorer/AllCurvesBootstrapping";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LineChart, Table, ArrowLeftRight, Calculator, Globe, Landmark, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fetchRateData } from "@/lib/rate-explorer/api/rates";
import { fetchIRSRates } from "@/lib/rate-explorer/api/irs";

export default function RateExplorer() {
  const [selectedIndex, setSelectedIndex] = useState(RATE_INDICES[0].id);
  const [localData, setLocalData] = useState<FuturesData[] | null>(null);
  const [activeTab, setActiveTab] = useState<"table" | "chart">("table");
  const [mainView, setMainView] = useState<"futures" | "irs" | "bootstrap" | "bonds" | "bonds_bootstrap" | "all_curves">("futures");
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: rateData, isLoading, isFetching, error } = useRateData(selectedIndex);

  const handleRefresh = () => {
    setLocalData(null); // Reset local edits on refresh
    queryClient.invalidateQueries({ queryKey: ["rateData", selectedIndex] });
  };

  const handleLoadAll = async () => {
    setIsLoadingAll(true);
    toast.info("Chargement de toutes les données...");
    
    try {
      // Fetch all rate futures in parallel
      const ratePromises = RATE_INDICES.map(idx => 
        fetchRateData(idx.id, true).then(() => {
          queryClient.invalidateQueries({ queryKey: ["rateData", idx.id] });
        })
      );
      
      // Fetch all IRS data in parallel
      const irsPromises = IRS_INDICES.map(idx => 
        fetchIRSRates(idx.currency, true).then(() => {
          queryClient.invalidateQueries({ queryKey: ["irs-rates", idx.currency] });
        })
      );
      
      await Promise.all([...ratePromises, ...irsPromises]);
      toast.success("Toutes les données sont chargées");
    } catch (error) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleDataChange = useCallback((newData: FuturesData[]) => {
    setLocalData(newData);
  }, []);

  // Use local data if edited, otherwise use fetched data
  const displayData = localData || rateData?.data || [];

  const selectedRate = RATE_INDICES.find((r) => r.id === selectedIndex);

  // Reset local data when index changes
  const handleIndexChange = (id: string) => {
    setLocalData(null);
    setSelectedIndex(id);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        {/* Background glow effect */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-[100px] rounded-full" />
        </div>

        <DashboardHeader
          lastUpdated={rateData?.lastUpdated}
          onRefresh={handleRefresh}
          isRefreshing={isFetching}
          onLoadAll={handleLoadAll}
          isLoadingAll={isLoadingAll}
        />

        <main className="container mx-auto px-4 py-6">
          {/* Main View Selector */}
          <div className="mb-6">
            <Tabs value={mainView} onValueChange={(v) => setMainView(v as typeof mainView)}>
              <TabsList className="grid grid-cols-6 w-[900px]">
                <TabsTrigger value="futures" className="flex items-center gap-2">
                  <LineChart className="w-4 h-4" />
                  Rate Futures
                </TabsTrigger>
                <TabsTrigger value="irs" className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" />
                  IRS Swaps
                </TabsTrigger>
                <TabsTrigger value="bootstrap" className="flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Bootstrapping
                </TabsTrigger>
                <TabsTrigger value="bonds" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Gov Bonds
                </TabsTrigger>
                <TabsTrigger value="bonds_bootstrap" className="flex items-center gap-2">
                  <Landmark className="w-4 h-4" />
                  Bonds Curve
                </TabsTrigger>
                <TabsTrigger value="all_curves" className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  All Curves
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mainView === "futures" ? (
            <>
              {/* Rate Index Selector */}
              <section className="mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Select Rate Index
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {RATE_INDICES.map((rate) => (
                    <RateCard
                      key={rate.id}
                      rate={rate}
                      isSelected={selectedIndex === rate.id}
                      onClick={() => handleIndexChange(rate.id)}
                      isLoading={selectedIndex === rate.id && isFetching}
                    />
                  ))}
                </div>
              </section>

              {/* Data Section with Tabs */}
              <section className="bg-card rounded-lg border border-border overflow-hidden shadow-lg">
                <div className="p-4 border-b border-border bg-secondary/20">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {selectedRate?.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Futures prices and rate curve • Taux Effectif = 100% - Latest
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {displayData.length > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {displayData.length} contracts
                        </span>
                      )}
                      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "table" | "chart")}>
                        <TabsList className="grid grid-cols-2 w-[200px]">
                          <TabsTrigger value="table" className="flex items-center gap-2">
                            <Table className="w-4 h-4" />
                            Tableau
                          </TabsTrigger>
                          <TabsTrigger value="chart" className="flex items-center gap-2">
                            <LineChart className="w-4 h-4" />
                            Courbe
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mb-4 text-destructive/50" />
                    <p className="text-lg font-medium">Failed to load data</p>
                    <p className="text-sm">{rateData?.error || "Please try again later"}</p>
                  </div>
                ) : (
                  <>
                    {activeTab === "table" ? (
                      <EditableRateTable
                        data={displayData}
                        isLoading={isLoading}
                        onDataChange={handleDataChange}
                      />
                    ) : (
                      <div className="p-4">
                        <RateCurveChart data={displayData} showEffectiveRate={true} />
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          ) : mainView === "irs" ? (
            <IRSDashboard />
          ) : mainView === "bootstrap" ? (
            <BootstrappingDashboard />
          ) : mainView === "bonds" ? (
            <BondsDashboard />
          ) : mainView === "bonds_bootstrap" ? (
            <GovBondsBootstrapping />
          ) : mainView === "all_curves" ? (
            <AllCurvesBootstrapping />
          ) : null}

          {/* Footer */}
          <footer className="mt-8 text-center text-sm text-muted-foreground">
            <p>Data sourced from Barchart & Investing.com. Prices may be delayed.</p>
            <p className="mt-1 text-xs">
              Pour le bootstrapping de courbes et pricing de dérivés : les données peuvent être modifiées localement.
            </p>
          </footer>
        </main>
      </div>
    </Layout>
  );
}
