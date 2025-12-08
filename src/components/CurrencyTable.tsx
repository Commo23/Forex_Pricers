import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, RefreshCw } from 'lucide-react';
import { CurrencyInfo } from '@/services/ExchangeRateService';

interface CurrencyTableProps {
  currencies: CurrencyInfo[];
  baseCurrency: string;
  onCurrencySelect?: (currency: CurrencyInfo) => void;
  onBaseCurrencyChange?: (currency: string) => void;
  loading?: boolean;
  lastUpdated?: Date;
  onRefresh?: () => void;
}

type SortField = 'code' | 'name' | 'rate';
type SortDirection = 'asc' | 'desc';

const CurrencyTable: React.FC<CurrencyTableProps> = ({
  currencies,
  baseCurrency,
  onCurrencySelect,
  onBaseCurrencyChange,
  loading = false,
  lastUpdated,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  // Devises principales pour le sélecteur de base
  const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];

  // Filtrage et tri des devises
  const filteredAndSortedCurrencies = useMemo(() => {
    let filtered = currencies.filter(currency => 
      currency.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      currency.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Tri
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [currencies, searchTerm, sortField, sortDirection]);

  // Fonction de tri
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Fonction de sélection de devise
  const handleCurrencySelect = (currency: CurrencyInfo) => {
    setSelectedCurrency(currency.code);
    if (onCurrencySelect) {
      onCurrencySelect(currency);
    }
  };

  // Formatage du taux
  const formatRate = (rate: number) => {
    if (rate > 100) {
      return rate.toFixed(2);
    } else if (rate > 10) {
      return rate.toFixed(3);
    } else {
      return rate.toFixed(4);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-xl font-bold">
              Taux de Change en Temps Réel
            </CardTitle>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground mt-1">
                Dernière mise à jour: {lastUpdated.toLocaleTimeString('fr-FR')}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Select 
              value={baseCurrency} 
              onValueChange={onBaseCurrencyChange}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {majorCurrencies.map(currency => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="h-10 w-10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Barre de recherche */}
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search currency (code or name)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tableau des devises */}
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('code')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Code
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('name')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Currency
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('rate')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Rate ({baseCurrency})
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Squelettes de chargement
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="h-4 bg-muted rounded animate-pulse w-12" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 bg-muted rounded animate-pulse w-32" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 bg-muted rounded animate-pulse w-20 ml-auto" />
                    </TableCell>
                    <TableCell>
                      <div className="h-8 bg-muted rounded animate-pulse w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedCurrencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No currency found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCurrencies.map((currency) => (
                  <TableRow 
                    key={currency.code}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      selectedCurrency === currency.code ? 'bg-muted' : ''
                    }`}
                    onClick={() => handleCurrencySelect(currency)}
                  >
                    <TableCell className="font-medium">
                      <Badge variant="outline" className="font-mono">
                        {currency.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{currency.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {currency.code}/{baseCurrency}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatRate(currency.rate)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCurrencySelect(currency);
                        }}
                      >
                        Utiliser
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CurrencyTable; 