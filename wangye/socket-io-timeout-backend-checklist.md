# Socket.IO 连接超时问题 — 完整排查报告

## 问题现象

```
[ERROR][app] Socket.IO 连接错误: timeout
[ERROR][chat] 用户端WebSocket连接失败: Error: timeout
```

前端 Socket.IO 客户端（weapp.socket.io）尝试连接 `https://omqktqrtntnn.sealosbja.site`，
在握手阶段超时（20秒），未能建立 WebSocket 连接。

---

## 根本原因（已定位）

### `miniprogram_npm/weapp.socket.io/index.js` 是一个损坏的构建产物

经过对库源码的逐行分析，确认问题出在前端使用的 `weapp.socket.io` 库本身：

**该文件是一个标准浏览器版 Socket.IO 客户端，不包含微信小程序 WebSocket 适配器。**

#### 证据链

1. **缺失微信 WebSocket API**
   - 文件中 `wx.connectSocket`、`wx.sendSocketMessage`、`wx.closeSocket` 等微信 API 调用次数：**0**
   - 文件中任何 `wx.` 开头的 API 调用次数：**0**

2. **依赖浏览器原生 WebSocket 全局对象**
   - 库的 WebSocket 传输模块（module 31）直接引用浏览器全局：
     ```javascript
     // module 31 — WebSocket 获取方式
     WebSocket: n.WebSocket || n.MozWebSocket
     ```
   - 全局作用域解析（module 10）：
     ```javascript
     // 依次尝试 self → window → Function("return this")()
     t.exports = "undefined" != typeof self ? self
       : "undefined" != typeof window ? window
       : Function("return this")()
     ```
   - 微信小程序环境中 **没有全局 `WebSocket` 构造函数**，所以 `n.WebSocket` 为 `undefined`

3. **WebSocket 传输的 `check()` 方法静默失败**
   ```javascript
   // module 21 — WebSocket 传输类
   check() {
     return !(!c || "__initialize" in c && this.name === d.prototype.name)
   }
   ```
   当 `c`（即 `WebSocket`）为 `undefined` 时，`!c` 为 `true`，`check()` 返回 `false`。
   `doOpen()` 检测到 `check()` 为 false 后直接 return，**不发起任何连接**。

4. **Manager 超时触发**
   ```javascript
   // module 6 — Manager 类
   this.timeout(null == e.timeout ? 2e4 : e.timeout)  // 默认 20000ms
   // ...
   const r = this.setTimeoutFn(() => {
     o()           // 清理 open 监听
     e.close()     // 关闭引擎
     e.emit("error", new Error("timeout"))  // ← 就是日志中看到的错误
   }, t)
   ```
   由于 WebSocket 传输从未真正发起连接，20秒后 Manager 超时，抛出 `Error: timeout`。

5. **两个文件完全相同**
   - `miniprogram_npm/weapp.socket.io/index.js`：58283 字节
   - `node_modules/weapp.socket.io/lib/weapp.socket.io.js`：58283 字节
   - 两者是同一个文件，都不包含微信适配代码

#### `weapp.socket.io` 的正确构建方式

