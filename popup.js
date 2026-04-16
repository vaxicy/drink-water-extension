const DEFAULT_MINUTES = 30;

const timerEl       = document.getElementById("timer");
const hintEl        = document.getElementById("nextHint");
const drinkBtn      = document.getElementById("drinkBtn");
const resetBtn      = document.getElementById("resetBtn");
const intervalSelect= document.getElementById("intervalSelect");
const customRow     = document.getElementById("customRow");
const customIntervalValue = document.getElementById("customIntervalValue");
const customIntervalUnit  = document.getElementById("customIntervalUnit");
const customApplyBtn      = document.getElementById("customApplyBtn");
const timerToggle   = document.getElementById("timerToggle");
const notifToggle   = document.getElementById("notifToggle");
const timerStatus   = document.getElementById("timerStatus");
const notifStatus   = document.getElementById("notifStatus");
const toast         = document.getElementById("toast");
const progressBar   = document.getElementById("progressBar");

let intervalMinutes = DEFAULT_MINUTES;
let customMinutes = DEFAULT_MINUTES;
let tickHandle = null;
let isRunning = false;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

const PRESET_MINUTES = [15, 30, 45, 60];

function getIntervalText(mins) {
  if (mins % 60 === 0) {
    return `每 ${mins / 60} 小时提醒一次`;
  } else if (mins >= 1) {
    return `每 ${mins} 分钟提醒一次`;
  } else {
    return `每 ${Math.round(mins * 60)} 秒提醒一次`;
  }
}

function formatMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2,"0") + ":" + String(s % 60).padStart(2,"0");
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function calcRemaining(alarmStartTime, intervalMins) {
  const elapsed = (Date.now() - alarmStartTime) / 1000;
  const total = intervalMins * 60;
  return Math.max(0, total - (elapsed % total));
}

function render(remainingSec) {
  timerEl.textContent = formatMMSS(remainingSec);
  const ratio = (intervalMinutes * 60) > 0 ? remainingSec / (intervalMinutes * 60) : 0;
  progressBar.style.width = clamp(ratio * 100, 0, 100) + "%";
}

// 更新界面的"运行/暂停"状态
function applyRunningUI(running) {
  isRunning = running;
  timerToggle.checked = running;
  timerStatus.textContent = running ? "运行中" : "未开启";
  drinkBtn.disabled = !running;
  resetBtn.disabled = !running;

  if (running) {
    timerEl.classList.remove("paused");
    progressBar.classList.remove("paused");
  } else {
    timerEl.classList.add("paused");
    progressBar.classList.add("paused");
    timerEl.textContent = "--:--";
    progressBar.style.width = "100%";
    hintEl.textContent = "提醒未开启";
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }
}

function startDisplayTicker(alarmStartTime) {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    const remaining = calcRemaining(alarmStartTime, intervalMinutes);
    render(remaining);
  }, 1000);
}

// 通知开关 UI
function applyNotifUI(enabled) {
  notifToggle.checked = enabled;
  notifStatus.textContent = enabled ? "已开启" : "未开启";
}

function showCustomRow(show) {
  if (!customRow) return;
  customRow.classList.toggle("show", !!show);
}

function minutesFromCustomInput() {
  const v = Number(customIntervalValue.value);
  const unit = customIntervalUnit.value;
  if (!Number.isFinite(v) || v <= 0) return null;

  let minutes;
  if (unit === "hours") {
    minutes = v * 60;
  } else if (unit === "minutes") {
    minutes = v;
  } else if (unit === "seconds") {
    minutes = v / 60;
  } else {
    return null;
  }

  const rounded = Math.round(minutes * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) return null;
  return clamp(rounded, 0.0167, 24 * 60);
}

function syncCustomInputsFromMinutes(mins) {
  const m = clamp(Number(mins) || DEFAULT_MINUTES, 0.0167, 24 * 60);
  // 如果是整数分钟，用分钟；否则用秒
  if (m % 1 === 0) {
    customIntervalUnit.value = "minutes";
    customIntervalValue.value = String(m);
  } else {
    customIntervalUnit.value = "seconds";
    customIntervalValue.value = String(Math.round(m * 60));
  }
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const p = await Notification.requestPermission();
  return p === "granted";
}

function init() {
  chrome.storage.local.get(
    ["intervalMinutes", "customMinutes", "alarmStartTime", "timerRunning", "notifEnabled"],
    (data) => {
      intervalMinutes = data.intervalMinutes || DEFAULT_MINUTES;
      customMinutes = data.customMinutes || data.intervalMinutes || DEFAULT_MINUTES;
      const running   = !!data.timerRunning;
      const notifOn   = !!data.notifEnabled;

      // 恢复选择器
      const isPreset = PRESET_MINUTES.includes(Number(intervalMinutes));
      if (isPreset) {
        const opt = intervalSelect.querySelector(`option[value="${intervalMinutes}"]`);
        if (opt) opt.selected = true;
        showCustomRow(false);
      } else {
        intervalSelect.value = "custom";
        showCustomRow(true);
        syncCustomInputsFromMinutes(intervalMinutes);
      }

      applyNotifUI(notifOn);
      applyRunningUI(running);

      if (running && data.alarmStartTime) {
        const remaining = calcRemaining(data.alarmStartTime, intervalMinutes);
        hintEl.textContent = getIntervalText(intervalMinutes);
        render(remaining);
        startDisplayTicker(data.alarmStartTime);
      }
    }
  );
}

