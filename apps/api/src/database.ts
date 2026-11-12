import { Global, Module, type DynamicModule } from "@nestjs/common";
import type { Db } from "@launchpad/db";

/** Injection token for the database. Injected explicitly with @Inject(DB). */
export const DB = Symbol("DB");

/** Provides an already-connected database to every module. Tests pass an in-process one. */
@Global()
@Module({})
export class DatabaseModule {
  static forDb(db: Db): DynamicModule {
    return { module: DatabaseModule, providers: [{ provide: DB, useValue: db }], exports: [DB] };
  }
}
