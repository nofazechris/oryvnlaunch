import { Global, Module, type DynamicModule } from "@nestjs/common";
import type { Db } from "@launchpad/db";

/** Injection token for the database. Injected explicitly with @Inject(DB). */
export const DB = Symbol("DB");
/** Injection token for the most image bytes the database may hold in total. */
export const IMAGE_STORAGE_LIMIT = Symbol("IMAGE_STORAGE_LIMIT");

/** Provides an already-connected database to every module. Tests pass an in-process one. */
@Global()
@Module({})
export class DatabaseModule {
  static forDb(db: Db, imageStorageLimit = 200 * 1024 * 1024): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DB, useValue: db }, { provide: IMAGE_STORAGE_LIMIT, useValue: imageStorageLimit }],
      exports: [DB, IMAGE_STORAGE_LIMIT],
    };
  }
}
