import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  FileText, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Download, 
  Trash2, 
  Eye, 
  Search,
  RefreshCw,
  Archive,
  Activity,
  XCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SavedScenario } from '@/types/Scenario';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import ScenariosPdfExport from '@/components/ScenariosPdfExport';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import {
  createPdfDocument,
  addPageHeader,
  addSectionTitle,
  addBodyText,
  addElementAsImage,
  checkPageBreak,
  addPageFooter,
  formatBasicParams,
  formatStressTestParams,
  calculateVolatility,
  PDF_CONFIG,
  TABLE_OPTIONS,
  HTML2CANVAS_OPTIONS
} from '@/services/PdfService';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

// Interfaces pour les différents types de rapports
interface SavedRiskMatrix {
  id: string;
  name: string;
  timestamp: number;
  priceRanges: Array<{ min: number; max: number; probability: number }>;
  strategies: Array<{
    components: any[];
    coverageRatio: number;
    name: string;
  }>;
  results: Array<{
    strategy: any[];
    coverageRatio: number;
    costs: Record<string, number>;
    differences: Record<string, number>;
    hedgingCost: number;
    name: string;
  }>;
}

interface SavedBacktest {
  id: string;
  name: string;
  timestamp: number;
  type: 'historical' | 'stress-test' | 'scenario';
  params: any;
  results: any[];
  historicalData?: Array<{ date: string; price: number }>;
  monthlyStats?: Array<{
    month: string;
    avgPrice: number;
    volatility: number;
    dataPoints: number;
    calculationMethod: string;
  }>;
}

interface ReportStats {
  totalScenarios: number;
  totalRiskMatrices: number;
  totalBacktests: number;
  totalSize: number;
  lastUpdated: Date;
  scenariosByCurrency: Record<string, number>;
  scenariosByType: Record<string, number>;
  averageScenarioSize: number;
  oldestReport: Date;
  newestReport: Date;
}

