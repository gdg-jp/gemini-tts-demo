import * as tts from "./features/tts.js";
import * as cloning from "./features/cloning.js";
import * as translation from "./features/translation.js";

const features = { tts, cloning, translation };
const tabs = [...document.querySelectorAll('[role="tab"]')];
let active;

function select(name, focus = false) {
  if (!Object.hasOwn(features, name)) name = "tts";
  if (active !== name) {
    if (active) features[active].deactivate();
    active = name;
    for (const tab of tabs) {
      const selected = tab.dataset.feature === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden =
        !selected;
    }
    document.querySelector(".voice").hidden = name !== "tts";
    document.getElementById("cloneVoiceControl").hidden = name !== "cloning";
    document.getElementById("translationControl").hidden =
      name !== "translation";
    features[name].activate();
  }
  if (focus) tabs.find((tab) => tab.dataset.feature === name).focus();
}

for (const tab of tabs)
  tab.addEventListener("click", () => {
    history.replaceState(null, "", `#${tab.dataset.feature}`);
    select(tab.dataset.feature);
  });
document
  .querySelector('[role="tablist"]')
  .addEventListener("keydown", (event) => {
    let index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    history.replaceState(null, "", `#${tabs[index].dataset.feature}`);
    select(tabs[index].dataset.feature, true);
  });
window.addEventListener("hashchange", () => select(location.hash.slice(1)));
window.addEventListener("pagehide", () => features[active]?.deactivate());
select(location.hash.slice(1));
