const RATE = 24000;

export async function playSpeech(script, { signal, onFirstAudio }) {
  signal.throwIfAborted();
  const started = performance.now();
  const ctx = new AudioContext({ latencyHint: "interactive" });
  let reader;
  let lastSource;
  let finishPlayback;
  let at = 0;
  let carry = new Uint8Array(0);
  const close = () => {
    if (ctx.state !== "closed") void ctx.close().catch(() => {});
    finishPlayback?.();
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    const [res] = await Promise.all([
      fetch("/api/speak", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(script),
      }),
      ctx.resume(),
    ]);
    if (!res.ok) throw new Error(await res.text());
    reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      const bytes = new Uint8Array(carry.length + value.length);
      bytes.set(carry);
      bytes.set(value, carry.length);
      const even = bytes.length - (bytes.length % 2);
      carry = bytes.slice(even);
      if (!even) continue;
      const buf = ctx.createBuffer(1, even / 2, RATE);
      const samples = buf.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, even);
      // Gemini emits signed 16-bit little-endian PCM.
      for (let i = 0; i < samples.length; i++)
        samples[i] = view.getInt16(i * 2, true) / 32768;
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.onended = () => {
        source.disconnect();
        if (lastSource === source) {
          lastSource = null;
          finishPlayback?.();
        }
      };
      lastSource = source;
      const start = Math.max(at, ctx.currentTime + 0.02);
      source.start(start);
      if (!at)
        onFirstAudio?.(
          Math.round(
            performance.now() -
              started +
              (start - ctx.currentTime + ctx.baseLatency) * 1000,
          ),
        );
      at = start + buf.duration;
    }
    if (!at || carry.length) throw new Error("Incomplete PCM audio");
    if (lastSource)
      await new Promise((resolve) => {
        finishPlayback = resolve;
      });
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", close);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    close();
  }
}
