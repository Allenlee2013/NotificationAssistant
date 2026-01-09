const { ipcRenderer } = require('electron');

let ws = null;
let userId = null;
let subscriptions = [];
let availableTopics = [];

// DOM元素
const serverUrlInput = document.getElementById('serverUrl');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const connectBtn = document.getElementById('connectBtn');
const currentUserIdSpan = document.getElementById('currentUserId');
const connectionStatusSpan = document.getElementById('connectionStatus');

const topicInput = document.getElementById('topicInput');
const subscribeBtn = document.getElementById('subscribeBtn');
const subscriptionsList = document.getElementById('subscriptionsList');

const publishTopicSelect = document.getElementById('publishTopic');
const messageContent = document.getElementById('messageContent');
const publishBtn = document.getElementById('publishBtn');
const scheduleBtn = document.getElementById('scheduleBtn');

const scheduleCard = document.getElementById('scheduleCard');
const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
const cancelScheduleBtn = document.getElementById('cancelScheduleBtn');

const immediateMessagesContainer = document.getElementById('immediateMessagesContainer');
const scheduledMessagesContainer = document.getElementById('scheduledMessagesContainer');
const historyMessagesContainer = document.getElementById('historyMessagesContainer');

// 消息分类存储
let immediateMessages = []; // 未读消息（即时消息和定时消息）
let historyMessages = []; // 历史消息（所有已读消息）
let allScheduledMessages = []; // 所有接收的定时消息（未到时）

let isIntentionalDisconnect = false; // 标记是否是主动断开
let lastConnectedUsername = null; // 记录上次连接的用户名
let editingMessageId = null; // 当前正在编辑的定时消息ID
let reconnectTimer = null; // 重连定时器
let reconnectAttempts = 0; // 重连尝试次数
const RECONNECT_INTERVAL = 3000; // 重连间隔（3秒）
const MAX_RECONNECT_DURATION = 30 * 60 * 1000; // 最大重连时长（30分钟）

// 初始化标签页切换
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const containers = [immediateMessagesContainer, historyMessagesContainer];

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // 移除所有激活状态
      tabBtns.forEach(b => b.classList.remove('active'));
      // 隐藏所有容器
      containers.forEach(c => c.style.display = 'none');
      // 激活当前标签
      btn.classList.add('active');
      const tabName = btn.getAttribute('data-tab');
      if (tabName === 'immediate') {
        immediateMessagesContainer.style.display = 'block';
      } else if (tabName === 'history') {
        historyMessagesContainer.style.display = 'block';
      }
    });
  });
}

// 清空所有缓存数据
function clearAllData() {
  userId = null;
  subscriptions = [];
  immediateMessages = [];
  historyMessages = [];
  allScheduledMessages = [];
  availableTopics = [];

  // 清空UI
  currentUserIdSpan.textContent = '未连接';
  subscriptionsList.innerHTML = '';
  immediateMessagesContainer.innerHTML = '<div class="empty-state">暂无未读消息</div>';
  scheduledMessagesContainer.innerHTML = '<div class="empty-state">暂无待办消息</div>';
  historyMessagesContainer.innerHTML = '<div class="empty-state">暂无已读消息</div>';
  updatePublishTopics();
}

// 显示 Toast 提示
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // 3秒后自动消失
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 连接服务器
connectBtn.addEventListener('click', () => {
  const serverUrl = serverUrlInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) {
    showToast('请输入用户名', 'warning');
    return;
  }

  if (!password) {
    showToast('请输入密码', 'warning');
    return;
  }

  connectToServer(serverUrl, username, password);
});

