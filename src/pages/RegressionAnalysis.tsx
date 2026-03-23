import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Database, 
  AlertTriangle, 
  Info,
  Upload,
  Calculator,
  FileSpreadsheet,
  Minus,
  CheckCircle,
  PlayCircle,
  Plus,
  X,
  FileText,
  ArrowRight,
  RefreshCcw,
  DollarSign,
  Save,
  History,
  Clock,
  FolderOpen,
  Trash2,
  Download,
  Eye
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  ComposedChart
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

// ===============================
// TYPES AND INTERFACES
// ===============================

interface DataPoint {
  x: number;
  y: number;
}

interface Dataset {
  id: string;
  name: string;
  data: Record<string, any>[];
  headers: string[];
  numericColumns: string[];
  rowCount: number;
}

// Interface pour l'historique des analyses
interface SavedAnalysis {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  datasets: Dataset[];
  selectedVariables: {
    x: VariableSelection | null;
    y: VariableSelection | null;
  };
  regressionResults: Record<RegressionType, RegressionResult | null>;
  calculatedModels: RegressionType[];
  selectedModel: RegressionType;
  polynomialDegree: number;
  combinedData: CombinedData | null;
}

interface VariableSelection {
  datasetId: string;
  column: string;
  label: string;
  customName?: string;
}

interface RegressionMetrics {
  mae: number;
  mse: number;
  rmse: number;
  mape: number;
  adjustedR2: number;
  aic: number;
  bic: number;
  standardError: number;
  fStatistic: number;
  pValue: number;
}

interface CorrelationStats {
  pearsonR: number;
  spearmanRho: number;
  kendallTau: number;
  pValue: number;
  confidenceInterval: { lower: number; upper: number };
  significance: 'very strong' | 'strong' | 'moderate' | 'weak' | 'very weak';
  isSignificant: boolean;
}

interface RegressionResult {
  equation: number[];
  string: string;
  customString?: string;
  r2: number;
  points: DataPoint[];
  type: RegressionType;
  metrics: RegressionMetrics;
  coefficients: number[];
  intercept?: number;
  slope?: number;
  predict: (x: number) => number;
  correlation?: CorrelationStats;
  residuals?: number[];
  standardizedResiduals?: number[];
}

export type RegressionType = 'linear' | 'polynomial' | 'exponential' | 'logarithmic' | 'power' | 'logistic';

interface CombinedData {
  dataPoints: DataPoint[];
  xLabel: string;
  yLabel: string;
  sourceInfo: {
    x: { dataset: string; column: string };
    y: { dataset: string; column: string };
  };
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

function parseCSV(text: string): { data: Record<string, any>[]; headers: string[] } {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
  
  const data: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
    if (values.length === headers.length) {
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        const value = values[index];
        const numericValue = parseFloat(value);
        row[header] = isNaN(numericValue) ? value : numericValue;
      });
      data.push(row);
    }
  }
  
  return { data, headers };
}

function getNumericColumns(data: Record<string, any>[], headers: string[]): string[] {
  return headers.filter(header => {
    const numericCount = data.filter(row => {
      const value = row[header];
      return typeof value === 'number' && !isNaN(value);
    }).length;
    return numericCount / data.length > 0.8;
  });
}

function validateNumericData(data: Record<string, any>[], xCol: string, yCol: string): DataPoint[] {
  const validPoints: DataPoint[] = [];
  
  data.forEach((row, index) => {
    try {
      const x = parseFloat(row[xCol]);
      const y = parseFloat(row[yCol]);
      
      // Check for valid numeric values
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        // Additional checks for extreme values that might cause numerical issues
        if (Math.abs(x) < 1e10 && Math.abs(y) < 1e10) {
          validPoints.push({ x, y });
        } else {
          console.warn(`Skipping row ${index}: extreme values (x=${x}, y=${y})`);
        }
      } else {
        console.warn(`Skipping row ${index}: invalid values (x=${x}, y=${y})`);
      }
    } catch (error) {
      console.warn(`Error processing row ${index}:`, error);
    }
  });
  
  console.log(`Validated ${validPoints.length} out of ${data.length} data points`);
  return validPoints;
}

// Forex pair detection functions
function detectForexPair(columnName: string): { isForexPair: boolean; baseCurrency?: string; quoteCurrency?: string; format?: 'slash' | 'direct' } {
  const slashPattern = /^([A-Z]{3})\/([A-Z]{3})$/;
  const directPattern = /^([A-Z]{3})([A-Z]{3})$/;
  
  const slashMatch = columnName.match(slashPattern);
  if (slashMatch) {
    return {
      isForexPair: true,
      baseCurrency: slashMatch[1],
      quoteCurrency: slashMatch[2],
      format: 'slash'
    };
  }
  
  const directMatch = columnName.match(directPattern);
  if (directMatch) {
    return {
      isForexPair: true,
      baseCurrency: directMatch[1],
      quoteCurrency: directMatch[2],
      format: 'direct'
    };
  }
  
  return { isForexPair: false };
}

function invertForexPair(columnName: string): string {
  const pairInfo = detectForexPair(columnName);
  if (!pairInfo.isForexPair || !pairInfo.baseCurrency || !pairInfo.quoteCurrency) {
    return columnName;
  }
  
  if (pairInfo.format === 'slash') {
    return `${pairInfo.quoteCurrency}/${pairInfo.baseCurrency}`;
  } else {
    return `${pairInfo.quoteCurrency}${pairInfo.baseCurrency}`;
  }
}

function invertForexDataInDataset(dataset: Dataset, columnName: string, forexPairName?: string): Dataset {
  const newColumnName = forexPairName ? invertForexPair(forexPairName) : invertForexPair(columnName);
  
  const newData = dataset.data.map(row => {
    const newRow = { ...row };
    const value = parseFloat(row[columnName]);
    
    if (!isNaN(value) && value !== 0) {
      newRow[newColumnName] = 1 / value;
    } else {
      newRow[newColumnName] = null;
    }
    
    delete newRow[columnName];
    return newRow;
  });

  const newHeaders = dataset.headers.map(h => h === columnName ? newColumnName : h);
  const newNumericColumns = dataset.numericColumns.map(h => h === columnName ? newColumnName : h);

  return {
    ...dataset,
    data: newData,
    headers: newHeaders,
    numericColumns: newNumericColumns
  };
}

// Data combination functions
function combineDatasets(
  datasets: Dataset[],
  xVariable: VariableSelection,
  yVariable: VariableSelection
): CombinedData | null {
  if (!xVariable.datasetId || !xVariable.column || !yVariable.datasetId || !yVariable.column) {
    return null;
  }

  const xDataset = datasets.find(d => d.id === xVariable.datasetId);
  const yDataset = datasets.find(d => d.id === yVariable.datasetId);

  if (!xDataset || !yDataset) {
    return null;
  }

  // If data comes from the same dataset, pair them directly
  if (xVariable.datasetId === yVariable.datasetId) {
    const dataPoints = validateNumericData(xDataset.data, xVariable.column, yVariable.column);
    
    return {
      dataPoints,
      xLabel: xVariable.customName || xVariable.label,
      yLabel: yVariable.customName || yVariable.label,
      sourceInfo: {
        x: { dataset: xDataset.name, column: xVariable.column },
        y: { dataset: yDataset.name, column: yVariable.column }
      }
    };
  }

  // If data comes from different datasets, align by index
  const xData = xDataset.data.map(row => parseFloat(row[xVariable.column])).filter(v => !isNaN(v));
  const yData = yDataset.data.map(row => parseFloat(row[yVariable.column])).filter(v => !isNaN(v));
  
  const minLength = Math.min(xData.length, yData.length);
  const dataPoints: DataPoint[] = [];
  
  for (let i = 0; i < minLength; i++) {
    if (!isNaN(xData[i]) && !isNaN(yData[i])) {
      dataPoints.push({ x: xData[i], y: yData[i] });
    }
  }

  return {
    dataPoints,
    xLabel: xVariable.customName || xVariable.label,
    yLabel: yVariable.customName || yVariable.label,
    sourceInfo: {
      x: { dataset: xDataset.name, column: xVariable.column },
      y: { dataset: yDataset.name, column: yVariable.column }
    }
  };
}

function createCustomEquationString(
  type: RegressionType, 
  coefficients: number[], 
  xName: string, 
  yName: string, 
  degree?: number
): string {
  const formatCoef = (coef: number, precision = 4) => coef.toFixed(precision);
  
  switch (type) {
    case 'linear':
      return `${yName} = ${formatCoef(coefficients[1])} × ${xName} + ${formatCoef(coefficients[0])}`;
    case 'polynomial':
      const terms = coefficients.map((coef, index) => {
        if (index === 0) return formatCoef(coef);
        if (index === 1) return `${formatCoef(coef)} × ${xName}`;
        return `${formatCoef(coef)} × ${xName}^${index}`;
      });
      return `${yName} = ${terms.join(' + ')}`;
    case 'exponential':
      return `${yName} = ${formatCoef(coefficients[0])} × e^(${formatCoef(coefficients[1])} × ${xName})`;
    case 'logarithmic':
      return `${yName} = ${formatCoef(coefficients[0])} + ${formatCoef(coefficients[1])} × ln(${xName})`;
    case 'power':
      return `${yName} = ${formatCoef(coefficients[0])} × ${xName}^${formatCoef(coefficients[1])}`;
    case 'logistic':
      return `${yName} = ${formatCoef(coefficients[2])} / (1 + e^(-(${formatCoef(coefficients[0])} + ${formatCoef(coefficients[1])} × ${xName})))`;
    default:
      return 'Unknown equation type';
  }
}

function calculateMetrics(data: DataPoint[], predictions: number[], numParams: number): RegressionMetrics {
  const n = data.length;
  const actualValues = data.map(point => point.y);
  const meanActual = actualValues.reduce((sum, val) => sum + val, 0) / n;
  
  // Calculate metrics
  const residuals = actualValues.map((actual, i) => actual - predictions[i]);
  const sse = residuals.reduce((sum, residual) => sum + residual * residual, 0);
  const sst = actualValues.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0);
  
  const mae = residuals.reduce((sum, residual) => sum + Math.abs(residual), 0) / n;
  const mse = sse / n;
  const rmse = Math.sqrt(mse);
  const mape = residuals.reduce((sum, residual, i) => {
    return sum + (actualValues[i] !== 0 ? Math.abs(residual / actualValues[i]) : 0);
  }, 0) / n * 100;
  
  const r2 = 1 - (sse / sst);
  const adjustedR2 = 1 - ((1 - r2) * (n - 1)) / (n - numParams - 1);
  
  const standardError = Math.sqrt(sse / (n - numParams));
  const fStatistic = (r2 / numParams) / ((1 - r2) / (n - numParams - 1));
  const pValue = fDistributionCDF(fStatistic, numParams, n - numParams - 1);
  
  const aic = n * Math.log(sse / n) + 2 * numParams;
  const bic = n * Math.log(sse / n) + numParams * Math.log(n);
  
  return {
    mae,
    mse,
    rmse,
    mape,
    adjustedR2,
    aic,
    bic,
    standardError,
    fStatistic,
    pValue
  };
}

