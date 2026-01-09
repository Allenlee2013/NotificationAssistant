const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// 读取配置文件
let config = {
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  log: {
    enable: true,
    dir: './logs',
    maxFiles: 30 // 保留最近30天的日志
  },
  storage: {
    enable: true,
    dir: './data',
    autoSaveInterval: 5 // 自动保存间隔（分钟）
  },
  users: [] // 用户列表 [{username, password}]
};

try {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    const loadedConfig = JSON.parse(configData);
    // 合并配置，保留默认值
    config = { ...config, ...loadedConfig };
    console.log('配置文件加载成功:', config);
  } else {
    console.log('配置文件不存在，使用默认配置');
  }
} catch (error) {
  console.error('配置文件加载失败，使用默认配置:', error.message);
}

const PORT = config.server.port;
const HOST = config.server.host;

// 日志系统
const logsDir = path.join(__dirname, '../logs');
const logFile = path.join(logsDir, `server-${new Date().toISOString().split('T')[0]}.log`);

// 创建日志目录
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 清理旧日志文件
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const serverLogs = files.filter(f => f.startsWith('server-') && f.endsWith('.log'));

    if (serverLogs.length > config.log.maxFiles) {
      // 按修改时间排序，删除最旧的日志
      const filesWithTime = serverLogs.map(f => {
        const filePath = path.join(logsDir, f);
        const stats = fs.statSync(filePath);
        return { file: f, path: filePath, mtime: stats.mtime };
      }).sort((a, b) => a.mtime - b.mtime);

      const filesToDelete = filesWithTime.slice(0, filesWithTime.length - config.log.maxFiles);
      filesToDelete.forEach(item => {
        fs.unlinkSync(item.path);
        console.log(`删除旧日志文件: ${item.file}`);
      });
    }
  } catch (error) {
    console.error('清理旧日志失败:', error.message);
  }
}

// 格式化日志消息
function formatLogMessage(type, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type,
    message,
    data
  };
  const logLine = JSON.stringify(logEntry) + '\n';
  return logLine;
}

// 写入日志
function writeLog(type, message, data = null) {
  if (!config.log.enable) return;

  try {
    const logLine = formatLogMessage(type, message, data);
    fs.appendFileSync(logFile, logLine, 'utf8');
    // 同时输出到控制台
    console.log(`[${type}] ${message}`);
  } catch (error) {
    console.error('写入日志失败:', error.message);
  }
}

// 初始化时清理旧日志
cleanOldLogs();

// 消息持久化
const dataDir = path.join(__dirname, '../data');
const messagesFile = path.join(dataDir, 'messages.json');
const scheduledMessagesFile = path.join(dataDir, 'scheduled-messages.json');

