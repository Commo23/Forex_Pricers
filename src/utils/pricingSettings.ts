/** Read saved app settings from localStorage (same key as Settings page). */

const SETTINGS_KEY = "fxRiskManagerSettings";

export function readPricingInterestRateSource(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "manual";
    const s = JSON.parse(raw) as { pricing?: { interestRateSource?: string } };
    return String(s?.pricing?.interestRateSource ?? "manual");
  } catch {
    return "manual";
  }
}

export function isBootstrappingInterestSource(): boolean {
  return readPricingInterestRateSource() === "bootstrapping";
}
