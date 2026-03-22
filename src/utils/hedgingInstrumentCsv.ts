/**
 * Hedging instruments bulk CSV — template & parsing (StrategyImportService / HedgingInstruments page).
 * Required: type, currency_pair, maturity, notional, spot
 * Optional: domestic_rate, foreign_rate, volatility, quantity, strike, strike_is_percent, counterparty, portfolio, unit_price, barrier, second_barrier, rebate
 */

import type { HedgingInstrument } from "@/services/StrategyImportService";
import { PricingService } from "@/services/PricingService";
import { parseCsvText, buildHeaderIndex } from "./fxExposureCsv";

/** Same internal values as HedgingInstruments INSTRUMENT_TYPES */
export const HEDGING_INSTRUMENT_TYPE_ENTRIES: { value: string; label: string }[] = [
  { value: "call", label: "Vanilla Call" },
  { value: "put", label: "Vanilla Put" },
  { value: "swap", label: "Swap" },
  { value: "forward", label: "Forward" },
  { value: "call-knockout", label: "Call Knock-Out" },
  { value: "call-reverse-knockout", label: "Call Reverse Knock-Out" },
  { value: "call-double-knockout", label: "Call Double Knock-Out" },
  { value: "put-knockout", label: "Put Knock-Out" },
  { value: "put-reverse-knockout", label: "Put Reverse Knock-Out" },
  { value: "put-double-knockout", label: "Put Double Knock-Out" },
  { value: "call-knockin", label: "Call Knock-In" },
  { value: "call-reverse-knockin", label: "Call Reverse Knock-In" },
  { value: "call-double-knockin", label: "Call Double Knock-In" },
  { value: "put-knockin", label: "Put Knock-In" },
  { value: "put-reverse-knockin", label: "Put Reverse Knock-In" },
  { value: "put-double-knockin", label: "Put Double Knock-In" },
  { value: "one-touch", label: "One Touch (beta)" },
  { value: "double-touch", label: "Double Touch (beta)" },
  { value: "no-touch", label: "No Touch (beta)" },
  { value: "double-no-touch", label: "Double No Touch (beta)" },
  { value: "range-binary", label: "Range Binary (beta)" },
  { value: "outside-binary", label: "Outside Binary (beta)" },
];

export function resolveInstrumentCsvType(raw: string): { value: string; label: string } | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const byValue = HEDGING_INSTRUMENT_TYPE_ENTRIES.find((e) => e.value.toLowerCase() === t);
  if (byValue) return { value: byValue.value, label: byValue.label };
  const byLabel = HEDGING_INSTRUMENT_TYPE_ENTRIES.find((e) => e.label.toLowerCase() === t);
  if (byLabel) return { value: byLabel.value, label: byLabel.label };
  return null;
}

export function displayTypeToCsvType(displayLabel: string): string {
  const hit = HEDGING_INSTRUMENT_TYPE_ENTRIES.find(
    (e) => e.label === displayLabel || e.label.toLowerCase() === displayLabel.toLowerCase()
  );
  return hit?.value ?? displayLabel.toLowerCase().replace(/\s+/g, "-");
}

export function normalizeCurrencyPair(raw: string): string | null {
  const x = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(x)) return x;
  if (/^[A-Z]{6}$/.test(x)) return `${x.slice(0, 3)}/${x.slice(3)}`;
  return null;
}

export const HEDGING_INSTRUMENT_CSV_TEMPLATE_HEADER =
  "type,currency_pair,maturity,notional,spot,domestic_rate,foreign_rate,volatility,quantity,strike,strike_is_percent,counterparty,portfolio,unit_price,barrier,second_barrier,rebate";

export const HEDGING_INSTRUMENT_CSV_TEMPLATE_SAMPLE = `${HEDGING_INSTRUMENT_CSV_TEMPLATE_HEADER}
forward,EUR/USD,2026-12-31,1000000,1.085,5.0,3.0,,100,,false,Manual,,0,,,
call,EUR/USD,2026-09-30,500000,1.085,5.0,3.0,15,100,1.09,false,Deutsche Bank,,0,,,
put,GBP/USD,2026-08-15,250000,1.27,5.0,4.5,12,100,,false,HSBC,,0,,,`;

export type ParsedHedgingCsvRow = {
  internalTypeValue: string;
  displayType: string;
  currencyPair: string;
  maturity: string;
  notional: number;
  spot: number;
  domesticRate: number;
  foreignRate: number;
  volatility: number | undefined;
  quantity: number;
  strikeInput: number | undefined;
  strikeIsPercent: boolean;
  counterparty: string;
  portfolioName?: string;
  unitPrice: number;
  barrier?: number;
  secondBarrier?: number;
  rebate?: number;
};

