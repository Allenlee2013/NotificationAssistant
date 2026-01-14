const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');
const nodemailer = require('nodemailer');

const store = new Store();
let mainWindow;
let tray;
let activeNotifications = new Map(); // 存储活跃的通知
let customNotificationWindows = new Map(); // 存储自定义通知窗口
let emailTransporter = null; // 邮件发送器实例

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

  tray.setToolTip('通知小助手');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

function showNotification(title, body, messageId = null) {
  const config = store.get('config', {});
  const centerNotification = config.centerNotification || false;

  // 如果启用了居中显示，使用自定义通知窗口
  if (centerNotification) {
    showCustomNotification(title, body, messageId);
  } else {
    // 否则使用系统原生通知
    showSystemNotification(title, body, messageId);
  }
}

// 显示系统原生通知
function showSystemNotification(title, body, messageId = null) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      closeButtonText: 'Close',
      timeoutType: 'never',
      urgency: 'critical'
    });
    notification.show();

    if (messageId) {
      activeNotifications.set(messageId, notification);
      console.log('Notification stored, messageId:', messageId, 'Total active:', activeNotifications.size);
    }

    notification.on('click', () => {
      console.log('Notification clicked, messageId:', messageId);
      // 点击通知只显示主窗口，不关闭通知
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.on('dismissed', () => {
      console.log('Notification dismissed, messageId:', messageId);
      // 移除通知引用，但不标记为已读（点击"关闭通知"按钮会触发这个事件）
      if (messageId) {
        activeNotifications.delete(messageId);
        console.log('Notification removed from active list, messageId:', messageId);
      }
    });

    notification.on('close', () => {
      console.log('Notification closed, messageId:', messageId);
      // 移除通知引用，但不标记为已读
      if (messageId) {
        activeNotifications.delete(messageId);
        console.log('Notification removed from active list, messageId:', messageId);
      }
    });

    notification.on('failed', () => {
      console.log('Notification failed, messageId:', messageId);
      // 移除通知引用，但不标记为已读
      if (messageId) {
        activeNotifications.delete(messageId);
      }
    });
  }
}

