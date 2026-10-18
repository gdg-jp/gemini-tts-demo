import { json, message } from "../api.js";
import { PcmPlayer, decodeAudio, encodeAudio } from "../audio/player.js";
import { openMicrophone } from "../audio/microphone.js";

const $ = (id) => document.getElementById(id);
let current = null;

function update(state = "idle") {
  $("translate").textContent =
    state === "connecting"
      ? "接続をキャンセル"
      : state === "live"
        ? "止める"
        : "翻訳する";
  $("translate").dataset.state = state === "idle" ? "idle" : "playing";
  $("language").disabled = state !== "idle";
  $("liveState").textContent =
    state === "connecting"
      ? "接続しています"
      : state === "live"
        ? "聞いています"
        : "";
}

function stop() {
  current?.controller.abort();
  current = null;
  update();
}

function append(id, text) {
  const element = $(id);
  element.textContent = (element.textContent + text).slice(-10000);
  element.scrollTop = element.scrollHeight;
}

async function connect(session, signal, player) {
  const url = new URL(
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained",
  );
  url.searchParams.set("access_token", session.token);
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  const close = () => socket.close();
  signal.addEventListener("abort", close, { once: true });
  await new Promise((resolve, reject) => {
    let ready = false;
    function fail(error = new Error("Translation disconnected")) {
      if (!ready) reject(error);
      else if (!signal.aborted) {
        message($("translationStatus"), error.message);
        stop();
      }
      close();
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    socket.onopen = () => {
      if (signal.aborted) return close();
      socket.send(JSON.stringify({ setup: session.setup }));
    };
    socket.onmessage = ({ data }) => {
      if (signal.aborted) return;
      try {
        const event = JSON.parse(
          typeof data === "string" ? data : new TextDecoder().decode(data),
        );
        if (event.error) return fail(new Error(event.error.message));
        if (event.setupComplete) {
          ready = true;
          signal.removeEventListener("abort", abort);
          resolve();
        }
        if (event.goAway) return close();
        const content = event.serverContent;
        if (content?.interrupted) player.clear();
        if (content?.inputTranscription?.text)
          append("sourceTranscript", content.inputTranscription.text);
        if (content?.outputTranscription?.text)
          append("translatedTranscript", content.outputTranscription.text);
        for (const part of content?.modelTurn?.parts ?? []) {
          if (!part.inlineData?.data) continue;
          const mime = part.inlineData.mimeType ?? "";
          const rate = Number(mime.match(/rate=(\d+)/)?.[1]) || 24000;
          player.enqueue(decodeAudio(part.inlineData.data), rate);
        }
      } catch (error) {
        fail(error);
      }
    };
    socket.onerror = () => fail();
    socket.onclose = () => {
      signal.removeEventListener("abort", close);
      signal.removeEventListener("abort", abort);
      if (!signal.aborted) fail();
    };
  });
  signal.throwIfAborted();
  return socket;
}

async function start() {
  const operation = { controller: new AbortController() };
  const { signal } = operation.controller;
  current = operation;
  update("connecting");
  message($("translationStatus"));
  $("sourceTranscript").textContent = "";
  $("translatedTranscript").textContent = "";
  const player = new PcmPlayer({ signal });
  try {
    await player.resume();
    const session = await json(
      "/api/live-token",
      { language: $("language").value },
      signal,
    );
    signal.throwIfAborted();
    const socket = await connect(session, signal, player);
    await openMicrophone({
      signal,
      rate: 16000,
      onAudio: (chunk) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: encodeAudio(chunk),
                mimeType: "audio/pcm;rate=16000",
              },
            },
          }),
        );
      },
    });
    signal.throwIfAborted();
    update("live");
  } catch (error) {
    if (!signal.aborted) message($("translationStatus"), error.message);
    if (current === operation) stop();
  }
}

$("translate").addEventListener("click", () => (current ? stop() : start()));
export function activate() {
  update();
}
export function deactivate() {
  stop();
}