查看 [weapp.socket.io GitHub 仓库](https://github.com/weapp-socketio/weapp.socket.io) 的 webpack 配置，
正确的构建过程应该包含：

1. **`NormalModuleReplacementPlugin`**：将标准 `ws` 模块替换为 `wx-ws.js`（微信 WebSocket 适配器）
2. **`wx-ws.js`**：封装 `wx.connectSocket()` 提供标准 WebSocket 接口（onOpen/onClose/onMessage/onError → emit 标准事件）
3. **`string-replace-loader`**：强制使用 WebSocket 传输（替换 `["polling", "websocket"]` → `["websocket"]`）
4. **`DefinePlugin`**：设置全局 `wx` 引用

当前项目中的构建产物缺少了步骤 1-4 的所有处理，等同于一个普通浏览器版 `socket.io-client`。

#### 版本兼容性问题

| 项目 | 版本 | Socket.IO 协议 |
|------|------|----------------|
| `node_modules/weapp.socket.io` (package.json) | 2.2.1 | v2（依赖 socket.io-client@2.2.0） |
| `miniprogram_npm/weapp.socket.io/index.js` 实际内容 | 未知来源 | v3（protocol 5, EIO 4） |
| 后端 Socket.IO 服务 | v3+（EIO=4 握手成功） | v3 |
| npm 可用最新版 `weapp.socket.io` | 3.0.0 | v3（依赖 socket.io-client@^3.1.0） |

`miniprogram_npm` 中的文件使用 Socket.IO v3 协议（与后端匹配），但缺少微信适配层。

---

## 后端排查结论

后端无需修改。以下检查项全部通过：

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 服务监听地址 | ✅ 通过 | `0.0.0.0:3000` |
| Socket.IO 路径 | ✅ 通过 | 默认 `/socket.io/`，前后端一致 |
| 内部握手测试 | ✅ 通过 | `curl localhost:3000/socket.io/?EIO=4&transport=polling` 返回有效 sid |
| 公网握手测试 | ✅ 通过 | `curl https://omqktqrtntnn.sealosbja.site/socket.io/?EIO=4&transport=polling` 返回有效 sid + `upgrades:["websocket"]` |
| Sealos DevBox | ✅ 通过 | 官方确认公网调试链接默认支持 WebSocket |

---

## 前端修复方案

### 方案一：重新构建 weapp.socket.io（推荐）

从 npm 安装 `weapp.socket.io@3.0.0`（匹配后端 Socket.IO v3），然后重新执行微信开发者工具的「构建 npm」：

```bash
npm install weapp.socket.io@3.0.0
```

然后在微信开发者工具中：工具 → 构建 npm

这会使用 `weapp.socket.io` 包自带的 webpack 配置重新构建，生成包含 `wx-ws.js` 适配器的正确产物。

如果微信开发者工具的「构建 npm」仍然生成不含适配器的文件，则需要手动执行 webpack 构建：

```bash
cd node_modules/weapp.socket.io
npm install
npm run build
```

然后将 `lib/weapp.socket.io.js` 复制到 `miniprogram_npm/weapp.socket.io/index.js`。

### 方案二：使用 weapp.socket.io 官方预构建文件

从 [weapp.socket.io GitHub Releases](https://github.com/weapp-socketio/weapp.socket.io) 下载预构建的 `weapp.socket.io.js`，
直接替换 `miniprogram_npm/weapp.socket.io/index.js`。

### 验证方法

替换后，检查新文件是否包含微信 WebSocket API：

```bash
grep -c "connectSocket" miniprogram_npm/weapp.socket.io/index.js
```

期望结果 > 0。如果仍然是 0，说明构建产物仍然不正确。

---

## 前端连接代码（app.ts 第378-386行）

```javascript
const socket = io(wsConfig.url, {
  transports: ['websocket'],             // 仅WebSocket传输
  auth: { token: userStore.accessToken }, // JWT Token通过auth选项传递
  reconnection: true,
  reconnectionDelay: 3000,               // 重连间隔3秒
  reconnectionAttempts: 5                // 最多重连5次
})
```

连接配置本身没有问题，`transports: ['websocket']` 是微信小程序的正确配置（微信不支持 HTTP 长轮询）。
问题在于底层库没有将 `WebSocket` 传输适配到 `wx.connectSocket()`。

---

## 后端事件协议（供修复后对齐）

修复库文件后，Socket.IO 连接建立成功，以下事件协议需要前后端一致：

| 事件名 | 方向 | 数据格式 | 说明 |
|--------|------|----------|------|
| `connection_established` | 后端→前端 | `{ user_id, is_admin, socket_id, server_time }` | 连接成功确认 |
| `new_message` | 后端→前端 | `{ chat_message_id, content, sender_type, session_id, message_type, created_at }` | 新消息推送 |
| `message_sent` | 后端→前端 | `{ chat_message_id, session_id, timestamp }` | 消息写库成功回执 |
| `message_error` | 后端→前端 | `{ error, message, timestamp }` | 消息处理失败回执 |
| `session_closed` | 后端→前端 | `{ session_id, close_reason }` | 会话关闭通知 |
| `notification` | 后端→前端 | `{ type, title, message, level }` | 系统通知 |
| `session_status` | 后端→前端 | `{ status }` | 会话状态变更 |
| `user_typing` | 后端→前端 | `{ isTyping, userName }` | 输入状态指示 |
| `send_message` | 前端→后端 | `{ session_id, content, message_type }` | 用户发送消息 |

---

## 前端当前状态

Socket.IO 连接超时时，前端已自动降级到 REST API 发送消息（日志显示 "API 降级发送成功"），
聊天功能的基本收发不受影响，但实时推送（新消息通知、输入状态、会话状态变更）依赖 Socket.IO，
需要修复 weapp.socket.io 库文件后才能正常工作。
