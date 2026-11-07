import type { IncomeBandKey } from "../../domain";
import { INCOME_BAND_COLORS, bandFill } from "./incomeBandColors";

/** Legend square for an income band: solid for recurring payments, hatched for withdrawals. */
export function BandSwatch({ band, hatched = false }: { band: IncomeBandKey; hatched?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{
        ...bandFill(band, hatched),
        ...(hatched ? { border: `1px solid ${INCOME_BAND_COLORS[band]}` } : {}),
      }}
    />
  );
}