function connectToServer(serverUrl, username, password) {
  // 检查是否切换了用户
  if (lastConnectedUsername && lastConnectedUsername !== username) {
    clearAllData();
  }

  // 如果已经存在连接，先关闭
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    isIntentionalDisconnect = true;
    ws.close();
  }

  isIntentionalDisconnect = false; // 重置断开标志
  lastConnectedUsername = username; // 记录当前用户

  // 在闭包中保存用户名和密码
  const savedUsername = username;
  const savedPassword = password;

  try {
    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      // 取消重连定时器并重置计数器
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = 0;

      connectionStatusSpan.textContent = '已连接';
      connectionStatusSpan.className = 'status connected';
      connectBtn.textContent = '断开';
      connectBtn.onclick = () => disconnect();

      // 登录用户
      ws.send(JSON.stringify({
        type: 'LOGIN',
        payload: { userId: savedUsername, password: savedPassword }
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    };

    ws.onclose = () => {
      console.log('连接关闭');
      // 如果不是主动断开，才显示错误提示
      if (!isIntentionalDisconnect) {
        showToast('连接已断开', 'warning');
      }
      handleDisconnect();
    };

    ws.onerror = (error) => {
      console.error('连接错误:', error);
      // 只有非主动断开时才显示错误
      if (!isIntentionalDisconnect) {
        showToast('连接失败，请检查服务器地址', 'error');
        handleDisconnect();
      }
    };
  } catch (error) {
    console.error('连接错误:', error);
    showToast('连接失败，请检查服务器地址', 'error');
  }
}

function disconnect() {
  // 取消重连定时器
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;

  if (ws) {
    isIntentionalDisconnect = true; // 标记为主动断开
    ws.close();
    ws = null;
  }
  handleDisconnect();
}

function handleDisconnect() {
  connectionStatusSpan.textContent = '已断开';
  connectionStatusSpan.className = 'status disconnected';
  connectBtn.textContent = '连接';

  // 清空当前用户ID（订阅、消息等保留，重连时会重新注册）
  userId = null;
  currentUserIdSpan.textContent = '未连接';

  connectBtn.onclick = () => {
    const serverUrl = serverUrlInput.value;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username) {
      showToast('请输入用户名', 'warning');
      return;
    }
    if (!password) {
      showToast('请输入密码', 'warning');
      return;
    }
    connectToServer(serverUrl, username, password);
  };

  // 如果不是主动断开且有登录信息，尝试自动重连
  if (!isIntentionalDisconnect && lastConnectedUsername && passwordInput.value) {
    startAutoReconnect();
  }
}

// 自动重连
function startAutoReconnect() {
  // 计算已重连时长
  const totalDuration = reconnectAttempts * RECONNECT_INTERVAL;

  if (totalDuration >= MAX_RECONNECT_DURATION) {
    showToast('重连超时，请手动重新连接', 'error');
    return;
  }

  reconnectAttempts++;

  connectionStatusSpan.textContent = `重连中 (${Math.floor(totalDuration / 60000)}/${Math.floor(MAX_RECONNECT_DURATION / 60000)}分钟)`;
  showToast(`第 ${reconnectAttempts} 次重连尝试...`, 'info');

  reconnectTimer = setTimeout(() => {
    const serverUrl = serverUrlInput.value;
    const username = lastConnectedUsername;
    const password = passwordInput.value;

    if (username && password) {
      console.log(`自动重连 (第${reconnectAttempts}次):`, username);
      connectToServer(serverUrl, username, password);
    }
  }, RECONNECT_INTERVAL);
}

