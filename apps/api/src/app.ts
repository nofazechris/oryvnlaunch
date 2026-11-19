import "reflect-metadata";
import cors from "@fastify/cors";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Db } from "@launchpad/db";
import { DatabaseModule } from "./database.js";
import { ActivityController } from "./activity/activity.controller.js";
import { ActivityService } from "./activity/activity.service.js";
import { LaunchesController } from "./launches/launches.controller.js";
import { LaunchesService } from "./launches/launches.service.js";
import { MarketController } from "./market.controller.js";
import { IMAGE_TYPES, ImagesController, MAX_IMAGE_BYTES } from "./images.js";
import { applySecurity } from "./security.js";
import { type FetchLike, PriceModule, PriceService, PricesController } from "./prices.js";

@Module({ controllers: [LaunchesController, ActivityController, MarketController, ImagesController, PricesController], providers: [LaunchesService, ActivityService] })
class MarketModule {}

export interface AppOptions {
  /** Browser origins allowed to call the API. Empty: none. */
  corsOrigins?: string[];
  logger?: boolean;
  /** Used to fetch the STRK price. Tests pass a stub so nothing touches the network. */
  priceFetch?: FetchLike;
  /** Proxies in front of the API (0 = none), so the caller's real address can be read. */
  trustProxyHops?: number;
  /** Requests each address may make per minute. */
  rateLimitPerMinute?: number;
  /** Most bytes of images kept in total. */
  maxImageStorageBytes?: number;
}

/** Build the application against a database. `main.ts` and the tests both use this. */
export async function createApp(db: Db, options: AppOptions = {}): Promise<NestFastifyApplication> {
  const Root = class {};
  Module({ imports: [DatabaseModule.forDb(db, options.maxImageStorageBytes), PriceModule.forService(new PriceService(options.priceFetch)), MarketModule] })(Root);

  const app = await NestFactory.create<NestFastifyApplication>(Root, new FastifyAdapter({ trustProxy: (options.trustProxyHops ? options.trustProxyHops : false) as never, bodyLimit: 16 * 1024, routerOptions: { maxParamLength: 100 } } as never), {
    logger: options.logger ? ["error", "warn", "log"] : false,
  });
  applySecurity(app.getHttpAdapter().getInstance(), { rateLimitPerMinute: options.rateLimitPerMinute ?? 300 });
  // Everything is a read except one narrow write: uploading a token image (POST /images). Those are the
  // only methods ever allowed cross-origin, and only from the configured origins.
  await app.register(cors as never, {
    origin: options.corsOrigins?.length ? options.corsOrigins : false,
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ["content-type"],
  });
  // Uploads arrive as the raw image bytes. Fastify only parses JSON and text unless told otherwise, and
  // the size limit is enforced while reading, so an oversized upload is cut off rather than buffered.
  app.getHttpAdapter().getInstance().addContentTypeParser([...IMAGE_TYPES], { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES + 1 }, (_req, body, done) => done(null, body));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