// ── 事件：提醒开关 ──────────────────────────
timerToggle.addEventListener("change", () => {
  if (timerToggle.checked) {
    // 开启：通知后台设置闹钟
    chrome.runtime.sendMessage({ type: "SET_ALARM", minutes: intervalMinutes }, () => {
      chrome.storage.local.set({ timerRunning: true });
      chrome.storage.local.get(["alarmStartTime"], (data) => {
        applyRunningUI(true);
        hintEl.textContent = getIntervalText(intervalMinutes);
        const remaining = calcRemaining(data.alarmStartTime, intervalMinutes);
        render(remaining);
        startDisplayTicker(data.alarmStartTime);
      });
    });
    showToast("提醒已开启 ✓");
  } else {
    // 关闭：通知后台取消闹钟
    chrome.runtime.sendMessage({ type: "CANCEL_ALARM" });
    chrome.storage.local.set({ timerRunning: false });
    applyRunningUI(false);
    showToast("提醒已关闭");
  }
});

// ── 事件：通知开关 ──────────────────────────
notifToggle.addEventListener("change", async () => {
  if (notifToggle.checked) {
    const granted = await requestNotifPermission();
    if (granted) {
      chrome.storage.local.set({ notifEnabled: true });
      applyNotifUI(true);
      showToast("通知已开启 ✓");
    } else {
      // 权限被拒，开关打不开
      applyNotifUI(false);
      chrome.storage.local.set({ notifEnabled: false });
      showToast("浏览器拒绝了通知权限");
    }
  } else {
    chrome.storage.local.set({ notifEnabled: false });
    applyNotifUI(false);
    showToast("通知已关闭");
  }
});

// ── 事件：我喝了 ──────────────────────────
drinkBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_ALARM", minutes: intervalMinutes }, () => {
    chrome.storage.local.get(["alarmStartTime"], (data) => {
      hintEl.textContent = getIntervalText(intervalMinutes);
      const remaining = calcRemaining(data.alarmStartTime, intervalMinutes);
      render(remaining);
      startDisplayTicker(data.alarmStartTime);
    });
  });
  showToast("喝水记录 ✓ 倒计时已重置");
});

// ── 事件：重置倒计时 ──────────────────────────
resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_ALARM", minutes: intervalMinutes }, () => {
    chrome.storage.local.get(["alarmStartTime"], (data) => {
      render(intervalMinutes * 60);
      startDisplayTicker(data.alarmStartTime);
    });
  });
  showToast("倒计时已重置");
});

// ── 事件：修改间隔 ──────────────────────────
intervalSelect.addEventListener("change", (e) => {
  const v = String(e.target.value);
  if (v === "custom") {
    showCustomRow(true);
    // 回显上次的自定义值
    syncCustomInputsFromMinutes(customMinutes || intervalMinutes);
    return;
  }

  showCustomRow(false);
  intervalMinutes = Number(v);
  chrome.storage.local.set({ intervalMinutes });
  if (isRunning) {
    chrome.runtime.sendMessage({ type: "SET_ALARM", minutes: intervalMinutes }, () => {
      chrome.storage.local.get(["alarmStartTime"], (data) => {
        hintEl.textContent = getIntervalText(intervalMinutes);
        render(intervalMinutes * 60);
        startDisplayTicker(data.alarmStartTime);
      });
    });
    showToast("间隔已更新");
  }
});

// ── 事件：应用自定义间隔 ──────────────────────────
customApplyBtn.addEventListener("click", () => {
  const m = minutesFromCustomInput();
  if (!m) {
    showToast("请输入有效的时间（1-1440 分钟）");
    return;
  }
  customMinutes = m;
  intervalMinutes = m;
  chrome.storage.local.set({ customMinutes, intervalMinutes });

  if (isRunning) {
    chrome.runtime.sendMessage({ type: "SET_ALARM", minutes: intervalMinutes }, () => {
      chrome.storage.local.get(["alarmStartTime"], (data) => {
        hintEl.textContent = getIntervalText(intervalMinutes);
        render(intervalMinutes * 60);
        startDisplayTicker(data.alarmStartTime);
      });
    });
  } else {
    hintEl.textContent = getIntervalText(intervalMinutes);
    render(intervalMinutes * 60);
  }
  showToast("自定义间隔已应用");
});

window.addEventListener("unload", () => {
  if (tickHandle) clearInterval(tickHandle);
});

init();