// 处理服务器消息
function handleServerMessage(data) {
  const { type, payload } = data;

  switch (type) {
    case 'AUTH_ERROR':
      showToast(payload.message || '认证失败', 'error');
      handleDisconnect();
      break;

    case 'LOGGED_IN':
      userId = payload.userId;
      currentUserIdSpan.textContent = userId;
      console.log('登录成功:', userId);

      // 重置重连计数器
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // 更新可用主题列表
      if (payload.topics) {
        availableTopics = payload.topics;
        updateAvailableTopics();
      }

      // 自动订阅本地配置的主题
      if (window.autoSubscribeTopics && window.autoSubscribeTopics.length > 0) {
        console.log('Auto-subscribing to topics:', window.autoSubscribeTopics);
        window.autoSubscribeTopics.forEach(topic => {
          ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            payload: { topic }
          }));
        });
      }

      // 拉取定时消息列表
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'GET_SCHEDULED_MESSAGES',
          payload: { userId }
        }));
      }

      // 拉取一周内的所有消息
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'GET_HISTORY_MESSAGES',
          payload: { userId }
        }));
      }

      // 保存配置（包含密码）
      saveConfig();
      break;

    case 'TOPICS_UPDATE':
      // 接收主题更新
      availableTopics = payload.topics;
      updateAvailableTopics();
      console.log('主题列表已更新:', availableTopics);
      break;

    case 'SUBSCRIBED':
      if (!subscriptions.includes(payload.topic)) {
        subscriptions.push(payload.topic);
        updateSubscriptionsList();
        updatePublishTopics();
        // 保存配置
        saveConfig();
      }
      break;

    case 'UNSUBSCRIBED':
      subscriptions = subscriptions.filter(t => t !== payload.topic);
      updateSubscriptionsList();
      updatePublishTopics();
      // 保存配置
      saveConfig();
      break;

    case 'MESSAGE':
      console.log('收到消息:', payload);
      // 区分即时消息和定时消息
      if (payload.scheduled) {
        // 定时消息：标记为未读，添加到即时消息
        payload.read = false;
        immediateMessages.unshift(payload);
        updateImmediateMessagesList();
        showNotification(payload);
        console.log('定时消息添加到即时消息列表');
      } else {
        // 即时消息：标记为未读
        payload.read = false;
        immediateMessages.unshift(payload);
        updateImmediateMessagesList();
        showNotification(payload);
        console.log('即时消息添加到列表');
      }
      break;

    case 'HISTORY_MESSAGES_LIST':
      // 处理历史消息列表
      const allMessages = payload.messages || [];
      immediateMessages = [];
      historyMessages = [];
      allMessages.forEach(msg => {
        if (msg.read) {
          // 已读的消息（即时消息或定时消息）
          historyMessages.push(msg);
        } else {
          // 未读的消息（即时消息或定时消息）
          immediateMessages.push(msg);
        }
      });
      // 按时间倒序排序
      immediateMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      historyMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      updateImmediateMessagesList();
      updateHistoryMessagesList();
      console.log('历史消息已加载:', immediateMessages.length, '条未读消息,', historyMessages.length, '条历史消息');
      break;

    case 'SCHEDULED':
      scheduleCard.style.display = 'none';
      break;

    case 'SCHEDULED_MESSAGES_LIST':
      allScheduledMessages = payload.messages || [];
      updateScheduledMessagesList();
      console.log('定时消息列表已更新:', allScheduledMessages.length);
      break;

    case 'SCHEDULED_UPDATED':
      console.log('定时消息已更新');
      break;

    case 'SCHEDULED_DELETED':
      console.log('定时消息已删除');
      break;

    case 'ERROR':
      console.error('服务端错误:', payload.message);
      showToast(payload.message, 'error');
      break;

    default:
      console.log('未知消息类型:', type);
  }
}

// 订阅主题
subscribeBtn.addEventListener('click', () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    showToast('请输入主题名称', 'warning');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('请先连接服务器', 'error');
    return;
  }

  ws.send(JSON.stringify({
    type: 'SUBSCRIBE',
    payload: { topic }
  }));

  topicInput.value = '';
});

// 更新订阅列表
function updateSubscriptionsList() {
  subscriptionsList.innerHTML = subscriptions.map(topic => `
    <span class="subscription-tag">
      ${topic}
      <span class="remove-btn" onclick="unsubscribe('${topic}')">×</span>
    </span>
  `).join('');
}

// 取消订阅
window.unsubscribe = (topic) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify({
    type: 'UNSUBSCRIBE',
    payload: { topic }
  }));
};

// 更新发布主题下拉框
function updatePublishTopics() {
  publishTopicSelect.innerHTML = subscriptions.length === 0
    ? '<option value="">请先订阅主题</option>'
    : subscriptions.map(topic => `<option value="${topic}">${topic}</option>`).join('');
}

// 发布消息
publishBtn.addEventListener('click', () => {
  const topic = publishTopicSelect.value;
  const content = messageContent.value.trim();

  if (!topic) {
    showToast('请先订阅主题', 'warning');
    return;
  }

  if (!content) {
    showToast('请输入消息内容', 'warning');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('请先连接服务器', 'error');
    return;
  }

  ws.send(JSON.stringify({
    type: 'PUBLISH',
    payload: { topic, content, sender: userId }
  }));

  messageContent.value = '';
});

// 显示定时设置
scheduleBtn.addEventListener('click', () => {
  const topic = publishTopicSelect.value;
  const content = messageContent.value.trim();

  if (!topic) {
    showToast('请先订阅主题', 'warning');
    return;
  }

  if (!content) {
    showToast('请输入消息内容', 'warning');
    return;
  }

  // 设置默认时间为当前时间
  const scheduledTime = new Date();
  const dateInput = document.getElementById('scheduleDate');
  const timeInput = document.getElementById('scheduleTime');

  if (!dateInput || !timeInput) {
    console.error('定时输入框未找到');
    return;
  }

  // 设置默认时间为当前时间加上10分钟
  scheduledTime.setMinutes(scheduledTime.getMinutes() + 10);

  // 格式化日期为 YYYY-MM-DD
  const dateStr = scheduledTime.toISOString().split('T')[0];
  dateInput.value = dateStr;

  // 格式化时间为 HH:MM
  const hours = String(scheduledTime.getHours()).padStart(2, '0');
  const minutes = String(scheduledTime.getMinutes()).padStart(2, '0');
  timeInput.value = `${hours}:${minutes}`;

  scheduleCard.style.display = 'block';
});

