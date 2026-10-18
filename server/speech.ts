import { Hono } from "hono";
import { Readable } from "node:stream";
import { gemini, TTS_MODEL } from "./gemini.ts";

type Speak = { text: string; style?: string; voice?: string };

function requestSpeech(
  { text, style, voice = "Kore" }: Speak,
  signal: AbortSignal,
) {
  return gemini(`/models/${TTS_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    signal,
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

async function* pcmChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Buffer> {
  let pending = "";
  function* parse(line: string) {
    if (!line.startsWith("data:")) return;
    const event = JSON.parse(line.slice(5));
    if (event.error) throw new Error(event.error.message);
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data)
        yield Buffer.from(part.inlineData.data, "base64");
    }
  }
  for await (const text of body.pipeThrough(new TextDecoderStream())) {
    const lines = (pending + text).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) yield* parse(line);
  }
  yield* parse(pending);
}

export const speech = new Hono();
speech.post("/", async (c) => {
  const input = await c.req.json<Speak>();
  const upstream = new AbortController();
  const signal = AbortSignal.any([c.req.raw.signal, upstream.signal]);
  const response = await requestSpeech(input, signal);
  const pcm = Readable.from(pcmChunks(response.body!), {
    signal,
    objectMode: false,
  });
  pcm.once("close", () => upstream.abort());
  return new Response(Readable.toWeb(pcm) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
});
