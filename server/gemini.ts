export const TTS_MODEL = "gemini-3.8-flash-tts";
export const LIVE_MODEL = "gemini-3.5-live-translate-preview";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function gemini(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-goog-api-key", process.env.GEMINI_API_KEY ?? "");
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
}