// 确认定时
confirmScheduleBtn.addEventListener('click', () => {
  const topic = publishTopicSelect.value;
  const content = messageContent.value.trim();
  const scheduleDate = document.getElementById('scheduleDate').value;
  const scheduleTime = document.getElementById('scheduleTime').value;

  if (!scheduleDate) {
    showToast('请选择日期', 'warning');
    return;
  }

  if (!scheduleTime) {
    showToast('请选择时间', 'warning');
    return;
  }

  if (!topic) {
    showToast('请先订阅主题', 'warning');
    return;
  }

  if (!content) {
    showToast('请输入消息内容', 'warning');
    return;
  }

  // 组合日期和时间
  const scheduledTime = `${scheduleDate} ${scheduleTime}`;
  const scheduledTimestamp = new Date(scheduledTime).getTime();

  if (isNaN(scheduledTimestamp)) {
    showToast('无效的日期时间', 'error');
    return;
  }

  // 检查是否为过去时间
  if (scheduledTimestamp < Date.now()) {
    showToast('不能设置过去的时间', 'error');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('请先连接服务器', 'error');
    return;
  }

  // 根据是否处于编辑模式，发送不同的请求
  if (editingMessageId) {
    // 编辑模式：更新现有消息
    ws.send(JSON.stringify({
      type: 'UPDATE_SCHEDULED_MESSAGE',
      payload: {
        id: editingMessageId,
        topic,
        content,
        scheduledTime: scheduledTimestamp,
        userId
      }
    }));
    showToast('定时消息更新成功', 'success');
  } else {
    // 创建模式：新建消息
    ws.send(JSON.stringify({
      type: 'SCHEDULE',
      payload: {
        id: `${userId}_${Date.now()}`,
        topic,
        content,
        sender: userId,
        scheduledTime: scheduledTimestamp
      }
    }));
    showToast('定时消息设置成功', 'success');
  }

  scheduleCard.style.display = 'none';
  messageContent.value = '';

  // 恢复发布消息按钮显示
  publishBtn.style.display = 'inline-block';
  scheduleBtn.style.display = 'inline-block';
  editingMessageId = null;
});

// 取消定时
cancelScheduleBtn.addEventListener('click', () => {
  scheduleCard.style.display = 'none';
  messageContent.value = '';

  // 恢复发布消息按钮显示
  publishBtn.style.display = 'inline-block';
  scheduleBtn.style.display = 'inline-block';
  editingMessageId = null; // 清除编辑状态
});

// 更新即时消息列表
function updateImmediateMessagesList() {
  if (immediateMessages.length === 0) {
    immediateMessagesContainer.innerHTML = '<div class="empty-state">暂无未读消息</div>';
    return;
  }

  immediateMessagesContainer.innerHTML = immediateMessages.map(msg => `
    <div class="message-item ${msg.scheduled ? 'scheduled' : ''} ${msg.read ? 'read' : 'unread'}" data-message-id="${msg.id}">
      <div class="message-header">
        <div>
          <span class="message-topic">${msg.topic}</span>
          ${msg.scheduled ? '<span class="message-scheduled-badge">定时消息</span>' : ''}
        </div>
        <div>
          <span class="message-sender">${msg.sender}</span>
          <span class="message-ip" title="${msg.senderIP || 'Unknown'}">${msg.senderIP === 'Unknown' ? 'Local' : msg.senderIP}</span>
          <span class="message-time">${new Date(msg.timestamp).toLocaleString('zh-CN')}</span>
        </div>
      </div>
      <div class="message-content">${msg.content}</div>
      ${!msg.read ? `<button class="close-notification-btn" data-message-id="${msg.id}" title="关闭通知">关闭通知</button>` : ''}
    </div>
  `).join('');

  // 为关闭通知按钮添加点击事件
  immediateMessagesContainer.onclick = (event) => {
    if (event.target.classList.contains('close-notification-btn')) {
      event.stopPropagation();
      const messageId = event.target.getAttribute('data-message-id');
      closeImmediateNotification(messageId);
    }
  };
}

