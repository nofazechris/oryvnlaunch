import "reflect-metadata";
import cors from "@fastify/cors";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Db } from "@launchpad/db";
import { DatabaseModule } from "./database.js";
import { LaunchesController } from "./launches/launches.controller.js";
import { LaunchesService } from "./launches/launches.service.js";
import { MarketController } from "./market.controller.js";

@Module({ controllers: [LaunchesController, MarketController], providers: [LaunchesService] })
class MarketModule {}

export interface AppOptions {
  /** Browser origins allowed to call the API. Empty: none. */
  corsOrigins?: string[];
  logger?: boolean;
}

/** Build the application against a database. `main.ts` and the tests both use this. */
export async function createApp(db: Db, options: AppOptions = {}): Promise<NestFastifyApplication> {
  const Root = class {};
  Module({ imports: [DatabaseModule.forDb(db), MarketModule] })(Root);

  const app = await NestFactory.create<NestFastifyApplication>(Root, new FastifyAdapter(), {
    logger: options.logger ? ["error", "warn", "log"] : false,
  });
  // Read-only API: only GET (and the preflight for it) is ever allowed cross-origin.
  await app.register(cors as never, {
    origin: options.corsOrigins?.length ? options.corsOrigins : false,
    methods: ["GET", "HEAD", "OPTIONS"],
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
