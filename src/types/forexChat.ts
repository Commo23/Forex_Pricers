export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface MarketRate {
  pair: string;
  spotRate: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
}

export interface ForwardRate {
  tenor: string;
  points: number;
  outright: number;
}

export type ResponseStyle = "concise" | "detailed" | "technical";

export type FXDisplayMode = "card" | "json";

export type AssetClass = "forex" | "commodities";

export interface ChatSettings {
  responseStyle: ResponseStyle;
  enableMarketData: boolean;
  enableFunctionCalls: boolean;
  customInstructions: string;
  fxDisplayMode: FXDisplayMode;
  assetClass: AssetClass;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  responseStyle: "concise",
  enableMarketData: true,
  enableFunctionCalls: true,
  customInstructions: "",
  fxDisplayMode: "card",
  assetClass: "forex",
};

// FX Strategy Extraction Data
export interface FXExtractionData {
  amount: number | null;
  currency: string | null;
  direction: "receive" | "pay" | null;
  maturity: string | null;
  baseCurrency: string | null;
  currentRate: number | null;
  Barriere: number | null;
  hedgeDirection: "upside" | "downside" | null;
}

// Helper to parse FX extraction JSON from assistant response
export function parseFXExtractionFromResponse(content: string): { data: FXExtractionData | null; cleanContent: string } {
  try {
    // Look for FX_DATA: prefix format (new format without markdown)
    const fxDataMatch = content.match(/FX_DATA:\s*(\{[^}]+\})/);
    if (fxDataMatch) {
      const parsed = JSON.parse(fxDataMatch[1]);
      if (
        'amount' in parsed &&
        'currency' in parsed &&
        'direction' in parsed &&
        'maturity' in parsed &&
        'baseCurrency' in parsed
      ) {
        // Remove the FX_DATA line from content
        const cleanContent = content.replace(/\n?FX_DATA:\s*\{[^}]+\}/, '').trim();
        return { data: parsed as FXExtractionData, cleanContent };
      }
    }

    // Fallback: Look for JSON block in markdown format
    const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (
        'amount' in parsed &&
        'currency' in parsed &&
        'direction' in parsed &&
        'maturity' in parsed &&
        'baseCurrency' in parsed
      ) {
        const cleanContent = content.replace(/```json\s*\{[\s\S]*?\}\s*```/, '').trim();
        return { data: parsed as FXExtractionData, cleanContent };
      }
    }
    
    // Fallback: Try to find inline JSON
    const inlineMatch = content.match(/\{"amount":\s*\d+[\s\S]*?"hedgeDirection":\s*(?:"[^"]*"|null)\}/);
    if (inlineMatch) {
      const parsed = JSON.parse(inlineMatch[0]);
      const cleanContent = content.replace(inlineMatch[0], '').trim();
      return { data: parsed as FXExtractionData, cleanContent };
    }
    
    return { data: null, cleanContent: content };
  } catch (error) {
    console.error("Failed to parse FX extraction:", error);
    return { data: null, cleanContent: content };
  }
}

