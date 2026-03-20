# 微信小程序前端 - 后端协助需求清单

> 生成日期: 2026-03-21
> 来源: 微信小程序前端项目审核链功能对接检查
> 关联文档: docs/approval-chain-design.md

---

## 一、前端审核链功能完成度总览

| 功能模块 | 完成状态 | 说明 |
|---------|---------|------|
| API层 utils/api/console.ts | 已完成 | 7个审核链API方法全部实现 |
| MobX Store store/audit.ts | 已完成 | 待办数量全局管理 角标显示 冷却控制 |
| 审核管理页 packageAdmin/audit-list/ | 已完成 | 双标签页(消费审核+我的待办) 时间线详情弹窗 |
| 消费记录审核链进度展示 | 已完成 | 支持 chain_info 字段展示 + 回退API查询 |
| Socket.IO审核链事件监听 app.ts | 已完成 | 3种事件类型自动刷新待办角标 |
| 个人中心待办角标 pages/user/user.ts | 已完成 | MobX绑定auditStore.pendingCount |
| 微信订阅消息框架 subscribe-message.ts | 待配置 | 代码已实现 模板ID需运营在微信公众平台配置 |

**结论: 前端审核链功能代码开发已全部完成 无待编码的前端任务**

---

## 二、需要后端或运营协助的事项

### 事项1: GET /api/v4/shop/consumption/me 附带 chain_info

**优先级**: P1 (影响普通用户查看审核进度体验)

前端代码位置:
- packageTrade/records/trade-upload-records/trade-upload-records.ts 第 705-757 行
- packageTrade/records/trade-upload-records/trade-upload-records.wxml 第 220-225 行

需要后端做: 在 GET /api/v4/shop/consumption/me 响应中, 对 status=pending 的消费记录,
LEFT JOIN approval_chain_instances 表, 附带 chain_info 字段:

    chain_info: {
      instance_id: 456,       // 审核链实例ID
      current_step: 1,        // 当前步骤
      total_steps: 2,         // 总步骤
      status: "in_progress",  // 审核链实例状态
      current_node_name: "..."// 当前节点名(可选)
    }

当没有审核链实例时, chain_info 为 null, 前端已处理此情况。

---

### 事项2: 微信订阅消息模板ID配置

**优先级**: P2

前端代码位置: utils/subscribe-message.ts 第 37-48 行

需要运营/后端做的事:
1. 登录微信公众平台 -> 功能 -> 订阅消息 -> 公共模板库
2. 选用审核任务提醒模板(业务类型 提交人 金额 提交时间)
3. 选用审核结果通知模板(审核结果 审核意见 业务类型 处理时间)
4. 获取模板ID后填入 utils/subscribe-message.ts 的 SUBSCRIBE_TEMPLATE_IDS
5. 后端需实现 wx.subscribeMessage.send 推送接口

---

### 事项3: Socket.IO 审核链事件推送确认

**优先级**: P1

前端代码位置: app.ts 第 653-686 行

| 事件名 | 触发场景 | 前端处理 |
|--------|---------|---------|
| approval_timeout_escalation | 非终审步骤超时12h自动升级 | 刷新待办角标 |
| approval_final_timeout_reminder | 终审步骤超时提醒 | 刷新待办角标 |
| approval_step_assigned | 审核链推进通知新审核人 | 刷新待办角标 |

需要后端确认: 以上3种事件是否已在后端实现并推送

---

### 事项4: 审核链API端点端到端验证

**优先级**: P1

| 方法 | 路径 | 前端调用函数 |
|------|------|------------|
| GET | /api/v4/console/approval-chain/instances | getApprovalChainInstances() |
| GET | /api/v4/console/approval-chain/instances/:id | getApprovalChainInstanceDetail() |
| GET | /api/v4/console/approval-chain/instances/by-auditable | getInstanceByAuditable() |
| GET | /api/v4/console/approval-chain/my-pending | getMyPendingApprovalSteps() |
| POST | /api/v4/console/approval-chain/steps/:id/approve | approveApprovalStep() |
| POST | /api/v4/console/approval-chain/steps/:id/reject | rejectApprovalStep() |

需要后端做的事: 对以上6个端点进行端到端测试验证
- 提交金额 < 200 消费 -> 走 consumption_default(单级 admin 终审)
- 提交金额 >= 200 消费 -> 走 consumption_large(business_manager 初审 -> admin 终审)
- 验证 /my-pending 返回数据中包含 pagination.total 字段(前端角标依赖此字段)

---

## 三、前端代码质量检查结果

| 检查项 | 结果 |
|--------|------|
| ESLint | 零错误零警告 |
| Prettier | 65个文件格式已统一 |
| APIClient Token机制 | JWT双Token + 自动刷新 + 防并发 |
| Token有效性检查 | validateJWTTokenIntegrity 完整性检查 |
| 认证头处理 | Authorization: Bearer {token} |
| 错误处理 | 401/403/404/409/429/500/503 全覆盖 |
| API路径 | 全部对齐文档中的路径规范 |
| utils/index.ts统一导出 | 分类导出 展开运算符自动同步 |
| Mock数据 | 无业务Mock数据 |
| 字段命名 | API字段100% snake_case |
| 幂等键 | Idempotency-Key 放在请求头 |
| Socket.IO | 审核链3种事件已监听 |
| MobX状态管理 | auditStore全局管理待办数量 |