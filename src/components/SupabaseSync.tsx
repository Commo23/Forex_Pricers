import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Cloud, CloudOff, Upload, Download, Database, AlertCircle, CheckCircle } from 'lucide-react'
import { useSupabase } from '../hooks/useSupabase'
import { useToast } from '../hooks/use-toast'

interface SupabaseSyncProps {
  onDataLoaded?: (data: any) => void
  onDataSaved?: (data: any) => void
}

export const SupabaseSync: React.FC<SupabaseSyncProps> = ({ onDataLoaded, onDataSaved }) => {
  const { toast } = useToast()
  const { 
    isConnected, 
    loading, 
    error, 
    getStrategies, 
    saveStrategy,
    getScenarios,
    saveScenario,
    getRiskMatrices,
    saveRiskMatrix,
    getHedgingInstruments,
    saveHedgingInstrument,
    clearError
  } = useSupabase()

  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')

  // Fonction pour sauvegarder les données locales vers Supabase
  const syncToSupabase = async () => {
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "Unable to connect to Supabase",
        variant: "destructive"
      })
      return
    }

    setSyncStatus('syncing')
    clearError()

    try {
      // Récupérer les données du localStorage
      const calculatorState = localStorage.getItem('calculatorState')
      const savedScenarios = localStorage.getItem('savedScenarios')
      const savedRiskMatrices = localStorage.getItem('savedRiskMatrices')
      const hedgingInstruments = localStorage.getItem('hedgingInstruments')

      if (calculatorState) {
        const state = JSON.parse(calculatorState)
        const strategyData = {
          name: `Strategy ${new Date().toLocaleDateString()}`,
          description: 'Strategy synchronized from local application',
          start_date: state.params?.startDate || new Date().toISOString().split('T')[0],
          strategy_start_date: state.params?.strategyStartDate || new Date().toISOString().split('T')[0],
          months_to_hedge: state.params?.monthsToHedge || 12,
          domestic_rate: state.params?.domesticRate || 1.0,
          foreign_rate: state.params?.foreignRate || 0.5,
          base_volume: state.params?.baseVolume || 10000000,
          quote_volume: state.params?.quoteVolume || 10000000,
          spot_price: state.params?.spotPrice || 1.0850,
          currency_pair: state.params?.currencyPair || {
            symbol: 'EUR/USD',
            name: 'Euro / US Dollar',
            base: 'EUR',
            quote: 'USD',
            category: 'majors',
            default_spot_rate: 1.0850
          },
          use_custom_periods: state.params?.useCustomPeriods || false,
          custom_periods: state.params?.customPeriods || [],
          strategy_components: state.strategy || [],
          option_pricing_model: 'garman-kohlhagen',
          barrier_pricing_model: 'closed-form',
          use_implied_vol: state.useImpliedVol || false,
          implied_volatilities: state.impliedVolatilities || {},
          use_custom_option_prices: state.useCustomOptionPrices || false,
          custom_option_prices: state.customOptionPrices || {},
          barrier_option_simulations: state.barrierOptionSimulations || 1000,
          results: state.results,
          payoff_data: state.payoffData || [],
          stress_test_scenarios: state.stressTestScenarios || {},
          manual_forwards: state.manualForwards || {},
          real_prices: state.realPrices || {},
          real_price_params: state.realPriceParams || {
            use_simulation: false,
            volatility: 15.0,
            drift: 0.0,
            num_simulations: 1000
          }
        }

        await saveStrategy(strategyData)
      }

      // Sauvegarder les scénarios
      if (savedScenarios) {
        const scenarios = JSON.parse(savedScenarios)
        for (const scenario of scenarios) {
          await saveScenario({
            name: scenario.name,
            description: scenario.description || '',
            params: scenario.params,
            strategy: scenario.strategy,
            results: scenario.results,
            payoff_data: scenario.payoffData || [],
            stress_test: scenario.stressTest,
            manual_forwards: scenario.manualForwards || {},
            real_prices: scenario.realPrices || {},
            use_implied_vol: scenario.useImpliedVol || false,
            implied_volatilities: scenario.impliedVolatilities || {},
            custom_option_prices: scenario.customOptionPrices || {}
          })
        }
      }

      // Sauvegarder les matrices de risque
      if (savedRiskMatrices) {
        const matrices = JSON.parse(savedRiskMatrices)
        for (const matrix of matrices) {
          await saveRiskMatrix({
            name: matrix.name,
            description: matrix.description || '',
            components: matrix.components || [],
            coverage_ratio: matrix.coverageRatio || 0,
            results: matrix.results || []
          })
        }
      }

      // Sauvegarder les instruments de couverture
      if (hedgingInstruments) {
        const instruments = JSON.parse(hedgingInstruments)
        for (const instrument of instruments) {
          await saveHedgingInstrument({
            ...instrument,
            created_at: new Date().toISOString()
          })
        }
      }

      setLastSync(new Date())
      setSyncStatus('success')
      
      toast({
        title: "Synchronization Successful",
        description: "All data has been saved to Supabase",
      })

      if (onDataSaved) {
        onDataSaved({ timestamp: new Date() })
      }

    } catch (err) {
      console.error('Error during synchronization:', err)
      setSyncStatus('error')
      
      toast({
        title: "Synchronization Error",
        description: error || "An error occurred during save",
        variant: "destructive"
      })
    }
  }

  // Fonction pour charger les données depuis Supabase
  const loadFromSupabase = async () => {
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "Unable to connect to Supabase",
        variant: "destructive"
      })
      return
    }

    setSyncStatus('syncing')
    clearError()

    try {
      // Charger les stratégies
      const strategies = await getStrategies()
      if (strategies && strategies.length > 0) {
        const latestStrategy = strategies[0] // Prendre la plus récente
        
        // Convertir au format localStorage
        const calculatorState = {
          params: {
            startDate: latestStrategy.start_date,
            strategyStartDate: latestStrategy.strategy_start_date,
            monthsToHedge: latestStrategy.months_to_hedge,
            domesticRate: latestStrategy.domestic_rate,
            foreignRate: latestStrategy.foreign_rate,
            baseVolume: latestStrategy.base_volume,
            quoteVolume: latestStrategy.quote_volume,
            spotPrice: latestStrategy.spot_price,
            currencyPair: latestStrategy.currency_pair,
            useCustomPeriods: latestStrategy.use_custom_periods,
            customPeriods: latestStrategy.custom_periods || []
          },
          strategy: latestStrategy.strategy_components || [],
          results: latestStrategy.results,
          payoffData: latestStrategy.payoff_data || [],
          useImpliedVol: latestStrategy.use_implied_vol || false,
          impliedVolatilities: latestStrategy.implied_volatilities || {},
          useCustomOptionPrices: latestStrategy.use_custom_option_prices || false,
          customOptionPrices: latestStrategy.custom_option_prices || {},
          barrierOptionSimulations: latestStrategy.barrier_option_simulations || 1000,
          stressTestScenarios: latestStrategy.stress_test_scenarios || {},
          manualForwards: latestStrategy.manual_forwards || {},
          realPrices: latestStrategy.real_prices || {},
          realPriceParams: latestStrategy.real_price_params || {
            useSimulation: false,
            volatility: 15.0,
            drift: 0.0,
            numSimulations: 1000
          }
        }

        localStorage.setItem('calculatorState', JSON.stringify(calculatorState))
      }

      // Charger les scénarios
      const scenarios = await getScenarios()
      if (scenarios && scenarios.length > 0) {
        const formattedScenarios = scenarios.map(scenario => ({
          id: scenario.id,
          name: scenario.name,
          description: scenario.description,
          timestamp: new Date(scenario.created_at).getTime(),
          params: scenario.params,
          strategy: scenario.strategy,
          results: scenario.results,
          payoffData: scenario.payoff_data || [],
          stressTest: scenario.stress_test,
          manualForwards: scenario.manual_forwards || {},
          realPrices: scenario.real_prices || {},
          useImpliedVol: scenario.use_implied_vol || false,
          impliedVolatilities: scenario.implied_volatilities || {},
          customOptionPrices: scenario.custom_option_prices || {}
        }))

        localStorage.setItem('savedScenarios', JSON.stringify(formattedScenarios))
      }

      // Charger les matrices de risque
      const riskMatrices = await getRiskMatrices()
      if (riskMatrices && riskMatrices.length > 0) {
        const formattedMatrices = riskMatrices.map(matrix => ({
          id: matrix.id,
          name: matrix.name,
          description: matrix.description,
          timestamp: new Date(matrix.created_at).getTime(),
          components: matrix.components || [],
          coverageRatio: matrix.coverage_ratio || 0,
          results: matrix.results || []
        }))

        localStorage.setItem('savedRiskMatrices', JSON.stringify(formattedMatrices))
      }

      // Charger les instruments de couverture
      const instruments = await getHedgingInstruments()
      if (instruments && instruments.length > 0) {
        localStorage.setItem('hedgingInstruments', JSON.stringify(instruments))
      }

      setLastSync(new Date())
      setSyncStatus('success')
      
      toast({
        title: "Données chargées",
        description: "Les données ont été chargées depuis Supabase",
      })

      if (onDataLoaded) {
        onDataLoaded({ timestamp: new Date() })
      }

    } catch (err) {
      console.error('Erreur lors du chargement:', err)
      setSyncStatus('error')
      
      toast({
        title: "Erreur de chargement",
        description: error || "Une erreur est survenue lors du chargement",
        variant: "destructive"
      })
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Supabase Synchronization
        </CardTitle>
        <CardDescription>
          Synchronize your data with the cloud database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statut de connexion */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <Badge variant="outline" className="text-green-600">
                <Cloud className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <Badge variant="outline" className="text-red-600">
                <CloudOff className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            </>
          )}
        </div>

        {/* Last synchronization */}
        {lastSync && (
          <div className="text-sm text-muted-foreground">
            Last synchronization: {lastSync.toLocaleString()}
          </div>
        )}

        {/* Erreur */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Boutons d'action */}
        <div className="flex gap-2">
          <Button
            onClick={syncToSupabase}
            disabled={!isConnected || loading}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Save
          </Button>
          
          <Button
            onClick={loadFromSupabase}
            disabled={!isConnected || loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Load
          </Button>
        </div>

        {/* Synchronization status */}
        {loading && (
          <div className="text-sm text-muted-foreground">
            Synchronizing...
          </div>
        )}

        {syncStatus === 'success' && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Synchronization successful!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