// 创建数据目录
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 保存消息到文件
function saveMessages() {
  if (!config.storage.enable) return;

  try {
    const data = {
      messages: messages,
      topics: Array.from(topics),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(messagesFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[${new Date().toLocaleString('zh-CN')}] 消息已保存: ${messages.length} 条消息, ${topics.size} 个主题`);
  } catch (error) {
    console.error('保存消息失败:', error.message);
  }
}

// 加载消息从文件
function loadMessages() {
  if (!config.storage.enable) return;

  try {
    if (fs.existsSync(messagesFile)) {
      const data = fs.readFileSync(messagesFile, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.messages && Array.isArray(parsed.messages)) {
        messages.push(...parsed.messages);
        console.log(`加载消息: ${parsed.messages.length} 条`);
      }

      if (parsed.topics && Array.isArray(parsed.topics)) {
        parsed.topics.forEach(topic => topics.add(topic));
        console.log(`加载主题: ${parsed.topics.length} 个`);
      }

      console.log(`[${new Date().toLocaleString('zh-CN')}] 数据加载完成`);
    }
  } catch (error) {
    console.error('加载消息失败:', error.message);
  }
}

// 保存定时消息到文件
function saveScheduledMessages() {
  if (!config.storage.enable) return;

  try {
    const data = {
      scheduledMessages: Array.from(scheduledMessages.values()),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(scheduledMessagesFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[${new Date().toLocaleString('zh-CN')}] 定时消息已保存: ${scheduledMessages.size} 条`);
  } catch (error) {
    console.error('保存定时消息失败:', error.message);
  }
}

// 加载定时消息从文件
function loadScheduledMessages() {
  if (!config.storage.enable) return;

  try {
    if (fs.existsSync(scheduledMessagesFile)) {
      const data = fs.readFileSync(scheduledMessagesFile, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.scheduledMessages && Array.isArray(parsed.scheduledMessages)) {
        const now = Date.now();
        parsed.scheduledMessages.forEach(msg => {
          // 只加载未过期的消息
          if (msg.scheduledTime > now) {
            scheduledMessages.set(msg.id, msg);

            // 恢复定时任务
            const delay = msg.scheduledTime - now;
            const task = setTimeout(() => {
              publishScheduledMessage(msg.topic, msg.content, msg.sender, msg.clientIP);
              scheduledTasks.delete(msg.id);
              scheduledMessages.delete(msg.id);
              console.log(`恢复的定时消息已发送: ${msg.id}`);
            }, delay);

            scheduledTasks.set(msg.id, task);
          }
        });

        console.log(`加载定时消息: ${scheduledMessages.size} 条（已恢复定时任务）`);
      }

      console.log(`[${new Date().toLocaleString('zh-CN')}] 定时消息加载完成`);
    }
  } catch (error) {
    console.error('加载定时消息失败:', error.message);
  }
}

// 保存所有数据
function saveAllData() {
  saveMessages();
  saveScheduledMessages();
}

// 定时保存任务
let autoSaveTimer = null;

function startAutoSave() {
  if (!config.storage.enable || !config.storage.autoSaveInterval) return;

  const intervalMs = config.storage.autoSaveInterval * 60 * 1000; // 转换为毫秒

  autoSaveTimer = setInterval(() => {
    saveAllData();
    writeLog('AUTO_SAVE', `自动保存数据`, {
      messagesCount: messages.length,
      scheduledCount: scheduledMessages.size
    });
  }, intervalMs);

  console.log(`自动保存已启用，每 ${config.storage.autoSaveInterval} 分钟保存一次`);
}

// 数据存储
const clients = new Map(); // Map<ws, {userId, subscriptions}>
const messages = []; // 存储消息历史
const topics = new Set(); // 存储所有主题
const scheduledMessages = new Map(); // 存储定时消息 Map<id, {id, topic, content, sender, scheduledTime, clientIP}>
const scheduledTasks = new Map(); // 存储定时任务 Map<id, task>

// 获取客户端IP地址
function getClientIP(ws) {
  // 方法1: 从WebSocket连接获取
  if (ws._socket) {
    const remoteAddress = ws._socket.remoteAddress;
    if (remoteAddress) {
      return formatIP(remoteAddress);
    }
  }

  // 方法2: 从upgradeReq获取
  const req = ws.upgradeReq;
  if (req) {
    // 检查代理头
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return formatIP(forwarded.split(',')[0].trim());
    }

    const xRealIP = req.headers['x-real-ip'];
    if (xRealIP) {
      return formatIP(xRealIP);
    }

    // 获取socket的remoteAddress
    const socket = req.socket;
    if (socket) {
      const ip = socket.remoteAddress || socket._socket?.remoteAddress;
      if (ip) {
        return formatIP(ip);
      }
    }

    // 获取connection的remoteAddress
    const connection = req.connection;
    if (connection) {
      const ip = connection.remoteAddress || connection.socket?.remoteAddress;
      if (ip) {
        return formatIP(ip);
      }
    }
  }

  // 方法3: 尝试从连接对象获取
  if (ws.readyState === ws.OPEN) {
    try {
      const socket = ws._socket || ws.socket;
      if (socket && socket.remoteAddress) {
        return formatIP(socket.remoteAddress);
      }
    } catch (error) {
      // 忽略错误
    }
  }

  return 'Unknown';
}

