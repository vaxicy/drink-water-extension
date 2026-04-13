const DEFAULT_MINUTES = 30;

const timerEl = document.getElementById("timer");
const hintEl = document.getElementById("nextHint");
const drinkBtn = document.getElementById("drinkBtn");
const intervalSelect = document.getElementById("intervalSelect");
const enableNotifBtn = document.getElementById("enableNotifBtn");
const permText = document.getElementById("permText");
const permDot = document.getElementById("permDot");
const toast = document.getElementById("toast");
const progressBar = document.getElementById("progressBar");

let intervalMinutes = DEFAULT_MINUTES;
let tickHandle = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

// 根据后台记录的开始时间，计算当前剩余秒数
function calcRemaining(alarmStartTime, intervalMins) {
  const elapsed = (Date.now() - alarmStartTime) / 1000;
  const total = intervalMins * 60;
  const remaining = total - (elapsed % total);
  return Math.max(0, remaining);
}

function render(remainingSec) {
  timerEl.textContent = formatMMSS(remainingSec);
  const ratio = (intervalMinutes * 60) > 0 ? remainingSec / (intervalMinutes * 60) : 0;
  progressBar.style.width = clamp(ratio * 100, 0, 100) + "%";
}

// 每秒从 storage 里算剩余时间并更新显示
function startDisplayTicker(alarmStartTime) {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    const remaining = calcRemaining(alarmStartTime, intervalMinutes);
    render(remaining);
  }, 1000);
}

function refreshPermissionUI() {
  const state = !("Notification" in window) ? "unsupported" : Notification.permission;
  if (state === "granted") {
    permText.textContent = "通知已开启";
    permDot.className = "dot ok";
    enableNotifBtn.textContent = "已开启";
    enableNotifBtn.disabled = true;
  } else if (state === "denied") {
    permText.textContent = "通知被拒绝";
    permDot.className = "dot warn";
    enableNotifBtn.textContent = "已被拒绝";
    enableNotifBtn.disabled = true;
  } else if (state === "unsupported") {
    permText.textContent = "不支持通知";
    permDot.className = "dot warn";
    enableNotifBtn.disabled = true;
  } else {
    permText.textContent = "通知未开启";
    permDot.className = "dot";
    enableNotifBtn.textContent = "开启通知";
    enableNotifBtn.disabled = false;
  }
}

async function requestNotificationPermission() {
  try {
    const p = await Notification.requestPermission();
    refreshPermissionUI();
    showToast(p === "granted" ? "通知已开启 ✓" : "通知被拒绝，将用弹窗提醒。");
  } catch {
    showToast("请求通知权限失败。");
  }
}

function applyInterval(minutes, resetTimer = true) {
  intervalMinutes = minutes;
  hintEl.textContent = `每 ${minutes} 分钟提醒一次`;

  // 通知后台重新设置闹钟
  chrome.runtime.sendMessage({ type: "SET_ALARM", minutes }, () => {
    if (resetTimer) {
      // 后台设置完后，用当前时间作为新起点
      chrome.storage.local.get(["alarmStartTime"], (data) => {
        startDisplayTicker(data.alarmStartTime || Date.now());
        render(minutes * 60);
      });
    }
  });
}

function init() {
  // 从后台获取当前状态
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (data) => {
    const savedMinutes = data?.intervalMinutes || DEFAULT_MINUTES;
    intervalMinutes = savedMinutes;

    // 恢复选择器显示
    const opt = intervalSelect.querySelector(`option[value="${savedMinutes}"]`);
    if (opt) opt.selected = true;
    hintEl.textContent = `每 ${savedMinutes} 分钟提醒一次`;

    const alarmStartTime = data?.alarmStartTime || Date.now();
    const remaining = calcRemaining(alarmStartTime, savedMinutes);
    render(remaining);
    startDisplayTicker(alarmStartTime);
    refreshPermissionUI();
  });
}

// 事件绑定
drinkBtn.addEventListener("click", () => {
  // 点击"我喝了"：重置后台闹钟
  applyInterval(intervalMinutes, true);
  showToast("喝水记录 ✓ 倒计时已重置");
});

intervalSelect.addEventListener("change", (e) => {
  applyInterval(Number(e.target.value), true);
  showToast("提醒间隔已更新");
});

enableNotifBtn.addEventListener("click", () => {
  requestNotificationPermission();
});

window.addEventListener("unload", () => {
  if (tickHandle) clearInterval(tickHandle);
});

init();