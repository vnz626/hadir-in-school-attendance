import type { INestApplication } from "@nestjs/common";
import type { Express, Request, Response } from "express";
import express from "express";
import { createRequire } from "node:module";
import { AllExceptionsFilter } from "./common/error.filter";
import { APP_CONFIG, type AppConfig } from "./config/env";
import { buildOpenApi } from "./modules/docs/openapi";

/** Konfigurasi bersama antara main.api.ts dan tes integrasi. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.enableDocs) mountDocs(app);
}

/** OpenAPI di /api/docs; hanya di luar production (ENABLE_DOCS=true untuk memaksa). */
function mountDocs(app: INestApplication): void {
  const server = app.getHttpAdapter().getInstance() as Express;
  // Aset Swagger UI disajikan dari paket npm, bukan CDN: tidak ada permintaan keluar.
  const assets = (
    createRequire(__filename)("swagger-ui-dist") as { getAbsoluteFSPath(): string }
  ).getAbsoluteFSPath();
  server.use("/api/docs/assets", express.static(assets));

  let cached: unknown;
  server.get("/api/docs/openapi.json", (_req: Request, res: Response) => {
    cached ??= buildOpenApi(app);
    res.json(cached);
  });
  server.get("/api/docs/init.js", (_req: Request, res: Response) => {
    res
      .type("application/javascript")
      .send(
        "window.onload=function(){window.ui=SwaggerUIBundle({url:'/api/docs/openapi.json',dom_id:'#ui',deepLinking:true});};",
      );
  });
  server.get("/api/docs", (_req: Request, res: Response) => {
    res
      .type("html")
      .send(
        `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>hadir.in API</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"></head><body><div id="ui"></div><script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/api/docs/init.js"></script></body></html>`,
      );
  });
}
