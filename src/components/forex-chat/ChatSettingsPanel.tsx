import { Settings, Database, Zap, MessageSquare, LayoutGrid, Code, TrendingUp, Wheat } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChatSettings, ResponseStyle, FXDisplayMode, AssetClass } from "@/types/forexChat";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface ChatSettingsPanelProps {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
}

const RESPONSE_STYLES: { value: ResponseStyle; label: string; description: string }[] = [
  { value: "concise", label: "Concis", description: "Réponses brèves et directes" },
  { value: "detailed", label: "Détaillé", description: "Explications complètes" },
  { value: "technical", label: "Technique", description: "Jargon financier avancé" },
];

const FX_DISPLAY_MODES: { value: FXDisplayMode; label: string; description: string; icon: typeof LayoutGrid }[] = [
  { value: "card", label: "Carte visuelle", description: "Affichage graphique structuré", icon: LayoutGrid },
  { value: "json", label: "JSON", description: "Format brut pour développeurs", icon: Code },
];

const ASSET_CLASSES: { value: AssetClass; label: string; description: string; icon: typeof TrendingUp }[] = [
  { value: "forex", label: "Forex", description: "Devises et change", icon: TrendingUp },
  { value: "commodities", label: "Commodities", description: "Matières premières", icon: Wheat },
];

export function ChatSettingsPanel({ settings, onSettingsChange }: ChatSettingsPanelProps) {
  const updateSetting = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Configuration
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configuration de l'Assistant
          </SheetTitle>
          <SheetDescription>
            Personnalisez le comportement de ForexHedge AI
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Asset Class Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Classe d'actifs</Label>
            </div>
            <RadioGroup
              value={settings.assetClass}
              onValueChange={(value) => updateSetting("assetClass", value as AssetClass)}
              className="grid grid-cols-2 gap-2"
            >
              {ASSET_CLASSES.map((asset) => (
                <div
                  key={asset.value}
                  className={`flex items-center space-x-3 rounded-lg border p-3 hover:bg-secondary/50 transition-colors ${
                    settings.assetClass === asset.value ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value={asset.value} id={`asset-${asset.value}`} />
                  <div className="flex-1">
                    <Label htmlFor={`asset-${asset.value}`} className="font-medium cursor-pointer flex items-center gap-2">
                      <asset.icon className="h-4 w-4" />
                      {asset.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{asset.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Response Style */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Style de réponse</Label>
            </div>
            <RadioGroup
              value={settings.responseStyle}
              onValueChange={(value) => updateSetting("responseStyle", value as ResponseStyle)}
              className="grid gap-2"
            >
              {RESPONSE_STYLES.map((style) => (
                <div
                  key={style.value}
                  className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-secondary/50 transition-colors"
                >
                  <RadioGroupItem value={style.value} id={style.value} />
                  <div className="flex-1">
                    <Label htmlFor={style.value} className="font-medium cursor-pointer">
                      {style.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{style.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Feature Flags */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Fonctionnalités</Label>
            
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/20">
                  <Database className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <Label htmlFor="market-data" className="font-medium cursor-pointer">
                    Accès Market Data
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Rechercher les taux spot, forwards, volatilités
                  </p>
                </div>
              </div>
              <Switch
                id="market-data"
                checked={settings.enableMarketData}
                onCheckedChange={(checked) => updateSetting("enableMarketData", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="function-calls" className="font-medium cursor-pointer">
                    Appels de fonctions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Calculer des prix, analyser des positions
                  </p>
                </div>
              </div>
              <Switch
                id="function-calls"
                checked={settings.enableFunctionCalls}
                onCheckedChange={(checked) => updateSetting("enableFunctionCalls", checked)}
              />
            </div>
          </div>

          {/* FX Data Display Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Affichage des données FX</Label>
            </div>
            <RadioGroup
              value={settings.fxDisplayMode}
              onValueChange={(value) => updateSetting("fxDisplayMode", value as FXDisplayMode)}
              className="grid grid-cols-2 gap-2"
            >
              {FX_DISPLAY_MODES.map((mode) => (
                <div
                  key={mode.value}
                  className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-secondary/50 transition-colors"
                >
                  <RadioGroupItem value={mode.value} id={`fx-${mode.value}`} />
                  <div className="flex-1">
                    <Label htmlFor={`fx-${mode.value}`} className="font-medium cursor-pointer flex items-center gap-2">
                      <mode.icon className="h-4 w-4" />
                      {mode.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{mode.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Custom Instructions */}
          <div className="space-y-3">
            <Label htmlFor="custom-instructions" className="text-sm font-medium">
              Instructions personnalisées
            </Label>
            <Textarea
              id="custom-instructions"
              placeholder="Ex: Réponds toujours en anglais, utilise des exemples concrets, évite les termes trop techniques..."
              value={settings.customInstructions}
              onChange={(e) => updateSetting("customInstructions", e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Ces instructions seront ajoutées au prompt système de l'assistant
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

