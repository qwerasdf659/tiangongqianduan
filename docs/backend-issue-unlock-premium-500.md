# 🚨 后端问题报告 — 臻选空间解锁接口 500 错误

> **报告日期**: 2026-02-16  
> **报告来源**: 微信小程序前端团队  
> **问题等级**: 🔴 A级（阻塞性 — 核心业务功能不可用）  
> **影响范围**: 臻选空间解锁功能完全不可用

---

## 📋 问题概述

前端调用 `POST /api/v4/backpack/exchange/unlock-premium` 接口时，后端返回 **HTTP 500 Internal Server Error**，导致用户无法解锁臻选空间。

---

## 🔍 错误详情

### 请求信息

| 项目 | 值 |
|------|-----|
| **请求方法** | POST |
| **请求URL** | `https://omqktqrtntnn.sealosbja.site/api/v4/backpack/exchange/unlock-premium` |
| **请求数据** | `{}`（该接口无需请求体参数，用户身份通过JWT Token识别） |
| **认证方式** | Bearer Token（JWT，Authorization请求头） |
| **请求耗时** | 147ms |

### 响应信息

```json
{
  "success": false,
  "code": "INTERNAL_ERROR",
  "message": "解锁失败，请稍后重试",
  "data": {},
  "timestamp": "2026-02-16T14:52:04.998+08:00"
}
```

| 项目 | 值 |
|------|-----|
| **HTTP状态码** | 500 |
| **错误码** | INTERNAL_ERROR |
| **错误消息** | 解锁失败，请稍后重试 |
| **时间戳** | 2026-02-16T14:52:04.998+08:00 |

---

## 🔗 前端调用链路（已验证无问题）

```
用户点击"解锁臻选空间"按钮
    ↓
exchange-shop-handlers.ts → handlePremiumUnlock()
    ↓ 先调用 checkPremiumUnlockStatus() 检查解锁条件
    ↓ 弹出确认弹窗（显示解锁费用和有效期）
    ↓ 用户确认后
exchange-shop-handlers.ts → unlockPremiumSpace()
    ↓
utils/api/backpack.ts → unlockPremium()
    ↓ 调用 apiClient.request('/backpack/exchange/unlock-premium', { method: 'POST', needAuth: true })
    ↓
utils/api/client.ts → APIClient.request()
    ↓ Token完整性验证通过 ✅
    ↓ Authorization: Bearer <JWT Token> 已正确添加 ✅
    ↓ wx.request() 发送请求
    ↓
后端返回 HTTP 500 ← 🔴 问题在这里
```

---

## ✅ 前端已验证项目（排除前端原因）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| API路径 | ✅ 正确 | `/api/v4/backpack/exchange/unlock-premium` 与文档一致 |
| HTTP方法 | ✅ 正确 | POST |
| JWT Token | ✅ 有效 | Token完整性验证通过，Authorization头正确携带 |
| 请求数据 | ✅ 正确 | 该接口无需请求体（用户身份通过JWT识别） |
| 错误处理 | ✅ 完善 | catch捕获500错误，显示后端返回的错误消息 |
| 导入链路 | ✅ 正确 | utils/index.ts → api/index.ts → backpack.ts → client.ts |
| Mock数据 | ✅ 无 | 前端无任何模拟数据，全部使用后端真实API |

---

## 🎯 需要后端排查的方向

根据后端API文档中的业务规则，`PremiumService.unlockPremium` 的执行流程为：

```
1. users.history_total_points >= 100000（历史累计门槛）
2. POINTS 可用余额 >= 100（通过 BalanceService.changeBalance 扣减）
3. 已解锁且未过期 → 拒绝重复解锁
4. 解锁有效期24小时
5. 全流程在 TransactionManager.execute() 事务内
```

### 请后端排查以下可能原因

#### 1. 数据库/服务层异常

- [ ] PremiumService.unlockPremium 方法是否正常部署？
- [ ] TransactionManager.execute() 事务是否正常执行？
- [ ] 是否有数据库连接池耗尽或死锁问题？

#### 2. 业务条件校验

- [ ] 当前测试用户的 `history_total_points` 是否满足 >= 100000？
- [ ] 当前测试用户的 POINTS 可用余额是否 >= 100？
- [ ] 用户是否已有未过期的解锁记录？

#### 3. 服务依赖

- [ ] BalanceService.changeBalance 是否正常工作？
- [ ] 积分扣减事务是否有异常？

#### 4. 错误日志

- [ ] 请提供后端 500 错误的完整堆栈信息（stack trace）
- [ ] 请提供 PremiumService 相关的后端日志

---

## 📝 希望后端提供的信息

1. **后端500错误的完整堆栈日志**（最关键）
2. **当前测试用户的数据状态**：
   - `users.history_total_points` 值
   - POINTS资产的 `available_balance` 值
   - 是否已有臻选空间解锁记录
3. **PremiumService 是否已正确部署和注册路由**
4. **TransactionManager 是否有事务超时或死锁日志**
5. **如果是业务条件不满足**（如积分不足），应返回 400 而非 500，请确认错误码是否正确

---

## 💡 建议

- 如果是业务条件不满足（积分不足、历史累计不达标等），后端应返回 **HTTP 400** + 明确的业务错误码（如 `INSUFFICIENT_POINTS`、`CONDITION_NOT_MET`），而不是 **HTTP 500**（服务器内部错误）
- 500 表示服务器内部未处理的异常，应该有对应的错误堆栈日志

---

## 📎 相关前端文件（仅供参考）

| 文件 | 说明 |
|------|------|
| `utils/api/backpack.ts` 第315-324行 | unlockPremium() API方法定义 |
| `utils/api/client.ts` 第150-247行 | APIClient.request() 统一请求方法 |
| `pages/exchange/exchange-shop-handlers.ts` 第392-410行 | unlockPremiumSpace() 页面调用逻辑 |
| `pages/exchange/exchange-shop-handlers.ts` 第350-386行 | handlePremiumUnlock() 解锁前检查逻辑 |

---

**报告人**: 微信小程序前端团队  
**日期**: 2026-02-16
