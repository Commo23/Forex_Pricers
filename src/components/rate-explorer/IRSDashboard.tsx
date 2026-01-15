import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, Table as TableIcon, LineChart } from "lucide-react";
import { useIRSData } from "@/hooks/useIRSData";
import { IRS_INDICES } from "@/lib/rate-explorer/irsIndices";
import { IRSTable } from "./IRSTable";
import { IRSCurveChart } from "./IRSCurveChart";

export function IRSDashboard() {
  const [selectedCurrency, setSelectedCurrency] = useState("usd");
  const { data: irsData, isLoading, refetch, isFetching } = useIRSData(selectedCurrency);

  const selectedIndex = IRS_INDICES.find(i => i.id === selectedCurrency);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Interest Rate Swaps</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedIndex?.description} - Live rates from Investing.com
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IRS_INDICES.map((index) => (
                  <SelectItem key={index.id} value={index.id}>
                    {index.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {irsData?.lastUpdated && (
            <p className="text-xs text-muted-foreground mb-4">
              Last updated: {new Date(irsData.lastUpdated).toLocaleString()}
            </p>
          )}
          
          <Tabs defaultValue="table" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="table" className="flex items-center gap-2">
                <TableIcon className="h-4 w-4" />
                Table
              </TabsTrigger>
              <TabsTrigger value="chart" className="flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                Swap Curve
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="table">
              <IRSTable data={irsData?.data || []} isLoading={isLoading || isFetching} />
            </TabsContent>
            
            <TabsContent value="chart">
              <IRSCurveChart data={irsData?.data || []} currency={selectedCurrency.toUpperCase()} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