// Add this interface for yearly results
interface YearlyResult {
  hedgedCost: number;
  unhedgedCost: number;
  deltaPnL: number;
  strategyPremium: number;
  volume: number;
}

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  
  // États pour les différents types de rapports
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [savedRiskMatrices, setSavedRiskMatrices] = useState<SavedRiskMatrix[]>([]);
  const [savedBacktests, setSavedBacktests] = useState<SavedBacktest[]>([]);
  const [reportStats, setReportStats] = useState<ReportStats>({
    totalScenarios: 0,
    totalRiskMatrices: 0,
    totalBacktests: 0,
    totalSize: 0,
    lastUpdated: new Date(),
    scenariosByCurrency: {},
    scenariosByType: {},
    averageScenarioSize: 0,
    oldestReport: new Date(),
    newestReport: new Date()
  });

  // États pour les dialogues
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, Record<string, boolean>>>({});

  // Charger tous les rapports au montage du composant
  useEffect(() => {
    loadAllReports();
  }, []);

  const loadAllReports = () => {
    try {
      // Charger les scénarios sauvegardés
      const scenariosData = localStorage.getItem('optionScenarios');
      const scenarios = scenariosData ? JSON.parse(scenariosData) : [];
      setSavedScenarios(scenarios);

      // Charger les matrices de risque
      const riskMatricesData = localStorage.getItem('savedRiskMatrices');
      const riskMatrices = riskMatricesData ? JSON.parse(riskMatricesData) : [];
      setSavedRiskMatrices(riskMatrices);

      // Charger les backtests (ils sont aussi dans optionScenarios mais marqués différemment)
      const backtests = scenarios.filter((scenario: SavedScenario) => 
        scenario.stressTest?.isHistorical || scenario.stressTest?.name === 'Historical Backtest'
      );
      setSavedBacktests(backtests);

      // Calculer les statistiques détaillées
      const totalSize = JSON.stringify(scenarios).length + 
                       JSON.stringify(riskMatrices).length + 
                       JSON.stringify(backtests).length;
      
      // Statistiques par devise
      const scenariosByCurrency: Record<string, number> = {};
      scenarios.forEach((scenario: SavedScenario) => {
        const currency = scenario.params.currencyPair?.symbol || 'Unknown';
        scenariosByCurrency[currency] = (scenariosByCurrency[currency] || 0) + 1;
      });

      // Statistiques par type de scénario
      const scenariosByType: Record<string, number> = {};
      scenarios.forEach((scenario: SavedScenario) => {
        const type = scenario.stressTest?.name || 'Base Calculation';
        scenariosByType[type] = (scenariosByType[type] || 0) + 1;
      });

      // Calculer les dates
      const allTimestamps = [
        ...scenarios.map(s => s.timestamp),
        ...riskMatrices.map(r => r.timestamp),
        ...backtests.map(b => b.timestamp)
      ];
      
      const oldestReport = allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : new Date();
      const newestReport = allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : new Date();
      
      // Taille moyenne des scénarios
      const averageScenarioSize = scenarios.length > 0 ? 
        scenarios.reduce((sum, s) => sum + JSON.stringify(s).length, 0) / scenarios.length : 0;
      
      setReportStats({
        totalScenarios: scenarios.length,
        totalRiskMatrices: riskMatrices.length,
        totalBacktests: backtests.length,
        totalSize,
        lastUpdated: new Date(),
        scenariosByCurrency,
        scenariosByType,
        averageScenarioSize,
        oldestReport,
        newestReport
      });
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  };

  // Fonctions utilitaires
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'scenario': return <FileText className="h-4 w-4" />;
      case 'risk-matrix': return <BarChart3 className="h-4 w-4" />;
      case 'backtest': return <TrendingUp className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getReportTypeColor = (type: string) => {
    switch (type) {
      case 'scenario': return 'bg-blue-100 text-blue-800';
      case 'risk-matrix': return 'bg-green-100 text-green-800';
      case 'backtest': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Fonctions de filtrage
  const filteredReports = () => {
    let reports = [
      ...savedScenarios.map(s => ({ ...s, type: 'scenario' })),
      ...savedRiskMatrices.map(r => ({ ...r, type: 'risk-matrix' })),
      ...savedBacktests.map(b => ({ ...b, type: 'backtest' }))
    ];

    // Filtre par recherche
    if (searchTerm) {
      reports = reports.filter(report => 
        report.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtre par type
    if (filterType !== 'all') {
      reports = reports.filter(report => report.type === filterType);
    }

    // Filtre par date
    if (dateRange !== 'all') {
      const now = Date.now();
      const ranges = {
        'today': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000,
        'year': 365 * 24 * 60 * 60 * 1000
      };
      
      if (ranges[dateRange as keyof typeof ranges]) {
        reports = reports.filter(report => 
          (now - report.timestamp) < ranges[dateRange as keyof typeof ranges]
        );
      }
    }

    return reports.sort((a, b) => b.timestamp - a.timestamp);
  };

  // Fonctions d'action
  const viewReport = (report: any) => {
    setSelectedReport(report);
    setIsViewDialogOpen(true);
  };

  const deleteReport = (report: any) => {
    setSelectedReport(report);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedReport) return;

    try {
      if (selectedReport.type === 'scenario') {
        const updatedScenarios = savedScenarios.filter(s => s.id !== selectedReport.id);
        setSavedScenarios(updatedScenarios);
        localStorage.setItem('optionScenarios', JSON.stringify(updatedScenarios));
      } else if (selectedReport.type === 'risk-matrix') {
        const updatedMatrices = savedRiskMatrices.filter(m => m.id !== selectedReport.id);
        setSavedRiskMatrices(updatedMatrices);
        localStorage.setItem('savedRiskMatrices', JSON.stringify(updatedMatrices));
      }

      loadAllReports(); // Recharger les statistiques
      setIsDeleteDialogOpen(false);
      setSelectedReport(null);
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  const exportReport = (report: any) => {
    // Utiliser la fonction PDF pour l'export
    exportToPdf(report);
  };

  const clearAllReports = () => {
    if (confirm('Are you sure you want to delete ALL reports? This action cannot be undone.')) {
      localStorage.removeItem('optionScenarios');
      localStorage.removeItem('savedRiskMatrices');
      loadAllReports();
    }
  };

  // Fonctions pour la sélection multiple
  const toggleReportSelection = (reportId: string) => {
    setSelectedReports(prev => 
      prev.includes(reportId) 
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const selectAllReports = () => {
    const allReportIds = filteredReports().map(report => `${report.type}-${report.id}`);
    setSelectedReports(allReportIds);
  };

  const clearSelection = () => {
    setSelectedReports([]);
  };

  const importReports = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        
        if (importData.reports && Array.isArray(importData.reports)) {
          // Importer les rapports
          importData.reports.forEach((report: any) => {
            if (report.type === 'scenario') {
              const existingScenarios = JSON.parse(localStorage.getItem('optionScenarios') || '[]');
              existingScenarios.push(report);
              localStorage.setItem('optionScenarios', JSON.stringify(existingScenarios));
            } else if (report.type === 'risk-matrix') {
              const existingMatrices = JSON.parse(localStorage.getItem('savedRiskMatrices') || '[]');
              existingMatrices.push(report);
              localStorage.setItem('savedRiskMatrices', JSON.stringify(existingMatrices));
            }
          });
          
          loadAllReports();
          alert(`Successfully imported ${importData.reports.length} reports`);
        }
      } catch (error) {
        console.error('Error importing reports:', error);
        alert('Error importing reports. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const exportSelectedReports = () => {
    if (selectedReports.length === 0) return;

    try {
      const reportsToExport = filteredReports().filter(report => 
        selectedReports.includes(`${report.type}-${report.id}`)
      );

      const exportData = {
        exportDate: new Date().toISOString(),
        totalReports: reportsToExport.length,
        reports: reportsToExport
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `reports_export_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error exporting selected reports:', error);
    }
  };

  // Fonctions pour la visualisation détaillée
  const initializeExpandedState = (reportId: string) => ({
    strategy: false,
    detailedResults: false,
    yearlyStats: false,
    totalStats: false,
    monthlyPnL: false
  });

  const toggleSection = (reportId: string, section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [reportId]: {
        ...(prev[reportId] || initializeExpandedState(reportId)),
        [section]: !(prev[reportId]?.[section] ?? false)
      }
    }));
  };

  const getScenarioTypeName = (scenario: SavedScenario) => {
    if (!scenario.stressTest) return 'Base Calculation';
    return scenario.stressTest.name;
  };

  // Formatage des nombres pour PDF - format cohérent et clair
  const formatNumber = (value: number, decimals: number = 0): string => {
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true
    });
  };

  const formatCurrency = (value: number, decimals: number = 2): string => {
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true
    });
  };

  const formatPercentage = (value: number, decimals: number = 2): string => {
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    return `${value.toFixed(decimals)}%`;
  };

  const formatVolume = (value: number): string => {
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    }
    return formatNumber(value, 0);
  };

  const calculateYearlyResults = (results: SavedScenario['results']): Record<string, YearlyResult> => {
    const yearlyData: Record<string, YearlyResult> = {};
    
    results.forEach(result => {
      const year = new Date(result.date).getFullYear().toString();
      
      if (!yearlyData[year]) {
        yearlyData[year] = {
          hedgedCost: 0,
          unhedgedCost: 0,
          deltaPnL: 0,
          strategyPremium: 0,
          volume: 0
        };
      }
      
      yearlyData[year].hedgedCost += result.hedgedCost;
      yearlyData[year].unhedgedCost += result.unhedgedCost;
      yearlyData[year].deltaPnL += result.deltaPnL;
      yearlyData[year].strategyPremium += result.strategyPrice * result.monthlyVolume;
      yearlyData[year].volume += result.monthlyVolume;
    });
    
    return yearlyData;
  };

  // Fonction pour générer les données du profil de couverture FX
  const generateFXHedgingData = (strategy: any[], spot: number, includePremium: boolean = false) => {
    const data = [];
    const minSpot = spot * 0.7;  // -30% du spot
    const maxSpot = spot * 1.3;  // +30% du spot
    const step = (maxSpot - minSpot) / 100; // 100 points

    for (let currentSpot = minSpot; currentSpot <= maxSpot; currentSpot += step) {
      const unhedgedRate = currentSpot;
      let hedgedRate = currentSpot;
      let totalPremium = 0;

      // Process each option in the strategy
      strategy.forEach(option => {
        const strike = option.strikeType === 'percent' 
          ? spot * (option.strike / 100) 
          : option.strike;
        
        // Utilise la quantité avec son signe (+ pour achat, - pour vente)
        const quantity = option.quantity / 100;
        
        // Calculate option premium (simplified)
        const premium = 0.01 * Math.abs(quantity); // Prime simplifiée, toujours positive
        
        if (option.type === 'put') {
          // PUT: La logique change selon achat ou vente
          if (currentSpot < strike) {
            // Dans la monnaie
            if (quantity > 0) {
              // ACHAT PUT: Protection contre la baisse
              hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
            } else if (quantity < 0) {
              // VENTE PUT: Obligation d'achat à un prix élevé
              hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
            }
          }
          // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
        } 
        else if (option.type === 'call') {
          // CALL: La logique change selon achat ou vente
          if (currentSpot > strike) {
            // Dans la monnaie
            if (quantity > 0) {
              // ACHAT CALL: Protection contre la hausse
              hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
            } else if (quantity < 0) {
              // VENTE CALL: Obligation de vente à un prix bas
              hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
            }
          }
          // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
        }
        else if (option.type === 'forward') {
          // FORWARD: Taux fixe peu importe le spot
          hedgedRate = strike * Math.abs(quantity) + currentSpot * (1 - Math.abs(quantity));
        }
        else if (option.type === 'swap') {
          // SWAP: Échange à taux fixe
          hedgedRate = strike;
        }
        
        // Barrier options (simplified logic)
        else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          const barrier = option.barrierType === 'percent' 
            ? spot * (option.barrier / 100) 
            : option.barrier;
          
          let isBarrierBroken = false;
          
          if (option.type.includes('knockout')) {
            if (option.type.includes('call')) {
              isBarrierBroken = currentSpot >= barrier;
            } else if (option.type.includes('put')) {
              isBarrierBroken = currentSpot <= barrier;
            }
          } else if (option.type.includes('knockin')) {
            if (option.type.includes('call')) {
              isBarrierBroken = currentSpot >= barrier;
            } else if (option.type.includes('put')) {
              isBarrierBroken = currentSpot <= barrier;
            }
          }
          
          if (isBarrierBroken) {
            if (option.type.includes('knockout')) {
              // Knockout: l'option expire
              hedgedRate = currentSpot;
            } else if (option.type.includes('knockin')) {
              // Knockin: l'option devient active
              if (option.type.includes('call') && currentSpot > strike) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (option.type.includes('put') && currentSpot < strike) {
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        }
        
        if (includePremium) {
          totalPremium += premium;
        }
      });
      
      data.push({
        spot: currentSpot,
        unhedged: unhedgedRate,
        hedged: hedgedRate,
        premium: totalPremium
      });
    }
    
    return data;
  };

  // Fonction helper pour générer un graphique P&L en Canvas
  const generatePnLChartCanvas = async (pdf: any, results: any[], yOffset: number, pageWidth: number, contentPadding: number): Promise<number> => {
    const pnlData = results.map((result: any) => ({
      month: new Date(result.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      pnl: result.deltaPnL
    }));

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    
    if (ctx && pnlData.length > 0) {
      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Border
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      // Title
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('P&L Evolution Over Time', canvas.width / 2, 30);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#6b7280';
      ctx.fillText('Monthly Delta P&L Performance', canvas.width / 2, 50);
      
      // Chart area
      const chartX = 70;
      const chartY = 80;
      const chartWidth = canvas.width - 140;
      const chartHeight = canvas.height - 140;
      
      // Grid
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = chartY + (i * chartHeight) / 5;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
      }
      
      // Y-axis
      const pnlValues = pnlData.map(d => d.pnl);
      const minPnL = Math.min(...pnlValues);
      const maxPnL = Math.max(...pnlValues);
      const range = maxPnL - minPnL || 1;
      
      // Zero line
      if (minPnL <= 0 && maxPnL >= 0) {
        const zeroY = chartY + chartHeight - ((0 - minPnL) / range) * chartHeight;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(chartX, zeroY);
        ctx.lineTo(chartX + chartWidth, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Zero label
        ctx.fillStyle = '#ef4444';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('0', chartX - 10, zeroY + 4);
      }
      
      // P&L line with gradient effect
      ctx.strokeStyle = '#8884d8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      
      pnlData.forEach((point, index) => {
        const x = chartX + (index * chartWidth) / Math.max(pnlData.length - 1, 1);
        const y = chartY + chartHeight - ((point.pnl - minPnL) / range) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      // Data points
      ctx.fillStyle = '#8884d8';
      pnlData.forEach((point, index) => {
        const x = chartX + (index * chartWidth) / Math.max(pnlData.length - 1, 1);
        const y = chartY + chartHeight - ((point.pnl - minPnL) / range) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const value = maxPnL - (i * range) / 5;
        const y = chartY + (i * chartHeight) / 5;
        ctx.fillText(formatNumber(value, 0), chartX - 10, y + 4);
      }
      
      // X-axis labels
      ctx.textAlign = 'center';
      const labelStep = Math.max(1, Math.floor(pnlData.length / 6));
      for (let i = 0; i < pnlData.length; i += labelStep) {
        const x = chartX + (i * chartWidth) / Math.max(pnlData.length - 1, 1);
        ctx.fillText(pnlData[i].month, x, chartY + chartHeight + 20);
      }
      
      // Axis labels
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Time Period', canvas.width / 2, canvas.height - 10);
      
      ctx.save();
      ctx.translate(20, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Delta P&L', 0, 0);
      ctx.restore();
      
      // Legend
      ctx.fillStyle = '#8884d8';
      ctx.beginPath();
      ctx.arc(canvas.width - 100, 25, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Delta P&L', canvas.width - 90, 29);
    }

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidth - (2 * contentPadding);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', contentPadding, yOffset, imgWidth, imgHeight);
    return yOffset + imgHeight + 10;
  };

  // Fonction helper pour générer un graphique FX Hedging en Canvas
  const generateFXHedgingChartCanvas = async (pdf: any, strategy: any[], spotPrice: number, yOffset: number, pageWidth: number, contentPadding: number): Promise<number> => {
    const hedgingData = generateFXHedgingData(strategy, spotPrice, false);
    
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    
    if (ctx && hedgingData.length > 0) {
      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Border
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      // Title
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('FX Hedging Profile', canvas.width / 2, 30);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#6b7280';
      ctx.fillText('Hedged vs Unhedged Rates Across Market Scenarios', canvas.width / 2, 50);
      
      // Chart area
      const chartX = 70;
      const chartY = 80;
      const chartWidth = canvas.width - 140;
      const chartHeight = canvas.height - 140;
      
      // Calculate scales
      const minSpot = Math.min(...hedgingData.map(d => d.spot));
      const maxSpot = Math.max(...hedgingData.map(d => d.spot));
      const minRate = Math.min(...hedgingData.map(d => Math.min(d.unhedged, d.hedged)));
      const maxRate = Math.max(...hedgingData.map(d => Math.max(d.unhedged, d.hedged)));
      const rateRange = maxRate - minRate || 1;
      
      const xScale = chartWidth / (maxSpot - minSpot);
      const yScale = chartHeight / rateRange;
      
      // Grid
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = chartY + (i * chartHeight) / 5;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 10; i++) {
        const x = chartX + (i * chartWidth) / 10;
        ctx.beginPath();
        ctx.moveTo(x, chartY);
        ctx.lineTo(x, chartY + chartHeight);
        ctx.stroke();
      }
      
      // Current spot line
      const currentSpotX = chartX + ((spotPrice - minSpot) * xScale);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(currentSpotX, chartY);
      ctx.lineTo(currentSpotX, chartY + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Current spot label
      ctx.fillStyle = '#10b981';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Current: ${spotPrice.toFixed(4)}`, currentSpotX, chartY - 5);
      
      // Unhedged line (dashed gray)
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      
      hedgingData.forEach((point, index) => {
        const x = chartX + ((point.spot - minSpot) * xScale);
        const y = chartY + chartHeight - ((point.unhedged - minRate) * yScale);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Hedged line (solid blue)
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      hedgingData.forEach((point, index) => {
        const x = chartX + ((point.spot - minSpot) * xScale);
        const y = chartY + chartHeight - ((point.hedged - minRate) * yScale);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      // Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const value = maxRate - (i * rateRange) / 5;
        const y = chartY + (i * chartHeight) / 5;
        ctx.fillText(value.toFixed(4), chartX - 10, y + 4);
      }
      
      // X-axis labels
      ctx.textAlign = 'center';
      for (let i = 0; i <= 5; i++) {
        const value = minSpot + (i * (maxSpot - minSpot)) / 5;
        const x = chartX + (i * chartWidth) / 5;
        ctx.fillText(value.toFixed(4), x, chartY + chartHeight + 20);
      }
      
      // Legend box
      const legendX = canvas.width - 180;
      const legendY = chartY + 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.fillRect(legendX, legendY, 160, 80);
      ctx.strokeRect(legendX, legendY, 160, 80);
      
      // Legend items
      ctx.fillStyle = '#374151';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      
      // Unhedged
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(legendX + 10, legendY + 25);
      ctx.lineTo(legendX + 35, legendY + 25);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('Unhedged Rate', legendX + 45, legendY + 29);
      
      // Hedged
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(legendX + 10, legendY + 45);
      ctx.lineTo(legendX + 35, legendY + 45);
      ctx.stroke();
      ctx.fillText('Hedged Rate', legendX + 45, legendY + 49);
      
      // Current spot
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(legendX + 10, legendY + 65);
      ctx.lineTo(legendX + 35, legendY + 65);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('Current Spot', legendX + 45, legendY + 69);
      
      // Axis labels
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('FX Rate', canvas.width / 2, canvas.height - 10);
      
      ctx.save();
      ctx.translate(20, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Effective Rate', 0, 0);
      ctx.restore();
    }

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidth - (2 * contentPadding);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', contentPadding, yOffset, imgWidth, imgHeight);
    return yOffset + imgHeight + 10;
  };

  // Fonction pour exporter en PDF - Version améliorée et professionnelle
  const exportToPdf = async (report: any) => {
    if (report.type === 'scenario') {
      const tempExport = async () => {
        const pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
          putOnlyUsedFonts: true,
          compress: true
        });

        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;
        const contentPadding = 15;
        let yOffset = contentPadding;
        let currentPage = 1;

        // Fonction pour ajouter une nouvelle page si nécessaire
        const checkPageBreak = (requiredSpace: number) => {
          if (yOffset + requiredSpace > pageHeight - 20) {
            pdf.addPage();
            yOffset = contentPadding;
            currentPage++;
            addPageHeader();
          }
        };

        // En-tête de page
        const addPageHeader = () => {
          // Header avec logo et titre
          pdf.setFillColor(30, 64, 175); // Blue-600
          pdf.rect(0, 0, pageWidth, 25, 'F');
          
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(255);
          pdf.setFontSize(16);
          pdf.text('FX HEDGING PLATFORM', contentPadding, 12);
          
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          pdf.text('Professional Risk Management Report', contentPadding, 18);
          
          // Ligne de séparation
          pdf.setDrawColor(200, 200, 200);
          pdf.line(contentPadding, 25, pageWidth - contentPadding, 25);
          
          yOffset = 35;
        };

        // En-tête principal du document
        addPageHeader();
        
        // Titre principal du rapport
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0);
        pdf.setFontSize(PDF_CONFIG.FONT_SIZES.TITLE);
        pdf.text(report.name, PDF_CONFIG.CONTENT_PADDING, yOffset);
        yOffset += 8;

        // Sous-titre avec métadonnées
        const scenarioType = getScenarioTypeName(report);
        yOffset = addBodyText(pdf, yOffset, `Scenario Type: ${scenarioType}`, { fontSize: PDF_CONFIG.FONT_SIZES.SUBTITLE, color: [100, 100, 100] });
        yOffset = addBodyText(pdf, yOffset, `Generated: ${new Date(report.timestamp).toLocaleString()}`, { fontSize: PDF_CONFIG.FONT_SIZES.SUBTITLE, color: [100, 100, 100] });
        yOffset = addBodyText(pdf, yOffset, `Report ID: ${report.id}`, { fontSize: PDF_CONFIG.FONT_SIZES.SUBTITLE, color: [100, 100, 100] });
        yOffset += 15;

        // Table des matières
        checkPageBreak(30);
        yOffset = addSectionTitle(pdf, yOffset, 'TABLE OF CONTENTS');

        const tocItems = [
          '1. Executive Summary',
          '2. Strategy Parameters',
          '3. Strategy Components',
          '4. Risk Analysis',
          '5. Detailed Results',
          '6. Performance Metrics',
          '7. Summary Statistics'
        ];

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(PDF_CONFIG.FONT_SIZES.BODY);
        tocItems.forEach((item) => {
          pdf.text(item, PDF_CONFIG.CONTENT_PADDING + 5, yOffset);
          yOffset += 4;
        });
        yOffset += 10;

        // 1. Executive Summary
        checkPageBreak(40);
        yOffset = addSectionTitle(pdf, yOffset, '1. EXECUTIVE SUMMARY');

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(PDF_CONFIG.FONT_SIZES.BODY);
        const totalPnL = report.results?.reduce((sum: number, r: any) => sum + r.deltaPnL, 0) || 0;
        const totalVolume = report.results?.reduce((sum: number, r: any) => sum + r.monthlyVolume, 0) || 0;
        const avgHedgedCost = report.results?.reduce((sum: number, r: any) => sum + r.hedgedCost, 0) / (report.results?.length || 1) || 0;
        const avgUnhedgedCost = report.results?.reduce((sum: number, r: any) => sum + r.unhedgedCost, 0) / (report.results?.length || 1) || 0;
        const costReduction = avgUnhedgedCost !== 0 ? ((totalPnL / Math.abs(avgUnhedgedCost)) * 100) : 0;

        const summaryText = [
          `This report presents a comprehensive analysis of the "${report.name}" hedging strategy.`,
          `The strategy covers ${report.params.monthsToHedge} months with a total volume of ${formatVolume(totalVolume)} units.`,
          `Key performance metrics:`,
          `• Total P&L: ${formatCurrency(totalPnL)}`,
          `• Average Hedged Cost: ${formatCurrency(avgHedgedCost)}`,
          `• Average Unhedged Cost: ${formatCurrency(avgUnhedgedCost)}`,
          `• Cost Reduction: ${formatPercentage(costReduction)}`,
          `• Strategy Components: ${report.strategy?.length || 0} instrument${(report.strategy?.length || 0) !== 1 ? 's' : ''}`
        ];

        summaryText.forEach(line => {
          pdf.text(line, contentPadding + 5, yOffset);
          yOffset += 4;
        });
        yOffset += 10;

        // 2. Strategy Parameters
        checkPageBreak(50);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text('2. STRATEGY PARAMETERS', contentPadding, yOffset);
        yOffset += 8;

        // Calculer la largeur disponible pour les tableaux
        const availableWidth = pageWidth - (2 * contentPadding);
        
        const tableOptions = {
          headStyles: { 
            fillColor: [30, 64, 175],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 10
          },
          bodyStyles: {
            fontSize: 9,
            cellPadding: 3,
            halign: 'left'
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          margin: { 
            left: contentPadding,
            right: contentPadding,
            top: 2,
            bottom: 2
          },
          tableWidth: availableWidth
        };

        const basicParams = [
          ['Parameter', 'Value', 'Description'],
          ['Start Date', report.params.startDate, 'Hedging start date'],
          ['Months to Hedge', report.params.monthsToHedge.toString(), 'Hedging period in months'],
          ['Interest Rate', `${report.params.interestRate}%`, 'Risk-free interest rate'],
          ['Currency Pair', report.params.currencyPair?.symbol || 'N/A', 'Trading currency pair']
        ];

        if (report.params.baseVolume && report.params.quoteVolume) {
          basicParams.push(
            [`Base Volume (${report.params.currencyPair?.base || 'BASE'})`, formatNumber(report.params.baseVolume, 0), 'Base currency volume'],
            [`Quote Volume (${report.params.currencyPair?.quote || 'QUOTE'})`, formatNumber(Math.round(report.params.quoteVolume), 0), 'Quote currency volume'],
            ['Spot Price', report.params.spotPrice ? formatNumber(report.params.spotPrice, 4) : 'N/A', 'Current spot exchange rate']
          );
        } else {
          basicParams.push(
            ['Total Volume', report.params.totalVolume ? formatNumber(report.params.totalVolume, 0) : 'N/A', 'Total hedging volume'],
            ['Spot Price', report.params.spotPrice ? formatNumber(report.params.spotPrice, 4) : 'N/A', 'Current spot exchange rate']
          );
        }

        pdf.autoTable({
          ...tableOptions,
          startY: yOffset,
          head: [basicParams[0]],
          body: basicParams.slice(1)
        });

        yOffset = (pdf as any).lastAutoTable.finalY + 10;

        // 3. Strategy Components
        if (report.strategy && report.strategy.length > 0) {
          checkPageBreak(40);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.text('3. STRATEGY COMPONENTS', contentPadding, yOffset);
          yOffset += 8;

          const strategyData = report.strategy.map((comp: any, index: number) => [
            `Component ${index + 1}`,
            comp.type.toUpperCase(),
            comp.strikeType === 'percent' ? formatPercentage(comp.strike, 1) : formatNumber(comp.strike, 4),
            formatPercentage(comp.volatility, 1),
            formatPercentage(comp.quantity, 1),
            comp.barrier ? (comp.barrierType === 'percent' ? formatPercentage(comp.barrier, 1) : formatNumber(comp.barrier, 4)) : 'N/A'
          ]);

          pdf.autoTable({
            ...TABLE_OPTIONS.standard,
            startY: yOffset,
            head: [['Component', 'Type', 'Strike', 'Volatility', 'Quantity', 'Barrier']],
            body: strategyData,
            tableWidth: availableWidth,
            columnStyles: {
              0: { cellWidth: availableWidth * 0.15 },
              1: { cellWidth: availableWidth * 0.12 },
              2: { cellWidth: availableWidth * 0.15 },
              3: { cellWidth: availableWidth * 0.15 },
              4: { cellWidth: availableWidth * 0.15 },
              5: { cellWidth: availableWidth * 0.18 }
            }
          });

          yOffset = (pdf as any).lastAutoTable.finalY + 10;
        }

        // 4. Risk Analysis (Stress Test)
        if (report.stressTest) {
          checkPageBreak(30);
          yOffset = addSectionTitle(pdf, yOffset, '4. RISK ANALYSIS');

          const stressParams = formatStressTestParams(report.stressTest);

          pdf.autoTable({
            ...TABLE_OPTIONS.standard,
            startY: yOffset,
            head: [stressParams[0]],
            body: stressParams.slice(1),
            tableWidth: availableWidth / 2
          });

          yOffset = (pdf as any).lastAutoTable.finalY + 10;
        }

        // 5. Detailed Results
        if (report.results && report.results.length > 0) {
          checkPageBreak(30);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.text('5. DETAILED RESULTS', contentPadding, yOffset);
          yOffset += 8;

          // Résultats par année
          const yearlyResults = calculateYearlyResults(report.results);
          const yearlyData = Object.entries(yearlyResults).map(([year, data]) => [
            year,
            formatNumber(data.volume, 0),
            formatCurrency(data.strategyPremium),
            formatCurrency(data.hedgedCost),
            formatCurrency(data.unhedgedCost),
            formatCurrency(data.deltaPnL),
            formatPercentage((data.deltaPnL / Math.abs(data.unhedgedCost)) * 100)
          ]);

          pdf.autoTable({
            ...TABLE_OPTIONS.standard,
            startY: yOffset,
            head: [['Year', 'Volume', 'Strategy Premium', 'Hedged Cost', 'Unhedged Cost', 'Delta P&L', 'Cost Reduction %']],
            body: yearlyData,
            tableWidth: availableWidth,
            columnStyles: {
              0: { cellWidth: availableWidth * 0.08, halign: 'center' },
              1: { cellWidth: availableWidth * 0.15, halign: 'right' },
              2: { cellWidth: availableWidth * 0.15, halign: 'right' },
              3: { cellWidth: availableWidth * 0.15, halign: 'right' },
              4: { cellWidth: availableWidth * 0.15, halign: 'right' },
              5: { cellWidth: availableWidth * 0.15, halign: 'right' },
              6: { cellWidth: availableWidth * 0.12, halign: 'right' }
            }
          });

          yOffset = (pdf as any).lastAutoTable.finalY + 10;

          // Graphique P&L Evolution - Essayer de capturer depuis Strategy Builder
          checkPageBreak(80);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(PDF_CONFIG.FONT_SIZES.SUBTITLE);
          pdf.text('P&L Evolution Chart', PDF_CONFIG.CONTENT_PADDING, yOffset);
          yOffset += 6;

          try {
            // Essayer de capturer le graphique depuis Strategy Builder
            const pnlChartElement = document.getElementById('strategy-builder-pnl-chart');
            
            if (pnlChartElement) {
              const result = await addElementAsImage(
                pdf,
                pnlChartElement,
                PDF_CONFIG.CONTENT_PADDING,
                yOffset,
                { maxWidth: pageWidth - 2 * PDF_CONFIG.CONTENT_PADDING, quality: 'highQuality' }
              );
              if (result.success) {
                yOffset = result.newY + 10;
              } else {
                // Fallback: Générer un graphique Canvas
                yOffset = await generatePnLChartCanvas(pdf, report.results, yOffset, pageWidth, contentPadding);
              }
            } else {
              // Fallback: Générer un graphique Canvas si Strategy Builder n'est pas ouvert
              yOffset = await generatePnLChartCanvas(pdf, report.results, yOffset, pageWidth, contentPadding);
            }
          } catch (error) {
            console.warn('Could not export P&L chart:', error);
            yOffset = addBodyText(pdf, yOffset, 'P&L Evolution Chart could not be generated', { fontSize: PDF_CONFIG.FONT_SIZES.BODY, color: [100, 100, 100] });
          }

          // Graphique FX Hedging Profile - Essayer de capturer depuis Strategy Builder
          checkPageBreak(80);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.text('FX Hedging Profile', contentPadding, yOffset);
          yOffset += 6;

          try {
            // Essayer de capturer le graphique depuis Strategy Builder
            const hedgingChartElement = document.getElementById('strategy-builder-fx-hedging-chart');
            
            if (hedgingChartElement) {
              const result = await addElementAsImage(
                pdf,
                hedgingChartElement,
                PDF_CONFIG.CONTENT_PADDING,
                yOffset,
                { maxWidth: pageWidth - 2 * PDF_CONFIG.CONTENT_PADDING, quality: 'highQuality' }
              );
              if (result.success) {
                yOffset = result.newY + 10;
              } else {
                // Fallback: Générer un graphique Canvas
                yOffset = await generateFXHedgingChartCanvas(pdf, report.strategy, report.params.spotPrice, yOffset, pageWidth, contentPadding);
              }
            } else {
              // Fallback: Générer un graphique Canvas si Strategy Builder n'est pas ouvert
              yOffset = await generateFXHedgingChartCanvas(pdf, report.strategy, report.params.spotPrice, yOffset, pageWidth, contentPadding);
            }
          } catch (error) {
            console.warn('Could not export FX Hedging chart:', error);
            yOffset = addBodyText(pdf, yOffset, 'FX Hedging Chart could not be generated', { fontSize: PDF_CONFIG.FONT_SIZES.BODY, color: [100, 100, 100] });
          }

          // Tableau détaillé (tous les résultats)
          checkPageBreak(50);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(PDF_CONFIG.FONT_SIZES.SUBTITLE);
          pdf.text(`Monthly Detailed Results (${report.results.length} periods)`, PDF_CONFIG.CONTENT_PADDING, yOffset);
          yOffset += 6;

          // Inclure toutes les colonnes disponibles
          const detailedData = report.results.map((result: any) => [
            new Date(result.date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            formatNumber(result.monthlyVolume, 0),
            result.forward ? formatNumber(result.forward, 4) : 'N/A',
            result.realPrice ? formatNumber(result.realPrice, 4) : 'N/A',
            formatNumber(result.strategyPrice, 4),
            result.totalPayoff !== undefined ? formatCurrency(result.totalPayoff) : 'N/A',
            formatCurrency(result.hedgedCost),
            formatCurrency(result.unhedgedCost),
            formatCurrency(result.deltaPnL)
          ]);

          // Pour le tableau détaillé avec 9 colonnes, utiliser des largeurs proportionnelles
          pdf.autoTable({
            ...tableOptions,
            startY: yOffset,
            head: [['Date', 'Volume', 'Forward', 'Real Price', 'Strategy Price', 'Payoff', 'Hedged Cost', 'Unhedged Cost', 'Delta P&L']],
            body: detailedData,
            tableWidth: availableWidth,
            headStyles: { ...tableOptions.headStyles, fontSize: 8 },
            bodyStyles: { ...tableOptions.bodyStyles, fontSize: 7 },
            columnStyles: {
              0: { cellWidth: availableWidth * 0.10, halign: 'center' },
              1: { cellWidth: availableWidth * 0.11, halign: 'right' },
              2: { cellWidth: availableWidth * 0.10, halign: 'right' },
              3: { cellWidth: availableWidth * 0.10, halign: 'right' },
              4: { cellWidth: availableWidth * 0.11, halign: 'right' },
              5: { cellWidth: availableWidth * 0.11, halign: 'right' },
              6: { cellWidth: availableWidth * 0.12, halign: 'right' },
              7: { cellWidth: availableWidth * 0.12, halign: 'right' },
              8: { cellWidth: availableWidth * 0.11, halign: 'right' }
            },
            styles: {
              fontSize: 7,
              cellPadding: 2,
              overflow: 'linebreak'
            }
          });

          yOffset = (pdf as any).lastAutoTable.finalY + 10;
        }

        // 6. Performance Metrics
        checkPageBreak(40);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text('6. PERFORMANCE METRICS', contentPadding, yOffset);
        yOffset += 8;

        const totalHedgedCost = report.results?.reduce((sum: number, r: any) => sum + r.hedgedCost, 0) || 0;
        const totalUnhedgedCost = report.results?.reduce((sum: number, r: any) => sum + r.unhedgedCost, 0) || 0;
        const totalStrategyPremium = report.results?.reduce((sum: number, r: any) => sum + (r.strategyPrice * r.monthlyVolume), 0) || 0;
        const strikeTarget = totalVolume > 0 ? Math.abs(totalHedgedCost) / totalVolume : 0;

        const metricsData = [
          ['Metric', 'Value', 'Description'],
          ['Total Hedged Cost', formatCurrency(totalHedgedCost), 'Total cost with hedging strategy'],
          ['Total Unhedged Cost', formatCurrency(totalUnhedgedCost), 'Total cost without hedging'],
          ['Total P&L', formatCurrency(totalPnL), 'Net profit/loss from hedging'],
          ['Total Strategy Premium', formatCurrency(totalStrategyPremium), 'Total premium paid for strategy'],
          ['Strike Target', formatNumber(strikeTarget, 4), 'Effective strike rate achieved'],
          ['Cost Reduction %', formatPercentage(costReduction), 'Percentage cost reduction achieved']
        ];

        pdf.autoTable({
          ...TABLE_OPTIONS.standard,
          startY: yOffset,
          head: [metricsData[0]],
          body: metricsData.slice(1),
          tableWidth: availableWidth
        });

        yOffset = (pdf as any).lastAutoTable.finalY + 10;

        // 7. Summary Statistics
        checkPageBreak(30);
        yOffset = addSectionTitle(pdf, yOffset, '7. SUMMARY STATISTICS');

        const avgStrategyPrice = report.results?.length > 0 
          ? report.results.reduce((sum: number, r: any) => sum + r.strategyPrice, 0) / report.results.length 
          : 0;
        const bestMonthPnL = report.results?.length > 0 
          ? Math.max(...report.results.map((r: any) => r.deltaPnL)) 
          : 0;
        const worstMonthPnL = report.results?.length > 0 
          ? Math.min(...report.results.map((r: any) => r.deltaPnL)) 
          : 0;
        const pnlVolatility = report.results?.length > 1 
          ? calculateVolatility(report.results.map((r: any) => r.deltaPnL)) 
          : 0;

        const summaryData = [
          ['Statistic', 'Value'],
          ['Total Periods', (report.results?.length || 0).toString()],
          ['Average Monthly Volume', totalVolume > 0 ? formatNumber(totalVolume / (report.results?.length || 1), 0) : 'N/A'],
          ['Average Strategy Price', report.results?.length > 0 ? formatNumber(avgStrategyPrice, 4) : 'N/A'],
          ['Best Month P&L', report.results?.length > 0 ? formatCurrency(bestMonthPnL) : 'N/A'],
          ['Worst Month P&L', report.results?.length > 0 ? formatCurrency(worstMonthPnL) : 'N/A'],
          ['Volatility of P&L', report.results?.length > 1 ? formatCurrency(pnlVolatility) : 'N/A']
        ];

        const availableWidthSummary = pageWidth - (2 * contentPadding);
        pdf.autoTable({
          ...tableOptions,
          startY: yOffset,
          head: [summaryData[0]],
          body: summaryData.slice(1),
          tableWidth: availableWidthSummary / 2,
          columnStyles: {
            0: { cellWidth: (availableWidthSummary / 2) * 0.55, halign: 'left', fontStyle: 'bold' },
            1: { cellWidth: (availableWidthSummary / 2) * 0.45, halign: 'right' }
          }
        });

        // Footer avec informations de page
        const addFooter = () => {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Page ${currentPage}`, pageWidth - 30, pageHeight - 10);
          pdf.text('FX Hedging Platform - Professional Report', contentPadding, pageHeight - 10);
        };

        addFooter();

        pdf.save(`${report.name.replace(/[^a-z0-9]/gi, '_')}_professional_report.pdf`);
      };

      tempExport();
    } else if (report.type === 'risk-matrix') {
      // Export amélioré pour les matrices de risque
      const pdf = createPdfDocument({ orientation: 'l' });
      const pageWidth = pdf.internal.pageSize.width;
      const contentPadding = PDF_CONFIG.CONTENT_PADDING;
      let yOffset = addPageHeader(pdf, 'RISK MATRIX ANALYSIS', `Matrix: ${report.name}`);

      // Informations générales
      yOffset = addSectionTitle(pdf, yOffset, 'MATRIX OVERVIEW');

      const overviewData = [
        ['Parameter', 'Value'],
        ['Matrix Name', report.name],
        ['Number of Strategies', report.strategies?.length || 0],
        ['Number of Price Ranges', report.priceRanges?.length || 0],
        ['Created', new Date(report.timestamp).toLocaleString()]
      ];

      const availableWidthRisk = pageWidth - (2 * contentPadding);
      pdf.autoTable({
        startY: yOffset,
        head: [overviewData[0]],
        body: overviewData.slice(1),
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        tableWidth: availableWidthRisk / 2,
        columnStyles: {
          0: { cellWidth: (availableWidthRisk / 2) * 0.55, halign: 'left', fontStyle: 'bold' },
          1: { cellWidth: (availableWidthRisk / 2) * 0.45, halign: 'left' }
        }
      });

      yOffset = (pdf as any).lastAutoTable.finalY + 10;

      // Détails des stratégies
      if (report.strategies && report.strategies.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text('STRATEGIES ANALYZED', contentPadding, yOffset);
        yOffset += 6;

        const strategiesData = report.strategies.map((strategy: any, index: number) => [
          `Strategy ${index + 1}`,
          strategy.name || `Strategy ${index + 1}`,
          strategy.components?.length || 0,
          `${strategy.coverageRatio?.toFixed(2) || 'N/A'}%`
        ]);

        pdf.autoTable({
          ...TABLE_OPTIONS.standard,
          startY: yOffset,
          head: [['ID', 'Name', 'Components', 'Coverage Ratio']],
          body: strategiesData,
          tableWidth: availableWidthRisk,
          columnStyles: {
            0: { cellWidth: availableWidthRisk * 0.10, halign: 'center' },
            1: { cellWidth: availableWidthRisk * 0.40, halign: 'left' },
            2: { cellWidth: availableWidthRisk * 0.20, halign: 'center' },
            3: { cellWidth: availableWidthRisk * 0.20, halign: 'right' }
          }
        });
      }

      pdf.save(`${report.name.replace(/[^a-z0-9]/gi, '_')}_risk_matrix.pdf`);
    } else if (report.type === 'backtest') {
      // Export amélioré pour les backtests
      const pdf = createPdfDocument();
      const pageWidth = pdf.internal.pageSize.width;
      const contentPaddingBacktest = PDF_CONFIG.CONTENT_PADDING;
      const availableWidthBacktest = pageWidth - (2 * contentPaddingBacktest);
      let yOffset = addPageHeader(pdf, 'HISTORICAL BACKTEST REPORT', `Backtest: ${report.name}`);

      // Résumé du backtest
      yOffset = addSectionTitle(pdf, yOffset, 'BACKTEST SUMMARY');

      const backtestData = [
        ['Parameter', 'Value'],
        ['Backtest Name', report.name],
        ['Type', report.type || 'Historical'],
        ['Historical Data Points', report.historicalData?.length || 0],
        ['Analysis Periods', report.results?.length || 0],
        ['Created', new Date(report.timestamp).toLocaleString()]
      ];

      pdf.autoTable({
        startY: yOffset,
        head: [backtestData[0]],
        body: backtestData.slice(1),
        tableWidth: availableWidthBacktest / 2,
        columnStyles: {
          0: { cellWidth: (availableWidthBacktest / 2) * 0.55, halign: 'left', fontStyle: 'bold' },
          1: { cellWidth: (availableWidthBacktest / 2) * 0.45, halign: 'left' }
        },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 }
      });

      pdf.save(`${report.name.replace(/[^a-z0-9]/gi, '_')}_backtest_report.pdf`);
    }
  };

  // calculateVolatility is now imported from PdfService


  return (
    <Layout 
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Reports" }
      ]}
    >
      {/* Header avec statistiques */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground">
              View and manage all saved reports, scenarios, and analytics
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadAllReports}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={importReports}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="import-reports"
              />
              <Button variant="outline" asChild>
                <label htmlFor="import-reports" className="cursor-pointer">
                  <Archive className="h-4 w-4 mr-2" />
                  Import
                </label>
              </Button>
            </div>
            {selectedReports.length > 0 && (
              <>
                <Button variant="outline" onClick={exportSelectedReports}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected ({selectedReports.length})
                </Button>
                <Button variant="outline" onClick={clearSelection}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Selection
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={clearAllReports}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Statistiques générales */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Scenarios</p>
                  <p className="text-2xl font-bold">{reportStats.totalScenarios}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Risk Matrices</p>
                  <p className="text-2xl font-bold">{reportStats.totalRiskMatrices}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Backtests</p>
                  <p className="text-2xl font-bold">{reportStats.totalBacktests}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Size</p>
                  <p className="text-2xl font-bold">{formatFileSize(reportStats.totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                  <p className="text-sm font-bold">{reportStats.lastUpdated.toLocaleTimeString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Statistiques détaillées */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Currency Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(reportStats.scenariosByCurrency).map(([currency, count]) => (
                  <div key={currency} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{currency}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
                {Object.keys(reportStats.scenariosByCurrency).length === 0 && (
                  <p className="text-sm text-muted-foreground">No scenarios found</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scenario Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(reportStats.scenariosByType).map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{type}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
                {Object.keys(reportStats.scenariosByType).length === 0 && (
                  <p className="text-sm text-muted-foreground">No scenarios found</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Oldest Report</span>
                  <span className="text-sm">{reportStats.oldestReport.toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Newest Report</span>
                  <span className="text-sm">{reportStats.newestReport.toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Avg Size</span>
                  <span className="text-sm">{formatFileSize(reportStats.averageScenarioSize)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtres et recherche */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">All Types</option>
                <option value="scenario">Scenarios</option>
                <option value="risk-matrix">Risk Matrices</option>
                <option value="backtest">Backtests</option>
              </select>

              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onglets principaux */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="risk-matrices">Risk Matrices</TabsTrigger>
          <TabsTrigger value="backtests">Backtests</TabsTrigger>
        </TabsList>

        {/* Vue d'ensemble */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Reports</CardTitle>
              <CardDescription>
                Complete list of all saved reports and analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Checkbox
                  checked={selectedReports.length === filteredReports().length && filteredReports().length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      selectAllReports();
                    } else {
                      clearSelection();
                    }
                  }}
                  id="select-all-reports"
                />
                <Label htmlFor="select-all-reports">Select All</Label>
                {selectedReports.length > 0 && (
                  <Badge variant="secondary">
                    {selectedReports.length} selected
                  </Badge>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedReports.length === filteredReports().length && filteredReports().length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selectAllReports();
                          } else {
                            clearSelection();
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports().map((report) => (
                    <TableRow key={`${report.type}-${report.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedReports.includes(`${report.type}-${report.id}`)}
                          onCheckedChange={() => toggleReportSelection(`${report.type}-${report.id}`)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getReportTypeIcon(report.type)}
                          {report.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getReportTypeColor(report.type)}>
                          {report.type.replace('-', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(report.timestamp)}</TableCell>
                      <TableCell>{formatFileSize(JSON.stringify(report).length)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewReport(report)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportReport(report)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteReport(report)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scénarios */}
        <TabsContent value="scenarios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved Scenarios</CardTitle>
              <CardDescription>
                Strategy scenarios with detailed calculations and results
              </CardDescription>
            </CardHeader>
            <CardContent>
              {savedScenarios.length === 0 ? (
                <div className="p-6 text-center">
                  <p>No saved scenarios found.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <ScenariosPdfExport
                    scenarios={savedScenarios}
                    selectedScenarios={selectedReports.filter(id => id.includes('scenario-'))}
                    setSelectedScenarios={(ids) => setSelectedReports(ids)}
                  />
                  {savedScenarios.map(scenario => (
                    <Card key={scenario.id} className="mb-6">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>{scenario.name}</CardTitle>
                          <p className="text-sm text-gray-500">{formatDate(scenario.timestamp)}</p>
                          <p className="text-sm font-medium mt-1">Type: {getScenarioTypeName(scenario)}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => exportToPdf({ ...scenario, type: 'scenario' })}
                            className="flex items-center gap-2"
                          >
                            <Download size={16} /> Export PDF
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => deleteReport({ ...scenario, type: 'scenario' })}
                            className="flex items-center gap-2"
                          >
                            <Trash2 size={16} /> Delete
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <h3 className="font-semibold mb-2">Basic Parameters</h3>
                            <ul className="space-y-1">
                              <li>Start Date: {scenario.params.startDate}</li>
                              <li>Months to Hedge: {scenario.params.monthsToHedge}</li>
                              <li>Interest Rate: {scenario.params.interestRate}%</li>
                              {scenario.params.baseVolume && scenario.params.quoteVolume ? (
                                <>
                                  <li>Base Volume ({scenario.params.currencyPair?.base || 'BASE'}): {scenario.params.baseVolume.toLocaleString()}</li>
                                  <li>Quote Volume ({scenario.params.currencyPair?.quote || 'QUOTE'}): {Math.round(scenario.params.quoteVolume).toLocaleString()}</li>
                                  <li>Rate: {scenario.params.spotPrice?.toFixed(4)}</li>
                                </>
                              ) : (
                                <>
                                  <li>Total Volume: {scenario.params.totalVolume?.toLocaleString()}</li>
                                  <li>Spot Price: {scenario.params.spotPrice}</li>
                                </>
                              )}
                            </ul>
                          </div>
                          {scenario.stressTest && (
                            <div>
                              <h3 className="font-semibold mb-2">Stress Test Parameters</h3>
                              <ul className="space-y-1">
                                <li>Volatility: {(scenario.stressTest.volatility * 100).toFixed(1)}%</li>
                                <li>Drift: {(scenario.stressTest.drift * 100).toFixed(1)}%</li>
                                <li>Price Shock: {(scenario.stressTest.priceShock * 100).toFixed(1)}%</li>
                                {scenario.stressTest.forwardBasis && (
                                  <li>Forward Basis: {(scenario.stressTest.forwardBasis * 100).toFixed(1)}%</li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>

                        <div className="mb-6">
                          <Button
                            variant="outline"
                            onClick={() => toggleSection(scenario.id, 'strategy')}
                            className="flex items-center gap-2 mb-2"
                          >
                            {expandedSections[scenario.id]?.strategy ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Strategy Components
                          </Button>
                          
                          {expandedSections[scenario.id]?.strategy && (
                            <div className="mt-2">
                              {scenario.strategy.map((option, index) => (
                                <div key={index} className="grid grid-cols-5 gap-4 p-2 border-b">
                                  <div>Type: {option.type}</div>
                                  <div>Strike: {option.strike} ({option.strikeType})</div>
                                  <div>Volatility: {option.volatility}%</div>
                                  <div>Quantity: {option.quantity}%</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-6">
                          <div className="h-64" id={`pnl-chart-${scenario.id}`}>
                            <h3 className="font-semibold mb-2">P&L Evolution</h3>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={scenario.results}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="deltaPnL" name="Delta P&L" stroke="#8884d8" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="h-80" id={`fx-hedging-chart-${scenario.id}`}>
                            <h3 className="font-semibold mb-2">FX Hedging Profile</h3>
                            <div className="text-sm text-muted-foreground mb-2">
                              Hedged vs Unhedged {scenario.params.currencyPair?.symbol || 'FX'} rates across market scenarios
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart 
                                data={generateFXHedgingData(scenario.strategy, scenario.params.spotPrice, false)}
                                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis
                                  dataKey="spot"
                                  domain={["dataMin", "dataMax"]}
                                  tickFormatter={(value) => value.toFixed(3)}
                                  label={{
                                    value: `${scenario.params.currencyPair?.symbol || 'FX'} Rate`,
                                    position: "insideBottom",
                                    offset: -10,
                                  }}
                                />
                                <YAxis
                                  tickFormatter={(value) => value.toFixed(3)}
                                  label={{
                                    value: `Effective Rate (${scenario.params.currencyPair?.quote || 'Quote Currency'})`,
                                    angle: -90,
                                    position: "insideLeft",
                                  }}
                                />
                                <Tooltip />
                                <Legend 
                                  verticalAlign="top" 
                                  height={36}
                                />
                                
                                {/* Unhedged rate line (reference) */}
                                <Line
                                  type="monotone"
                                  dataKey="unhedgedRate"
                                  stroke="#9CA3AF"
                                  strokeWidth={2}
                                  strokeDasharray="4 4"
                                  dot={false}
                                  name="Unhedged Rate"
                                />
                                
                                {/* Hedged rate line */}
                                <Line
                                  type="monotone"
                                  dataKey="hedgedRate"
                                  stroke="#3B82F6"
                                  strokeWidth={3}
                                  dot={false}
                                  activeDot={{ r: 6, fill: "#3B82F6" }}
                                  name="Hedged Rate"
                                />
                                
                                {/* Reference line for current spot */}
                                <ReferenceLine
                                  x={scenario.params.spotPrice}
                                  stroke="#059669"
                                  strokeWidth={2}
                                  strokeDasharray="5 5"
                                  label={{
                                    value: "Current Spot",
                                    position: "top",
                                    fill: "#059669",
                                    fontSize: 11,
                                  }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="mt-6">
                          <Button
                            variant="outline"
                            onClick={() => toggleSection(scenario.id, 'detailedResults')}
                            className="flex items-center gap-2 mb-2"
                          >
                            {expandedSections[scenario.id]?.detailedResults ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Detailed Results
                          </Button>
                          
                          {expandedSections[scenario.id]?.detailedResults && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full border-collapse">
                                <thead>
                                  <tr>
                                    <th className="border p-2">Maturity</th>
                                    <th className="border p-2">Time to Maturity</th>
                                    <th className="border p-2">Forward Price</th>
                                    <th className="border p-2">Real Price</th>
                                    <th className="border p-2">IV (%)</th>
                                    {scenario.results[0]?.optionPrices?.map((option, idx) => (
                                      <th key={idx} className="border p-2">{option.label || `${option.type.charAt(0).toUpperCase() + option.type.slice(1)} Price ${idx + 1}`}</th>
                                    ))}
                                    <th className="border p-2">Strategy Price</th>
                                    <th className="border p-2">Payoff</th>
                                    <th className="border p-2">Volume</th>
                                    <th className="border p-2">Hedged Cost</th>
                                    <th className="border p-2">Unhedged Cost</th>
                                    <th className="border p-2">Delta P&L</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {scenario.results.map((row, i) => {
                                    // Récupération de la volatilité implicite pour cette date
                                    const date = row.date;
                                    let impliedVol = null;
                                    
                                    // 1. Vérifier si l'utilisateur a entré des valeurs manuelles d'IV
                                    if (scenario.useImpliedVol && scenario.impliedVolatilities && scenario.impliedVolatilities[date]) {
                                      impliedVol = scenario.impliedVolatilities[date];
                                    }
                                    // 2. Utiliser la volatilité de la stratégie comme dernier recours
                                    else if (scenario.strategy && scenario.strategy.length > 0) {
                                      impliedVol = scenario.strategy[0].volatility / 100;
                                    }
                                    
                                    return (
                                      <tr key={i}>
                                        <td className="border p-2">{row.date}</td>
                                        <td className="border p-2">{row.timeToMaturity.toFixed(4)}</td>
                                        <td className="border p-2">{row.forward.toFixed(4)}</td>
                                        <td className="border p-2">{row.realPrice.toFixed(4)}</td>
                                        <td className="border p-2">
                                          {impliedVol !== null 
                                            ? (impliedVol * 100).toFixed(0) 
                                            : ""}
                                        </td>
                                        {/* S'assurer que toutes les options sont affichées */}
                                        {row.optionPrices && Array.isArray(row.optionPrices) 
                                          ? row.optionPrices.map((option, idx) => (
                                              <td key={idx} className="border p-2">{option.price.toFixed(2)}</td>
                                            ))
                                          : scenario.strategy.map((_, idx) => (
                                              <td key={idx} className="border p-2">-</td>
                                            ))
                                        }
                                        <td className="border p-2">{row.strategyPrice.toFixed(2)}</td>
                                        <td className="border p-2">{row.totalPayoff.toFixed(2)}</td>
                                        <td className="border p-2">{row.monthlyVolume.toFixed(0)}</td>
                                        <td className="border p-2">{row.hedgedCost.toFixed(2)}</td>
                                        <td className="border p-2">{row.unhedgedCost.toFixed(2)}</td>
                                        <td className="border p-2">{row.deltaPnL.toFixed(2)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="mt-6">
                          <Button
                            variant="outline"
                            onClick={() => toggleSection(scenario.id, 'yearlyStats')}
                            className="flex items-center gap-2 mb-2"
                          >
                            {expandedSections[scenario.id]?.yearlyStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Summary Statistics by Year
                          </Button>
                          
                          {expandedSections[scenario.id]?.yearlyStats && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full border-collapse">
                                <thead>
                                  <tr>
                                    <th className="border p-2">Year</th>
                                    <th className="border p-2">Volume</th>
                                    <th className="border p-2">Strategy Premium</th>
                                    <th className="border p-2">Hedged Cost</th>
                                    <th className="border p-2">Unhedged Cost</th>
                                    <th className="border p-2">Delta P&L</th>
                                    <th className="border p-2">Cost Reduction (%)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(calculateYearlyResults(scenario.results)).map(([year, data]) => (
                                    <tr key={year}>
                                      <td className="border p-2">{year}</td>
                                      <td className="border p-2">{data.volume.toLocaleString()}</td>
                                      <td className="border p-2">{data.strategyPremium.toFixed(2)}</td>
                                      <td className="border p-2">{data.hedgedCost.toFixed(2)}</td>
                                      <td className="border p-2">{data.unhedgedCost.toFixed(2)}</td>
                                      <td className="border p-2">{data.deltaPnL.toFixed(2)}</td>
                                      <td className="border p-2">
                                        {((data.deltaPnL / Math.abs(data.unhedgedCost)) * 100).toFixed(2)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="mt-6">
                          <Button
                            variant="outline"
                            onClick={() => toggleSection(scenario.id, 'totalStats')}
                            className="flex items-center gap-2 mb-2"
                          >
                            {expandedSections[scenario.id]?.totalStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Total Summary Statistics
                          </Button>
                          
                          {expandedSections[scenario.id]?.totalStats && (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse">
                                <tbody>
                                  <tr>
                                    <td className="border p-2 font-medium">Total Cost with Hedging</td>
                                    <td className="border p-2 text-right">
                                      {scenario.results.reduce((sum, row) => sum + row.hedgedCost, 0).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="border p-2 font-medium">Total Cost without Hedging</td>
                                    <td className="border p-2 text-right">
                                      {scenario.results.reduce((sum, row) => sum + row.unhedgedCost, 0).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="border p-2 font-medium">Total P&L</td>
                                    <td className="border p-2 text-right">
                                      {scenario.results.reduce((sum, row) => sum + row.deltaPnL, 0).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="border p-2 font-medium">Total Strategy Premium</td>
                                    <td className="border p-2 text-right">
                                      {scenario.results.reduce((sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0).toFixed(2)}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="border p-2 font-medium">Cost Reduction (%)</td>
                                    <td className="border p-2 text-right">
                                      {(() => {
                                        const totalPnL = scenario.results.reduce((sum, row) => sum + row.deltaPnL, 0);
                                        const totalUnhedgedCost = scenario.results.reduce((sum, row) => sum + row.unhedgedCost, 0);
                                        return ((totalPnL / Math.abs(totalUnhedgedCost)) * 100).toFixed(2);
                                      })()}%
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="border p-2 font-medium">Strike Target</td>
                                    <td className="border p-2 text-right">
                                      {(() => {
                                        const totalHedgedCost = scenario.results.reduce((sum, row) => sum + row.hedgedCost, 0);
                                        const totalVolume = scenario.results.reduce((sum, row) => sum + row.monthlyVolume, 0);
                                        return totalVolume > 0 
                                          ? Number(Math.abs(totalHedgedCost) / totalVolume).toFixed(2)
                                          : 'N/A';
                                      })()}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="mt-6">
                          <Button
                            variant="outline"
                            onClick={() => toggleSection(scenario.id, 'monthlyPnL')}
                            className="flex items-center gap-2 mb-2"
                          >
                            {expandedSections[scenario.id]?.monthlyPnL ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Monthly & Yearly P&L Breakdown
                          </Button>
                          
                          {expandedSections[scenario.id]?.monthlyPnL && (
                            <div className="overflow-x-auto">
                              {(() => {
                                // Organiser les données par année et par mois
                                const pnlByYearMonth: Record<string, Record<string, number>> = {};
                                const yearTotals: Record<string, number> = {};
                                const monthTotals: Record<string, number> = {};
                                let grandTotal = 0;
                                
                                // Collecter toutes les années et tous les mois uniques
                                const years: Set<string> = new Set();
                                const months: string[] = [
                                  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                                ];
                                
                                // Initialiser la structure de données
                                scenario.results.forEach(result => {
                                  const date = new Date(result.date);
                                  const year = date.getFullYear().toString();
                                  const month = date.getMonth();
                                  const monthKey = months[month];
                                  
                                  years.add(year);
                                  
                                  if (!pnlByYearMonth[year]) {
                                    pnlByYearMonth[year] = {};
                                    yearTotals[year] = 0;
                                  }
                                  
                                  if (!pnlByYearMonth[year][monthKey]) {
                                    pnlByYearMonth[year][monthKey] = 0;
                                  }
                                  
                                  // Ajouter le P&L au mois correspondant
                                  pnlByYearMonth[year][monthKey] += result.deltaPnL;
                                  
                                  // Mettre à jour les totaux
                                  yearTotals[year] += result.deltaPnL;
                                  if (!monthTotals[monthKey]) monthTotals[monthKey] = 0;
                                  monthTotals[monthKey] += result.deltaPnL;
                                  grandTotal += result.deltaPnL;
                                });
                                
                                // Convertir l'ensemble des années en tableau trié
                                const sortedYears = Array.from(years).sort();
                                
                                // Fonction pour appliquer une couleur en fonction de la valeur
                                const getPnLColor = (value: number) => {
                                  if (value > 0) return 'bg-green-100';
                                  if (value < 0) return 'bg-red-100';
                                  return '';
                                };
                                
                                // Fonction pour formater les valeurs de P&L
                                const formatPnL = (value: number) => {
                                  if (Math.abs(value) < 0.01) return '0';
                                  // Formater en milliers avec un point de séparation de milliers
                                  return (value / 1000).toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 3
                                  });
                                };
                                
                                return (
                                  <table className="min-w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="bg-gray-100">
                                        <th className="border p-2 font-semibold text-left"></th>
                                        {months.map(month => (
                                          <th key={month} className="border p-2 font-semibold text-center w-20">{month}</th>
                                        ))}
                                        <th className="border p-2 font-semibold text-center w-20">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sortedYears.map(year => (
                                        <tr key={year}>
                                          <td className="border p-2 font-semibold">{year}</td>
                                          {months.map(month => {
                                            const value = pnlByYearMonth[year][month] || 0;
                                            return (
                                              <td 
                                                key={`${year}-${month}`} 
                                                className={`border p-2 text-right ${getPnLColor(value)}`}
                                              >
                                                {value ? formatPnL(value) : '-'}
                                              </td>
                                            );
                                          })}
                                          <td className={`border p-2 text-right font-semibold ${getPnLColor(yearTotals[year])}`}>
                                            {formatPnL(yearTotals[year])}
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="bg-gray-50">
                                        <td className="border p-2 font-semibold">Total</td>
                                        {months.map(month => (
                                          <td 
                                            key={`total-${month}`} 
                                            className={`border p-2 text-right font-semibold ${getPnLColor(monthTotals[month] || 0)}`}
                                          >
                                            {monthTotals[month] ? formatPnL(monthTotals[month]) : '-'}
                                          </td>
                                        ))}
                                        <td className={`border p-2 text-right font-semibold ${getPnLColor(grandTotal)}`}>
                                          {formatPnL(grandTotal)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={() => {
                            localStorage.setItem('calculatorState', JSON.stringify({
                              params: scenario.params,
                              strategy: scenario.strategy,
                              results: scenario.results,
                              payoffData: scenario.payoffData,
                              // Récupérer les paramètres personnalisés du scénario sauvegardé ou utiliser des valeurs par défaut
                              manualForwards: scenario.manualForwards || {},
                              realPrices: scenario.realPrices || {},
                              realPriceParams: {
                                useSimulation: false,
                                volatility: 0.3,
                                drift: 0.01,
                                numSimulations: 1000
                              },
                              barrierOptionSimulations: 1000,
                              useClosedFormBarrier: false,
                              activeTab: 'parameters',
                              customScenario: scenario.stressTest,
                              stressTestScenarios: {}, // You might want to save this too
                              // Récupérer les paramètres de volatilité implicite
                              useImpliedVol: scenario.useImpliedVol || false,
                              impliedVolatilities: scenario.impliedVolatilities || {},
                              // Récupérer les prix personnalisés des options
                              customOptionPrices: scenario.customOptionPrices || {}
                            }));
                            navigate('/strategy-builder');
                          }}
                          className="mt-4"
                        >
                          Load This Scenario
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Matrices de risque */}
        <TabsContent value="risk-matrices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Matrices</CardTitle>
              <CardDescription>
                Risk analysis matrices with multiple strategy comparisons
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Strategies</TableHead>
                    <TableHead>Price Ranges</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedRiskMatrices.map((matrix) => (
                    <TableRow key={matrix.id}>
                      <TableCell className="font-medium">{matrix.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {matrix.strategies.length} strategies
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {matrix.priceRanges.length} ranges
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(matrix.timestamp)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewReport({ ...matrix, type: 'risk-matrix' })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportReport(matrix)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backtests */}
        <TabsContent value="backtests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historical Backtests</CardTitle>
              <CardDescription>
                Historical data analysis and backtesting results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Data Points</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedBacktests.map((backtest) => (
                    <TableRow key={backtest.id}>
                      <TableCell className="font-medium">{backtest.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {backtest.historicalData?.length || backtest.results?.length || 0} points
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {backtest.params?.monthsToHedge || 'N/A'} months
                      </TableCell>
                      <TableCell>{formatDate(backtest.timestamp)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewReport({ ...backtest, type: 'backtest' })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportReport(backtest)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogues */}
      
      {/* Dialogue de visualisation */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedReport?.name} - {selectedReport?.type?.replace('-', ' ')}
            </DialogTitle>
            <DialogDescription>
              Detailed view of the selected report
            </DialogDescription>
          </DialogHeader>
          
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Created</Label>
                  <p className="text-sm">{formatDate(selectedReport.timestamp)}</p>
                </div>
                <div>
                  <Label>Type</Label>
                  <Badge className={getReportTypeColor(selectedReport.type)}>
                    {selectedReport.type.replace('-', ' ')}
                  </Badge>
                </div>
              </div>

              {selectedReport.type === 'scenario' && (
                <div className="space-y-4">
                  <div>
                    <Label>Strategy Components</Label>
                    <div className="text-sm">
                      {selectedReport.strategy?.length || 0} components
                    </div>
                  </div>
                  <div>
                    <Label>Parameters</Label>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                      {JSON.stringify(selectedReport.params, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedReport.type === 'risk-matrix' && (
                <div className="space-y-4">
                  <div>
                    <Label>Strategies</Label>
                    <div className="text-sm">
                      {selectedReport.strategies?.length || 0} strategies analyzed
                    </div>
                  </div>
                  <div>
                    <Label>Price Ranges</Label>
                    <div className="text-sm">
                      {selectedReport.priceRanges?.length || 0} price ranges
                    </div>
                  </div>
                </div>
              )}

              {selectedReport.type === 'backtest' && (
                <div className="space-y-4">
                  <div>
                    <Label>Historical Data</Label>
                    <div className="text-sm">
                      {selectedReport.historicalData?.length || 0} data points
                    </div>
                  </div>
                  <div>
                    <Label>Results</Label>
                    <div className="text-sm">
                      {selectedReport.results?.length || 0} periods analyzed
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => exportReport(selectedReport)}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de suppression */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedReport?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Reports; 
