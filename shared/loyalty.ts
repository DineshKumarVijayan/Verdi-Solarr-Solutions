import { z } from "zod";

/** Default loyalty rate before an owner/admin changes it: 0.5 % (basis points). */
export const DEFAULT_LOYALTY_BP = 50;

/** Points earned on a sale: the rate's share of the sale in whole rupees, rounded down (1 point = Rs 1). */
export function loyaltyPoints(salePaise: number, rateBasisPoints: number): number {
  return Math.floor((salePaise * rateBasisPoints) / 10_000 / 100);
}

export interface LoyaltySettings {
  rateBasisPoints: number;
  setBy: string | null;
  setAt: string | null;
}

export const LoyaltyRateSchema = z.object({ rateBasisPoints: z.number().int("Use at most two decimals").min(0, "Enter a percentage between 0 and 100").max(10_000, "Enter a percentage between 0 and 100") }).strict();
