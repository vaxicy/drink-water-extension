const DEFAULT_MINUTES = 30;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1. 设置闹钟：用于“我喝了”重置，或者切换间隔
  if (msg.type === "SET_ALARM") {
    const minutes = Number(msg.minutes) || DEFAULT_MINUTES;
    // 清除所有旧闹钟
    chrome.alarms.clearAll(() => {
      // 设置新闹钟
      chrome.alarms.create("drinkWater", {
        delayInMinutes: minutes,
        periodInMinutes: minutes, // 循环周期
      });
      // 同步存储
      chrome.storage.local.set({
        intervalMinutes: minutes,
        // 不需要存储 alarmStartTime，因为 chrome.alarms 自带
      });
    });
    sendResponse({ ok: true });
  }

  // 2. 取消闹钟：只在“我喝了”且不想立即重置时调用，或者在切换间隔时调用
  if (msg.type === "CANCEL_ALARM") {
    chrome.alarms.clearAll();
    sendResponse({ ok: true });
  }

  // 3. 获取状态
  if (msg.type === "GET_STATE") {
    chrome.storage.local.get(["intervalMinutes", "notifEnabled"], (data) => {
      sendResponse(data);
    });
    return true; // 保持消息通道开启以接收下一帧
  }
});

// 监听闹钟触发
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "drinkWater") return;

  // 1. 立即设置下一个闹钟（保持周期性）
  chrome.storage.local.get(["intervalMinutes"], (data) => {
    const minutes = data.intervalMinutes || DEFAULT_MINUTES;
    chrome.alarms.create("drinkWater", {
      delayInMinutes: minutes,
      periodInMinutes: minutes,
    });
  });

  // 2. 发送通知
  // 检查通知开关
  chrome.storage.local.get(["notifEnabled"], (data) => {
    if (data.notifEnabled) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png", // 确保文件存在
        title: "喝水提醒 💧",
        message: "该喝水啦！记得保持水分，状态更好。",
        priority: 2,
      });
    }
  });
});

// 安装或启动时的恢复逻辑
// 注意：onStartup 在浏览器重启时会触发，但在后台服务 worker 中可能有限制
// 我们主要依赖 onInstalled 和用户的显式操作。
// 如果用户安装后不想立刻喝，最好默认不启动。