function fDistributionCDF(f: number, df1: number, df2: number): number {
  // Simplified approximation of F-distribution CDF
  return 1 - Math.exp(-f * df1 / df2);
}

function calculateCorrelationStats(data: DataPoint[]): CorrelationStats {
  const n = data.length;
  
  if (n < 3) {
    return {
      pearsonR: 0,
      spearmanRho: 0,
      kendallTau: 0,
      pValue: 1,
      confidenceInterval: { lower: 0, upper: 0 },
      significance: 'very weak',
      isSignificant: false
    };
  }

  // Pearson correlation
  const xValues = data.map(p => p.x);
  const yValues = data.map(p => p.y);
  const xMean = xValues.reduce((sum, val) => sum + val, 0) / n;
  const yMean = yValues.reduce((sum, val) => sum + val, 0) / n;
  
  const numerator = data.reduce((sum, point) => 
    sum + (point.x - xMean) * (point.y - yMean), 0);
  const xSumSq = data.reduce((sum, point) => 
    sum + Math.pow(point.x - xMean, 2), 0);
  const ySumSq = data.reduce((sum, point) => 
    sum + Math.pow(point.y - yMean, 2), 0);
  
  const pearsonR = numerator / Math.sqrt(xSumSq * ySumSq);
  
  // Spearman rank correlation
  const xRanks = getRanks(xValues);
  const yRanks = getRanks(yValues);
  const xRankMean = xRanks.reduce((sum, val) => sum + val, 0) / n;
  const yRankMean = yRanks.reduce((sum, val) => sum + val, 0) / n;
  
  const spearmanNum = xRanks.reduce((sum, xRank, i) => 
    sum + (xRank - xRankMean) * (yRanks[i] - yRankMean), 0);
  const spearmanXSumSq = xRanks.reduce((sum, xRank) => 
    sum + Math.pow(xRank - xRankMean, 2), 0);
  const spearmanYSumSq = yRanks.reduce((sum, yRank) => 
    sum + Math.pow(yRank - yRankMean, 2), 0);
  
  const spearmanRho = spearmanNum / Math.sqrt(spearmanXSumSq * spearmanYSumSq);
  
  // Kendall's tau (simplified)
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const xDiff = data[i].x - data[j].x;
      const yDiff = data[i].y - data[j].y;
      if ((xDiff > 0 && yDiff > 0) || (xDiff < 0 && yDiff < 0)) {
        concordant++;
      } else if ((xDiff > 0 && yDiff < 0) || (xDiff < 0 && yDiff > 0)) {
        discordant++;
      }
    }
  }
  const kendallTau = (concordant - discordant) / (0.5 * n * (n - 1));
  
  // P-value for Pearson correlation (t-test)
  const tStat = pearsonR * Math.sqrt((n - 2) / (1 - pearsonR * pearsonR));
  const pValue = 2 * (1 - Math.abs(tStat) / Math.sqrt(tStat * tStat + n - 2));
  
  // Confidence interval for Pearson correlation (Fisher's z-transform)
  const zR = 0.5 * Math.log((1 + pearsonR) / (1 - pearsonR));
  const zSE = 1 / Math.sqrt(n - 3);
  const zLower = zR - 1.96 * zSE;
  const zUpper = zR + 1.96 * zSE;
  const ciLower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
  const ciUpper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);
  
  // Significance interpretation
  const absR = Math.abs(pearsonR);
  let significance: 'very strong' | 'strong' | 'moderate' | 'weak' | 'very weak';
  if (absR >= 0.9) significance = 'very strong';
  else if (absR >= 0.7) significance = 'strong';
  else if (absR >= 0.5) significance = 'moderate';
  else if (absR >= 0.3) significance = 'weak';
  else significance = 'very weak';
  
  return {
    pearsonR: isNaN(pearsonR) ? 0 : pearsonR,
    spearmanRho: isNaN(spearmanRho) ? 0 : spearmanRho,
    kendallTau: isNaN(kendallTau) ? 0 : kendallTau,
    pValue: isNaN(pValue) ? 1 : Math.max(0, Math.min(1, pValue)),
    confidenceInterval: { 
      lower: isNaN(ciLower) ? 0 : ciLower, 
      upper: isNaN(ciUpper) ? 0 : ciUpper 
    },
    significance,
    isSignificant: pValue < 0.05
  };
}

function getRanks(values: number[]): number[] {
  const sorted = values.map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val);
  
  const ranks = new Array(values.length);
  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].idx] = i + 1;
  }
  return ranks;
}

function calculateResiduals(data: DataPoint[], predictions: number[]): { residuals: number[]; standardizedResiduals: number[] } {
  const residuals = data.map((point, i) => point.y - predictions[i]);
  const meanResidual = residuals.reduce((sum, r) => sum + r, 0) / residuals.length;
  const residualSumSq = residuals.reduce((sum, r) => sum + Math.pow(r - meanResidual, 2), 0);
  const residualStdDev = Math.sqrt(residualSumSq / (residuals.length - 1));
  
  const standardizedResiduals = residuals.map(r => 
    residualStdDev !== 0 ? (r - meanResidual) / residualStdDev : 0
  );
  
  return { residuals, standardizedResiduals };
}

// Regression calculation functions
function linearRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 2) return null;
  
  const n = data.length;
  const sumX = data.reduce((sum, point) => sum + point.x, 0);
  const sumY = data.reduce((sum, point) => sum + point.y, 0);
  const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const predictions = data.map(point => slope * point.x + intercept);
  const sst = data.reduce((sum, point) => {
    const mean = sumY / n;
    return sum + Math.pow(point.y - mean, 2);
  }, 0);
  const sse = data.reduce((sum, point, i) => {
    return sum + Math.pow(point.y - predictions[i], 2);
  }, 0);
  const r2 = 1 - (sse / sst);
  
  const metrics = calculateMetrics(data, predictions, 1);
  const correlation = calculateCorrelationStats(data);
  const { residuals, standardizedResiduals } = calculateResiduals(data, predictions);
  
  return {
    equation: [intercept, slope],
    string: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,
    r2,
    points: data.map(point => ({
      x: point.x,
      y: slope * point.x + intercept
    })),
    type: 'linear',
    metrics,
    coefficients: [intercept, slope],
    intercept,
    slope,
    predict: (x: number) => slope * x + intercept,
    correlation,
    residuals,
    standardizedResiduals
  };
}

function exponentialRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 2) return null;
  
  // Transform y values to ln(y) for linear regression
  const transformedData = data
    .filter(point => point.y > 0) // Exponential regression requires positive y values
    .map(point => ({ x: point.x, y: Math.log(point.y) }));
  
  if (transformedData.length < 2) return null;
  
  const linearResult = linearRegression(transformedData);
  if (!linearResult) return null;
  
  const a = Math.exp(linearResult.intercept!);
  const b = linearResult.slope!;
  
  const predictions = data.map(point => a * Math.exp(b * point.x));
  const metrics = calculateMetrics(data, predictions, 2);
  
  const sst = data.reduce((sum, point) => {
    const mean = data.reduce((s, p) => s + p.y, 0) / data.length;
    return sum + Math.pow(point.y - mean, 2);
  }, 0);
  const sse = data.reduce((sum, point, i) => {
    return sum + Math.pow(point.y - predictions[i], 2);
  }, 0);
  const r2 = 1 - (sse / sst);
  
  return {
    equation: [a, b],
    string: `y = ${a.toFixed(4)} * e^(${b.toFixed(4)} * x)`,
    r2,
    points: data.map(point => ({
      x: point.x,
      y: a * Math.exp(b * point.x)
    })),
    type: 'exponential',
    metrics,
    coefficients: [a, b],
    predict: (x: number) => a * Math.exp(b * x)
  };
}

function logarithmicRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 2) return null;
  
  // Transform x values to ln(x) for linear regression
  const transformedData = data
    .filter(point => point.x > 0) // Logarithmic regression requires positive x values
    .map(point => ({ x: Math.log(point.x), y: point.y }));
  
  if (transformedData.length < 2) return null;
  
  const linearResult = linearRegression(transformedData);
  if (!linearResult) return null;
  
  const a = linearResult.intercept!;
  const b = linearResult.slope!;
  
  const predictions = data
    .filter(point => point.x > 0)
    .map(point => a + b * Math.log(point.x));
  
  const validData = data.filter(point => point.x > 0);
  const metrics = calculateMetrics(validData, predictions, 2);
  
  const sst = validData.reduce((sum, point) => {
    const mean = validData.reduce((s, p) => s + p.y, 0) / validData.length;
    return sum + Math.pow(point.y - mean, 2);
  }, 0);
  const sse = validData.reduce((sum, point, i) => {
    return sum + Math.pow(point.y - predictions[i], 2);
  }, 0);
  const r2 = 1 - (sse / sst);
  
  return {
    equation: [a, b],
    string: `y = ${a.toFixed(4)} + ${b.toFixed(4)} * ln(x)`,
    r2,
    points: validData.map(point => ({
      x: point.x,
      y: a + b * Math.log(point.x)
    })),
    type: 'logarithmic',
    metrics,
    coefficients: [a, b],
    predict: (x: number) => x > 0 ? a + b * Math.log(x) : NaN
  };
}

function powerRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 2) return null;
  
  // Transform both x and y to logarithmic scale
  const transformedData = data
    .filter(point => point.x > 0 && point.y > 0)
    .map(point => ({ x: Math.log(point.x), y: Math.log(point.y) }));
  
  if (transformedData.length < 2) return null;
  
  const linearResult = linearRegression(transformedData);
  if (!linearResult) return null;
  
  const a = Math.exp(linearResult.intercept!);
  const b = linearResult.slope!;
  
  const validData = data.filter(point => point.x > 0 && point.y > 0);
  const predictions = validData.map(point => a * Math.pow(point.x, b));
  const metrics = calculateMetrics(validData, predictions, 2);
  
  const sst = validData.reduce((sum, point) => {
    const mean = validData.reduce((s, p) => s + p.y, 0) / validData.length;
    return sum + Math.pow(point.y - mean, 2);
  }, 0);
  const sse = validData.reduce((sum, point, i) => {
    return sum + Math.pow(point.y - predictions[i], 2);
  }, 0);
  const r2 = 1 - (sse / sst);
  
  return {
    equation: [a, b],
    string: `y = ${a.toFixed(4)} * x^${b.toFixed(4)}`,
    r2,
    points: validData.map(point => ({
      x: point.x,
      y: a * Math.pow(point.x, b)
    })),
    type: 'power',
    metrics,
    coefficients: [a, b],
    predict: (x: number) => x > 0 ? a * Math.pow(x, b) : NaN
  };
}

