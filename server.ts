import { Hono } from "hono";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const MODEL = "gemini-3.8-flash-tts";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;

type Speak = { text: string; style?: string; voice?: string };

export function requestSpeech(
  { text, style, voice = "Kore" }: Speak,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(API, {
    method: "POST",
    signal,
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text, ...(style && { speech_metadata: { style } }) }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { voice } },
      },
    }),
  });
}

export async function* pcmChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Buffer> {
  let pending = "";
  for await (const text of body.pipeThrough(new TextDecoderStream())) {
    const lines = (pending + text).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const event = JSON.parse(line.slice(5));
      if (event.error) throw new Error(event.error.message);
      for (const part of event.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data)
          yield Buffer.from(part.inlineData.data, "base64");
      }
    }
  }
}

export const app = new Hono();

app.post("/api/speak", async (c) => {
  const input = await c.req.json<Speak>();
  if (
    !input.text?.trim() ||
    input.text.length > 300 ||
    (input.style?.length ?? 0) > 200
  ) {
    return c.text("Invalid script length", 400);
  }
  const upstream = new AbortController();
  const signal = AbortSignal.any([c.req.raw.signal, upstream.signal]);
  const res = await requestSpeech(input, signal);
  if (!res.ok || !res.body) {
    console.error("Gemini:", res.status, await res.text());
    return c.text("Speech generation failed", 502);
  }
  const pcm = Readable.from(pcmChunks(res.body), { signal, objectMode: false });
  pcm.once("close", () => upstream.abort());
  return new Response(Readable.toWeb(pcm) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
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
