import { request } from "../api.js";

export class PcmPlayer {
  constructor({ signal, onFirstAudio } = {}) {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.signal = signal;
    this.onFirstAudio = onFirstAudio;
    this.started = performance.now();
    this.at = 0;
    this.carry = new Uint8Array(0);
    this.sources = new Set();
    this.closed = false;
    this.abort = () => this.close();
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.close();
  }

  async resume() {
    this.signal?.throwIfAborted();
    await this.context.resume();
  }

  enqueue(chunk, rate = 24000) {
    if (this.closed) return;
    const bytes = new Uint8Array(this.carry.length + chunk.length);
    bytes.set(this.carry);
    bytes.set(chunk, this.carry.length);
    const even = bytes.length - (bytes.length % 2);
    this.carry = bytes.slice(even);
    if (!even) return;
    const buffer = this.context.createBuffer(1, even / 2, rate);
    const samples = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, even);
    for (let i = 0; i < samples.length; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size) this.finish?.();
    };
    const start = Math.max(this.at, this.context.currentTime + 0.02);
    source.start(start);
    if (!this.at)
      this.onFirstAudio?.(
        Math.round(
          performance.now() -
            this.started +
            (start - this.context.currentTime + this.context.baseLatency) *
              1000,
        ),
      );
    this.at = start + buffer.duration;
  }

  clear() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.at = 0;
    this.carry = new Uint8Array(0);
    this.finish?.();
  }

  async drain() {
    if (this.sources.size)
      await new Promise((resolve) => {
        this.finish = resolve;
      });
    this.signal?.throwIfAborted();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clear();
    this.signal?.removeEventListener("abort", this.abort);
    void this.context.close().catch(() => {});
  }
}

export function decodeAudio(data) {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
}

export function encodeAudio(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export async function playSpeech(script, { signal, onFirstAudio }) {
  signal.throwIfAborted();
  const player = new PcmPlayer({ signal, onFirstAudio });
  let reader;
  try {
    const [response] = await Promise.all([
      request("/api/speak", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(script),
      }),
      player.resume(),
    ]);
    reader = response.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      player.enqueue(value);
    }
    await player.drain();
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    player.close();
  }
}