function polynomialRegression(data: DataPoint[], degree: number = 2): RegressionResult | null {
  if (data.length < degree + 1) return null;
  
  const n = data.length;
  const matrix: number[][] = [];
  const vector: number[] = [];
  
  // Build system of normal equations
  for (let i = 0; i <= degree; i++) {
    const row: number[] = [];
    for (let j = 0; j <= degree; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += Math.pow(data[k].x, i + j);
      }
      row.push(sum);
    }
    matrix.push(row);
    
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += data[k].y * Math.pow(data[k].x, i);
    }
    vector.push(sum);
  }
  
  // Solve using Gaussian elimination
  const coefficients = solveNormalEquations(matrix, vector);
  if (!coefficients) return null;
  
  const predictions = data.map(point => {
    let sum = 0;
    for (let i = 0; i < coefficients.length; i++) {
      sum += coefficients[i] * Math.pow(point.x, i);
    }
    return sum;
  });
  
  const metrics = calculateMetrics(data, predictions, degree);
  
  const sst = data.reduce((sum, point) => {
    const mean = data.reduce((s, p) => s + p.y, 0) / n;
    return sum + Math.pow(point.y - mean, 2);
  }, 0);
  const sse = data.reduce((sum, point, i) => {
    return sum + Math.pow(point.y - predictions[i], 2);
  }, 0);
  const r2 = 1 - (sse / sst);
  
  const equationTerms = coefficients.map((coef, index) => {
    if (index === 0) return `${coef.toFixed(4)}`;
    if (index === 1) return `${coef.toFixed(4)}x`;
    return `${coef.toFixed(4)}x^${index}`;
  });
  
  return {
    equation: coefficients,
    string: `y = ${equationTerms.join(' + ')}`,
    r2,
    points: data.map(point => ({
      x: point.x,
      y: predictions[data.indexOf(point)]
    })),
    type: 'polynomial',
    metrics,
    coefficients,
    predict: (x: number) => {
      let sum = 0;
      for (let i = 0; i < coefficients.length; i++) {
        sum += coefficients[i] * Math.pow(x, i);
      }
      return sum;
    }
  };
}

function solveNormalEquations(A: number[][], b: number[]): number[] | null {
  return gaussianElimination(A, b);
}

function gaussianElimination(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Check for zero pivot
    if (Math.abs(augmented[i][i]) < 1e-10) {
      return null;
    }
    
    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }
  
  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }
  
  return x;
}

