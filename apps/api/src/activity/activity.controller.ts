import { Controller, Get, Inject, Query } from "@nestjs/common";
import { describeQuoteAsset } from "../assets.js";
import { cleanText } from "../sanitize.js";
import { parse } from "../launches/launches.controller.js";
import { ActivityQuery } from "../launches/launches.query.js";
import { ActivityService } from "./activity.service.js";

@Controller("activity")
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  /** Recent events across the platform, or for one wallet (`wallet=`) or one token (`token=`). */
  @Get()
  async recent(@Query() rawQuery: unknown) {
    const query = parse(ActivityQuery, rawQuery);
    const events = await this.activity.recent(query);
    return {
      items: events.map((e) => ({
        kind: e.kind,
        time: e.time.toISOString(),
        token: e.token,
        symbol: cleanText(e.symbol, 16),
        name: cleanText(e.name, 64),
        quote: describeQuoteAsset(e.quoteToken),
        wallet: e.wallet,
        /** Smallest quote units. A buy's amount includes the fee; a sell's is after it. */
        amount: e.amount === null ? null : e.amount.toString(),
        tokenAmount: e.tokenAmount === null ? null : e.tokenAmount.toString(),
        txHash: e.txHash,
        blockNumber: e.blockNumber,
      })),
    };
  }
}
