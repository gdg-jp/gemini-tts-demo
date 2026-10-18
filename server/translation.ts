import { Hono } from "hono";
import { gemini, LIVE_MODEL } from "./gemini.ts";

export const translation = new Hono();
translation.post("/", async (c) => {
  const input = await c.req.json();
  const setup = {
    model: `models/${LIVE_MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      translationConfig: {
        targetLanguageCode: input.language,
        echoTargetLanguage: false,
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
  const response = await gemini("/auth_tokens", {
    method: "POST",
    signal: c.req.raw.signal,
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
  });
  const token = await response.json();
  return c.json({ token: token.name, setup });
});