// 更新历史消息列表
function updateHistoryMessagesList() {
  if (historyMessages.length === 0) {
    historyMessagesContainer.innerHTML = '<div class="empty-state">暂无已读消息</div>';
    return;
  }

  historyMessagesContainer.innerHTML = historyMessages.map(msg => `
    <div class="message-item ${msg.scheduled ? 'scheduled' : ''} read" data-message-id="${msg.id}">
      <div class="message-header">
        <div>
          <span class="message-topic">${msg.topic}</span>
          ${msg.scheduled ? '<span class="message-scheduled-badge">定时消息</span>' : ''}
        </div>
        <div>
          <span class="message-sender">${msg.sender}</span>
          <span class="message-ip" title="${msg.senderIP || 'Unknown'}">${msg.senderIP === 'Unknown' ? 'Local' : msg.senderIP}</span>
          <span class="message-time">${new Date(msg.timestamp).toLocaleString('zh-CN')}</span>
        </div>
      </div>
      <div class="message-content">${msg.content}</div>
    </div>
  `).join('');
}

// 定期检查通知状态
let notificationCheckInterval = null;
let checkCount = 0;

function startNotificationCheck() {
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
  }

  console.log('Starting notification check interval');
  checkCount = 0;

  // 每500ms检查一次未读消息的通知是否还存在
  notificationCheckInterval = setInterval(() => {
    checkCount++;
    if (checkCount % 10 === 0) {
      console.log(`Notification check running, count: ${checkCount}, active notifications:`, immediateMessages.filter(m => !m.read).length);
    }

    let updated = false;

    immediateMessages.forEach(msg => {
      if (!msg.read) {
        // 检查此消息的通知是否还在活跃列表中
        const notificationExists = checkNotificationActive(msg.id);

        if (!notificationExists) {
          // 通知已关闭，标记消息为已读
          msg.read = true;
          // 移到历史消息
          historyMessages.unshift(msg);
          immediateMessages = immediateMessages.filter(m => m.id !== msg.id);
          updated = true;
          console.log('Auto-marking message as read, messageId:', msg.id);
        }
      }
    });

    if (updated) {
      updateImmediateMessagesList();
      updateHistoryMessagesList();
    }
  }, 500);
}

function stopNotificationCheck() {
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
    console.log('Stopped notification check interval, total checks:', checkCount);
  }
}

// 检查通知是否活跃
function checkNotificationActive(messageId) {
  const result = ipcRenderer.sendSync('check-notification', { messageId });
  return result;
}

// 关闭即时消息通知
function closeImmediateNotification(messageId) {
  const numericId = parseInt(messageId);

  const message = immediateMessages.find(msg => msg.id === numericId);
  if (message && !message.read) {
    message.read = true;
    console.log('Message marked as read, messageId:', numericId);
    // 移到历史消息
    historyMessages.unshift(message);
    immediateMessages = immediateMessages.filter(m => m.id !== numericId);
    updateImmediateMessagesList();
    updateHistoryMessagesList();
  }

  // Send close notification request to main process
  ipcRenderer.send('notification-read', { messageId: numericId });
  console.log('Closing notification via IPC, messageId:', numericId);
}

// 更新可用主题列表
function updateAvailableTopics() {
  const topicInput = document.getElementById('topicInput');
  const datalist = document.getElementById('availableTopicsList');
  
  if (!datalist) {
    const list = document.createElement('datalist');
    list.id = 'availableTopicsList';
    document.body.appendChild(list);
  }
  
  const list = document.getElementById('availableTopicsList');
  list.innerHTML = availableTopics.map(topic => `<option value="${topic}">`).join('');
  
  if (topicInput) {
    topicInput.setAttribute('list', 'availableTopicsList');
  }
}

// 显示系统通知
function showNotification(message) {
  ipcRenderer.send('show-notification', {
    title: `[${message.topic}] 新消息`,
    body: message.content,
    messageId: message.id
  });
}

// 保存配置
function saveConfig() {
  const config = {
    serverUrl: serverUrlInput.value,
    username: usernameInput.value,
    password: passwordInput.value,
    autoSubscribeTopics: subscriptions // 保存当前订阅的主题
  };
  ipcRenderer.send('save-config', config);
  console.log('Config saved:', config);
}

