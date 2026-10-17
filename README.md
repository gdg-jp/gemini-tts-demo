# Gemini TTS demo

A small streaming text-to-speech demo for [DevFest Kansai 2026](https://df26.gdgs.jp/kansai/).

## Run

Requires Node.js 24.2+ and a Gemini API key with access to `gemini-3.8-flash-tts`.

```sh
npm ci
echo "GEMINI_API_KEY=your-key" > .env
npm run dev
```

Open <http://localhost:8790>. `npm start` runs without watching files. `HOST` and `PORT` override `127.0.0.1:8790`. This is a local demo, without authentication.

## How it works

`web/app.js` posts the script, reading style, and voice to `server.ts`. The server calls [streamGenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation#streaming) and forwards the PCM chunks to `web/audio.js`, which plays them as they arrive. The API key never leaves the server.