export type ParseHedgingInstrumentRowResult =
  | { ok: true; row: number; data: ParsedHedgingCsvRow }
  | { ok: false; row: number; error: string };

function parseBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function parseNum(raw: string): number | undefined {
  const v = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return isFinite(v) ? v : undefined;
}

export function parseHedgingInstrumentRows(
  rows: string[][],
  opts: { valuationDate: string }
): { headerErrors: string[]; results: ParseHedgingInstrumentRowResult[] } {
  const headerErrors: string[] = [];
  if (rows.length < 2) {
    headerErrors.push("CSV must include a header row and at least one data row.");
    return { headerErrors, results: [] };
  }

  const idx = buildHeaderIndex(rows[0]);
  const aliasPair = (keys: string[]) => {
    for (const k of keys) {
      const i = idx[k];
      if (i !== undefined) return i;
    }
    return undefined;
  };

  const colType = aliasPair(["type"]);
  const colPair = aliasPair(["currency_pair", "pair", "currency"]);
  const colMat = aliasPair(["maturity"]);
  const colNot = aliasPair(["notional"]);
  const colSpot = aliasPair(["spot", "spot_price"]);
  const colDom = aliasPair(["domestic_rate", "quote_rate"]);
  const colFor = aliasPair(["foreign_rate", "base_rate"]);
  const colVol = aliasPair(["volatility", "vol"]);
  const colQty = aliasPair(["quantity", "qty"]);
  const colStrike = aliasPair(["strike"]);
  const colStrikePct = aliasPair(["strike_is_percent", "strike_percent"]);
  const colCpty = aliasPair(["counterparty", "cpty"]);
  const colPort = aliasPair(["portfolio", "portfolio_name"]);
  const colPrice = aliasPair(["unit_price", "premium", "real_price"]);
  const colBar = aliasPair(["barrier"]);
  const colBar2 = aliasPair(["second_barrier", "barrier_2"]);
  const colRebate = aliasPair(["rebate"]);

  if (colType === undefined) headerErrors.push("Missing required column: type");
  if (colPair === undefined) headerErrors.push("Missing required column: currency_pair (or currency)");
  if (colMat === undefined) headerErrors.push("Missing required column: maturity");
  if (colNot === undefined) headerErrors.push("Missing required column: notional");
  if (colSpot === undefined) headerErrors.push("Missing required column: spot");

  if (headerErrors.length > 0) {
    return { headerErrors, results: [] };
  }

  const valDay = new Date(opts.valuationDate);
  valDay.setHours(0, 0, 0, 0);

  const results: ParseHedgingInstrumentRowResult[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    const rowNum = r + 1;
    if (!line || line.every((c) => !c || c.trim() === "")) continue;

    const cell = (i: number | undefined) =>
      i === undefined ? "" : (line[i] ?? "").trim();

    const typeResolved = resolveInstrumentCsvType(cell(colType));
    if (!typeResolved) {
      results.push({
        ok: false,
        row: rowNum,
        error: `Unknown type "${cell(colType)}" (use internal code e.g. forward, call, put, or full label)`,
      });
      continue;
    }

    const pair = normalizeCurrencyPair(cell(colPair));
    if (!pair) {
      results.push({
        ok: false,
        row: rowNum,
        error: `Invalid currency_pair "${cell(colPair)}" (use e.g. EUR/USD or EURUSD)`,
      });
      continue;
    }

    const maturityStr = cell(colMat);
    const mat = new Date(maturityStr);
    if (isNaN(mat.getTime())) {
      results.push({
        ok: false,
        row: rowNum,
        error: `Invalid maturity "${maturityStr}" (use YYYY-MM-DD)`,
      });
      continue;
    }
    const matDay = new Date(mat);
    matDay.setHours(0, 0, 0, 0);
    if (matDay <= valDay) {
      results.push({
        ok: false,
        row: rowNum,
        error: "Maturity must be strictly after the valuation date",
      });
      continue;
    }

    const notional = parseNum(cell(colNot));
    if (notional === undefined || notional <= 0) {
      results.push({ ok: false, row: rowNum, error: "notional must be a positive number" });
      continue;
    }

    const spot = parseNum(cell(colSpot));
    if (spot === undefined || spot <= 0) {
      results.push({ ok: false, row: rowNum, error: "spot must be a positive number" });
      continue;
    }

    const domesticRaw = cell(colDom);
    const foreignRaw = cell(colFor);
    const domesticRate = domesticRaw ? parseNum(domesticRaw) ?? 5 : 5;
    const foreignRate = foreignRaw ? parseNum(foreignRaw) ?? 3 : 3;

    const volRaw = cell(colVol);
    const needsVolDefault =
      typeResolved.value !== "forward" && typeResolved.value !== "swap";

    let volatility: number | undefined;
    if (volRaw) {
      volatility = parseNum(volRaw);
      if (volatility === undefined || volatility < 0 || volatility > 200) {
        results.push({ ok: false, row: rowNum, error: "volatility must be between 0 and 200 (%)" });
        continue;
      }
    } else if (needsVolDefault) {
      volatility = 15;
    } else {
      volatility = undefined;
    }

    const qtyRaw = cell(colQty);
    const quantity = qtyRaw
      ? Math.min(100, Math.max(0, parseNum(qtyRaw) ?? 100))
      : 100;

    const strikeRaw = cell(colStrike);
    let strikeInput: number | undefined;
    if (strikeRaw) {
      strikeInput = parseNum(strikeRaw);
      if (strikeInput === undefined) {
        results.push({ ok: false, row: rowNum, error: "Invalid strike" });
        continue;
      }
    }

    const strikeIsPercent = parseBool(cell(colStrikePct));

    const counterparty = cell(colCpty) || "Manual";
    const portfolioName = cell(colPort) || undefined;

    const priceRaw = cell(colPrice);
    const unitPrice = priceRaw ? parseNum(priceRaw) ?? 0 : 0;

    const b1 = cell(colBar);
    const b2 = cell(colBar2);
    const rebateRaw = cell(colRebate);
    let barrier: number | undefined;
    let secondBarrier: number | undefined;
    let rebate: number | undefined;
    if (b1) {
      barrier = parseNum(b1);
      if (barrier === undefined) {
        results.push({ ok: false, row: rowNum, error: "Invalid barrier" });
        continue;
      }
    }
    if (b2) {
      secondBarrier = parseNum(b2);
      if (secondBarrier === undefined) {
        results.push({ ok: false, row: rowNum, error: "Invalid second_barrier" });
        continue;
      }
    }
    if (rebateRaw) {
      rebate = parseNum(rebateRaw);
      if (rebate === undefined) {
        results.push({ ok: false, row: rowNum, error: "Invalid rebate" });
        continue;
      }
    }

    results.push({
      ok: true,
      row: rowNum,
      data: {
        internalTypeValue: typeResolved.value,
        displayType: typeResolved.label,
        currencyPair: pair,
        maturity: maturityStr,
        notional,
        spot,
        domesticRate,
        foreignRate,
        volatility,
        quantity,
        strikeInput,
        strikeIsPercent,
        counterparty,
        portfolioName,
        unitPrice,
        barrier,
        secondBarrier,
        rebate,
      },
    });
  }

  return { headerErrors, results };
}