// 格式化IP地址（将IPv6转换为IPv4格式）
function formatIP(ip) {
  if (!ip) return 'Unknown';

  // 处理IPv6格式 (::1, ::ffff:127.0.0.1, etc.)
  if (ip.includes(':') && ip.includes('.')) {
    // IPv6映射的IPv4地址 (例如: ::ffff:127.0.0.1)
    const ipv4 = ip.split(':').pop();
    return ipv4;
  } else if (ip === '::1' || ip === '::') {
    // IPv6本地回环地址
    return '127.0.0.1';
  }

  return ip;
}

// 处理消息
function handleMessage(ws, data, clientIP) {
  const { type, payload } = data;

  switch (type) {
    case 'LOGIN':
      handleLogin(ws, payload, clientIP);
      break;
    case 'SUBSCRIBE':
      handleSubscribe(ws, payload);
      break;
    case 'UNSUBSCRIBE':
      handleUnsubscribe(ws, payload);
      break;
    case 'PUBLISH':
      handlePublish(ws, payload, clientIP);
      break;
    case 'SCHEDULE':
      handleSchedule(ws, payload, clientIP);
      break;
    case 'GET_SCHEDULED_MESSAGES':
      handleGetScheduledMessages(ws, payload);
      break;
    case 'UPDATE_SCHEDULED_MESSAGE':
      handleUpdateScheduledMessage(ws, payload);
      break;
    case 'DELETE_SCHEDULED_MESSAGE':
      handleDeleteScheduledMessage(ws, payload);
      break;
    case 'GET_HISTORY_MESSAGES':
      handleGetHistoryMessages(ws, payload);
      break;
    default:
      console.log('未知消息类型:', type);
  }
}

// 登录客户端
function handleLogin(ws, payload, clientIP) {
  const { userId, password } = payload;

  // 验证用户名和密码
  const user = config.users.find(u => u.username === userId && u.password === password);
  if (!user) {
    writeLog('AUTH_FAIL', `用户认证失败`, { userId, ip: clientIP });
    ws.send(JSON.stringify({
      type: 'AUTH_ERROR',
      payload: { message: '用户名或密码错误' }
    }));
    ws.close();
    return;
  }

  clients.set(ws, {
    userId,
    subscriptions: [],
    ip: clientIP
  });
  writeLog('LOGIN', `用户登录`, { userId, ip: clientIP });

  // 发送当前所有主题
  ws.send(JSON.stringify({
    type: 'LOGGED_IN',
    payload: {
      userId,
      topics: Array.from(topics)
    }
  }));
}

// 订阅主题
function handleSubscribe(ws, payload) {
  const client = clients.get(ws);
  if (!client) return;

  const { topic } = payload;

  // 添加到主题集合
  topics.add(topic);

  if (!client.subscriptions.includes(topic)) {
    client.subscriptions.push(topic);
  }
  writeLog('SUBSCRIBE', `订阅主题`, { userId: client.userId, topic });

  // 广播新主题给所有在线客户端
  broadcastTopics();

  ws.send(JSON.stringify({
    type: 'SUBSCRIBED',
    payload: { topic }
  }));
}

// 取消订阅
function handleUnsubscribe(ws, payload) {
  const client = clients.get(ws);
  if (!client) return;

  const { topic } = payload;
  client.subscriptions = client.subscriptions.filter(t => t !== topic);
  writeLog('UNSUBSCRIBE', `取消订阅主题`, { userId: client.userId, topic });

  ws.send(JSON.stringify({
    type: 'UNSUBSCRIBED',
    payload: { topic }
  }));
}

