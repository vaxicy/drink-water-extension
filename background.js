const DEFAULT_MINUTES = 30;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SET_ALARM") {
    setAlarm(msg.minutes);
    sendResponse({ ok: true });
  }
  if (msg.type === "CANCEL_ALARM") {
    chrome.alarms.clearAll();
    sendResponse({ ok: true });
  }
  if (msg.type === "GET_STATE") {
    chrome.storage.local.get(["intervalMinutes", "alarmStartTime", "timerRunning", "notifEnabled"], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

function setAlarm(minutes) {
  const m = Number(minutes) || DEFAULT_MINUTES;
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("drinkWater", {
      delayInMinutes: m,
      periodInMinutes: m,
    });
    chrome.storage.local.set({
      intervalMinutes: m,
      alarmStartTime: Date.now(),
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "drinkWater") return;

  chrome.storage.local.get(["intervalMinutes", "notifEnabled"], (data) => {
    // 更新下一轮起点
    chrome.storage.local.set({ alarmStartTime: Date.now() });

    // 只有通知开关开着才发通知
    if (!data.notifEnabled) return;

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "喝水提醒 💧",
      message: "该喝水啦！记得保持水分，状态更好。",
      priority: 2,
    });
  });
});

// 安装时不自动开启，等用户手动打开开关
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["timerRunning"], (data) => {
    // 只有之前是开启状态才恢复
    if (data.timerRunning) {
      chrome.storage.local.get(["intervalMinutes"], (d) => {
        setAlarm(d.intervalMinutes || DEFAULT_MINUTES);
      });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["timerRunning"], (data) => {
    if (data.timerRunning) {
      chrome.storage.local.get(["intervalMinutes"], (d) => {
        setAlarm(d.intervalMinutes || DEFAULT_MINUTES);
      });
    }
  });
});
