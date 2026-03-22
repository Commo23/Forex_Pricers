/**
 * FX Exposures bulk CSV import — template & parsing.
 * Required columns: currency, type, amount, description, maturity
 * Optional: subsidiary, hedge_ratio (0–100, default 0)
 */

export const FX_EXPOSURE_CSV_TEMPLATE_HEADER =
  "currency,type,amount,description,subsidiary,maturity,hedge_ratio";

export const FX_EXPOSURE_CSV_TEMPLATE_SAMPLE = `${FX_EXPOSURE_CSV_TEMPLATE_HEADER}
EUR,receivable,1000000,Q1 export receivable,Paris Office,2026-12-31,0
USD,payable,500000,Vendor payable USD,New York,2026-06-30,25
GBP,receivable,250000,UK subsidiary revenue,London,2026-09-15,50`;

/** Parse CSV text into rows; handles double-quoted fields with commas */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ""); // BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur.trim());
      cur = "";
    } else if (c === "\n") {
      row.push(cur.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      continue;
    } else {
      cur += c;
    }
  }
  row.push(cur.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/%/g, "");
}

/** Map header row to column index */
export function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    map[normalizeHeader(h)] = i;
  });
  return map;
}

export type ParsedExposureRow = {
  currency: string;
  type: "receivable" | "payable";
  amount: number;
  description: string;
  subsidiary: string;
  maturity: Date;
  hedgeRatio: number;
  hedgedAmount: number;
};

export type ParseExposureRowResult =
  | { ok: true; row: number; data: ParsedExposureRow }
  | { ok: false; row: number; error: string };

const REQUIRED = ["currency", "type", "amount", "description", "maturity"] as const;

export function parseExposureRows(rows: string[][]): {
  headerErrors: string[];
  results: ParseExposureRowResult[];
} {
  const headerErrors: string[] = [];
  if (rows.length < 2) {
    headerErrors.push("CSV must include a header row and at least one data row.");
    return { headerErrors, results: [] };
  }

  const idx = buildHeaderIndex(rows[0]);
  for (const col of REQUIRED) {
    if (idx[col] === undefined) {
      headerErrors.push(`Missing required column: ${col}`);
    }
  }
  if (headerErrors.length > 0) {
    return { headerErrors, results: [] };
  }

  const results: ParseExposureRowResult[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    const rowNum = r + 1; // 1-based for user display
    if (!line || line.every((c) => !c || c.trim() === "")) continue;

    const get = (key: string) => {
      const i = idx[key];
      return i === undefined ? "" : (line[i] ?? "").trim();
    };

    const currencyRaw = get("currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyRaw)) {
      results.push({ ok: false, row: rowNum, error: `Invalid currency "${get("currency")}" (use 3-letter ISO, e.g. EUR)` });
      continue;
    }

    const typeRaw = get("type").toLowerCase();
    let type: "receivable" | "payable";
    if (typeRaw === "receivable" || typeRaw === "rec") type = "receivable";
    else if (typeRaw === "payable" || typeRaw === "pay") type = "payable";
    else {
      results.push({ ok: false, row: rowNum, error: `Invalid type "${get("type")}" (use receivable or payable)` });
      continue;
    }

    const amountAbs = Math.abs(parseFloat(get("amount").replace(/\s/g, "").replace(",", "")));
    if (!isFinite(amountAbs) || amountAbs <= 0) {
      results.push({ ok: false, row: rowNum, error: "Amount must be a positive number" });
      continue;
    }

    const description = get("description");
    if (!description) {
      results.push({ ok: false, row: rowNum, error: "Description is required" });
      continue;
    }

    const maturityStr = get("maturity");
    const maturity = new Date(maturityStr);
    if (isNaN(maturity.getTime())) {
      results.push({ ok: false, row: rowNum, error: `Invalid maturity date "${maturityStr}" (use YYYY-MM-DD)` });
      continue;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (maturity <= today) {
      results.push({ ok: false, row: rowNum, error: "Maturity must be in the future" });
      continue;
    }

    let hedgeRatio = 0;
    const hrCell = get("hedge_ratio") || get("hedgeratio");
    const hrRaw = hrCell.replace("%", "").replace(",", ".").trim();
    if (hrRaw) {
      hedgeRatio = parseFloat(hrRaw);
      if (!isFinite(hedgeRatio) || hedgeRatio < 0 || hedgeRatio > 100) {
        results.push({ ok: false, row: rowNum, error: "hedge_ratio must be between 0 and 100" });
        continue;
      }
    }

    const subsidiary = get("subsidiary") || "Main Office";
    const signedAmount = type === "payable" ? -amountAbs : amountAbs;
    const hedgedAmount = (hedgeRatio / 100) * signedAmount;

    results.push({
      ok: true,
      row: rowNum,
      data: {
        currency: currencyRaw,
        type,
        amount: signedAmount,
        description,
        subsidiary,
        maturity,
        hedgeRatio,
        hedgedAmount,
      },
    });
  }

  return { headerErrors, results };
}