// 显示自定义居中通知
function showCustomNotification(title, body, messageId = null) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const notificationWidth = 366;
  const notificationHeight = 160;

  const notificationWindow = new BrowserWindow({
    width: notificationWidth,
    height: notificationHeight,
    x: Math.floor((width - notificationWidth) / 2),
    y: Math.floor((height - notificationHeight) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 创建通知内容 HTML - 保持系统通知样式
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          margin: 0;
          font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
          font-size: 14px;
          background: transparent;
          color: #333;
          overflow: hidden;
          animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          cursor: default;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .notification {
          background: #fcfcfc;
          border-radius: 10px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(102, 126, 234, 0.3);
          padding: 20px;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border: 1px solid #d0d0d0;
          position: relative;
          overflow: hidden;
        }
        .notification::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #667eea 100%);
          animation: shimmer 2s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .notification-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .notification-title {
          font-size: 15px;
          font-weight: 700;
          color: #333;
          margin: 0;
          flex: 1;
          line-height: 1.4;
          text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          color: #666;
          cursor: pointer;
          padding: 4px;
          width: 32px;
          height: 32px;
          line-height: 1;
          transition: all 0.2s ease;
          border-radius: 6px;
          flex-shrink: 0;
          margin-left: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-btn:hover {
          color: #333;
          background: #e8e8e8;
          transform: rotate(90deg);
        }
        .notification-body {
          font-size: 14px;
          color: #666;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .app-icon {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          animation: iconPulse 2s ease-in-out infinite;
        }
        @keyframes iconPulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
          }
        }
        .message-content {
          flex: 1;
          min-width: 0;
        }
        .message-title {
          font-size: 15px;
          font-weight: 600;
          color: #222;
          margin-bottom: 6px;
        }
        .message-text {
          font-size: 13px;
          color: #555;
          line-height: 1.5;
        }
        .click-hint {
          font-size: 11px;
          color: #999;
          margin-top: 6px;
          font-style: italic;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(-40px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes attention {
          0%, 100% {
            transform: scale(1);
          }
          10%, 30% {
            transform: scale(1.02);
          }
          20%, 40% {
            transform: scale(1);
          }
        }
        .notification.attention {
          animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                     attention 1s ease-in-out 0.4s 2;
        }
      </style>
    </head>
    <body>
      <div class="notification attention">
        <div class="notification-header">
          <h3 class="notification-title">通知小助手</h3>
          <button class="close-btn" id="closeBtn" title="关闭通知">×</button>
        </div>
        <div class="notification-body">
          <div class="app-icon">📢</div>
          <div class="message-content">
            <div class="message-title">${title}</div>
            <div class="message-text">${body}</div>
            <div class="click-hint">点击通知内容查看详情</div>
          </div>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        const closeBtn = document.getElementById('closeBtn');
        const notification = document.querySelector('.notification');

        let clickTimer = null;

        // 关闭按钮点击事件 - 立即关闭，不延迟
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTimeout(clickTimer);
          ipcRenderer.send('close-custom-notification', { messageId: ${messageId || 'null'} });
        });

        // 通知体点击事件 - 双击或长按生效，避免误触
        notification.addEventListener('click', () => {
          if (clickTimer === null) {
            // 第一次点击，设置定时器
            clickTimer = setTimeout(() => {
              // 短时间没有第二次点击，视为单击 - 不做任何操作
              clickTimer = null;
            }, 300);
          } else {
            // 第二次点击，双击生效
            clearTimeout(clickTimer);
            clickTimer = null;
            ipcRenderer.send('click-custom-notification', { messageId: ${messageId || 'null'} });
          }
        });

        // 添加悬停效果
        notification.addEventListener('mouseenter', () => {
          notification.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(102, 126, 234, 0.5)';
        });

        notification.addEventListener('mouseleave', () => {
          notification.style.boxShadow = '0 8px 40px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(102, 126, 234, 0.3)';
        });
      </script>
    </body>
    </html>
  `;

  notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  if (messageId) {
    customNotificationWindows.set(messageId, notificationWindow);
    console.log('Custom notification stored, messageId:', messageId);
  }

  notificationWindow.on('closed', () => {
    // 只有在主动关闭时才调用 handleNotificationClose
    // window 关闭事件会在点击通知后也会触发，所以要区分
    console.log('Custom notification window closed');
  });
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
  // 关闭系统通知
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

  // 关闭自定义通知窗口
  const customWindow = customNotificationWindows.get(messageId);
  if (customWindow && !customWindow.isDestroyed()) {
    try {
      customWindow.close();
      console.log('Custom notification window closed, messageId:', messageId);
    } catch (error) {
      console.error('Error closing custom notification window, messageId:', messageId, error);
    }
    customNotificationWindows.delete(messageId);
  }
}

// 检查通知是否活跃
function checkNotificationActive(messageId) {
  return activeNotifications.has(messageId) || customNotificationWindows.has(messageId);
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

// 发送邮件通知
async function sendEmailNotification(title, body) {
  const config = store.get('config', {});

  // 检查是否启用邮件通知
  if (!config.emailNotification) {
    return;
  }

  // 检查是否配置了SMTP服务器
  const smtpConfig = store.get('smtp', {});
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    console.log('未配置SMTP服务器，跳过邮件通知');
    return;
  }

  try {
    // 创建邮件发送器（每次重新创建，确保配置最新）
    emailTransporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: smtpConfig.secure || false,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    });

    // 发送邮件（自己给自己发）
    const info = await emailTransporter.sendMail({
      from: smtpConfig.user,
      to: smtpConfig.user, // 发送到自己的邮箱
      subject: title,
      text: body,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #667eea;">${title}</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-top: 20px;">
            <p style="color: #333; line-height: 1.6;">${body.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">此邮件由通知小助手自动发送，请勿回复。</p>
        </div>
      `
    });

    console.log('邮件发送成功:', info.messageId);
  } catch (error) {
    console.error('邮件发送失败:', error);
  }
}

// 监听服务器发送邮件的请求
ipcMain.on('send-email-notification', async (event, { title, body }) => {
  await sendEmailNotification(title, body);
});

// 保存SMTP配置
ipcMain.on('save-smtp-config', (event, config) => {
  store.set('smtp', config);
  console.log('SMTP配置已保存');
});

// 获取SMTP配置
ipcMain.on('get-smtp-config', (event) => {
  const config = store.get('smtp', {});
  event.reply('smtp-config-response', config);
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

// 自定义通知窗口的 IPC
ipcMain.on('close-custom-notification', (event, { messageId }) => {
  console.log('Custom notification close requested, messageId:', messageId);
  // 只关闭窗口，不调用 handleNotificationClose（不标记为已读）
  const customWindow = customNotificationWindows.get(messageId);
  if (customWindow && !customWindow.isDestroyed()) {
    try {
      customWindow.close();
      console.log('Custom notification window closed (without marking as read), messageId:', messageId);
    } catch (error) {
      console.error('Error closing custom notification window, messageId:', messageId, error);
    }
    customNotificationWindows.delete(messageId);
  }
});

ipcMain.on('click-custom-notification', (event, { messageId }) => {
  console.log('Custom notification clicked, messageId:', messageId);
  // 显示主窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  // 只关闭通知窗口，不标记为已读
  const customWindow = customNotificationWindows.get(messageId);
  if (customWindow && !customWindow.isDestroyed()) {
    try {
      customWindow.close();
      console.log('Custom notification window closed on click (without marking as read), messageId:', messageId);
    } catch (error) {
      console.error('Error closing custom notification window, messageId:', messageId, error);
    }
    customNotificationWindows.delete(messageId);
  }
});