// 发布消息
function handlePublish(ws, payload, clientIP) {
  const { topic, content, sender } = payload;
  const message = {
    id: Date.now(),
    topic,
    content,
    sender,
    senderIP: clientIP,
    timestamp: new Date().toISOString()
  };

  messages.push(message);

  // 广播给订阅该主题的所有客户端
  clients.forEach((client, clientWs) => {
    if (client.subscriptions.includes(topic)) {
      clientWs.send(JSON.stringify({
        type: 'MESSAGE',
        payload: message
      }));
    }
  });

  writeLog('PUBLISH', `发布消息`, {
    topic,
    content,
    sender,
    ip: clientIP,
    messageId: message.id
  });
}

// 定时消息
function handleSchedule(ws, payload, clientIP) {
  const { topic, content, sender, scheduledTime, id } = payload;

  // 如果已存在相同ID的任务，先清除
  if (scheduledTasks.has(id)) {
    clearTimeout(scheduledTasks.get(id));
    scheduledMessages.delete(id);
  }

  // 存储定时消息信息
  scheduledMessages.set(id, {
    id,
    topic,
    content,
    sender,
    scheduledTime,
    clientIP
  });

  // 计算延迟时间（毫秒）
  const now = Date.now();
  const delay = scheduledTime - now;

  if (delay <= 0) {
    // 时间已过，立即发送
    writeLog('SCHEDULE', `定时消息立即发送（时间已过）`, {
      topic,
      content,
      sender,
      ip: clientIP,
      messageId: id
    });
    publishScheduledMessage(topic, content, sender, clientIP);
    scheduledMessages.delete(id);
  } else {
    // 设置定时任务
    const task = setTimeout(() => {
      publishScheduledMessage(topic, content, sender, clientIP);
      scheduledTasks.delete(id);
      scheduledMessages.delete(id);
      console.log(`定时消息已发送并清除: ${id}`);
    }, delay);

    scheduledTasks.set(id, task);
    const scheduledDate = new Date(scheduledTime).toLocaleString('zh-CN');
    writeLog('SCHEDULE', `设置定时任务`, {
      topic,
      content,
      sender,
      ip: clientIP,
      messageId: id,
      scheduledTime: scheduledDate
    });
  }

  ws.send(JSON.stringify({
    type: 'SCHEDULED',
    payload: { id, scheduledTime }
  }));

  // 广播给所有客户端更新定时消息列表
  broadcastScheduledMessagesUpdate();
}

// 发布定时消息
function publishScheduledMessage(topic, content, sender, clientIP) {
  const message = {
    id: Date.now(),
    topic,
    content,
    sender,
    senderIP: clientIP,
    timestamp: new Date().toISOString(),
    scheduled: true
  };

  clients.forEach((client, clientWs) => {
    if (client.subscriptions.includes(topic)) {
      clientWs.send(JSON.stringify({
        type: 'MESSAGE',
        payload: message
      }));
    }
  });

  writeLog('SCHEDULED_TRIGGER', `定时消息触发`, {
    topic,
    content,
    sender,
    ip: clientIP,
    messageId: message.id
  });

  // 广播定时消息列表更新（移除已触发的消息）
  broadcastScheduledMessagesUpdate();
}

// 获取所有定时消息
function handleGetScheduledMessages(ws, payload) {
  const { userId } = payload;
  const client = clients.get(ws);

  // 验证用户身份
  if (client && client.userId === userId) {
    // 获取所有未到时的定时消息
    const allScheduledMessages = [];
    scheduledMessages.forEach((msg) => {
      // 只返回未到时的消息
      if (msg.scheduledTime > Date.now()) {
        allScheduledMessages.push(msg);
      }
    });

    ws.send(JSON.stringify({
      type: 'SCHEDULED_MESSAGES_LIST',
      payload: { messages: allScheduledMessages }
    }));

    console.log(`用户 ${userId} 请求定时消息列表，返回 ${allScheduledMessages.length} 条`);
  }
}