function logisticRegression(data: DataPoint[]): RegressionResult | null {
  if (data.length < 3) return null;
  
  try {
    // Normalize Y values to 0-1 range for logistic regression
    const yValues = data.map(p => p.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const range = maxY - minY;
    
    if (range === 0) return null;
    
    // Transform data to 0-1 range
    const normalizedData = data.map(p => ({
      x: p.x,
      y: (p.y - minY) / range
    }));
    
    // Use iterative least squares to fit logistic curve
    let a = 0.5, b = 1, c = 1; // Initial parameters
    
    for (let iter = 0; iter < 50; iter++) {
      const predictions = normalizedData.map(p => c / (1 + Math.exp(-(a + b * p.x))));
      const residuals = normalizedData.map((p, i) => p.y - predictions[i]);
      const sse = residuals.reduce((sum, r) => sum + r * r, 0);
      
      if (sse < 0.0001) break;
      
      // Simple gradient descent
      const step = 0.01;
      a += step * residuals.reduce((sum, r, i) => sum + r, 0) / normalizedData.length;
      b += step * residuals.reduce((sum, r, i) => sum + r * normalizedData[i].x, 0) / normalizedData.length;
      c += step * residuals.reduce((sum, r, i) => sum + r / (1 + Math.exp(-(a + b * normalizedData[i].x))), 0) / normalizedData.length;
      
      // Clamp parameters to reasonable ranges
      c = Math.max(0.1, Math.min(2, c));
    }
    
    // Scale back parameters for original data range
    const scaledA = a;
    const scaledB = b;
    const scaledC = c * range + minY;
    
    const predict = (x: number) => (scaledC - minY) / (1 + Math.exp(-(scaledA + scaledB * x))) + minY;
    
    const predictions = data.map(p => predict(p.x));
    const metrics = calculateMetrics(data, predictions, 3);
    
    const sst = data.reduce((sum, point) => {
      const mean = data.reduce((s, p) => s + p.y, 0) / data.length;
      return sum + Math.pow(point.y - mean, 2);
    }, 0);
    const sse = data.reduce((sum, point, i) => {
      return sum + Math.pow(point.y - predictions[i], 2);
    }, 0);
    const r2 = 1 - (sse / sst);
    
    return {
      equation: [scaledA, scaledB, scaledC],
      string: `y = ${scaledC.toFixed(4)} / (1 + e^(-(${scaledA.toFixed(4)} + ${scaledB.toFixed(4)} * x)))`,
      r2: Math.max(0, r2),
      points: data.map(point => ({
        x: point.x,
        y: predict(point.x)
      })),
      type: 'logistic',
      metrics,
      coefficients: [scaledA, scaledB, scaledC],
      predict
    };
  } catch (error) {
    console.error('Logistic regression error:', error);
    return null;
  }
}

function performRegression(
  data: DataPoint[], 
  type: RegressionType,
  order = 2,
  xName = 'x',
  yName = 'y'
): RegressionResult | null {
  if (!data || data.length < 2) {
    console.error(`Not enough data points for ${type} regression:`, data?.length || 0);
    return null;
  }

  let result: RegressionResult | null = null;
  
  try {
    switch (type) {
      case 'linear':
        result = linearRegression(data);
        break;
      case 'polynomial':
        if (data.length < order + 1) {
          console.error(`Not enough data points for polynomial degree ${order}: need ${order + 1}, have ${data.length}`);
          return null;
        }
        result = polynomialRegression(data, order);
        break;
      case 'exponential':
        // Check if all y values are positive
        if (!data.every(p => p.y > 0)) {
          console.error('Exponential regression requires all y values > 0');
          return null;
        }
        result = exponentialRegression(data);
        break;
      case 'logarithmic':
        // Check if all x values are positive
        if (!data.every(p => p.x > 0)) {
          console.error('Logarithmic regression requires all x values > 0');
          return null;
        }
        result = logarithmicRegression(data);
        break;
      case 'power':
        // Check if all x and y values are positive
        if (!data.every(p => p.x > 0 && p.y > 0)) {
          console.error('Power regression requires all x and y values > 0');
          return null;
        }
        result = powerRegression(data);
        break;
      case 'logistic':
        result = logisticRegression(data);
        break;
      default:
        console.error('Unknown regression type:', type);
        return null;
    }
    
    if (result) {
      result.customString = createCustomEquationString(type, result.coefficients, xName, yName, order);
    }
    
    return result;
  } catch (error) {
    console.error(`Error in ${type} regression:`, error);
    return null;
  }
}

function calculateStatistics(data: DataPoint[]) {
  if (data.length === 0) {
    return { mean: { x: 0, y: 0 }, std: { x: 0, y: 0 }, correlation: 0, min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  
  const xValues = data.map(p => p.x);
  const yValues = data.map(p => p.y);
  
  const meanX = xValues.reduce((sum, val) => sum + val, 0) / xValues.length;
  const meanY = yValues.reduce((sum, val) => sum + val, 0) / yValues.length;
  
  const stdX = Math.sqrt(xValues.reduce((sum, val) => sum + Math.pow(val - meanX, 2), 0) / (xValues.length - 1));
  const stdY = Math.sqrt(yValues.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / (yValues.length - 1));
  
  const correlation = xValues.reduce((sum, val, i) => 
    sum + (val - meanX) * (yValues[i] - meanY), 0
  ) / ((xValues.length - 1) * stdX * stdY);
  
  return {
    mean: { x: meanX, y: meanY },
    std: { x: stdX, y: stdY },
    correlation: isNaN(correlation) ? 0 : correlation,
    min: { x: Math.min(...xValues), y: Math.min(...yValues) },
    max: { x: Math.max(...xValues), y: Math.max(...yValues) }
  };
}

function getAvailableRegressionTypes(data: DataPoint[]): RegressionType[] {
  if (!data || data.length < 2) {
    return ['linear'];
  }

  const types: RegressionType[] = ['linear', 'polynomial'];
  
  try {
    // Check if exponential regression is possible (all y > 0)
    if (data.length >= 3 && data.every(point => point.y > 0 && isFinite(point.y))) {
      types.push('exponential');
    }
    
    // Check if logarithmic regression is possible (all x > 0)
    if (data.length >= 3 && data.every(point => point.x > 0 && isFinite(point.x))) {
      types.push('logarithmic');
    }
    
    // Check if power regression is possible (all x > 0 and y > 0)
    if (data.length >= 3 && data.every(point => point.x > 0 && point.y > 0 && isFinite(point.x) && isFinite(point.y))) {
      types.push('power');
    }
    
    // Logistic regression needs at least 3 points and some variation in Y
    if (data.length >= 3) {
      const yValues = data.map(p => p.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      if (maxY > minY && isFinite(minY) && isFinite(maxY)) {
        types.push('logistic');
      }
    }
  } catch (error) {
    console.error('Error checking available regression types:', error);
  }
  
  return types;
}

// ===============================
// COMPONENT DEFINITIONS
// ===============================

// File Upload Component
interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="text-center">
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <div className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        Import CSV file
      </div>
      <div className="text-sm text-gray-500 mb-4">
        Drag and drop a CSV file or click to select
      </div>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
        id="csv-upload"
      />
      <Button asChild>
        <label htmlFor="csv-upload" className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Choose a file
        </label>
      </Button>
    </div>
  );
};

// Forex Column Manager Component
function ForexColumnManager({ 
  dataset, 
  onForexInversion 
}: { 
  dataset: Dataset; 
  onForexInversion: (datasetId: string, columnName: string, forexPairName?: string) => void;
}) {
  const [enableInversion, setEnableInversion] = useState<boolean>(false);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [forexPairName, setForexPairName] = useState<string>('');

  const handleInversion = () => {
    if (!selectedColumn || !forexPairName || !enableInversion) return;
    onForexInversion(dataset.id, selectedColumn, forexPairName);
    setSelectedColumn('');
    setForexPairName('');
    setEnableInversion(false);
  };

  return (
    <div className="border rounded-lg p-3 bg-white dark:bg-gray-800">
      <div className="font-medium text-sm mb-3 text-yellow-800 dark:text-yellow-200">
        {dataset.name}
      </div>
      
      <div className="mb-3">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id={`enable-inversion-${dataset.id}`}
            checked={enableInversion}
            onCheckedChange={(checked) => setEnableInversion(checked === true)}
          />
          <Label 
            htmlFor={`enable-inversion-${dataset.id}`}
            className="text-sm text-yellow-800 dark:text-yellow-200 cursor-pointer"
          >
                            Enable forex pair inversion
          </Label>
        </div>
      </div>

      {enableInversion && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs text-yellow-700 dark:text-yellow-300">
              Column to invert
            </Label>
            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Choose..." />
              </SelectTrigger>
              <SelectContent>
                {dataset.numericColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-yellow-700 dark:text-yellow-300">
              Currency pair
            </Label>
            <Input
              placeholder="USD/MAD"
              value={forexPairName}
              onChange={(e) => setForexPairName(e.target.value.toUpperCase())}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <Button
              size="sm"
              onClick={handleInversion}
              disabled={!selectedColumn || !forexPairName}
              className="h-8 w-full"
            >
              <RefreshCcw className="h-3 w-3 mr-1" />
              → {forexPairName ? invertForexPair(forexPairName) : '?'}
            </Button>
          </div>
        </div>
      )}

      {dataset.numericColumns.some(col => detectForexPair(col).isForexPair) && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                          Automatically detected pairs:
          </div>
          <div className="flex flex-wrap gap-2">
            {dataset.numericColumns
              .filter(col => detectForexPair(col).isForexPair)
              .map(col => (
                <div key={col} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border">
                  <span className="text-sm font-medium">{col}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onForexInversion(dataset.id, col)}
                    className="h-6 px-2 text-xs"
                  >
                    <RefreshCcw className="h-3 w-3 mr-1" />
                    → {invertForexPair(col)}
                  </Button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi Dataset Manager Component
interface MultiDatasetManagerProps {
  datasets: Dataset[];
  onDatasetsChange: (datasets: Dataset[]) => void;
  selectedVariables: { x: VariableSelection | null; y: VariableSelection | null };
  onVariableSelect: (variable: VariableSelection, axis: 'x' | 'y') => void;
  onValidateAndProceed?: () => void;
  isValidated?: boolean;
}

function MultiDatasetManager({ 
  datasets, 
  onDatasetsChange, 
  selectedVariables, 
  onVariableSelect,
  onValidateAndProceed,
  isValidated = false
}: MultiDatasetManagerProps) {
  const [activeTab, setActiveTab] = useState<string>("upload");

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const result = parseCSV(text);
      
      if (result.data.length === 0) {
        toast({
          title: "No data found",
          description: "The file appears to be empty or invalid",
          variant: "destructive"
        });
        return;
      }

      const numericColumns = getNumericColumns(result.data, result.headers);

      const newDataset: Dataset = {
        id: Date.now().toString(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        data: result.data,
        headers: result.headers,
        numericColumns,
        rowCount: result.data.length
      };

      const updatedDatasets = [...datasets, newDataset];
      onDatasetsChange(updatedDatasets);
      setActiveTab(newDataset.id);

      toast({
        title: "Dataset loaded successfully",
        description: `${result.data.length} rows, ${result.headers.length} columns, ${numericColumns.length} numeric`
      });
    } catch (error) {
      toast({
        title: "Loading Error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  }, [datasets, onDatasetsChange]);

  const removeDataset = useCallback((datasetId: string) => {
    const updatedDatasets = datasets.filter(d => d.id !== datasetId);
    onDatasetsChange(updatedDatasets);
    
    if (selectedVariables.x?.datasetId === datasetId) {
      onVariableSelect({ datasetId: "", column: "", label: "" }, 'x');
    }
    if (selectedVariables.y?.datasetId === datasetId) {
      onVariableSelect({ datasetId: "", column: "", label: "" }, 'y');
    }

    if (updatedDatasets.length === 0) {
      setActiveTab("upload");
    } else if (activeTab === datasetId) {
      setActiveTab(updatedDatasets[0].id);
    }
  }, [datasets, onDatasetsChange, selectedVariables, onVariableSelect, activeTab]);

  const handleForexInversion = useCallback((datasetId: string, columnName: string, forexPairName?: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;
    
    const newDataset = invertForexDataInDataset(dataset, columnName, forexPairName);
    const updatedDatasets = datasets.map(d => d.id === datasetId ? newDataset : d);
    
    onDatasetsChange(updatedDatasets);
    
    const newColumnName = forexPairName ? invertForexPair(forexPairName) : invertForexPair(columnName);
    if (selectedVariables.x?.datasetId === datasetId && selectedVariables.x?.column === columnName) {
      onVariableSelect({
        datasetId,
        column: newColumnName,
        label: newColumnName,
        customName: selectedVariables.x.customName
      }, 'x');
    }
    if (selectedVariables.y?.datasetId === datasetId && selectedVariables.y?.column === columnName) {
      onVariableSelect({
        datasetId,
        column: newColumnName,
        label: newColumnName,
        customName: selectedVariables.y.customName
      }, 'y');
    }

    const originalName = forexPairName || columnName;
    toast({
      title: "Pair inverted",
      description: `${originalName} → ${newColumnName}`,
      variant: "default"
    });
  }, [datasets, onDatasetsChange, selectedVariables, onVariableSelect]);

  const handleVariableSelect = useCallback((datasetId: string, column: string, axis: 'x' | 'y') => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (dataset) {
      const pairInfo = detectForexPair(column);
      const label = pairInfo.isForexPair ? column : `${dataset.name}.${column}`;
      
      onVariableSelect({
        datasetId,
        column,
        label
      }, axis);
    }
  }, [datasets, onVariableSelect]);

  const allNumericOptions = datasets.flatMap(dataset => 
    dataset.numericColumns.map(column => ({
      datasetId: dataset.id,
      datasetName: dataset.name,
      column,
      label: `${dataset.name}.${column}`
    }))
  );

  const canValidate = selectedVariables.x && selectedVariables.y && 
    selectedVariables.x.datasetId && selectedVariables.x.column &&
    selectedVariables.y.datasetId && selectedVariables.y.column;

  const getDatasetInfo = (selection: VariableSelection) => {
    const dataset = datasets.find(d => d.id === selection.datasetId);
    return dataset;
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Management
          </div>
          {datasets.length > 0 && (
            <Badge variant="outline">
              {datasets.length} dataset{datasets.length > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {datasets.length > 0 && (
          <div className="mb-6 space-y-4">
                          <h3 className="font-medium">Variable Selection</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-primary">Variable X (Independent)</label>
                <Select 
                  value={selectedVariables.x?.datasetId && selectedVariables.x?.column ? 
                    `${selectedVariables.x.datasetId}:${selectedVariables.x.column}` : ""} 
                  onValueChange={(value) => {
                    if (value) {
                      const [datasetId, column] = value.split(':');
                      handleVariableSelect(datasetId, column, 'x');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose X variable..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allNumericOptions.map((option) => (
                      <SelectItem key={`${option.datasetId}:${option.column}`} value={`${option.datasetId}:${option.column}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{option.datasetName}</Badge>
                          {option.column}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block text-green-600">Variable Y (Dependent)</label>
                <Select 
                  value={selectedVariables.y?.datasetId && selectedVariables.y?.column ? 
                    `${selectedVariables.y.datasetId}:${selectedVariables.y.column}` : ""} 
                  onValueChange={(value) => {
                    if (value) {
                      const [datasetId, column] = value.split(':');
                      handleVariableSelect(datasetId, column, 'y');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Y variable..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allNumericOptions.map((option) => (
                      <SelectItem key={`${option.datasetId}:${option.column}`} value={`${option.datasetId}:${option.column}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{option.datasetName}</Badge>
                          {option.column}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {canValidate && (
          <div className="border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Validation of Selected Variables
              </h3>
              {isValidated && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Validated
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                                  <div className="font-medium text-sm text-primary">Variable X (Independent)</div>
                <div className="bg-card rounded p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getDatasetInfo(selectedVariables.x!)?.name}
                    </Badge>
                    <span className="font-medium">{selectedVariables.x!.column}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getDatasetInfo(selectedVariables.x!)?.data.length} data rows
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                                  <div className="font-medium text-sm text-accent">Variable Y (Dependent)</div>
                <div className="bg-card rounded p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getDatasetInfo(selectedVariables.y!)?.name}
                    </Badge>
                    <span className="font-medium">{selectedVariables.y!.column}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getDatasetInfo(selectedVariables.y!)?.data.length} data rows
                  </div>
                </div>
              </div>
            </div>

            {selectedVariables.x!.datasetId !== selectedVariables.y!.datasetId && (
              <div className="mb-4 p-3 bg-primary/10 dark:bg-primary/10 rounded border border-primary/30 dark:border-primary/40">
                <div className="flex items-center gap-2 text-primary dark:text-primary text-sm">
                  <Info className="h-4 w-4" />
                  <span className="font-medium">Cross-Dataset Analysis</span>
                </div>
                <div className="text-sm text-primary/85 dark:text-primary/85 mt-1">
                  Data comes from different datasets. Alignment will be performed automatically.
                </div>
              </div>
            )}

            <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
              <div className="text-sm font-medium mb-3">Custom variable names:</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="x-custom-name" className="text-xs">
                    Name for {selectedVariables.x!.column}
                  </Label>
                  <Input
                    id="x-custom-name"
                    placeholder={selectedVariables.x!.column}
                    value={selectedVariables.x!.customName || ''}
                    onChange={(e) => {
                      const updatedSelection = { ...selectedVariables.x!, customName: e.target.value };
                      onVariableSelect(updatedSelection, 'x');
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="y-custom-name" className="text-xs">
                    Name for {selectedVariables.y!.column}
                  </Label>
                  <Input
                    id="y-custom-name"
                    placeholder={selectedVariables.y!.column}
                    value={selectedVariables.y!.customName || ''}
                    onChange={(e) => {
                      const updatedSelection = { ...selectedVariables.y!, customName: e.target.value };
                      onVariableSelect(updatedSelection, 'y');
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                These names will appear in regression equations
              </div>
            </div>

            <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-5 w-5 text-yellow-600" />
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                  Forex Pair Inversion (Optional)
                </h3>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
                Invert a currency pair before analysis (e.g., USD/MAD → MAD/USD)
              </p>
              
              <div className="space-y-3">
                {datasets.map(dataset => (
                  <ForexColumnManager
                    key={dataset.id}
                    dataset={dataset}
                    onForexInversion={handleForexInversion}
                  />
                ))}
              </div>
            </div>

            {onValidateAndProceed && (
              <div className="flex justify-end">
                <Button 
                  onClick={() => {
                    console.log('Validation button clicked');
                    onValidateAndProceed();
                  }}
                  className="flex items-center gap-2"
                  disabled={isValidated}
                >
                  {isValidated ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Data Validated
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" />
                      Validate and Continue
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Datasets</h3>
            <Button onClick={() => setActiveTab("upload")} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Dataset
            </Button>
          </div>

          {activeTab === "upload" && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <FileUpload onFileSelect={handleFileSelect} />
            </div>
          )}

          {datasets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {datasets.map((dataset) => (
                <Card key={dataset.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{dataset.name}</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDataset(dataset.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div>{dataset.data.length} lignes • {dataset.headers.length} colonnes</div>
                      <div className="flex flex-wrap gap-1">
                        {dataset.numericColumns.slice(0, 3).map((column) => (
                          <Badge key={column} variant="secondary" className="text-xs">
                            {column}
                          </Badge>
                        ))}
                        {dataset.numericColumns.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{dataset.numericColumns.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Model Selector Component
interface ModelSelectorProps {
  selectedModel: RegressionType;
  onModelSelect: (model: RegressionType) => void;
  regressionResults: Record<RegressionType, RegressionResult | null>;
  availableTypes: RegressionType[];
  calculatedModels: Set<RegressionType>;
  onCalculateModel: (model: RegressionType) => void;
  onCalculateAll: () => void;
  isCalculatingAll: boolean;
  isDataValidated: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelSelect,
  regressionResults,
  availableTypes,
  calculatedModels,
  onCalculateModel,
  onCalculateAll,
  isCalculatingAll,
  isDataValidated
}) => {
  const getModelIcon = (type: RegressionType) => {
    switch (type) {
      case 'linear': return TrendingUp;
      case 'polynomial': return BarChart3;
      case 'exponential': return TrendingUp;
      case 'logarithmic': return TrendingDown;
      case 'power': return Calculator;
      case 'logistic': return Database;
      default: return Calculator;
    }
  };

  const getModelName = (type: RegressionType) => {
    switch (type) {
              case 'linear': return 'Linear';
              case 'polynomial': return 'Polynomial';
              case 'exponential': return 'Exponential';
              case 'logarithmic': return 'Logarithmic';
              case 'power': return 'Power';
              case 'logistic': return 'Logistic';
      default: return type;
    }
  };

  const getModelColor = (type: RegressionType) => {
    switch (type) {
      case 'linear': return 'text-primary';
      case 'polynomial': return 'text-emerald-600';
      case 'exponential': return 'text-green-600';
      case 'logarithmic': return 'text-orange-600';
      case 'power': return 'text-red-600';
      case 'logistic': return 'text-primary';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Regression Models
          </div>
          <Button 
            onClick={onCalculateAll}
            disabled={!isDataValidated || isCalculatingAll}
            variant="outline"
            size="sm"
          >
            {isCalculatingAll ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                Calcul...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Calculer Tous
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {availableTypes.map((type) => {
            const Icon = getModelIcon(type);
            const isCalculated = calculatedModels.has(type);
            const result = regressionResults[type];
            const isSelected = selectedModel === type;
            
            return (
              <div key={type} className="space-y-2">
                <Button
                  variant={isSelected ? "default" : "outline"}
                  className={`w-full h-auto p-3 flex flex-col items-center gap-2 ${
                    isSelected ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                  onClick={() => onModelSelect(type)}
                  disabled={!isDataValidated}
                >
                  <Icon className={`h-5 w-5 ${getModelColor(type)}`} />
                  <span className="text-xs font-medium">{getModelName(type)}</span>
                  {isCalculated && result && (
                    <Badge variant="secondary" className="text-xs">
                      R² = {result.r2.toFixed(3)}
                    </Badge>
                  )}
                </Button>
                
                {!isCalculated && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-6 text-xs"
                    onClick={() => onCalculateModel(type)}
                    disabled={!isDataValidated}
                  >
                    <PlayCircle className="h-3 w-3 mr-1" />
                    Calculer
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// Regression Chart Component
interface RegressionChartProps {
  data: DataPoint[];
  regression: RegressionResult | null;
  title: string;
  xLabel: string;
  yLabel: string;
}

const RegressionChart: React.FC<RegressionChartProps> = ({ data, regression, title, xLabel, yLabel }) => {
  const { chartData, xDomain, yDomain } = useMemo(() => {
    if (!data.length) return { 
      chartData: [], 
      xDomain: [0, 1], 
      yDomain: [0, 1] 
    };
    
    // Calculate domains with proper padding
    const xValues = data.map(p => p.x);
    const yValues = data.map(p => p.y);
    
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    
    // Add 3% padding to each side for better visualization
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const xPadding = Math.max(xRange * 0.03, 0.01); // Minimum padding
    const yPadding = Math.max(yRange * 0.03, 0.001);
    
    const xDomainCalc: [number, number] = [
      minX - xPadding,
      maxX + xPadding
    ];
    
    const yDomainCalc: [number, number] = [
      minY - yPadding,
      maxY + yPadding
    ];
    
    // Combine real data with regression line for unified chart data
    const combinedData: Array<{
      x: number;
      actual?: number;
      predicted?: number;
      isRegressionPoint?: boolean;
    }> = [];
    
    // Add real data points
    data.forEach(point => {
      combinedData.push({
        x: point.x,
        actual: point.y,
        predicted: regression ? regression.predict(point.x) : undefined,
        isRegressionPoint: false
      });
    });
    
    // Add regression line points (only 25 points for clean line)
    if (regression) {
      const numRegressionPoints = 25;
      const step = (maxX - minX) / (numRegressionPoints - 1);
      
      for (let i = 0; i < numRegressionPoints; i++) {
        const x = minX + (i * step);
        const predicted = regression.predict(x);
        if (!isNaN(predicted) && isFinite(predicted)) {
          // Only add if it's not too close to existing data points
          const hasNearbyDataPoint = data.some(point => Math.abs(point.x - x) < step * 0.3);
          if (!hasNearbyDataPoint) {
            combinedData.push({
              x,
              predicted,
              isRegressionPoint: true
            });
          }
        }
      }
    }
    
    // Sort by x value for proper line connection
    combinedData.sort((a, b) => a.x - b.x);
    
    return { 
      chartData: combinedData,
      xDomain: xDomainCalc,
      yDomain: yDomainCalc
    };
  }, [data, regression]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pointData = payload[0].payload;
      
      if (pointData.actual !== undefined) {
        const residual = pointData.predicted !== undefined ? 
          pointData.actual - pointData.predicted : null;
        
        return (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xl border-2 border-blue-200 dark:border-blue-600 backdrop-blur-sm max-w-xs">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div>
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                Data Point
              </p>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center gap-4">
                <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">{xLabel}:</span>
                <span className="font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg text-sm">
                  {Number(pointData.x).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-4">
                                    <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">{yLabel} (Actual):</span>
                <span className="font-bold text-primary bg-primary/10 dark:bg-primary/20 px-3 py-1 rounded-lg text-sm">
                  {Number(pointData.actual).toFixed(4)}
                </span>
              </div>
              {pointData.predicted !== undefined && (
                <>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">{yLabel} (Predicted):</span>
                    <span className="font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-lg text-sm">
                      {Number(pointData.predicted).toFixed(4)}
                    </span>
                  </div>
                  {residual !== null && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">Error (Residual):</span>
                        <span className={`font-bold text-xs px-2.5 py-1 rounded-lg ${
                          Math.abs(residual) < 0.001 
                            ? 'text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-400' 
                            : 'text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400'
                        }`}>
                          {residual > 0 ? '+' : ''}{Number(residual).toFixed(5)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      } else if (pointData.predicted !== undefined) {
        // For regression line points only
        return (
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-red-200 dark:border-red-600">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <p className="font-semibold text-red-600 text-sm">Regression Line</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {xLabel}: <span className="font-mono text-gray-800 dark:text-gray-200">{Number(pointData.x).toFixed(2)}</span>
              </p>
              <p className="text-red-600 text-sm">
                {yLabel}: <span className="font-mono">{Number(pointData.predicted).toFixed(4)}</span>
              </p>
            </div>
          </div>
        );
      }
    }
    return null;
  };

  const getCorrelationColor = (r: number) => {
    const abs = Math.abs(r);
    if (abs >= 0.9) return 'text-green-600';
    if (abs >= 0.7) return 'text-primary';
    if (abs >= 0.5) return 'text-yellow-600';
    if (abs >= 0.3) return 'text-orange-600';
    return 'text-red-600';
  };

  const getCorrelationBg = (r: number) => {
    const abs = Math.abs(r);
    if (abs >= 0.9) return 'bg-green-50 border-green-200';
    if (abs >= 0.7) return 'bg-primary/10 border-primary/30';
    if (abs >= 0.5) return 'bg-yellow-50 border-yellow-200';
    if (abs >= 0.3) return 'bg-orange-50 border-orange-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {title}
            </div>
            {regression && (
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-sm">
                  R² = {regression.r2.toFixed(4)}
                </Badge>
                {regression.correlation && (
                  <Badge 
                    variant={regression.correlation.isSignificant ? "default" : "outline"}
                    className="text-sm"
                  >
                    r = {regression.correlation.pearsonR.toFixed(4)}
                  </Badge>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Equation and basic stats */}
          {regression && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-primary/10 to-emerald-50 dark:from-primary/15 dark:to-emerald-900/20 rounded-lg border border-primary/30 dark:border-primary/40">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Regression Equation</h4>
                <p className="font-mono text-lg text-primary dark:text-primary">
                  {regression.customString || regression.string}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="text-sm text-gray-600 dark:text-gray-400">R²</div>
                  <div className="text-xl font-bold text-primary">{regression.r2.toFixed(4)}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Adjusted R²</div>
                  <div className="text-xl font-bold text-primary">{regression.metrics.adjustedR2.toFixed(4)}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="text-sm text-gray-600 dark:text-gray-400">RMSE</div>
                  <div className="text-xl font-bold text-orange-600">{regression.metrics.rmse.toFixed(4)}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <div className="text-sm text-gray-600 dark:text-gray-400">MAE</div>
                  <div className="text-xl font-bold text-orange-600">{regression.metrics.mae.toFixed(4)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="h-96 border rounded-lg p-2 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart 
                data={chartData}
                margin={{ top: 30, right: 40, left: 40, bottom: 80 }}
              >
                <CartesianGrid 
                  strokeDasharray="1 2" 
                  stroke="#e5e7eb" 
                  strokeWidth={0.6}
                  opacity={0.3}
                />
                <XAxis 
                  type="number" 
                  dataKey="x"
                  domain={xDomain}
                  scale="linear"
                  tickCount={8}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                  label={{ 
                    value: xLabel, 
                    position: 'insideBottom', 
                    offset: -20,
                    style: { 
                      textAnchor: 'middle', 
                      fontWeight: '700', 
                      fontSize: '14px',
                      fill: '#1f2937',
                      fontFamily: 'Inter, system-ui'
                    }
                  }}
                  tick={{ 
                    fontSize: 12, 
                    fill: '#4b5563',
                    fontFamily: 'Inter, system-ui',
                    fontWeight: '500'
                  }}
                  axisLine={{ 
                    stroke: '#374151', 
                    strokeWidth: 1.5 
                  }}
                  tickLine={{ 
                    stroke: '#6b7280', 
                    strokeWidth: 1 
                  }}
                />
                <YAxis 
                  type="number" 
                  domain={yDomain}
                  scale="linear"
                  tickCount={7}
                  tickFormatter={(value) => Number(value).toFixed(3)}
                  label={{ 
                    value: yLabel, 
                    angle: -90, 
                    position: 'insideLeft',
                    offset: 15,
                    style: { 
                      textAnchor: 'middle', 
                      fontWeight: '700', 
                      fontSize: '14px',
                      fill: '#1f2937',
                      fontFamily: 'Inter, system-ui'
                    }
                  }}
                  tick={{ 
                    fontSize: 12, 
                    fill: '#4b5563',
                    fontFamily: 'Inter, system-ui',
                    fontWeight: '500'
                  }}
                  axisLine={{ 
                    stroke: '#374151', 
                    strokeWidth: 1.5 
                  }}
                  tickLine={{ 
                    stroke: '#6b7280', 
                    strokeWidth: 1 
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Regression Line - Clean and Smooth */}
                {regression && (
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={false}
                    name="Regression Line"
                    connectNulls={false}
                    isAnimationActive={false}
                    strokeDasharray="0"
                  />
                )}
                
                {/* Real Data Points - Clear and Distinct */}
                <Scatter 
                  dataKey="actual"
                  fill="#2563eb" 
                  stroke="#1d4ed8"
                  strokeWidth={1.5}
                  name="Actual Data"
                  shape="circle"
                  r={5}
                />
              </ComposedChart>
            </ResponsiveContainer>
            
            {/* Enhanced Custom Legend */}
            <div className="mt-4 flex justify-center">
              <div className="flex items-center gap-8 bg-white dark:bg-gray-800 px-6 py-3 rounded-xl border shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-blue-700 shadow-sm"></div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Actual Data</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-1 bg-red-500 rounded-full shadow-sm"></div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Regression Line</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Correlation Analysis */}
      {regression?.correlation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Correlation Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-4 rounded-lg border-2 ${getCorrelationBg(regression.correlation.pearsonR)}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Pearson (r)</div>
                  <div className={`text-2xl font-bold ${getCorrelationColor(regression.correlation.pearsonR)}`}>
                    {regression.correlation.pearsonR.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {regression.correlation.significance}
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Spearman (ρ)</div>
                  <div className={`text-2xl font-bold ${getCorrelationColor(regression.correlation.spearmanRho)}`}>
                    {regression.correlation.spearmanRho.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">rang</div>
                </div>
                
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Kendall (τ)</div>
                  <div className={`text-2xl font-bold ${getCorrelationColor(regression.correlation.kendallTau)}`}>
                    {regression.correlation.kendallTau.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">concordance</div>
                </div>
                
                <div className="text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">P-value</div>
                  <div className={`text-2xl font-bold ${regression.correlation.pValue < 0.05 ? 'text-green-600' : 'text-red-600'}`}>
                    {regression.correlation.pValue.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {regression.correlation.isSignificant ? 'significatif' : 'non significatif'}
                  </div>
                </div>
              </div>
              
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                <strong>Intervalle de confiance 95%:</strong> [
                {regression.correlation.confidenceInterval.lower.toFixed(4)}, 
                {regression.correlation.confidenceInterval.upper.toFixed(4)}]
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Residuals Analysis */}
      {regression?.residuals && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Residuals Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 border rounded-lg p-4 bg-white dark:bg-gray-800">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart 
                  data={data.map((point, i) => ({
                    predicted: regression.predict(point.x),
                    residual: regression.residuals?.[i] || 0,
                    standardized: regression.standardizedResiduals?.[i] || 0
                  }))}
                  margin={{ top: 25, right: 35, left: 40, bottom: 70 }}
                >
                  <CartesianGrid 
                    strokeDasharray="2 2" 
                    stroke="#e2e8f0" 
                    strokeWidth={1}
                    className="opacity-50" 
                  />
                  <XAxis 
                    type="number" 
                    dataKey="predicted" 
                    name="Predicted Values"
                    scale="linear"
                    tickCount={6}
                    tickFormatter={(value) => Number(value).toFixed(3)}
                    label={{ 
                      value: "Predicted Values", 
                      position: 'insideBottom', 
                      offset: -15,
                      style: { 
                        textAnchor: 'middle', 
                        fontWeight: 'bold',
                        fontSize: '12px',
                        fill: '#374151'
                      }
                    }}
                    tick={{ 
                      fontSize: 11, 
                      fill: '#6b7280',
                      fontFamily: 'system-ui'
                    }}
                    axisLine={{ 
                      stroke: '#64748b', 
                      strokeWidth: 1.5 
                    }}
                    tickLine={{ 
                      stroke: '#64748b', 
                      strokeWidth: 1 
                    }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="residual" 
                    name="Residuals"
                    scale="linear"
                    tickCount={5}
                    tickFormatter={(value) => Number(value).toFixed(4)}
                    label={{ 
                      value: "Residuals", 
                      angle: -90, 
                      position: 'insideLeft',
                      offset: 15,
                      style: { 
                        textAnchor: 'middle', 
                        fontWeight: 'bold',
                        fontSize: '12px',
                        fill: '#374151'
                      }
                    }}
                    tick={{ 
                      fontSize: 11, 
                      fill: '#6b7280',
                      fontFamily: 'system-ui'
                    }}
                    axisLine={{ 
                      stroke: '#64748b', 
                      strokeWidth: 1.5 
                    }}
                    tickLine={{ 
                      stroke: '#64748b', 
                      strokeWidth: 1 
                    }}
                  />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      Number(value).toFixed(4),
                      name === "residual" ? "Residual" : name === "predicted" ? "Predicted" : name
                    ]}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <ReferenceLine 
                    y={0} 
                    stroke="#64748b" 
                    strokeDasharray="4 4" 
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                  <Scatter 
                    name="Residuals"
                    fill="#f59e0b" 
                    stroke="#d97706"
                    strokeWidth={1}
                    r={2.5}
                    fillOpacity={0.7}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <strong>Good model:</strong> Residuals are randomly distributed around zero
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  <strong>Warning:</strong> A visible trend may indicate an inadequate model
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <strong>Heteroscedasticity:</strong> Non-constant variance = funnel-shaped points
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Regression Table Component
interface RegressionTableProps {
  data: DataPoint[];
  regression: RegressionResult | null;
  xLabel: string;
  yLabel: string;
}

const RegressionTable: React.FC<RegressionTableProps> = ({ data, regression, xLabel, yLabel }) => {
  if (!regression) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No regression calculated</p>
        </CardContent>
      </Card>
    );
  }

  const statistics = calculateStatistics(data);

  // Calculate detailed results for each data point
  const detailedResults = data.map((point, index) => {
    const predicted = regression.predict(point.x);
    const error = point.y - predicted;
    const errorAbs = Math.abs(error);
    const errorPercent = Math.abs(error / point.y) * 100;
    
    return {
      index: index + 1,
      x: point.x,
      actual: point.y,
      predicted: predicted,
      error: error,
      errorAbs: errorAbs,
      errorPercent: errorPercent
    };
  });

  return (
    <div className="space-y-6">
      {/* Detailed Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Regression Analysis Results
            <div className="ml-auto flex gap-4 text-sm">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                MAE: {regression.metrics.mae.toFixed(4)}
              </Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                MAPE: {regression.metrics.mape.toFixed(2)}%
              </Badge>
            </div>
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Showing actual vs predicted values with error analysis
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden bg-white dark:bg-gray-900">
            <div className="overflow-x-auto" style={{ maxHeight: '400px' }}>
              <Table>
                <TableHeader className="bg-gray-900 dark:bg-gray-800 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="font-bold text-white dark:text-gray-100 border-r border-gray-600 text-center min-w-32">
                      {xLabel}
                    </TableHead>
                    <TableHead className="font-bold text-white dark:text-gray-100 border-r border-gray-600 text-center min-w-32">
                      {yLabel}<br/>(Actual)
                    </TableHead>
                    <TableHead className="font-bold text-white dark:text-gray-100 border-r border-gray-600 text-center min-w-32">
                      {yLabel}<br/>(Predicted)
                    </TableHead>
                    <TableHead className="font-bold text-white dark:text-gray-100 border-r border-gray-600 text-center min-w-24">
                      Error
                    </TableHead>
                    <TableHead className="font-bold text-white dark:text-gray-100 border-r border-gray-600 text-center min-w-24">
                      Error<br/>Abs.
                    </TableHead>
                    <TableHead className="font-bold text-white dark:text-gray-100 text-center min-w-24">
                      Error<br/>%
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedResults.map((result, index) => (
                    <TableRow 
                      key={index} 
                      className={`
                        ${index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}
                        hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-200 dark:border-gray-700
                      `}
                    >
                      <TableCell className="font-mono text-sm border-r border-gray-200 dark:border-gray-700 text-center text-gray-900 dark:text-gray-100">
                        {result.x.toFixed(4)}
                      </TableCell>
                      <TableCell className="font-mono text-sm border-r border-gray-200 dark:border-gray-700 text-center text-blue-700 dark:text-blue-400 font-semibold">
                        {result.actual.toFixed(4)}
                      </TableCell>
                      <TableCell className="font-mono text-sm border-r border-gray-200 dark:border-gray-700 text-center text-red-700 dark:text-red-400 font-semibold">
                        {result.predicted.toFixed(4)}
                      </TableCell>
                      <TableCell className={`font-mono text-sm border-r border-gray-200 dark:border-gray-700 text-center font-semibold ${
                        result.error >= 0 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {result.error >= 0 ? '+' : ''}{result.error.toFixed(4)}
                      </TableCell>
                      <TableCell className="font-mono text-sm border-r border-gray-200 dark:border-gray-700 text-center text-purple-700 dark:text-purple-400 font-semibold">
                        {result.errorAbs.toFixed(4)}
                      </TableCell>
                      <TableCell className={`font-mono text-sm text-center font-bold ${
                        result.errorPercent < 1 
                          ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' 
                          : result.errorPercent < 2 
                            ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                            : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                      }`}>
                        {result.errorPercent.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          
          {/* Summary Statistics Cards */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-xl border border-blue-200 dark:border-blue-700">
              <div className="text-blue-700 dark:text-blue-400 font-semibold text-sm">Observations</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
                {detailedResults.length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-700">
              <div className="text-green-700 dark:text-green-400 font-semibold text-sm">MAPE</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-300 mt-1">
                {regression.metrics.mape.toFixed(2)}%
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-xl border border-purple-200 dark:border-purple-700">
              <div className="text-purple-700 dark:text-purple-400 font-semibold text-sm">RMSE</div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-300 mt-1">
                {regression.metrics.rmse.toFixed(4)}
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-4 rounded-xl border border-orange-200 dark:border-orange-700">
              <div className="text-orange-700 dark:text-orange-400 font-semibold text-sm">R² Score</div>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-300 mt-1">
                {regression.r2.toFixed(4)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistical Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Regression Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Model Metrics</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">R²</TableCell>
                    <TableCell>{regression.r2.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Adj. R²</TableCell>
                    <TableCell>{regression.metrics.adjustedR2.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">RMSE</TableCell>
                    <TableCell>{regression.metrics.rmse.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">MAE</TableCell>
                    <TableCell>{regression.metrics.mae.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">MAPE (%)</TableCell>
                    <TableCell>{regression.metrics.mape.toFixed(2)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Standard Error</TableCell>
                    <TableCell>{regression.metrics.standardError.toFixed(6)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div>
              <h4 className="font-medium mb-3">Data Statistics</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Number of points</TableCell>
                    <TableCell>{data.length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Correlation</TableCell>
                    <TableCell>{statistics.correlation.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Mean {xLabel}</TableCell>
                    <TableCell>{statistics.mean.x.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Mean {yLabel}</TableCell>
                    <TableCell>{statistics.mean.y.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Std Dev {xLabel}</TableCell>
                    <TableCell>{statistics.std.x.toFixed(6)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Std Dev {yLabel}</TableCell>
                    <TableCell>{statistics.std.y.toFixed(6)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          
          <div className="mt-6">
            <h4 className="font-medium mb-3">Equation</h4>
            <div className="bg-muted p-3 rounded font-mono text-sm">
              {regression.customString || regression.string}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Model Comparison Component
interface ModelComparisonProps {
  regressionResults: Record<RegressionType, RegressionResult | null>;
  calculatedModels: Set<RegressionType>;
  selectedModel: RegressionType;
  onModelSelect: (model: RegressionType) => void;
}

const ModelComparison: React.FC<ModelComparisonProps> = ({
  regressionResults,
  calculatedModels,
  selectedModel,
  onModelSelect
}) => {
  const comparisonData = useMemo(() => {
    return Array.from(calculatedModels)
      .map(type => {
        const result = regressionResults[type];
        if (!result) return null;
        
        return {
          model: type,
          name: type.charAt(0).toUpperCase() + type.slice(1),
          r2: result.r2,
          adjustedR2: result.metrics.adjustedR2,
          rmse: result.metrics.rmse,
          mae: result.metrics.mae,
          aic: result.metrics.aic,
          bic: result.metrics.bic
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.r2 || 0) - (a?.r2 || 0));
  }, [regressionResults, calculatedModels]);

  if (comparisonData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No model calculated for comparison</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = comparisonData.map(item => ({
    name: item?.name || '',
    r2: item?.r2 || 0,
    adjustedR2: item?.adjustedR2 || 0
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <h4 className="font-medium mb-3">Performance R²</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="r2" fill="#3B82F6" name="R²" />
                <Bar dataKey="adjustedR2" fill="#10B981" name="Adj. R²" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div>
            <h4 className="font-medium mb-3">Comparison Table</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">R²</TableHead>
                  <TableHead className="text-right">Adj. R²</TableHead>
                  <TableHead className="text-right">RMSE</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">AIC</TableHead>
                  <TableHead className="text-right">BIC</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonData.map((item, index) => (
                  <TableRow 
                    key={item?.model} 
                    className={selectedModel === item?.model ? 'bg-muted/50' : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {index === 0 && <Badge variant="default" className="text-xs">Best</Badge>}
                        {item?.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item?.r2.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{item?.adjustedR2.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{item?.rmse.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{item?.mae.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{item?.aic.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{item?.bic.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={selectedModel === item?.model ? "default" : "outline"}
                        onClick={() => item && onModelSelect(item.model as RegressionType)}
                      >
                        {selectedModel === item?.model ? 'Selected' : 'Select'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ===============================
// HISTORY MANAGEMENT FUNCTIONS
// ===============================

const ANALYSIS_STORAGE_KEY = 'regression_analysis_history';

// Fonction pour sauvegarder une analyse
function saveAnalysisToStorage(analysis: SavedAnalysis): void {
  try {
    const existingHistory = JSON.parse(localStorage.getItem(ANALYSIS_STORAGE_KEY) || '[]');
    const updatedHistory = [analysis, ...existingHistory.filter((item: SavedAnalysis) => item.id !== analysis.id)];
    
    // Limiter à 50 analyses max pour éviter la surcharge
    const limitedHistory = updatedHistory.slice(0, 50);
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(limitedHistory));
  } catch (error) {
    console.error('Error saving analysis to storage:', error);
    throw error;
  }
}

// Fonction pour charger l'historique des analyses
function loadAnalysisHistory(): SavedAnalysis[] {
  try {
    const history = localStorage.getItem(ANALYSIS_STORAGE_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading analysis history:', error);
    return [];
  }
}

// Fonction pour supprimer une analyse de l'historique
function deleteAnalysisFromStorage(analysisId: string): void {
  try {
    const existingHistory = JSON.parse(localStorage.getItem(ANALYSIS_STORAGE_KEY) || '[]');
    const updatedHistory = existingHistory.filter((item: SavedAnalysis) => item.id !== analysisId);
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(updatedHistory));
  } catch (error) {
    console.error('Error deleting analysis from storage:', error);
    throw error;
  }
}

// Fonction pour exporter une analyse en JSON
function exportAnalysisAsJSON(analysis: SavedAnalysis): void {
  const dataStr = JSON.stringify(analysis, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `regression_analysis_${analysis.name}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ===============================
// MAIN COMPONENT
// ===============================

const RegressionAnalysis: React.FC = () => {
  // Multi-dataset state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedVariables, setSelectedVariables] = useState<{
    x: VariableSelection | null;
    y: VariableSelection | null;
  }>({
    x: null,
    y: null
  });
  const [isDataValidated, setIsDataValidated] = useState(false);
  const [combinedData, setCombinedData] = useState<CombinedData | null>(null);

  // Regression state
  const [selectedModel, setSelectedModel] = useState<RegressionType>('linear');
  const [regressionResults, setRegressionResults] = useState<Record<RegressionType, RegressionResult | null>>({
    linear: null,
    polynomial: null,
    exponential: null,
    logarithmic: null,
    power: null,
    logistic: null
  });
  const [calculatedModels, setCalculatedModels] = useState<Set<RegressionType>>(new Set());
  const [isCalculatingAll, setIsCalculatingAll] = useState(false);
  const [polynomialDegree, setPolynomialDegree] = useState(2);

  // History management state
  const [analysisHistory, setAnalysisHistory] = useState<SavedAnalysis[]>([]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    description: ''
  });

  // Available regression types based on current data
  const availableTypes = useMemo(() => {
    if (!combinedData) return ['linear', 'polynomial'] as RegressionType[];
    return getAvailableRegressionTypes(combinedData.dataPoints);
  }, [combinedData]);

  // Load analysis history on component mount
  useEffect(() => {
    const history = loadAnalysisHistory();
    setAnalysisHistory(history);
  }, []);

  // Function to save current analysis
  const handleSaveAnalysis = useCallback(() => {
    if (!saveForm.name.trim()) {
      toast({
        title: "Error",
        description: "Please provide a name for the analysis",
        variant: "destructive"
      });
      return;
    }

    if (!isDataValidated || !combinedData) {
      toast({
        title: "Error", 
        description: "Please validate your data before saving",
        variant: "destructive"
      });
      return;
    }

    try {
      const analysis: SavedAnalysis = {
        id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: saveForm.name.trim(),
        description: saveForm.description.trim(),
        timestamp: Date.now(),
        datasets,
        selectedVariables,
        regressionResults,
        calculatedModels: Array.from(calculatedModels),
        selectedModel,
        polynomialDegree,
        combinedData
      };

      saveAnalysisToStorage(analysis);
      const updatedHistory = loadAnalysisHistory();
      setAnalysisHistory(updatedHistory);
      
      toast({
        title: "Analysis Saved",
        description: `Analysis "${analysis.name}" has been saved successfully`
      });

      setSaveForm({ name: '', description: '' });
      setIsSaveDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save analysis. Please try again.",
        variant: "destructive"
      });
    }
  }, [saveForm, isDataValidated, combinedData, datasets, selectedVariables, regressionResults, calculatedModels, selectedModel, polynomialDegree]);

  // Function to reconstruct prediction functions for loaded regression results
  const reconstructRegressionFunctions = useCallback((results: Record<RegressionType, RegressionResult | null>) => {
    const reconstructedResults: Record<RegressionType, RegressionResult | null> = {
      linear: null,
      polynomial: null,
      exponential: null,
      logarithmic: null,
      power: null,
      logistic: null
    };

    Object.entries(results).forEach(([type, result]) => {
      if (result && result.coefficients) {
        const regressionType = type as RegressionType;
        
        // Reconstruct the predict function based on the type and coefficients
        let predictFunction: (x: number) => number;
        
        switch (regressionType) {
          case 'linear':
            predictFunction = (x: number) => result.coefficients[1] * x + result.coefficients[0];
            break;
          case 'polynomial':
            predictFunction = (x: number) => {
              let sum = 0;
              for (let i = 0; i < result.coefficients.length; i++) {
                sum += result.coefficients[i] * Math.pow(x, i);
              }
              return sum;
            };
            break;
          case 'exponential':
            predictFunction = (x: number) => result.coefficients[0] * Math.exp(result.coefficients[1] * x);
            break;
          case 'logarithmic':
            predictFunction = (x: number) => x > 0 ? result.coefficients[0] + result.coefficients[1] * Math.log(x) : NaN;
            break;
          case 'power':
            predictFunction = (x: number) => x > 0 ? result.coefficients[0] * Math.pow(x, result.coefficients[1]) : NaN;
            break;
          case 'logistic':
            predictFunction = (x: number) => result.coefficients[2] / (1 + Math.exp(-(result.coefficients[0] + result.coefficients[1] * x)));
            break;
          default:
            predictFunction = () => NaN;
        }

        reconstructedResults[regressionType] = {
          ...result,
          predict: predictFunction
        };
      }
    });

    return reconstructedResults;
  }, []);

  // Function to load an analysis from history
  const handleLoadAnalysis = useCallback((analysis: SavedAnalysis) => {
    try {
      console.log('Loading analysis:', analysis);
      
      // Restore all states in the correct order
      setDatasets(analysis.datasets || []);
      setSelectedVariables(analysis.selectedVariables || { x: null, y: null });
      setPolynomialDegree(analysis.polynomialDegree || 2);
      setCombinedData(analysis.combinedData);
      setIsDataValidated(!!analysis.combinedData);
      
      // Reconstruct regression results with proper predict functions
      const reconstructedResults = reconstructRegressionFunctions(analysis.regressionResults || {
        linear: null,
        polynomial: null,
        exponential: null,
        logarithmic: null,
        power: null,
        logistic: null
      });
      
      setRegressionResults(reconstructedResults);
      setCalculatedModels(new Set(analysis.calculatedModels || []));
      setSelectedModel(analysis.selectedModel || 'linear');

      // Small delay to ensure all states are set before showing success
      setTimeout(() => {
        toast({
          title: "Analysis Loaded",
          description: `Analysis "${analysis.name}" has been loaded successfully`
        });
      }, 100);

      setIsHistoryDialogOpen(false);
    } catch (error) {
      console.error('Error loading analysis:', error);
      toast({
        title: "Error",
        description: "Failed to load analysis. Please try again.",
        variant: "destructive"
      });
    }
  }, [reconstructRegressionFunctions]);

  // Function to delete an analysis from history
  const handleDeleteAnalysis = useCallback((analysisId: string) => {
    try {
      deleteAnalysisFromStorage(analysisId);
      const updatedHistory = loadAnalysisHistory();
      setAnalysisHistory(updatedHistory);
      
      toast({
        title: "Analysis Deleted",
        description: "Analysis has been deleted from history"
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to delete analysis. Please try again.",
        variant: "destructive"
      });
    }
  }, []);

  // Function to export analysis
  const handleExportAnalysis = useCallback((analysis: SavedAnalysis) => {
    try {
      exportAnalysisAsJSON(analysis);
      toast({
        title: "Analysis Exported",
        description: "Analysis has been exported as JSON file"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export analysis. Please try again.",
        variant: "destructive"
      });
    }
  }, []);

  // Handle variable selection
  const handleVariableSelect = useCallback((variable: VariableSelection, axis: 'x' | 'y') => {
    setSelectedVariables(prev => ({
      ...prev,
      [axis]: variable
    }));
    setIsDataValidated(false);
  }, []);

  // Validate and proceed
  const handleValidateAndProceed = useCallback(() => {
    if (!selectedVariables.x || !selectedVariables.y) {
      toast({
        title: "Missing variables",
        description: "Please select X and Y variables",
        variant: "destructive"
      });
      return;
    }

    const combined = combineDatasets(datasets, selectedVariables.x, selectedVariables.y);
    if (!combined || combined.dataPoints.length === 0) {
      toast({
        title: "Invalid data",
        description: "Unable to combine selected data",
        variant: "destructive"
      });
      return;
    }

    setCombinedData(combined);
    setIsDataValidated(true);
    
    // Reset regression results
    setRegressionResults({
      linear: null,
      polynomial: null,
      exponential: null,
      logarithmic: null,
      power: null,
      logistic: null
    });
    setCalculatedModels(new Set());

    toast({
      title: "Data validated",
      description: `${combined.dataPoints.length} data points ready for analysis`,
      variant: "default"
    });
  }, [datasets, selectedVariables]);


  // Calculate single regression model
  const calculateModel = useCallback(async (type: RegressionType) => {
    if (!combinedData) {
      toast({
        title: "Missing data",
        description: "Please validate your data in the Data tab first",
        variant: "destructive"
      });
      return;
    }

    try {
      const result = performRegression(
        combinedData.dataPoints,
        type,
        polynomialDegree,
        combinedData.xLabel,
        combinedData.yLabel
      );

      if (result) {
        setRegressionResults(prev => ({
          ...prev,
          [type]: result
        }));
        setCalculatedModels(prev => new Set([...prev, type]));
        
        toast({
          title: "Model Calculated",
          description: `${type.charAt(0).toUpperCase() + type.slice(1)} regression completed successfully`
        });
      } else {
        toast({
          title: "Calculation Failed",
          description: `Unable to calculate ${type} regression with current data`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error(`Error calculating ${type} model:`, error);
      toast({
        title: "Calculation Error",
        description: `Error calculating ${type} regression model`,
        variant: "destructive"
      });
    }
  }, [combinedData, polynomialDegree]);

  // Calculate all regression models
  const calculateAllModels = useCallback(async () => {
    if (!combinedData) {
      toast({
        title: "Missing data",
        description: "Please validate your data in the Data tab first",
        variant: "destructive"
      });
      return;
    }

    setIsCalculatingAll(true);
    
    try {
      const newResults: Record<RegressionType, RegressionResult | null> = {
        linear: null,
        polynomial: null,
        exponential: null,
        logarithmic: null,
        power: null,
        logistic: null
      };
      const newCalculatedModels = new Set<RegressionType>();
      const failedModels: string[] = [];

      for (const type of availableTypes) {
        try {
          const degree = type === 'polynomial' ? polynomialDegree : 2;
          const result = performRegression(
            combinedData.dataPoints, 
            type, 
            degree,
            combinedData.xLabel,
            combinedData.yLabel
          );

          if (result) {
            newResults[type] = result;
            newCalculatedModels.add(type);
          } else {
            failedModels.push(type);
          }
        } catch (error) {
          console.error(`Error calculating ${type} model:`, error);
          failedModels.push(type);
        }
        
        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setRegressionResults(newResults);
      setCalculatedModels(newCalculatedModels);

      if (newCalculatedModels.size > 0) {
        let message = `${newCalculatedModels.size} models calculated successfully`;
        if (failedModels.length > 0) {
          message += `. ${failedModels.length} models failed: ${failedModels.join(', ')}`;
        }
        
        toast({
          title: "Calculations finished",
          description: message,
          variant: newCalculatedModels.size > 0 ? "default" : "destructive"
        });
      } else {
        toast({
          title: "No model calculated",
          description: "Check that your data is compatible with regression models",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error in calculateAllModels:', error);
      toast({
        title: "Calculation Error",
        description: "Technical error during model calculations",
        variant: "destructive"
      });
    } finally {
      setIsCalculatingAll(false);
    }
  }, [combinedData, availableTypes, polynomialDegree]);

  const currentRegression = regressionResults[selectedModel];

  return (
    <Layout title="Regression Analysis" breadcrumbs={[
      { label: "Home", href: "/" },
      { label: "Regression Analysis" }
    ]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Regression Analysis</h1>
            <p className="text-muted-foreground mt-2">
              Analyze relationships between variables with 6 types of regression models
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Save Analysis Button */}
            <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  disabled={!isDataValidated}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Analysis
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Save Regression Analysis</DialogTitle>
                  <DialogDescription>
                    Save your current analysis to access it later without recalculation.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="analysis-name">Analysis Name</Label>
                    <Input
                      id="analysis-name"
                      value={saveForm.name}
                      onChange={(e) => setSaveForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Sales vs Marketing Spend Analysis"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analysis-description">Description (Optional)</Label>
                    <Textarea
                      id="analysis-description"
                      value={saveForm.description}
                      onChange={(e) => setSaveForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add any notes about this analysis..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAnalysis}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Analysis
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* History Button */}
            <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <History className="h-4 w-4" />
                  History ({analysisHistory.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[600px]">
                <DialogHeader>
                  <DialogTitle>Analysis History</DialogTitle>
                  <DialogDescription>
                    Load, export, or delete previous regression analyses.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] w-full">
                  {analysisHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No saved analyses yet.</p>
                      <p className="text-sm">Create and save your first analysis to see it here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analysisHistory.map((analysis) => (
                        <Card key={analysis.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-lg">{analysis.name}</h4>
                              {analysis.description && (
                                <p className="text-sm text-muted-foreground mt-1">{analysis.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(analysis.timestamp).toLocaleDateString()} {new Date(analysis.timestamp).toLocaleTimeString()}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Database className="h-3 w-3" />
                                  {analysis.datasets.length} dataset(s)
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calculator className="h-3 w-3" />
                                  {analysis.calculatedModels.length} model(s)
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleLoadAnalysis(analysis)}
                                className="h-8 px-2"
                              >
                                <FolderOpen className="h-3 w-3 mr-1" />
                                Load
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleExportAnalysis(analysis)}
                                className="h-8 px-2"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Export
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteAnalysis(analysis.id)}
                                className="h-8 px-2 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Badge variant="outline" className="text-lg px-3 py-1">
              <TrendingUp className="h-4 w-4 mr-2" />
              Multi-Datasets
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="data" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data
            </TabsTrigger>
            <TabsTrigger value="models" className="flex items-center gap-2" disabled={!isDataValidated}>
              <Calculator className="h-4 w-4" />
              Models
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2" disabled={!isDataValidated}>
              <BarChart3 className="h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-2" disabled={calculatedModels.size < 2}>
              <TrendingUp className="h-4 w-4" />
              Comparison
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-6">
            <MultiDatasetManager
              datasets={datasets}
              onDatasetsChange={setDatasets}
              selectedVariables={selectedVariables}
              onVariableSelect={handleVariableSelect}
              onValidateAndProceed={handleValidateAndProceed}
              isValidated={isDataValidated}
            />
          </TabsContent>

          <TabsContent value="models" className="space-y-6">
            {isDataValidated && combinedData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelSelect={setSelectedModel}
                  regressionResults={regressionResults}
                  availableTypes={availableTypes}
                  calculatedModels={calculatedModels}
                  onCalculateModel={calculateModel}
                  onCalculateAll={calculateAllModels}
                  isCalculatingAll={isCalculatingAll}
                  isDataValidated={isDataValidated}
                />
                
                {selectedModel === 'polynomial' && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">Parameters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label htmlFor="polynomial-degree">Polynomial Degree</Label>
                        <Select
                          value={polynomialDegree.toString()}
                          onValueChange={(value) => setPolynomialDegree(parseInt(value))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 (Quadratic)</SelectItem>
                            <SelectItem value="3">3 (Cubic)</SelectItem>
                            <SelectItem value="4">4 (Quartic)</SelectItem>
                            <SelectItem value="5">5 (Quintic)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              
              <div className="lg:col-span-2">
                <RegressionChart
                  data={combinedData.dataPoints}
                  regression={currentRegression}
                  title={`${selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1)} Regression`}
                  xLabel={combinedData.xLabel}
                  yLabel={combinedData.yLabel}
                />
              </div>
            </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
                    <p className="text-muted-foreground">Please validate your data in the Data tab first.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            {isDataValidated && combinedData ? (
              <RegressionTable
                data={combinedData.dataPoints}
                regression={currentRegression}
                xLabel={combinedData.xLabel}
                yLabel={combinedData.yLabel}
              />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Results Available</h3>
                    <p className="text-muted-foreground">Please validate your data and calculate models first.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="comparison" className="space-y-6">
            <ModelComparison
              regressionResults={regressionResults}
              calculatedModels={calculatedModels}
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default RegressionAnalysis;