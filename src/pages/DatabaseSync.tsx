import React, { useState, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { SupabaseSync } from '../components/SupabaseSync'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { 
  Database, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Download, 
  Upload,
  CheckCircle,
  AlertCircle,
  Info,
  FileText,
  BarChart3,
  Shield
} from 'lucide-react'
import { useSupabase } from '../hooks/useSupabase'
import { useToast } from '../hooks/use-toast'

const DatabaseSync: React.FC = () => {
  const { toast } = useToast()
  const { 
    isConnected, 
    loading, 
    error,
    getStrategies,
    getScenarios,
    getRiskMatrices,
    getHedgingInstruments,
    clearError
  } = useSupabase()

  const [stats, setStats] = useState({
    strategies: 0,
    scenarios: 0,
    riskMatrices: 0,
    hedgingInstruments: 0
  })

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Load statistics
  const loadStats = async () => {
    if (!isConnected) return

    try {
      const [strategies, scenarios, riskMatrices, instruments] = await Promise.all([
        getStrategies(),
        getScenarios(),
        getRiskMatrices(),
        getHedgingInstruments()
      ])

      setStats({
        strategies: strategies?.length || 0,
        scenarios: scenarios?.length || 0,
        riskMatrices: riskMatrices?.length || 0,
        hedgingInstruments: instruments?.length || 0
      })

      setLastRefresh(new Date())
    } catch (err) {
      console.error('Error loading statistics:', err)
    }
  }

  useEffect(() => {
    if (isConnected) {
      loadStats()
    }
  }, [isConnected])

  const handleDataLoaded = () => {
    loadStats()
    toast({
      title: "Data Loaded",
      description: "Data has been loaded from the cloud",
    })
  }

  const handleDataSaved = () => {
    loadStats()
    toast({
      title: "Data Saved",
      description: "Data has been saved to the cloud",
    })
  }

  return (
    <Layout 
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Database Sync" }
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Database Sync</h1>
            <p className="text-muted-foreground">
              Manage synchronization of your data with the cloud
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="outline" className="text-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600">
                <AlertCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
            
            <Button
              onClick={loadStats}
              disabled={!isConnected || loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Unable to connect to the cloud database. Please check your internet connection and configuration.
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics */}
        {isConnected && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Strategies</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.strategies}</div>
                <p className="text-xs text-muted-foreground">
                  Saved strategies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Scenarios</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.scenarios}</div>
                <p className="text-xs text-muted-foreground">
                  Saved scenarios
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Risk Matrices</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.riskMatrices}</div>
                <p className="text-xs text-muted-foreground">
                  Saved matrices
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Instruments</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.hedgingInstruments}</div>
                <p className="text-xs text-muted-foreground">
                  Hedging instruments
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="sync" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sync">Synchronization</TabsTrigger>
          </TabsList>

          <TabsContent value="sync" className="space-y-4">
            <SupabaseSync 
              onDataLoaded={handleDataLoaded}
              onDataSaved={handleDataSaved}
            />
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> Synchronization automatically saves all your local data 
                (strategies, scenarios, risk matrices, hedging instruments) to the cloud database. 
                You can also load data from the cloud database.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}

export default DatabaseSync
