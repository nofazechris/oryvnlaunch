import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query } from "@nestjs/common";
import type { z } from "zod";
import { serializeLaunch, serializeTrade } from "../serialize.js";
import { AddressParam, ListLaunchesQuery, TradesQuery } from "./launches.query.js";
import { LaunchesService } from "./launches.service.js";

/** Parse with zod and turn a failure into a 400 that names every bad field. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: "Bad Request",
      message: result.error.issues.map((i) => ({ field: i.path.join(".") || "request", problem: i.message })),
    });
  }
  return result.data;
}

@Controller("launches")
export class LaunchesController {
  constructor(@Inject(LaunchesService) private readonly launches: LaunchesService) {}

  @Get()
  async list(@Query() rawQuery: unknown) {
    const query = parse(ListLaunchesQuery, rawQuery);
    const { items, total } = await this.launches.list(query);
    return { items: items.map(serializeLaunch), total, limit: query.limit, offset: query.offset };
  }

  @Get(":token")
  async get(@Param("token") rawToken: string) {
    const token = parse(AddressParam, rawToken);
    const launch = await this.launches.get(token);
    if (!launch) throw new NotFoundException(`No launch for token ${token}`);
    return serializeLaunch(launch);
  }

  @Get(":token/trades")
  async trades(@Param("token") rawToken: string, @Query() rawQuery: unknown) {
    const token = parse(AddressParam, rawToken);
    const query = parse(TradesQuery, rawQuery);
    const result = await this.launches.tradesFor(token, query);
    if (!result) throw new NotFoundException(`No launch for token ${token}`);
    return { items: result.items.map(serializeTrade), total: result.total, limit: query.limit, offset: query.offset };
  }
}
