// 后台服务：负责真正的定时提醒
// 弹窗关闭后它依然在运行

const DEFAULT_MINUTES = 30;

// 监听来自 popup 的消息
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
    chrome.storage.local.get(["intervalMinutes", "alarmStartTime"], (data) => {
      sendResponse(data);
    });
    return true; // 异步响应必须 return true
  }
});

// 设置定时器
function setAlarm(minutes) {
  const m = Number(minutes) || DEFAULT_MINUTES;
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("drinkWater", {
      delayInMinutes: m,
      periodInMinutes: m,
    });
    // 记录开始时间，供弹窗计算剩余时间
    chrome.storage.local.set({
      intervalMinutes: m,
      alarmStartTime: Date.now(),
    });
  });
}

// 闹钟触发时发送通知
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "drinkWater") return;

  chrome.storage.local.get(["intervalMinutes"], (data) => {
    const m = data.intervalMinutes || DEFAULT_MINUTES;
    // 更新开始时间（下一轮计时起点）
    chrome.storage.local.set({ alarmStartTime: Date.now() });

    // 发送系统通知
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "喝水提醒 💧",
      message: "该喝水啦！记得保持水分，状态更好。",
      priority: 2,
    });
  });
});

// 扩展安装或启动时，自动恢复定时器
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["intervalMinutes"], (data) => {
    const m = data.intervalMinutes || DEFAULT_MINUTES;
    setAlarm(m);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["intervalMinutes"], (data) => {
    const m = data.intervalMinutes || DEFAULT_MINUTES;
    setAlarm(m);
  });
});