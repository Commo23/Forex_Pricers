/**
 * Bilinear interpolation for the IV surface grid.
 * Fills null gaps in the z matrix using neighboring known values.
 */
export function interpolateSurface(
  z: (number | null)[][],
  strikes: number[],
  dtes: number[]
): (number | null)[][] {
  const rows = z.length;
  const cols = z[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return z;

  const result = z.map((row) => [...row]);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (result[i][j] !== null) continue;

      // Find nearest non-null neighbors in 4 directions
      const neighbors: { value: number; dist: number }[] = [];

      // Left
      for (let jj = j - 1; jj >= 0; jj--) {
        if (result[i][jj] !== null) {
          neighbors.push({ value: result[i][jj]!, dist: Math.abs(strikes[j] - strikes[jj]) || 1 });
          break;
        }
      }
      // Right
      for (let jj = j + 1; jj < cols; jj++) {
        if (result[i][jj] !== null) {
          neighbors.push({ value: result[i][jj]!, dist: Math.abs(strikes[j] - strikes[jj]) || 1 });
          break;
        }
      }
      // Up (lower DTE)
      for (let ii = i - 1; ii >= 0; ii--) {
        if (result[ii][j] !== null) {
          neighbors.push({ value: result[ii][j]!, dist: Math.abs(dtes[i] - dtes[ii]) || 1 });
          break;
        }
      }
      // Down (higher DTE)
      for (let ii = i + 1; ii < rows; ii++) {
        if (result[ii][j] !== null) {
          neighbors.push({ value: result[ii][j]!, dist: Math.abs(dtes[i] - dtes[ii]) || 1 });
          break;
        }
      }

      if (neighbors.length >= 2) {
        // Inverse-distance weighting
        const totalInvDist = neighbors.reduce((s, n) => s + 1 / n.dist, 0);
        result[i][j] = neighbors.reduce((s, n) => s + (n.value / n.dist), 0) / totalInvDist;
      }
    }
  }

  return result;
}

/**
 * Bilinear IV interpolation at a single (strike, DTE) point.
 * Same logic as the "IV interpolation" UI in Futures Insights.
 * Returns null if the point is outside the grid or there is insufficient data.
 */
export function interpolateIVAtPoint(
  strikes: number[],
  dtes: number[],
  z: (number | null)[][],
  strike: number,
  dte: number
): number | null {
  if (strikes.length < 2 || dtes.length < 2) return null;

  let si = strikes.findIndex((s) => s >= strike);
  let di = dtes.findIndex((d) => d >= dte);

  if (si <= 0) si = 1;
  if (si >= strikes.length) si = strikes.length - 1;
  if (di <= 0) di = 1;
  if (di >= dtes.length) di = dtes.length - 1;

  const s0 = strikes[si - 1],
    s1 = strikes[si];
  const d0 = dtes[di - 1],
    d1 = dtes[di];

  const z00 = z[di - 1]?.[si - 1];
  const z01 = z[di - 1]?.[si];
  const z10 = z[di]?.[si - 1];
  const z11 = z[di]?.[si];

  const vals = [z00, z01, z10, z11].filter((v) => v !== null) as number[];
  if (vals.length === 0) return null;
  if (vals.length < 4) {
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const ts = s1 !== s0 ? (strike - s0) / (s1 - s0) : 0.5;
  const td = d1 !== d0 ? (dte - d0) / (d1 - d0) : 0.5;
  return (
    z00! * (1 - ts) * (1 - td) +
    z01! * ts * (1 - td) +
    z10! * (1 - ts) * td +
    z11! * ts * td
  );
}
