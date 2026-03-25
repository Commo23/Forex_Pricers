import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/ThemeProvider";
import { useSmoothScroll, useMomentumScroll } from "./hooks/useSmoothScroll";
import { useZoom } from "./hooks/useZoom";
import { useAutoSync } from "./hooks/useAutoSync";
import LocalStorageWatcher from "./services/LocalStorageWatcher";
// Test utilities: only load in development to avoid signup/API noise in production
if (import.meta.env.DEV) {
  import("./utils/testSupabaseIntegration");
  import("./utils/testSupabaseFinal");
  import("./utils/testSignUp");
}
import "./utils/initSupabaseTables";
import "./utils/cleanupLocalStorage";

// Import pages
import Dashboard from "./pages/Dashboard";
import Exposures from "./pages/Exposures";
import HedgingInstruments from "./pages/HedgingInstruments";
import HedgingInstrumentDetails from "./pages/HedgingInstrumentDetails";
import HedgingStrategyDetails from "./pages/HedgingStrategyDetails";
import RiskAnalysis from "./pages/RiskAnalysis";
import PositionMonitor from "./pages/PositionMonitor";
import Index from "./pages/Index";
import StrategyBuilder from "./pages/StrategyBuilder";
import Pricers from "./pages/Pricers";
import Reports from "./pages/Reports";
import ForexMarket from "./pages/ForexMarket";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import DatabaseSync from "./pages/DatabaseSync";
import SavedScenarios from "./pages/SavedScenarios";
import RegressionAnalysis from "./pages/RegressionAnalysis";
import OptionsMarketData from "./pages/OptionsMarketData";
import RateExplorer from "./pages/RateExplorer";
import ForexChat from "./pages/ForexChat";
import FuturesInsights from "./pages/FuturesInsights";
import LandingPage from "./pages/LandingPage";
import SupabaseLogin from "./pages/SupabaseLogin";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

// Theme toggle component
import { ThemeToggle } from "./components/ui/theme-toggle";

const queryClient = new QueryClient();

const App = () => {
  // Initialiser les hooks de scroll fluide
  useSmoothScroll();
  useMomentumScroll();
  
  // Initialiser le zoom
  useZoom();
  
  // Initialiser la synchronisation automatique
  useAutoSync();
  
  // Initialiser la surveillance du localStorage
  LocalStorageWatcher.getInstance();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggle />
          </div>
          <Router>
          <Routes>
            {/* Landing Page - Page par défaut */}
            <Route path="/" element={<LandingPage />} />
            
            {/* Authentication */}
            <Route path="/login" element={<SupabaseLogin />} />
            <Route path="/supabase-login" element={<SupabaseLogin />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            
            {/* FX Risk Management Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/exposures" element={<ProtectedRoute><Exposures /></ProtectedRoute>} />
            <Route path="/hedging" element={<ProtectedRoute><HedgingInstruments /></ProtectedRoute>} />
            <Route path="/hedging/:id" element={<ProtectedRoute><HedgingInstrumentDetails /></ProtectedRoute>} />
            <Route path="/hedging-strategy/:id" element={<ProtectedRoute><HedgingStrategyDetails /></ProtectedRoute>} />
            <Route path="/risk-analysis" element={<ProtectedRoute><RiskAnalysis /></ProtectedRoute>} />
            
            {/* Strategy Builder and Advanced Features */}
            <Route path="/strategy-builder" element={<ProtectedRoute><StrategyBuilder /></ProtectedRoute>} />
            <Route path="/pricers" element={<ProtectedRoute><Pricers /></ProtectedRoute>} />
            <Route path="/positions" element={<ProtectedRoute><PositionMonitor /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/forex-market" element={<ProtectedRoute><ForexMarket /></ProtectedRoute>} />
            <Route path="/options-market-data" element={<ProtectedRoute><OptionsMarketData /></ProtectedRoute>} />
            <Route path="/rate-explorer" element={<ProtectedRoute><RateExplorer /></ProtectedRoute>} />
            <Route path="/forex-chat" element={<ProtectedRoute><ForexChat /></ProtectedRoute>} />
            <Route path="/futures-insights" element={<ProtectedRoute><FuturesInsights /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
            <Route path="/database-sync" element={<ProtectedRoute><DatabaseSync /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/regression-analysis" element={<ProtectedRoute><RegressionAnalysis /></ProtectedRoute>} />
            
            {/* Legacy routes */}
            <Route path="/saved" element={<ProtectedRoute><SavedScenarios /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