// 更新定时消息
function handleUpdateScheduledMessage(ws, payload) {
  const { id, topic, content, scheduledTime, userId } = payload;
  const client = clients.get(ws);
  const scheduledMessage = scheduledMessages.get(id);

  // 验证：消息存在且属于当前用户
  if (scheduledMessage && client && client.userId === userId && scheduledMessage.sender === userId) {
    // 清除旧的任务
    if (scheduledTasks.has(id)) {
      clearTimeout(scheduledTasks.get(id));
      scheduledTasks.delete(id);
    }

    // 更新定时消息信息
    scheduledMessages.set(id, {
      id,
      topic,
      content,
      sender: userId,
      scheduledTime,
      clientIP: scheduledMessage.clientIP
    });

    // 计算新的延迟时间
    const now = Date.now();
    const delay = scheduledTime - now;

    if (delay <= 0) {
      // 时间已过，立即发送
      writeLog('UPDATE_SCHEDULE', `更新后定时时间已过，立即发送`, {
        topic,
        content,
        userId,
        messageId: id
      });
      publishScheduledMessage(topic, content, userId, scheduledMessage.clientIP);
      scheduledMessages.delete(id);
    } else {
      // 设置新的定时任务
      const task = setTimeout(() => {
        publishScheduledMessage(topic, content, userId, scheduledMessage.clientIP);
        scheduledTasks.delete(id);
        scheduledMessages.delete(id);
        console.log(`更新的定时消息已发送: ${id}`);
      }, delay);

      scheduledTasks.set(id, task);
      const scheduledDate = new Date(scheduledTime).toLocaleString('zh-CN');
      writeLog('UPDATE_SCHEDULE', `更新定时任务`, {
        topic,
        content,
        userId,
        messageId: id,
        scheduledTime: scheduledDate
      });
    }

    ws.send(JSON.stringify({
      type: 'SCHEDULED_UPDATED',
      payload: { id, scheduledTime }
    }));

    // 广播给所有客户端更新定时消息列表
    broadcastScheduledMessagesUpdate();
  } else {
    writeLog('ERROR', `更新定时消息失败（权限或不存在）`, { userId, messageId: id });
    ws.send(JSON.stringify({
      type: 'ERROR',
      payload: { message: '无权修改此定时消息或消息不存在' }
    }));
  }
}

// 删除定时消息
function handleDeleteScheduledMessage(ws, payload) {
  const { id, userId } = payload;
  const client = clients.get(ws);
  const scheduledMessage = scheduledMessages.get(id);

  // 验证：消息存在且属于当前用户
  if (scheduledMessage && client && client.userId === userId && scheduledMessage.sender === userId) {
    // 清除定时任务
    if (scheduledTasks.has(id)) {
      clearTimeout(scheduledTasks.get(id));
      scheduledTasks.delete(id);
    }

    // 删除定时消息
    scheduledMessages.delete(id);

    writeLog('DELETE_SCHEDULE', `删除定时消息`, { userId, messageId: id });

    ws.send(JSON.stringify({
      type: 'SCHEDULED_DELETED',
      payload: { id }
    }));

    // 广播给所有客户端更新定时消息列表
    broadcastScheduledMessagesUpdate();
  } else {
    writeLog('ERROR', `删除定时消息失败（权限或不存在）`, { userId, messageId: id });
    ws.send(JSON.stringify({
      type: 'ERROR',
      payload: { message: '无权删除此定时消息或消息不存在' }
    }));
  }
}

// 获取历史消息
function handleGetHistoryMessages(ws, payload) {
  const { userId } = payload;
  const client = clients.get(ws);

  // 计算一周前的时间
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // 筛选一周内的所有消息
  const historyMessages = messages.filter(msg => {
    const msgTime = new Date(msg.timestamp).getTime();
    return msgTime >= oneWeekAgo;
  });

  // 按时间倒序排序
  historyMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  ws.send(JSON.stringify({
    type: 'HISTORY_MESSAGES_LIST',
    payload: { messages: historyMessages }
  }));

  console.log(`用户 ${userId} 请求历史消息，返回 ${historyMessages.length} 条`);
}

