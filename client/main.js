const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let tray;
let activeNotifications = new Map(); // 存储活跃的通知

// 设置开机自启动
function setAutoStart(enable) {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true
    });
  } else if (process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true
    });
  } else if (process.platform === 'linux') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false
    });
  }
}

// 获取当前开机自启动状态
function getAutoStartStatus() {
  const loginItemSettings = app.getLoginItemSettings();
  return loginItemSettings.openAtLogin;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // 关闭窗口时隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow.show() },
    { label: '退出', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('订阅通知小助手');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

function showNotification(title, body, messageId = null) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      closeButtonText: 'Close',
      timeoutType: 'never', // Set notification to never auto-dismiss
      urgency: 'critical' // Increase notification priority to ensure it's shown
    });
    notification.show();

    // Store notification reference
    if (messageId) {
      activeNotifications.set(messageId, notification);
      console.log('Notification stored, messageId:', messageId, 'Total active:', activeNotifications.size);
    }

    // Click notification to show window, but don't auto-close
    notification.on('click', () => {
      console.log('Notification clicked, messageId:', messageId);
      mainWindow.show();
      // Don't call notification.close(), keep notification visible
    });

    // Listen for all possible events
    notification.on('dismissed', () => {
      console.log('Notification dismissed, messageId:', messageId);
      handleNotificationClose(messageId);
    });

    notification.on('close', () => {
      console.log('Notification closed, messageId:', messageId);
      handleNotificationClose(messageId);
    });

    notification.on('failed', () => {
      console.log('Notification failed, messageId:', messageId);
      handleNotificationClose(messageId);
    });
  }
}

function handleNotificationClose(messageId) {
  if (messageId) {
    // Remove from active notifications
    if (activeNotifications.has(messageId)) {
      activeNotifications.delete(messageId);
      console.log('Notification removed from active list, messageId:', messageId, 'Remaining:', activeNotifications.size);
    }

    // Notify renderer to update message status
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('notification-closed', { messageId });
      console.log('Sent notification-closed to renderer, messageId:', messageId);
    }
  }
}

// 关闭通知
function closeNotification(messageId) {
  const notification = activeNotifications.get(messageId);
  if (notification) {
    try {
      notification.close();
      console.log('Notification closed programmatically, messageId:', messageId);
    } catch (error) {
      console.error('Error closing notification, messageId:', messageId, error);
    }
    activeNotifications.delete(messageId);
  }
}

// 检查通知是否活跃
function checkNotificationActive(messageId) {
  return activeNotifications.has(messageId);
}

// 强制从活跃列表中移除通知
function forceRemoveNotification(messageId) {
  activeNotifications.delete(messageId);
  console.log('Force removed notification, messageId:', messageId, 'Remaining:', activeNotifications.size);
}

app.whenReady().then(() => {
  // 检查并应用开机自启动设置
  const autoStartEnabled = store.get('autoStart', false);
  if (autoStartEnabled) {
    setAutoStart(true);
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC通信
ipcMain.on('show-notification', (event, { title, body, messageId }) => {
  showNotification(title, body, messageId);
});

ipcMain.on('notification-read', (event, { messageId }) => {
  console.log('notification-read IPC received, messageId:', messageId);
  closeNotification(messageId);
});

ipcMain.on('check-notification', (event, { messageId }) => {
  // 同步返回通知是否活跃
  event.returnValue = checkNotificationActive(messageId);
});

ipcMain.on('force-remove-notification', (event, { messageId }) => {
  // 强制从活跃列表中移除通知
  console.log('force-remove-notification IPC received, messageId:', messageId);
  forceRemoveNotification(messageId);
});

ipcMain.on('save-config', (event, config) => {
  store.set('config', config);
});

ipcMain.on('get-config', (event) => {
  event.reply('config-response', store.get('config', {}));
});

ipcMain.on('set-auto-start', (event, enable) => {
  setAutoStart(enable);
  store.set('autoStart', enable);
});

ipcMain.on('get-auto-start', (event) => {
  const enabled = getAutoStartStatus();
  event.reply('auto-start-status', enabled);
});