// 加载配置
ipcRenderer.on('config-response', (_, config) => {
  if (config.serverUrl) {
    serverUrlInput.value = config.serverUrl;
  }
  if (config.username) {
    usernameInput.value = config.username;
  }
  if (config.password) {
    passwordInput.value = config.password;
  }
  if (config.autoSubscribeTopics && Array.isArray(config.autoSubscribeTopics)) {
    // 保存自动订阅的主题列表，连接成功后会自动订阅
    window.autoSubscribeTopics = config.autoSubscribeTopics;
    console.log('Auto-subscribe topics loaded:', window.autoSubscribeTopics);
  }

  // 如果配置中有用户名，自动连接服务器
  if (config.username && config.serverUrl) {
    console.log('Auto-connecting to server...');
    setTimeout(() => {
      const password = config.password || passwordInput.value;
      connectToServer(config.serverUrl, config.username, password);
    }, 500); // 延迟500ms确保配置已加载
  }
});

// 监听系统通知关闭事件
ipcRenderer.on('notification-closed', (_, { messageId }) => {
  console.log('Renderer received notification-closed event, messageId:', messageId);

  // 从未读消息中查找
  const message = immediateMessages.find(msg => msg.id === messageId);
  if (message) {
    console.log('Found message:', message.id, 'Current read status:', message.read);

    if (!message.read) {
      message.read = true;
      // 移到历史消息
      historyMessages.unshift(message);
      immediateMessages = immediateMessages.filter(m => m.id !== messageId);
      updateImmediateMessagesList();
      updateHistoryMessagesList();
      console.log('Message marked as read');
    } else {
      console.log('Message already marked as read');
    }
  } else {
    console.log('Message not found for messageId:', messageId);
  }
});

// 页面加载时获取配置
window.addEventListener('load', () => {
  ipcRenderer.send('get-config');
  initTabs(); // 初始化标签页切换
  updateAvailableTopics();
  updateScheduledMessagesList();
  updateImmediateMessagesList();
  updateHistoryMessagesList();
  // 开始定期检查通知状态
  startNotificationCheck();
});

// Save config on window close
window.addEventListener('beforeunload', () => {
  saveConfig();
  stopNotificationCheck();
});

// 更新定时消息列表
function updateScheduledMessagesList() {
  if (allScheduledMessages.length === 0) {
    scheduledMessagesContainer.innerHTML = '<div class="empty-state">暂无待办消息</div>';
    return;
  }

  // 按发送时间排序
  allScheduledMessages.sort((a, b) => a.scheduledTime - b.scheduledTime);

  scheduledMessagesContainer.innerHTML = allScheduledMessages.map(msg => {
    const scheduledDate = new Date(msg.scheduledTime).toLocaleString('zh-CN');
    const isOwner = msg.sender === userId;
    return `
      <div class="scheduled-message-item" data-message-id="${msg.id}">
        <div class="scheduled-message-header">
          <span class="scheduled-message-topic">${msg.topic}</span>
          <span class="scheduled-message-time">${scheduledDate}</span>
        </div>
        <div class="scheduled-message-content">${msg.content}</div>
        <div class="scheduled-message-footer">
          <span class="scheduled-message-sender">发送者: ${msg.sender}</span>
          ${isOwner ? `
            <div class="scheduled-message-actions">
              <button class="btn-edit" onclick="editScheduledMessage('${msg.id}')">编辑</button>
              <button class="btn-delete" onclick="deleteScheduledMessage('${msg.id}')">删除</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 编辑定时消息
window.editScheduledMessage = (id) => {
  const msg = allScheduledMessages.find(m => m.id === id);
  if (!msg) return;

  // 设置编辑模式
  editingMessageId = id;

  // 隐藏发布消息按钮
  publishBtn.style.display = 'none';
  scheduleBtn.style.display = 'none';

  // 填充消息内容到输入框
  publishTopicSelect.value = msg.topic;
  messageContent.value = msg.content;

  // 填充时间到定时设置
  const date = new Date(msg.scheduledTime);
  const dateInput = document.getElementById('scheduleDate');
  const timeInput = document.getElementById('scheduleTime');

  // 格式化日期为 YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0];
  dateInput.value = dateStr;

  // 格式化时间为 HH:MM
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  timeInput.value = `${hours}:${minutes}`;

  // 显示定时设置卡片
  scheduleCard.style.display = 'block';
};

// 删除定时消息
window.deleteScheduledMessage = (id) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('请先连接服务器', 'error');
    return;
  }

  ws.send(JSON.stringify({
    type: 'DELETE_SCHEDULED_MESSAGE',
    payload: { id, userId }
  }));
  showToast('定时消息删除成功', 'success');
};


