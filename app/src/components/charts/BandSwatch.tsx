import type { IncomeBandKey } from "../../domain";
import { INCOME_BAND_COLORS } from "./incomeBandColors";

/** Legend square for an income band: solid for recurring payments, hatched for withdrawals. */
export function BandSwatch({ band, hatched = false }: { band: IncomeBandKey; hatched?: boolean }) {
  const color = INCOME_BAND_COLORS[band];
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={
        hatched
          ? {
              border: `1px solid ${color}`,
              backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2px, #ffffff 2px 4px)`,
            }
          : { backgroundColor: color }
      }
    />
  );
}
