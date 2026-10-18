import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { speech } from "./server/speech.ts";
import { voices } from "./server/voices.ts";
import { translation } from "./server/translation.ts";

export const app = new Hono();

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
app.route("/api/speak", speech);
app.route("/api/voices", voices);
app.route("/api/live-token", translation);
app.onError((error, c) => {
  console.error(error);
  return c.text(error.message, 500);
});
app.use(
  "/*",
  serveStatic({ root: fileURLToPath(new URL("./web", import.meta.url)) }),
);

if (import.meta.main) {
  if (!process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is not set");
  serve(
    {
      fetch: app.fetch,
      hostname: process.env.HOST ?? "127.0.0.1",
      port: Number(process.env.PORT ?? 8790),
    },
    (info) => console.log(`http://localhost:${info.port}`),
  );
}
