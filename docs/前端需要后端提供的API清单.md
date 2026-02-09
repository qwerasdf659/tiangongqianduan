# 📋 前端需要后端提供的API清单

> **项目**: 天工餐厅积分抽奖系统 - 微信小程序前端  
> **生成时间**: 2026-02-10  
> **说明**: 以下API在前端代码中已标注为"后端缺失"，需要后端开发人员实现后通知前端对接  
> **优先级**: 🔴 高（影响核心功能） / 🟡 中（影响辅助功能） / 🟢 低（可后续迭代）

---

## 🔴 高优先级

### 1. 反馈配置接口

| 项目 | 内容 |
|------|------|
| **路径** | `GET /api/v4/system/feedback/config` |
| **认证** | 需要（Bearer Token） |
| **前端文件** | `pages/feedback/feedback.ts` → `loadFeedbackConfig()` |
| **当前状态** | 前端使用UI默认值（maxLength: 500, minLength: 10, maxImages: 3） |
| **问题** | 前端无法从后端获取反馈表单的业务配置 |

**期望响应格式**:

```json
{
  "success": true,
  "data": {
    "max_content_length": 500,
    "min_content_length": 10,
    "max_image_count": 3,
    "polling_interval": 5000,
    "allowed_categories": ["bug", "suggestion", "complaint", "other"]
  }
}
```

---

### 2. 聊天图片上传接口

| 项目 | 内容 |
|------|------|
| **路径** | `POST /api/v4/system/chat/upload-image` |
| **认证** | 需要（Bearer Token） |
| **前端文件** | `pages/chat/chat.ts` → 图片消息发送功能 |
| **当前状态** | 前端已注释图片上传功能，等待后端提供专用接口 |
| **问题** | 客服聊天无法发送图片消息 |

**期望请求格式**:

```
Content-Type: multipart/form-data
字段: session_id (number), image (file)
```

**期望响应格式**:

```json
{
  "success": true,
  "data": {
    "message_id": 123,
    "image_url": "https://xxx/chat-images/xxx.jpg",
    "created_at": "2026-02-10T12:00:00+08:00"
  }
}
```

---

### 3. 交易记录删除接口

| 项目 | 内容 |
|------|------|
| **路径** | `DELETE /api/v4/records/trade-upload/:record_id` 或 `POST /api/v4/records/trade-upload/:record_id/delete` |
| **认证** | 需要（Bearer Token） |
| **前端文件** | `pages/records/trade-upload-records/trade-upload-records.ts` |
| **当前状态** | 前端已标注"删除功能待后端实现删除API后启用" |
| **问题** | 用户无法删除自己的交易上传记录 |

**期望响应格式**:

```json
{
  "success": true,
  "message": "记录删除成功"
}
```

---

## 🟡 中优先级

### 4. 管理员客服统计接口

| 项目 | 内容 |
|------|------|
| **路径** | `GET /api/v4/console/customer-service/stats` |
| **认证** | 需要（Bearer Token，admin权限） |
| **前端文件** | `packageAdmin/chat-management/chat-management.ts` → `loadTodayStats()` |
| **当前状态** | 前端仅使用会话列表长度作为总数，其余字段为占位值 |
| **问题** | 管理员客服面板无法展示完整的今日统计数据 |

**期望响应格式**:

```json
{
  "success": true,
  "data": {
    "total_sessions": 15,
    "completed_sessions": 12,
    "avg_response_time": "3分钟",
    "customer_satisfaction": 4.5
  }
}
```

---

### 5. 管理员在线状态更新接口

| 项目 | 内容 |
|------|------|
| **路径** | `POST /api/v4/console/customer-service/status` |
| **认证** | 需要（Bearer Token，admin权限） |
| **前端文件** | `packageAdmin/chat-management/chat-management.ts` → `updateAdminStatus()` |
| **当前状态** | 前端仅更新本地状态，未同步到服务端 |
| **问题** | 用户无法看到客服管理员的在线状态 |

**期望请求格式**:

```json
{
  "status": "online"
}
```

status 可选值: `"online"` / `"offline"` / `"busy"`

**期望响应格式**:

```json
{
  "success": true,
  "message": "状态更新成功"
}
```

---

### 6. 臻选空间解锁状态接口

| 项目 | 内容 |
|------|------|
| **路径** | `GET /api/v4/backpack/exchange/premium-status` |
| **认证** | 需要（Bearer Token） |
| **前端文件** | `pages/exchange/exchange.ts` → `initPremiumUnlockStatus()` |
| **当前状态** | 前端占位方法，未实现 |
| **问题** | 兑换页面无法检查臻选空间的解锁状态 |

**期望响应格式**:

```json
{
  "success": true,
  "data": {
    "unlocked": true,
    "unlock_time": "2026-02-10T10:00:00+08:00",
    "expires_at": "2026-02-12T10:00:00+08:00"
  }
}
```

---

## 🟢 低优先级

### 7. 短信验证码发送服务

| 项目 | 内容 |
|------|------|
| **路径** | `POST /api/v4/auth/send-code`（已定义，需接入短信服务） |
| **认证** | 不需要 |
| **前端文件** | `components/auth-modal/auth-modal.ts` |
| **当前状态** | 前端标注"等后端接入短信服务后恢复发送功能" |
| **问题** | 开发/测试环境使用万能验证码123456可正常工作，但真实短信服务尚未接入 |

**说明**: 该API路径已在前端定义（`utils/api.ts` → `sendVerificationCode`），后端需接入第三方短信服务商完成实际短信发送。

---

### 8. 非客服类型聊天支持

| 项目 | 内容 |
|------|------|
| **说明** | 当前聊天系统仅支持"客服聊天"类型 |
| **前端文件** | `pages/chat/chat.ts` |
| **当前状态** | 前端标注"非客服聊天功能暂未实现，等待后端API开发" |
| **问题** | 如需支持用户间聊天、群聊等功能，需后端提供对应API |

---

## 📊 汇总

| 优先级 | 数量 | 说明 |
|--------|------|------|
| 🔴 高 | 3个 | 影响核心业务功能（反馈、聊天图片、记录删除） |
| 🟡 中 | 3个 | 影响管理后台辅助功能 |
| 🟢 低 | 2个 | 可后续迭代的增强功能 |
| **合计** | **8个** | — |

---

## ⚠️ 统一约定提醒

1. **所有API响应** 必须遵循V4.0统一格式: `{ success: boolean, data?: T, message?: string, code?: string }`
2. **字段命名** 统一使用 `snake_case`（如 `max_content_length`，不是 `maxContentLength`）
3. **认证方式**: `Authorization: Bearer {access_token}`
4. **错误码规范**: 401/403/404/409/429/500/503 按标准HTTP语义返回
5. **时间格式**: ISO 8601 + 北京时间偏移 `+08:00`（如 `2026-02-10T12:00:00+08:00`）

---

**文档生成方**: 微信小程序前端  
**接收方**: 后端数据库开发人员  
**生成时间**: 2026-02-10