// REST API 获取消息历史
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

// REST API 获取所有主题
app.get('/api/topics', (req, res) => {
  res.json(Array.from(topics));
});

// 广播主题列表给所有客户端
function broadcastTopics() {
  const topicList = Array.from(topics);
  clients.forEach((client, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'TOPICS_UPDATE',
        payload: { topics: topicList }
      }));
    }
  });
}

// 广播定时消息更新给所有客户端
function broadcastScheduledMessagesUpdate() {
  // 获取所有未到时的定时消息
  const allScheduledMessages = [];
  scheduledMessages.forEach((msg) => {
    if (msg.scheduledTime > Date.now()) {
      allScheduledMessages.push(msg);
    }
  });

  clients.forEach((client, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'SCHEDULED_MESSAGES_LIST',
        payload: { messages: allScheduledMessages }
      }));
    }
  });

  writeLog('BROADCAST_SCHEDULE', `广播定时消息列表更新`, { count: allScheduledMessages.length });
}

// 优雅关闭处理
function gracefulShutdown() {
  console.log('\n正在关闭服务器...');

  // 清除定时保存任务
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }

  // 取消所有定时任务
  scheduledTasks.forEach((task, id) => {
    clearTimeout(task);
    console.log(`取消定时任务: ${id}`);
  });

  // 保存所有数据
  saveAllData();
  writeLog('SHUTDOWN', `服务器关闭，保存数据`, {
    messagesCount: messages.length,
    scheduledCount: scheduledMessages.size
  });

  console.log('数据保存完成，服务器已关闭');
  process.exit(0);
}

// 注册关闭事件
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('exit', () => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }
});

// 加载持久化数据
loadMessages();
loadScheduledMessages();

// 启动自动保存
startAutoSave();

// 先启动 Express 服务器
const httpServer = app.listen(PORT, HOST, () => {
  console.log(`✓ Express服务器运行在 http://${HOST}:${PORT}`);
  console.log(`✓ 监听所有网络接口，可通过以下地址访问:`);
  console.log(`  - http://localhost:${PORT}`);
  console.log(`  - http://127.0.0.1:${PORT}`);
  console.log(`  - http://<局域网IP>:${PORT}`);
});

// Express 启动后启动 WebSocket 服务器
const wss = new WebSocket.Server({ server: httpServer, path: '/' });

wss.on('listening', () => {
  console.log(`✓ WebSocket服务器已启动，监听端口 ${PORT}`);
  console.log(`✓ WebSocket地址: ws://localhost:${PORT}`);
  console.log(`✓ WebSocket地址: ws://0.0.0.0:${PORT}`);
  console.log(`✓ WebSocket地址: ws://<局域网IP>:${PORT}`);
});

wss.on('error', (error) => {
  console.error('✗ WebSocket服务器错误:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`✗ 端口 ${PORT} 已被占用`);
  }
});

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress || 'Unknown';
  writeLog('CONNECTION', `新客户端连接`, { ip: clientIP });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const ip = getClientIP(ws);
      handleMessage(ws, data, ip);
    } catch (error) {
      console.error('✗ 消息解析错误:', error);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      writeLog('DISCONNECTION', `客户端断开连接`, { userId: client.userId, ip: client.ip });
      clients.delete(ws);
    }
  });

  ws.on('error', (error) => {
    writeLog('ERROR', `WebSocket连接错误`, { error: error.message });
    console.error('✗ WebSocket连接错误:', error);
  });
});

// 获取本机IP地址
function getLocalIPs() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.keys(interfaces).forEach(devName => {
    interfaces[devName].forEach(iface => {
      // 跳过内部IP和非IPv4地址
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    });
  });

  return ips;
}

// 打印本机可用IP
const localIPs = getLocalIPs();
if (localIPs.length > 0) {
  console.log('✓ 本机可用IP地址:');
  localIPs.forEach(ip => {
    console.log(`  - ${ip}`);
  });
}
