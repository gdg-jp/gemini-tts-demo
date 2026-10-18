export async function openMicrophone({ signal, rate = 24000, onAudio }) {
  signal.throwIfAborted();
  const context = new AudioContext({ latencyHint: "interactive" });
  let stream, source, worklet;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener("abort", stop);
    if (worklet) {
      worklet.port.onmessage = null;
      worklet.disconnect();
    }
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") void context.close().catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await context.resume();
    signal.throwIfAborted();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      signal.throwIfAborted();
    }
    await context.audioWorklet.addModule(
      new URL("./capture-worklet.js", import.meta.url),
    );
    signal.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, "pcm-capture", {
      processorOptions: { rate },
    });
    worklet.port.onmessage = ({ data }) => {
      if (!stopped) onAudio(new Uint8Array(data));
    };
    source.connect(worklet);
    worklet.connect(context.destination);
    return { stop };
  } catch (error) {
    stop();
    throw error;
  }
}

export function wav(chunks, rate = 24000) {
  const length = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const write = (offset, text) =>
    [...text].forEach((character, i) =>
      view.setUint8(offset + i, character.charCodeAt(0)),
    );
  write(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length, true);
  let offset = 44;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function normalizeAudio(file, signal) {
  const decoder = new OfflineAudioContext(1, 1, 24000);
  const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
  signal.throwIfAborted();
  const context = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * 24000),
    24000,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  signal.throwIfAborted();
  const samples = rendered.getChannelData(0);
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return wav([bytes]);
}
