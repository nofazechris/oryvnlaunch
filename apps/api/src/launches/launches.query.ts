import { normalizeAddress } from "@launchpad/chain";
import { z } from "zod";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/, "must be a 0x-prefixed hex address")
  .transform((value, ctx) => {
    try {
      return normalizeAddress(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "not a valid Starknet address" });
      return z.NEVER;
    }
  });

export const AddressParam = address;

const page = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
};

export const ListLaunchesQuery = z
  .object({
    sort: z.enum(["newest", "volume", "marketcap", "progress"]).default("newest"),
    /** Only launches paired with this quote asset. */
    quote: address.optional(),
    creator: address.optional(),
    graduated: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    ...page,
  })
  .superRefine((q, ctx) => {
    // Volume and market cap are amounts in the quote asset's own unit. STRK has 18 decimals and
    // USDC has 6, so ranking them against each other would put every USDC launch at the bottom
    // for no real reason. Comparing them fairly needs a price feed, which we do not have yet.
    if ((q.sort === "volume" || q.sort === "marketcap") && !q.quote) {
      ctx.addIssue({
        code: "custom",
        path: ["quote"],
        message:
          "sorting by volume or marketcap compares amounts in one asset's units, so it needs quote=<asset address>. Use sort=progress or sort=newest to compare across assets.",
      });
    }
  });
export type ListLaunchesQuery = z.infer<typeof ListLaunchesQuery>;

export const TradesQuery = z.object({ ...page });
export type TradesQuery = z.infer<typeof TradesQuery>;
