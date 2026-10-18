import { Hono } from "hono";
import { gemini, TTS_MODEL } from "./gemini.ts";

async function audio(file: File) {
  return {
    mime_type: "audio/wav",
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
  };
}

export const voices = new Hono();
voices.get("/", async (c) => {
  const result = [];
  let page = "";
  do {
    const query = new URLSearchParams({ type: "replicated", page_size: "200" });
    if (page) query.set("page_token", page);
    const response = await gemini(`/voices?${query}`, {
      signal: c.req.raw.signal,
    });
    const data = await response.json();
    result.push(
      ...(data.voices ?? []).map(
        (voice: {
          id: string;
          display_name?: string;
          displayName?: string;
        }) => ({
          id: voice.id,
          name: voice.display_name ?? voice.displayName ?? "自分の声",
        }),
      ),
    );
    page = data.next_page_token ?? data.nextPageToken ?? "";
  } while (page && result.length < 200);
  return c.json({ voices: result });
});
voices.post("/", async (c) => {
  const form = await c.req.formData();
  const name = form.get("name") as string;
  const source = await audio(form.get("source") as File);
  const consent = await audio(form.get("consent") as File);
  const response = await gemini("/voices", {
    method: "POST",
    signal: c.req.raw.signal,
    body: JSON.stringify({
      store: true,
      voice: {
        model: TTS_MODEL,
        type: "replicated",
        display_name: name,
        replicated: { source_audio: source, consent_audio: consent },
      },
    }),
  });
  const voice = await response.json();
  return c.json({ id: voice.id, name }, 201);
});
