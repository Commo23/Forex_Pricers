import React, { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useFinancialData } from "@/hooks/useFinancialData";
import { toast } from "@/hooks/use-toast";
import { 
  Plus, 
  Download, 
  Upload, 
  Search,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Edit,
  Trash2,
  RefreshCw,
  FileText,
  Globe,
  ArrowRight,
  Target,
  Shield,
  Loader2
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { getAvailableCurrencies, getCurrencyOptionLabel } from "@/utils/currencyList";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import {
  parseCsvText,
  parseExposureRows,
  FX_EXPOSURE_CSV_TEMPLATE_HEADER,
  FX_EXPOSURE_CSV_TEMPLATE_SAMPLE,
  type ParsedExposureRow,
} from "@/utils/fxExposureCsv";

interface ExposureFormData {
  exposureDate: string;
  currency: string;
  hedgeCurrency: string;
  amount: number;
  type: "receivable" | "payable";
  description: string;
  subsidiary: string;
  hedgeRatio: number;
  hedgedAmount: number;
  maturityDays: number;
}

const Exposures = () => {
  const baseCurrency = useBaseCurrency();
  const todayYmd = new Date().toISOString().split("T")[0];
  const isManualExposureHedgeEditingEnabled = useMemo(() => {
    try {
      const raw = localStorage.getItem("fxRiskManagerSettings");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed?.fxExposures?.manualHedgeEditing;
    } catch {
      return false;
    }
  }, []);
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  // Debounce/dedupe for auto-sync toast (prevents flicker when events fire in bursts)
  const autoSyncToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSyncToastKeyRef = useRef<string>("");
  const lastAutoSyncToastAtRef = useRef<number>(0);
  // Show the auto-sync toast only once per page open (first auto-sync burst after mount).
  const hasShownAutoSyncToastRef = useRef<boolean>(false);
  const [importReportOpen, setImportReportOpen] = useState(false);
  const [importReport, setImportReport] = useState<{
    imported: number;
    headerErrors: string[];
    rowErrors: { row: number; msg: string }[];
  }>({ imported: 0, headerErrors: [], rowErrors: [] });

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingExposure, setEditingExposure] = useState<string | null>(null);
  // ✅ NOUVEAUX ÉTATS : Vues d'agrégation
  const [showCurrencyBreakdown, setShowCurrencyBreakdown] = useState(false);
  const [showMaturityBreakdown, setShowMaturityBreakdown] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'currency' | 'maturity'>('none');
  
  // ✅ NOUVEAUX ÉTATS : Notifications pour nouvelles devises et échéances
  const [newCurrencies, setNewCurrencies] = useState<string[]>([]);
  const [newMaturities, setNewMaturities] = useState<string[]>([]);
  const [showNewCurrencyAlert, setShowNewCurrencyAlert] = useState(false);
  const [showNewMaturityAlert, setShowNewMaturityAlert] = useState(false);
  
  const [newExposure, setNewExposure] = useState<ExposureFormData>({
    exposureDate: todayYmd,
    currency: "",
    hedgeCurrency: baseCurrency || "USD",
    amount: 0,
    type: "receivable",
    description: "",
    subsidiary: "",
    hedgeRatio: 0,
    hedgedAmount: 0,
    maturityDays: 30
  });

  useEffect(() => {
    setNewExposure((prev) => ({
      ...prev,
      hedgeCurrency: prev.hedgeCurrency || baseCurrency || "USD",
    }));
  }, [baseCurrency]);

  const {
    exposures,
    instruments,
    riskMetrics,
    addExposure,
    batchAddExposures,
    updateExposure,
    deleteExposure,
    updateMarketData,
    isLoading,
    autoGenerateExposures,
    syncWithHedgingInstruments
  } = useFinancialData();

  // Hedge linking stats (Solution B): exposure -> hedge requests -> hedging instruments
  const [hedgeLinkStats, setHedgeLinkStats] = useState<Record<string, { requestCount: number; instrumentCount: number }>>({});
  useEffect(() => {
    const recompute = () => {
      try {
        const rawReq = localStorage.getItem("hedgeRequests");
        const rawInst = localStorage.getItem("hedgingInstruments");
        const reqs: Array<{ id: string; exposureId: string }> = rawReq ? JSON.parse(rawReq) : [];
        const insts: Array<{ hedgeRequestId?: string }> = rawInst ? JSON.parse(rawInst) : [];

        const byExposure = new Map<string, { reqIds: Set<string> }>();
        for (const r of reqs) {
          const exId = String((r as any).exposureId || "");
          const id = String((r as any).id || "");
          if (!exId || !id) continue;
          const entry = byExposure.get(exId) || { reqIds: new Set<string>() };
          entry.reqIds.add(id);
          byExposure.set(exId, entry);
        }

        const stats: Record<string, { requestCount: number; instrumentCount: number }> = {};
        for (const [exposureId, entry] of byExposure.entries()) {
          const reqIds = entry.reqIds;
          const instrumentCount = insts.filter((i) => i.hedgeRequestId && reqIds.has(String(i.hedgeRequestId))).length;
          stats[exposureId] = { requestCount: reqIds.size, instrumentCount };
        }
        setHedgeLinkStats(stats);
      } catch {
        setHedgeLinkStats({});
      }
    };

    recompute();
    window.addEventListener("hedgingInstrumentsUpdated", recompute as EventListener);
    window.addEventListener("storage", recompute);
    return () => {
      window.removeEventListener("hedgingInstrumentsUpdated", recompute as EventListener);
      window.removeEventListener("storage", recompute);
    };
  }, []);

  // ✅ NOUVEAU : Gestionnaires d'événements pour les nouvelles détections
  useEffect(() => {
    const handleNewCurrencies = (event: CustomEvent) => {
      const { currencies } = event.detail;
      setNewCurrencies(currencies);
      setShowNewCurrencyAlert(true);
      
      // Auto-hide alert after 10 seconds
      setTimeout(() => {
        setShowNewCurrencyAlert(false);
      }, 10000);
    };

    const handleNewMaturities = (event: CustomEvent) => {
      const { maturities } = event.detail;
      setNewMaturities(maturities);
      setShowNewMaturityAlert(true);
      
      // Auto-hide alert after 10 seconds
      setTimeout(() => {
        setShowNewMaturityAlert(false);
      }, 10000);
    };

    const handleExposuresAutoGenerated = (event: CustomEvent) => {
      const { count, updated, newCurrencies, newMaturities, newCurrencyMaturityPairs } = event.detail;
      
      // ✅ NOTIFICATION ENRICHIE : Afficher les détails des nouvelles détections ET mises à jour
      let message = '';
      
      if (count > 0) {
        message += `${count} exposure${count > 1 ? 's' : ''} created`;
      }
      
      if (updated > 0) {
        if (message) message += ' • ';
        message += `${updated} exposure${updated > 1 ? 's' : ''} updated`;
      }
      
      if (newCurrencies && newCurrencies.length > 0) {
        message += `\n• New currencies: ${newCurrencies.join(', ')}`;
      }
      
      if (newMaturities && newMaturities.length > 0) {
        message += `\n• New maturities: ${newMaturities.length}`;
      }
      
      if (newCurrencyMaturityPairs && newCurrencyMaturityPairs.length > 0) {
        message += `\n• New combinations: ${newCurrencyMaturityPairs.length}`;
      }

      // Debounce + dedupe to avoid flickering toasts when auto-sync fires multiple times quickly
      const toastKey = JSON.stringify({
        count: Number(count || 0),
        updated: Number(updated || 0),
        newCurrencies: Array.isArray(newCurrencies) ? [...newCurrencies].sort() : [],
        newMaturities: Array.isArray(newMaturities) ? [...newMaturities].sort() : [],
        newCurrencyMaturityPairs: Array.isArray(newCurrencyMaturityPairs) ? [...newCurrencyMaturityPairs].sort() : [],
      });

      // User preference: don't spam. It's enough to show once when opening FX Exposures.
      if (hasShownAutoSyncToastRef.current) {
        return;
      }

      if (autoSyncToastTimerRef.current) {
        clearTimeout(autoSyncToastTimerRef.current);
      }
      autoSyncToastTimerRef.current = setTimeout(() => {
        const now = Date.now();
        // Ignore exact duplicates within a short window
        if (toastKey === lastAutoSyncToastKeyRef.current && now - lastAutoSyncToastAtRef.current < 1500) {
          return;
        }
        lastAutoSyncToastKeyRef.current = toastKey;
        lastAutoSyncToastAtRef.current = now;
        hasShownAutoSyncToastRef.current = true;
        toast({
          title: "Auto Synchronization",
          description: message,
          duration: 8000,
        });
      }, 250);
    };

    // ✅ NOUVEAU : Ajout des listeners pour les événements de détection
    window.addEventListener('newCurrenciesDetected', handleNewCurrencies as EventListener);
    window.addEventListener('newMaturitiesDetected', handleNewMaturities as EventListener);
    window.addEventListener('exposuresAutoGenerated', handleExposuresAutoGenerated as EventListener);

    return () => {
      window.removeEventListener('newCurrenciesDetected', handleNewCurrencies as EventListener);
      window.removeEventListener('newMaturitiesDetected', handleNewMaturities as EventListener);
      window.removeEventListener('exposuresAutoGenerated', handleExposuresAutoGenerated as EventListener);
      if (autoSyncToastTimerRef.current) {
        clearTimeout(autoSyncToastTimerRef.current);
        autoSyncToastTimerRef.current = null;
      }
    };
  }, []);

  // Convert exposures to display format with proper calculations
  const displayExposures = exposures.map(exp => {
    const isReceivable = exp.type === 'receivable';
    const displayAmount = isReceivable ? Math.abs(exp.amount) : -Math.abs(exp.amount);
    
    // ✅ CORRECTION : Utiliser le hedgeRatio qui vient de l'exposition (calculé correctement dans useFinancialData)
    // Ne pas le recalculer comme hedgedAmount/amount car cela donne toujours 100%
    // Le vrai hedge ratio est basé sur la quantité de couverture des instruments (hedgeQuantity)
    const hedgeRatio = exp.hedgeRatio !== undefined && exp.hedgeRatio !== null 
      ? exp.hedgeRatio 
      : (exp.amount !== 0 ? Math.abs(exp.hedgedAmount / exp.amount) * 100 : 0); // Fallback seulement si pas défini
    
    return {
    id: exp.id,
    date: exp.date ? new Date(exp.date).toISOString().split('T')[0] : todayYmd,
    currency: exp.currency,
    hedgeCurrency: exp.hedgeCurrency || baseCurrency || "USD",
      type: isReceivable ? 'Receivable' : 'Payable',
      amount: displayAmount,
    description: exp.description,
    subsidiary: exp.subsidiary || 'Main Office',
    maturity: exp.maturity.toISOString().split('T')[0],
    status: 'active',
    hedged: exp.hedgedAmount,
      hedgeRatio: Math.round(hedgeRatio),
      unhedgedAmount: exp.amount - exp.hedgedAmount,
      originalExposure: exp
    };
  });

  // ✅ DÉCLARATION PRÉALABLE : Expositions filtrées (nécessaire pour aggregatedData)
  const filteredExposures = displayExposures.filter(exposure => {
    const matchesSearch = exposure.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exposure.currency.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exposure.subsidiary.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = selectedTab === "all" || 
                      (selectedTab === "receivables" && exposure.type === 'Receivable') ||
                      (selectedTab === "payables" && exposure.type === 'Payable') ||
                      (selectedTab === "unhedged" && exposure.hedgeRatio === 0);
    
    return matchesSearch && matchesTab;
  });

  // ✅ OPTIMISATION : Calculs d'agrégation memoized
  const aggregatedData = useMemo(() => {
    const currencyMap = new Map<string, {
      totalAmount: number;
      totalReceivables: number;
      totalPayables: number;
      totalHedged: number;
      totalUnhedged: number;
      count: number;
      avgHedgeRatio: number;
      exposures: typeof displayExposures;
    }>();

    const maturityMap = new Map<string, {
      totalAmount: number;
      totalReceivables: number;
      totalPayables: number;
      totalHedged: number;
      totalUnhedged: number;
      count: number;
      avgHedgeRatio: number;
      exposures: typeof displayExposures;
      maturityRange: string;
    }>();

    // Fonction pour déterminer la période de maturité
    const getMaturityRange = (maturityDate: string) => {
      const now = new Date();
      const maturity = new Date(maturityDate);
      const diffDays = Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 30) return '≤ 30 days';
      if (diffDays <= 90) return '31-90 days';
      if (diffDays <= 180) return '91-180 days';
      if (diffDays <= 365) return '181-365 days';
      return '> 1 year';
    };

    // Traitement optimisé des expositions filtrées
    filteredExposures.forEach(exposure => {
      const absAmount = Math.abs(exposure.amount);
      const hedgedAmount = Math.abs(exposure.hedged);
      const unhedgedAmount = absAmount - hedgedAmount;

      // Agrégation par devise
      const currencyKey = exposure.currency;
      const currencyData = currencyMap.get(currencyKey) || {
        totalAmount: 0,
        totalReceivables: 0,
        totalPayables: 0,
        totalHedged: 0,
        totalUnhedged: 0,
        count: 0,
        avgHedgeRatio: 0,
        exposures: []
      };

      currencyData.totalAmount += absAmount;
      currencyData.totalHedged += hedgedAmount;
      currencyData.totalUnhedged += unhedgedAmount;
      currencyData.count += 1;
      currencyData.exposures.push(exposure);

      if (exposure.type === 'Receivable') {
        currencyData.totalReceivables += absAmount;
      } else {
        currencyData.totalPayables += absAmount;
      }

      // Calcul du ratio de couverture moyen pondéré
      currencyData.avgHedgeRatio = currencyData.totalAmount > 0 ? 
        (currencyData.totalHedged / currencyData.totalAmount) * 100 : 0;

      currencyMap.set(currencyKey, currencyData);

      // Agrégation par maturité
      const maturityRange = getMaturityRange(exposure.maturity);
      const maturityData = maturityMap.get(maturityRange) || {
        totalAmount: 0,
        totalReceivables: 0,
        totalPayables: 0,
        totalHedged: 0,
        totalUnhedged: 0,
        count: 0,
        avgHedgeRatio: 0,
        exposures: [],
        maturityRange
      };

      maturityData.totalAmount += absAmount;
      maturityData.totalHedged += hedgedAmount;
      maturityData.totalUnhedged += unhedgedAmount;
      maturityData.count += 1;
      maturityData.exposures.push(exposure);

      if (exposure.type === 'Receivable') {
        maturityData.totalReceivables += absAmount;
      } else {
        maturityData.totalPayables += absAmount;
      }

      maturityData.avgHedgeRatio = maturityData.totalAmount > 0 ? 
        (maturityData.totalHedged / maturityData.totalAmount) * 100 : 0;

      maturityMap.set(maturityRange, maturityData);
    });

    return {
      byCurrency: Array.from(currencyMap.entries()).map(([currency, data]) => ({
        currency,
        ...data
      })).sort((a, b) => b.totalAmount - a.totalAmount),
      
      byMaturity: Array.from(maturityMap.entries()).map(([range, data]) => ({
        ...data
      })).sort((a, b) => {
        // Tri par ordre chronologique des échéances
        const order = ['≤ 30 days', '31-90 days', '91-180 days', '181-365 days', '> 1 year'];
        return order.indexOf(a.maturityRange) - order.indexOf(b.maturityRange);
      })
    };
  }, [filteredExposures]);

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    const absAmount = Math.abs(amount);
    if (currency === "JPY") {
      return `¥${absAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency;
    return `${symbol}${absAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  // ✅ NOUVEAU : Calculer les totaux par devise
  const currencyTotals = useMemo(() => {
    const totals: { [currency: string]: { receivables: number; payables: number; total: number } } = {};
    
    exposures.forEach(exp => {
      if (!totals[exp.currency]) {
        totals[exp.currency] = { receivables: 0, payables: 0, total: 0 };
      }
      
      const absAmount = Math.abs(exp.amount);
      totals[exp.currency].total += absAmount;
      
      if (exp.type === 'receivable') {
        totals[exp.currency].receivables += absAmount;
      } else {
        totals[exp.currency].payables += absAmount;
      }
    });
    
    return totals;
  }, [exposures]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHedgeRatioColor = (ratio: number) => {
    if (ratio >= 80) return "text-green-600";
    if (ratio >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getHedgeRatioBadge = (ratio: number) => {
    if (ratio >= 80) return <Badge className="bg-green-100 text-green-800">Well Hedged</Badge>;
    if (ratio >= 50) return <Badge className="bg-yellow-100 text-yellow-800">Partially Hedged</Badge>;
    if (ratio > 0) return <Badge className="bg-orange-100 text-orange-800">Under Hedged</Badge>;
    return <Badge variant="destructive">Unhedged</Badge>;
  };

  // Enhanced summary calculations
  const summaryStats = {
    totalExposure: riskMetrics.totalExposure,
    totalHedged: riskMetrics.hedgedAmount,
    overallHedgeRatio: riskMetrics.hedgeRatio,
    unhedgedRisk: riskMetrics.unhedgedRisk,
    receivablesCount: displayExposures.filter(e => e.type === 'Receivable').length,
    payablesCount: displayExposures.filter(e => e.type === 'Payable').length,
    unhedgedCount: displayExposures.filter(e => e.hedgeRatio === 0).length,
    nearMaturityCount: displayExposures.filter(e => {
      const maturityDate = new Date(e.maturity);
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      return maturityDate <= thirtyDaysFromNow;
    }).length
  };

  const resetForm = () => {
    setNewExposure({
      exposureDate: todayYmd,
      currency: "",
      hedgeCurrency: baseCurrency || "USD",
      amount: 0,
      type: "receivable",
      description: "",
      subsidiary: "",
      hedgeRatio: 0,
      hedgedAmount: 0,
      maturityDays: 90
    });
  };

  const validateForm = (data: ExposureFormData): string | null => {
    if (!data.currency) return "Currency is required";
    if (!data.amount || data.amount <= 0) return "Amount must be greater than 0";
    if (!data.description.trim()) return "Description is required";
    if (data.hedgeRatio < 0 || data.hedgeRatio > 100) return "Hedge ratio must be between 0 and 100";
    return null;
  };

  const handleAddExposure = () => {
    const validationError = validateForm(newExposure);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    try {
      const maturityDate = new Date(Date.now() + newExposure.maturityDays * 24 * 60 * 60 * 1000);
      
      addExposure({
        date: new Date(`${newExposure.exposureDate || todayYmd}T00:00:00`),
        currency: newExposure.currency,
        hedgeCurrency: newExposure.hedgeCurrency || baseCurrency || "USD",
        amount: newExposure.type === 'payable' ? -Math.abs(newExposure.amount) : Math.abs(newExposure.amount),
        type: newExposure.type,
        maturity: maturityDate,
        description: newExposure.description,
        subsidiary: newExposure.subsidiary || 'Main Office',
        hedgeRatio: newExposure.hedgeRatio,
        hedgedAmount: newExposure.hedgedAmount
      });
      
      toast({
        title: "Success",
        description: "Exposure added successfully",
      });
      
      resetForm();
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add exposure",
        variant: "destructive"
      });
    }
  };

  const handleHedgeRatioChange = (ratio: number) => {
    const hedgedAmount = (ratio / 100) * Math.abs(newExposure.amount);
    setNewExposure({
      ...newExposure,
      hedgeRatio: ratio,
      hedgedAmount: newExposure.type === 'payable' ? -hedgedAmount : hedgedAmount
    });
  };

  const handleEditExposure = (exposureId: string) => {
    const exposure = displayExposures.find(e => e.id === exposureId);
    if (exposure) {
      const maturityDays = Math.ceil((new Date(exposure.maturity).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      setNewExposure({
        exposureDate: exposure.date || todayYmd,
        currency: exposure.currency,
        hedgeCurrency: exposure.hedgeCurrency || baseCurrency || "USD",
        amount: Math.abs(exposure.amount),
        type: exposure.type === 'Receivable' ? 'receivable' : 'payable',
        description: exposure.description,
        subsidiary: exposure.subsidiary,
        hedgeRatio: exposure.hedgeRatio,
        hedgedAmount: exposure.hedged,
        maturityDays: Math.max(1, maturityDays)
      });
      setEditingExposure(exposureId);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdateExposure = () => {
    if (!editingExposure) return;

    const validationError = validateForm(newExposure);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    try {
      const maturityDate = new Date(Date.now() + newExposure.maturityDays * 24 * 60 * 60 * 1000);
      
      const success = updateExposure(editingExposure, {
        date: new Date(`${newExposure.exposureDate || todayYmd}T00:00:00`),
        currency: newExposure.currency,
        hedgeCurrency: newExposure.hedgeCurrency || baseCurrency || "USD",
        amount: newExposure.type === 'payable' ? -Math.abs(newExposure.amount) : Math.abs(newExposure.amount),
        type: newExposure.type,
        maturity: maturityDate,
        description: newExposure.description,
        subsidiary: newExposure.subsidiary || 'Main Office',
        hedgeRatio: newExposure.hedgeRatio,
        hedgedAmount: newExposure.hedgedAmount
      });
      
      if (success) {
        toast({
          title: "Success",
          description: "Exposure updated successfully",
        });
        setIsAddDialogOpen(false);
        setIsEditDialogOpen(false);
        setEditingExposure(null);
        resetForm();
      } else {
        toast({
          title: "Error",
          description: "Exposure not found",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update exposure",
        variant: "destructive"
      });
    }
  };

  const handleDeleteExposure = (exposureId: string) => {
    try {
      const success = deleteExposure(exposureId);
      if (success) {
        toast({
          title: "Success",
          description: "Exposure deleted successfully",
        });
      } else {
        toast({
          title: "Error",
          description: "Exposure not found",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete exposure",
        variant: "destructive"
      });
    }
  };

  const handleRefreshData = () => {
    updateMarketData();
    toast({
      title: "Data Refreshed",
      description: "Market data and calculations updated",
    });
  };

  const handleExportData = () => {
    const csvContent = [
      ['ID', 'Currency', 'Hedge Currency', 'Type', 'Amount', 'Description', 'Subsidiary', 'Maturity', 'Hedge Ratio', 'Hedged Amount', 'Unhedged Amount'].join(','),
      ...filteredExposures.map(exp => [
        exp.id,
        exp.currency,
        exp.hedgeCurrency,
        exp.type,
        exp.amount,
        `"${exp.description}"`,
        `"${exp.subsidiary}"`,
        exp.maturity,
        `${exp.hedgeRatio}%`,
        exp.hedged,
        exp.unhedgedAmount
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fx-exposures-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "FX exposures exported (same format as CSV import template)",
    });
  };

  const handleDownloadExposureTemplate = () => {
    const blob = new Blob([FX_EXPOSURE_CSV_TEMPLATE_SAMPLE], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fx-exposures-import-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Template downloaded",
      description: "Required columns: currency, type, amount, description, maturity. Optional: subsidiary, hedge_currency, hedge_ratio (defaults to Settings base currency).",
    });
  };

  const handleImportCsvClick = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsvText(text);
      const { headerErrors, results } = parseExposureRows(rows, {
        defaultHedgeCurrency: baseCurrency || "USD",
      });

      if (headerErrors.length > 0) {
        setImportReport({ imported: 0, headerErrors, rowErrors: [] });
        setImportReportOpen(true);
        input.value = "";
        return;
      }

      const rowErrors = results
        .filter((r): r is { ok: false; row: number; error: string } => !r.ok)
        .map((r) => ({ row: r.row, msg: r.error }));

      const validPayload = results
        .filter((r): r is { ok: true; row: number; data: ParsedExposureRow } => r.ok)
        .map((r) => ({
          currency: r.data.currency,
          amount: r.data.amount,
          type: r.data.type,
          maturity: r.data.maturity,
          description: r.data.description,
          subsidiary: r.data.subsidiary,
          hedgeCurrency: r.data.hedgeCurrency,
          hedgeRatio: r.data.hedgeRatio,
          hedgedAmount: r.data.hedgedAmount,
        }));

      if (validPayload.length > 0) {
        batchAddExposures(validPayload);
      }

      if (rowErrors.length > 0) {
        toast({
          title: validPayload.length > 0 ? "Partial import" : "Import failed",
          description: `${validPayload.length} row(s) imported, ${rowErrors.length} row(s) skipped. See details.`,
          variant: validPayload.length > 0 ? "default" : "destructive",
        });
        setImportReport({
          imported: validPayload.length,
          headerErrors: [],
          rowErrors,
        });
        setImportReportOpen(true);
      } else if (validPayload.length > 0) {
        toast({
          title: "Import complete",
          description: `${validPayload.length} exposure(s) imported from CSV.`,
        });
      } else {
        toast({
          title: "No data imported",
          description: "Add at least one data row below the header, or check your file.",
          variant: "destructive",
        });
      }

      input.value = "";
    };
    reader.onerror = () => {
      toast({
        title: "Read error",
        description: "Could not read the CSV file.",
        variant: "destructive",
      });
      input.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <Layout title="FX Exposures" breadcrumbs={[{ label: "FX Exposures" }]}>
      <div className="space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">FX Exposures</h1>
            <p className="text-muted-foreground mt-1">
              Manage and monitor your foreign exchange exposures and hedging strategies
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRefreshData}
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={handleExportData}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              type="button"
              onClick={handleDownloadExposureTemplate}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              title="Download CSV template for bulk import"
            >
              <FileText className="h-4 w-4" />
              CSV template
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvFileChange}
            />
            <Button
              type="button"
              onClick={handleImportCsvClick}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              disabled={isLoading}
              title="Import multiple exposures from CSV (use template)"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              size="sm"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Exposure
            </Button>
          </div>
        </div>

        {/* ✅ NOUVELLES ALERTES : Notifications pour nouvelles devises et échéances */}
        {showNewCurrencyAlert && newCurrencies.length > 0 && (
          <Card className="border-primary/40 bg-primary/10 dark:border-primary/50 dark:bg-primary/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary dark:text-primary" />
                  <CardTitle className="text-lg text-primary dark:text-primary">
                    New Currencies Detected
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewCurrencyAlert(false)}
                  className="text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/80"
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-primary dark:text-primary/90">
                  The following new currencies were detected during strategy import:
                </p>
                <div className="flex flex-wrap gap-2">
                  {newCurrencies.map((currency) => (
                    <Badge key={currency} variant="outline" className="border-primary/40 text-primary dark:border-primary/50 dark:text-primary">
                      {currency}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-primary/80 dark:text-primary/80 mt-2">
                  Exposures have been automatically created for these currencies.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {showNewMaturityAlert && newMaturities.length > 0 && (
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <CardTitle className="text-lg text-green-800 dark:text-green-200">
                    New Maturities Detected
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewMaturityAlert(false)}
                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {newMaturities.length} new maturit{newMaturities.length > 1 ? 'ies' : 'y'} detected:
                </p>
                <div className="flex flex-wrap gap-2">
                  {newMaturities.slice(0, 5).map((maturity) => (
                    <Badge key={maturity} variant="outline" className="border-green-300 text-green-700 dark:border-green-600 dark:text-green-300">
                      {new Date(maturity).toLocaleDateString('en-US')}
                    </Badge>
                  ))}
                  {newMaturities.length > 5 && (
                    <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-600 dark:text-green-300">
                      +{newMaturities.length - 5} more
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Exposures have been organized by maturity for better tracking.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Exposures</p>
                  <p className="text-2xl font-bold">{exposures.length}</p>
                </div>
                <div className="h-8 w-8 bg-primary/15 dark:bg-primary/25 rounded-full flex items-center justify-center">
                  <Globe className="h-4 w-4 text-primary dark:text-primary" />
                </div>
              </div>
          </CardContent>
        </Card>

        <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Receivables</p>
                  <div className="space-y-1">
                    {Object.entries(currencyTotals).map(([currency, totals]) => (
                      totals.receivables > 0 && (
                        <p key={currency} className="text-lg font-bold text-green-600">
                          {formatCurrency(totals.receivables, currency)}
                        </p>
                      )
                    ))}
                    {Object.values(currencyTotals).every(totals => totals.receivables === 0) && (
                      <p className="text-2xl font-bold text-gray-400">$0</p>
                    )}
                  </div>
                </div>
                <div className="h-8 w-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
          </CardContent>
        </Card>

        <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Payables</p>
                  <div className="space-y-1">
                    {Object.entries(currencyTotals).map(([currency, totals]) => (
                      totals.payables > 0 && (
                        <p key={currency} className="text-lg font-bold text-red-600">
                          {formatCurrency(totals.payables, currency)}
                        </p>
                      )
                    ))}
                    {Object.values(currencyTotals).every(totals => totals.payables === 0) && (
                      <p className="text-2xl font-bold text-gray-400">$0</p>
                    )}
                  </div>
                </div>
                <div className="h-8 w-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              </div>
          </CardContent>
        </Card>

        <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Hedge Ratio</p>
                  <p className="text-2xl font-bold">
                    {exposures.length > 0 
                      ? `${Math.round(exposures.reduce((sum, exp) => sum + exp.hedgeRatio, 0) / exposures.length)}%`
                      : '0%'
                    }
                  </p>
                </div>
                <div className="h-8 w-8 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center">
                  <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                </div>
              </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
        {exposures.length === 0 ? (
          /* Empty State with Connection Guide */
      <Card>
            <CardContent className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="h-16 w-16 bg-primary/15 dark:bg-primary/25 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-8 w-8 text-primary dark:text-primary" />
            </div>
                <h3 className="text-xl font-semibold mb-2">No FX Exposures Found</h3>
                <p className="text-muted-foreground mb-6">
                  Get started by adding your first FX exposure or importing hedging strategies from the Strategy Builder.
                </p>
                
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 text-left">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      Connected Workflow
                    </h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Create hedging strategies in <strong>Strategy Builder</strong></li>
                      <li>Export strategies to <strong>Hedging Instruments</strong></li>
                      <li>Add corresponding exposures here to see hedge ratios</li>
                      <li>Monitor risk metrics and effectiveness</li>
                    </ol>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button asChild>
                      <a href="/strategy-builder" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Go to Strategy Builder
                      </a>
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsAddDialogOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Manual Exposure
                    </Button>
                  </div>
                  
                  {instruments.length > 0 && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">
                          <strong>{instruments.length}</strong> hedging instruments detected
                        </p>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-300 mb-3">
                        Automatically generate exposures based on your hedging instruments or add them manually.
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          onClick={autoGenerateExposures}
                          size="sm" 
                          className="flex-1"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Shield className="h-4 w-4 mr-2" />
                          )}
                          Auto-Generate
                        </Button>
                        <Button 
                          onClick={() => setIsAddDialogOpen(true)}
                          size="sm" 
                          variant="outline"
                          className="flex-1"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Manually
                        </Button>
            </div>
          </div>
                  )}
            </div>
          </div>
            </CardContent>
          </Card>
        ) : (
          /* Existing content when there are exposures */
          <>
          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  All
                  <Badge variant="secondary" className="ml-1">
                    {exposures.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="receivables" className="flex items-center gap-2">
                  Receivables
                  <Badge variant="secondary" className="ml-1">
                    {exposures.filter(exp => exp.type === 'receivable').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="payables" className="flex items-center gap-2">
                  Payables
                  <Badge variant="secondary" className="ml-1">
                    {exposures.filter(exp => exp.type === 'payable').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="unhedged" className="flex items-center gap-2">
                  Unhedged
                  <Badge variant="destructive" className="ml-1">
                    {exposures.filter(exp => exp.hedgeRatio === 0).length}
                  </Badge>
                </TabsTrigger>
            </TabsList>
            
            <TabsContent value={selectedTab} className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>
                        {selectedTab === 'all' && 'All Exposures'}
                        {selectedTab === 'receivables' && 'Receivables'}
                        {selectedTab === 'payables' && 'Payables'}
                        {selectedTab === 'unhedged' && 'Unhedged Exposures'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {filteredExposures.length} items
                        </Badge>
                        {/* ✅ NOUVEAUX CONTRÔLES : Boutons de vue pour All Exposures */}
                        {selectedTab === 'all' && (
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant={groupBy === 'none' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGroupBy('none')}
                              className="text-xs"
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Detailed
                            </Button>
                            <Button
                              variant={groupBy === 'currency' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGroupBy('currency')}
                              className="text-xs"
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              By Currency
                            </Button>
                            <Button
                              variant={groupBy === 'maturity' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGroupBy('maturity')}
                              className="text-xs"
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              By Maturity
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* ✅ AFFICHAGE CONDITIONNEL : Vue détaillée, par devise ou par maturité */}
                    {selectedTab === 'all' && groupBy === 'currency' ? (
                      /* Vue agrégée par devise */
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground mb-4">
                          Exposures grouped by currency • {aggregatedData.byCurrency.length} currencies
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Currency</TableHead>
                                <TableHead>Total Amount</TableHead>
                                <TableHead>Receivables</TableHead>
                                <TableHead>Payables</TableHead>
                                <TableHead>Hedged Amount</TableHead>
                                <TableHead>Unhedged Amount</TableHead>
                                <TableHead>Avg Hedge Ratio</TableHead>
                                <TableHead>Count</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {aggregatedData.byCurrency.map((currencyData) => (
                                <TableRow key={currencyData.currency} className="hover:bg-muted/50">
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono font-bold">
                                      {currencyData.currency}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono font-semibold">
                                    {formatCurrency(currencyData.totalAmount, currencyData.currency)}
                                  </TableCell>
                                  <TableCell className="font-mono text-green-600">
                                    {formatCurrency(currencyData.totalReceivables, currencyData.currency)}
                                  </TableCell>
                                  <TableCell className="font-mono text-red-600">
                                    {formatCurrency(currencyData.totalPayables, currencyData.currency)}
                                  </TableCell>
                                  <TableCell className="font-mono text-primary">
                                    {formatCurrency(currencyData.totalHedged, currencyData.currency)}
                                  </TableCell>
                                  <TableCell className="font-mono text-orange-600">
                                    {formatCurrency(currencyData.totalUnhedged, currencyData.currency)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono">{Math.round(currencyData.avgHedgeRatio)}%</span>
                                      {getHedgeRatioBadge(currencyData.avgHedgeRatio)}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary">{currencyData.count}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : selectedTab === 'all' && groupBy === 'maturity' ? (
                      /* Vue agrégée par maturité */
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground mb-4">
                          Exposures grouped by maturity • {aggregatedData.byMaturity.length} maturity ranges
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Maturity Range</TableHead>
                                <TableHead>Total Amount</TableHead>
                                <TableHead>Receivables</TableHead>
                                <TableHead>Payables</TableHead>
                                <TableHead>Hedged Amount</TableHead>
                                <TableHead>Unhedged Amount</TableHead>
                                <TableHead>Avg Hedge Ratio</TableHead>
                                <TableHead>Count</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {aggregatedData.byMaturity.map((maturityData) => (
                                <TableRow key={maturityData.maturityRange} className="hover:bg-muted/50">
                                  <TableCell>
                                    <Badge 
                                      variant="outline" 
                                      className={`font-mono font-bold ${
                                        maturityData.maturityRange === '≤ 30 days' ? 'border-red-200 text-red-700' :
                                        maturityData.maturityRange === '31-90 days' ? 'border-orange-200 text-orange-700' :
                                        maturityData.maturityRange === '91-180 days' ? 'border-yellow-200 text-yellow-700' :
                                        maturityData.maturityRange === '181-365 days' ? 'border-primary/40 text-primary' :
                                        'border-green-200 text-green-700'
                                      }`}
                                    >
                                      {maturityData.maturityRange}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono font-semibold">
                                    ${maturityData.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="font-mono text-green-600">
                                    ${maturityData.totalReceivables.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="font-mono text-red-600">
                                    ${maturityData.totalPayables.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="font-mono text-primary">
                                    ${maturityData.totalHedged.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="font-mono text-orange-600">
                                    ${maturityData.totalUnhedged.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono">{Math.round(maturityData.avgHedgeRatio)}%</span>
                                      {getHedgeRatioBadge(maturityData.avgHedgeRatio)}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary">{maturityData.count}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      /* Vue détaillée standard */
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Currency</TableHead>
                              <TableHead>Hedge Currency</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Maturity</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Subsidiary</TableHead>
                              <TableHead>Hedge Requests</TableHead>
                              <TableHead>Hedging Instruments</TableHead>
                              <TableHead>Hedge Ratio</TableHead>
                              <TableHead>Hedged Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredExposures.map((exposure) => (
                              <TableRow key={exposure.id}>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono">
                                    {exposure.currency}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="font-mono">
                                    {exposure.hedgeCurrency}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono">
                                  {formatCurrency(exposure.amount, exposure.currency)}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={exposure.type === 'Receivable' ? 'default' : 'secondary'}
                                    className={exposure.type === 'Receivable' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}
                                  >
                                    {exposure.type === 'Receivable' ? 'Receivable' : 'Payable'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono">
                                  {new Date(exposure.originalExposure.maturity).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {exposure.description}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {exposure.subsidiary || '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono">
                                    {hedgeLinkStats[exposure.id]?.requestCount ?? 0}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="font-mono">
                                    {hedgeLinkStats[exposure.id]?.instrumentCount ?? 0}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">{exposure.hedgeRatio}%</span>
                                    {getHedgeRatioBadge(exposure.hedgeRatio)}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono">
                                  {formatCurrency(exposure.hedged, exposure.currency)}
                                </TableCell>
                                <TableCell>
                                  {getStatusBadge(exposure.hedgeRatio > 80 ? 'well-hedged' : exposure.hedgeRatio > 50 ? 'partially-hedged' : exposure.hedgeRatio > 0 ? 'under-hedged' : 'unhedged')}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditExposure(exposure.id)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteExposure(exposure.id)}
                                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </TabsContent>
          </Tabs>
          </>
        )}

        {/* Add/Edit Exposure Dialog - open when either Add or Edit is triggered */}
        <Dialog
          open={isAddDialogOpen || isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setIsEditDialogOpen(false);
              setEditingExposure(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingExposure ? 'Edit Exposure' : 'Add New Exposure'}
              </DialogTitle>
              <DialogDescription>
                {editingExposure 
                  ? 'Update the exposure details below.'
                  : 'Enter the details for the new FX exposure.'
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={newExposure.currency}
                    onValueChange={(value) => setNewExposure({...newExposure, currency: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {getAvailableCurrencies().map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={newExposure.type}
                    onValueChange={(value: 'receivable' | 'payable') => 
                      setNewExposure({...newExposure, type: value})
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable">Receivable</SelectItem>
                      <SelectItem value="payable">Payable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hedgeCurrency">Hedge Currency</Label>
                <Select
                  value={newExposure.hedgeCurrency}
                  onValueChange={(value) => setNewExposure({ ...newExposure, hedgeCurrency: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hedge currency" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {getAvailableCurrencies().map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default from Settings base currency ({baseCurrency || "USD"}).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={newExposure.amount || ''}
                  onChange={(e) => setNewExposure({...newExposure, amount: parseFloat(e.target.value) || 0})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exposureDate">Date (Trade Date)</Label>
                <Input
                  id="exposureDate"
                  type="date"
                  value={newExposure.exposureDate}
                  onChange={(e) => setNewExposure({ ...newExposure, exposureDate: e.target.value || todayYmd })}
                />
                <p className="text-xs text-muted-foreground">This date is different from the maturity date below.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Enter description"
                  value={newExposure.description}
                  onChange={(e) => setNewExposure({...newExposure, description: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subsidiary">Subsidiary</Label>
                <Input
                  id="subsidiary"
                  placeholder="Enter subsidiary (optional)"
                  value={newExposure.subsidiary}
                  onChange={(e) => setNewExposure({...newExposure, subsidiary: e.target.value})}
                />
              </div>

              <div className="space-y-3">
                <Label>Maturity</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="maturityDate" className="text-xs text-muted-foreground">Date</Label>
                    <Input
                      id="maturityDate"
                      type="date"
                      value={(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + newExposure.maturityDays);
                        return d.toISOString().split("T")[0];
                      })()}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        const selected = new Date(value + "T12:00:00");
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        selected.setHours(0, 0, 0, 0);
                        const days = Math.round((selected.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                        setNewExposure({ ...newExposure, maturityDays: Math.max(0, days) });
                      }}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maturityDays" className="text-xs text-muted-foreground">Days from now</Label>
                    <Input
                      id="maturityDays"
                      type="number"
                      min={0}
                      placeholder="e.g. 30"
                      value={newExposure.maturityDays ?? ""}
                      onChange={(e) => setNewExposure({ ...newExposure, maturityDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-full"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Choose a date or enter the number of days from today.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hedgeRatio">
                  Hedge Ratio: {newExposure.hedgeRatio}%
                </Label>
                <Slider
                  id="hedgeRatio"
                  min={0}
                  max={100}
                  step={5}
                  value={[newExposure.hedgeRatio]}
                  onValueChange={(value) => handleHedgeRatioChange(value[0])}
                  className="w-full"
                  disabled={!isManualExposureHedgeEditingEnabled}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
                {!isManualExposureHedgeEditingEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Hedge ratio is auto-calculated from hedges. Enable manual override in Settings → FX Exposures to edit.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="hedgedAmount">Hedged Amount</Label>
                <Input
                  id="hedgedAmount"
                  type="number"
                  placeholder="Calculated automatically"
                  value={newExposure.hedgedAmount || ''}
                  onChange={(e) => setNewExposure({...newExposure, hedgedAmount: parseFloat(e.target.value) || 0})}
                  className="bg-muted"
                  readOnly={!isManualExposureHedgeEditingEnabled}
                  disabled={!isManualExposureHedgeEditingEnabled}
                />
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setIsEditDialogOpen(false);
                  setEditingExposure(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={editingExposure ? handleUpdateExposure : handleAddExposure}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingExposure ? 'Updating...' : 'Adding...'}
                  </>
                ) : (
                  editingExposure ? 'Update Exposure' : 'Add Exposure'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importReportOpen} onOpenChange={setImportReportOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>CSV import report</DialogTitle>
              <DialogDescription>
                {importReport.imported > 0
                  ? `${importReport.imported} exposure(s) were imported successfully.`
                  : "No exposures were imported."}
                {(importReport.headerErrors.length > 0 || importReport.rowErrors.length > 0) &&
                  " Fix the issues below and try again for skipped rows."}
              </DialogDescription>
            </DialogHeader>
            {importReport.headerErrors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Header / file errors</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {importReport.headerErrors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            {importReport.rowErrors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Row errors</p>
                <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                  <ul className="space-y-1">
                    {importReport.rowErrors.map((err, i) => (
                      <li key={i}>
                        <span className="font-mono text-xs">Row {err.row}:</span> {err.msg}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" onClick={() => setImportReportOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Exposures; 