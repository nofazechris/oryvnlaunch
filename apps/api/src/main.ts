import { connect } from "@launchpad/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { db, close } = connect(config.databaseUrl);
const app = await createApp(db, { corsOrigins: config.corsOrigins, logger: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await close();
    process.exit(0);
  });
}

await app.listen(config.port, config.host);
console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", message: "api listening", port: config.port }));
