import templates from "./templates.js";
import { playSpeech } from "./audio.js";

const $ = (id) => document.getElementById(id);
let current = null;

const pop = $("voices"),
  voiceBtn = $("voiceBtn");
const options = [...pop.querySelectorAll("[data-voice]")];
for (const b of options)
  b.tabIndex = b.getAttribute("aria-selected") === "true" ? 0 : -1;
function positionVoices() {
  if (!pop.matches(":popover-open")) return;
  const r = voiceBtn.getBoundingClientRect();
  pop.style.left = `${Math.max(16, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 16))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 8))}px`;
}
pop.addEventListener("toggle", (e) => {
  const open = e.newState === "open";
  voiceBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    positionVoices();
    options.find((b) => b.getAttribute("aria-selected") === "true").focus();
  }
});
window.addEventListener("resize", positionVoices);
window.addEventListener("scroll", positionVoices, { passive: true });
pop.addEventListener("click", (e) => {
  const b = e.target.closest("[data-voice]");
  if (!b) return;
  for (const x of options) {
    x.setAttribute("aria-selected", String(x === b));
    x.tabIndex = x === b ? 0 : -1;
  }
  $("voiceName").textContent = b.dataset.voice;
  voiceBtn.setAttribute("aria-label", `声を選ぶ: ${b.dataset.voice}`);
  pop.hidePopover();
  voiceBtn.focus();
});
pop.addEventListener("keydown", (e) => {
  const index = options.indexOf(document.activeElement);
  let next;
  if (e.key === "ArrowDown") next = (index + 1) % options.length;
  if (e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
  if (e.key === "Home") next = 0;
  if (e.key === "End") next = options.length - 1;
  if (next !== undefined) {
    e.preventDefault();
    options[next].focus();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    pop.hidePopover();
    voiceBtn.focus();
  }
  if (e.key === "Tab") pop.hidePopover();
});

let activeTemplate = null;
for (const t of templates) {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = t.name;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => {
    activeTemplate = t;
    $("style").value = t.style;
    $("text").value = t.text;
    updateEditor();
    $("text").focus();
  });
  $("chips").append(b);
}
function updateEditor() {
  const text = $("text");
  setState(current ? "playing" : "idle");
  text.style.height = "auto";
  text.style.height = `${text.scrollHeight}px`;
  [...$("chips").children].forEach((b, i) => {
    const t = templates[i];
    b.setAttribute(
      "aria-pressed",
      String(
        t === activeTemplate &&
          text.value === t.text &&
          $("style").value === t.style,
      ),
    );
  });
}
for (const field of [$("text"), $("style")])
  field.addEventListener("input", updateEditor);
window.addEventListener("resize", updateEditor);
document.fonts.ready.then(updateEditor);
updateEditor();

$("speak").addEventListener("click", () => (current ? stop() : speak()));

async function speak() {
  const text = $("text").value.trim();
  if (!text) return;
  const controller = new AbortController();
  current = controller;
  setState("playing");
  showStatus("");
  try {
    await playSpeech(
      {
        text,
        style: $("style").value.trim(),
        voice: $("voiceName").textContent,
      },
      {
        signal: controller.signal,
        onFirstAudio: (ms) => {
          if (current === controller) showStatus(`${ms} ms`);
        },
      },
    );
  } catch (error) {
    if (current === controller && !controller.signal.aborted) {
      console.error("Playback:", error);
      showStatus("音声を再生できませんでした。もう一度お試しください。");
    }
  } finally {
    if (current === controller) stop();
  }
}

function stop() {
  current?.abort();
  current = null;
  setState("idle");
}
function setState(state) {
  $("speak").dataset.state = state;
  $("speak").disabled = state === "idle" && !$("text").value.trim();
  $("speakLabel").textContent = state === "playing" ? "止める" : "読み上げる";
}
function showStatus(text) {
  $("ms").value = text;
  $("ms").hidden = !text;
}
window.addEventListener("pagehide", stop);