/** Map a parsed CSV row to the payload expected by StrategyImportService.addHedgingInstrument */
export function buildHedgingInstrumentPayload(
  row: ParsedHedgingCsvRow,
  opts: { valuationDate: string; portfolioId?: string }
): Omit<HedgingInstrument, "id"> {
  const isDigital =
    row.internalTypeValue.includes("touch") || row.internalTypeValue.includes("binary");
  const isFwdSwap = row.internalTypeValue === "forward" || row.internalTypeValue === "swap";

  let strikeAbs: number | undefined;
  if (isFwdSwap) {
    strikeAbs = undefined;
  } else if (isDigital) {
    strikeAbs = row.spot;
  } else if (row.strikeInput === undefined) {
    strikeAbs = row.spot;
  } else {
    strikeAbs = row.strikeIsPercent ? (row.spot * row.strikeInput) / 100 : row.strikeInput;
  }

  const ttm = PricingService.calculateTimeToMaturity(row.maturity, opts.valuationDate);
  const unitPrice = row.unitPrice;

  return {
    type: row.displayType,
    currency: row.currencyPair,
    notional: row.notional,
    quantity: row.quantity,
    strike: strikeAbs !== undefined && !isNaN(strikeAbs) ? strikeAbs : undefined,
    premium: unitPrice,
    realOptionPrice: unitPrice > 0 ? unitPrice : undefined,
    volatility: row.volatility,
    maturity: row.maturity,
    status: "active",
    mtm: 0,
    hedge_accounting: false,
    counterparty: row.counterparty,
    portfolioId: opts.portfolioId,
    barrier: row.barrier,
    secondBarrier: row.secondBarrier,
    rebate: row.rebate,
    exportSpotPrice: row.spot,
    exportDomesticRate: row.domesticRate,
    exportForeignRate: row.foreignRate,
    exportVolatility: row.volatility,
    exportTimeToMaturity: ttm > 0 ? ttm : undefined,
  };
}

export { parseCsvText };
