# Gemini Voice demo

A small text-to-speech, voice cloning, and live translation demo for [DevFest Kansai 2026](https://df26.gdgs.jp/kansai/).

| Demo | Description |
| --- | --- |
| Text to Speech | Stream speech with a chosen voice and reading style. |
| Voice Cloning | Register your voice from sample and consent recordings, then use it for speech. |
| Live Translation | Translate microphone audio with speech and transcripts. |

## Run

Requires Node.js 24.2+ and a Gemini API key with access to `gemini-3.8-flash-tts`, Voice replication, and `gemini-3.5-live-translate-preview`.

```sh
npm ci
echo "GEMINI_API_KEY=your-key" > .env
npm run dev
```

Open <http://localhost:8790>. `npm start` runs without watching files. `HOST` and `PORT` override `127.0.0.1:8790`. This is a local demo, without authentication. Microphone capture requires localhost or HTTPS.

## How it works

`server.ts` proxies speech generation and voice registration to Gemini. `web/audio/` handles PCM playback, microphone capture, and WAV conversion. Live translation connects directly to Gemini over WebSocket using a server-issued ephemeral token. The API key never leaves the server.
