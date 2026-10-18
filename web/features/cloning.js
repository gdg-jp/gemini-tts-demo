import { request, message } from "../api.js";
import { openMicrophone, normalizeAudio, wav } from "../audio/microphone.js";
import { playSpeech } from "../audio/player.js";

const $ = (id) => document.getElementById(id);
const samplePhrase =
  "こんにちは。DevFest Kansaiへようこそ。今日は、どんな発見があるでしょうか。いろいろな分野の人たちと話しながら、AIと一緒にできることを考えてみましょう。";
let current = null;
let loaded = false;

function update() {
  const recording = current?.kind === "record";
  const busy = !!current;
  $("recordVoice").disabled = busy && !recording && current.kind !== "play";
  $("recordVoice").textContent = recording
    ? current.stage === "source"
      ? "次へ"
      : "登録する"
    : current?.kind === "create"
      ? "登録中…"
      : "声を録音";
  $("recordVoice").dataset.recording = String(recording);
  $("sourceFile").disabled = busy;
  $("clonedVoices").disabled = busy;
  $("cancelRecording").hidden = !recording;
  $("recordingPrompt").hidden = !recording;
  $("recordingPrompt").textContent = recording ? samplePhrase : "";
  $("cloneText").hidden = recording;
  $("recordingTime").hidden = !recording;
  $("cloneSpeak").disabled =
    (busy && current.kind !== "play") ||
    !$("clonedVoices").value ||
    !$("cloneText").value.trim();
  $("cloneSpeak").textContent =
    current?.kind === "play" ? "止める" : "読み上げる";
  $("cloneSpeak").dataset.state = current?.kind === "play" ? "playing" : "idle";
}

function stop() {
  current?.controller.abort();
  current = null;
  update();
}

async function run(kind, action) {
  stop();
  const operation = { kind, controller: new AbortController() };
  current = operation;
  message($("cloneStatus"));
  update();
  try {
    await action(operation);
  } catch (error) {
    if (!operation.controller.signal.aborted)
      message($("cloneStatus"), error.message);
  } finally {
    if (current === operation) {
      current = null;
      update();
    }
  }
}

function addVoice(voice) {
  if (
    ![...$("clonedVoices").options].some((option) => option.value === voice.id)
  )
    $("clonedVoices").add(new Option(voice.name, voice.id));
}

async function register(operation, source, consent) {
  operation.kind = "create";
  update();
  const name = `自分の声 ${$("clonedVoices").options.length}`;
  const form = new FormData();
  form.set("name", name);
  form.set("source", source, "source.wav");
  form.set("consent", consent, "consent.wav");
  const response = await request("/api/voices", {
    method: "POST",
    body: form,
    signal: operation.controller.signal,
  });
  const voice = await response.json();
  operation.controller.signal.throwIfAborted();
  addVoice(voice);
  $("clonedVoices").value = voice.id;
}

async function record(reference = null) {
  if (current?.kind === "record") return current.advance?.();
  await run("record", async (operation) => {
    const { signal } = operation.controller;
    let source = reference;
    let chunks = [];
    let count = 0;
    let finish;
    operation.stage = source ? "consent" : "source";
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    const updateTime = () => {
      const label = operation.stage === "source" ? "サンプル" : "同意音声";
      $("recordingTime").textContent =
        `${label} ${(count / 48000).toFixed(1)} 秒`;
    };
    operation.advance = () => {
      if (operation.stage === "source") {
        if (count < 10 * 48000) {
          message($("cloneStatus"), "10秒以上、読み上げてください。");
          return;
        }
        source = wav(chunks);
        chunks = [];
        count = 0;
        operation.stage = "consent";
        message($("cloneStatus"));
        update();
        updateTime();
      } else if (count > 0) finish();
    };
    signal.addEventListener("abort", finish, { once: true });
    update();
    $("recordingTime").textContent = "マイクに接続中…";
    let microphone;
    try {
      microphone = await openMicrophone({
        signal,
        onAudio: (chunk) => {
          chunks.push(chunk);
          count += chunk.length;
          updateTime();
          if (count >= 30 * 48000) operation.advance();
        },
      });
      await done;
      signal.throwIfAborted();
      microphone.stop();
      await register(operation, source, wav(chunks));
    } finally {
      microphone?.stop();
      signal.removeEventListener("abort", finish);
    }
  });
}

$("recordVoice").addEventListener("click", () => record());
$("cancelRecording").addEventListener("click", stop);
$("sourceFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  let reference;
  await run("upload", async ({ controller }) => {
    reference = await normalizeAudio(file, controller.signal);
  });
  if (reference) void record(reference);
});
$("cloneSpeak").addEventListener("click", () => {
  if (current?.kind === "play") return stop();
  void run("play", ({ controller }) =>
    playSpeech(
      {
        text: $("cloneText").value.trim(),
        voice: $("clonedVoices").value,
      },
      {
        signal: controller.signal,
        onFirstAudio: (ms) => message($("cloneStatus"), `${ms} ms`),
      },
    ),
  );
});
$("cloneText").addEventListener("input", update);
$("clonedVoices").addEventListener("change", update);

export function activate() {
  update();
  if (!loaded)
    void run("list", async ({ controller }) => {
      const response = await request("/api/voices", {
        signal: controller.signal,
      });
      const data = await response.json();
      controller.signal.throwIfAborted();
      for (const voice of data.voices) addVoice(voice);
      $("clonedVoices").value = data.voices[0]?.id ?? "";
      loaded = true;
    });
}

export function deactivate() {
  stop();
}
