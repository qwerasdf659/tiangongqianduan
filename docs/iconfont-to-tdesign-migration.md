# 全站 iconfont → TDesign t-icon 迁移清单

## 概述

将所有 `<text class="iconfont icon-xxx">` 替换为 `<t-icon name="xxx" />`，统一全站图标风格。

**总计：约 150 处，分布在 30 个文件中。**

---

## 图标映射表（自建 → TDesign）

| 自建 iconfont | TDesign 图标名 | 语义 |
|---|---|---|
| icon-bell | notification-filled | 通知/铃铛 |
| icon-box | shop-filled | 仓库/箱子 |
| icon-bulb | lightbulb-filled | 提示/灯泡 |
| icon-camera | camera-filled | 相机 |
| icon-celebrate | fireworks-filled | 庆祝 |
| icon-chart | chart-bar-filled | 图表 |
| icon-chat | chat-bubble-filled | 聊天 |
| icon-clipboard | task-filled | 审核/剪贴板 |
| icon-coin | money-filled | 金币/积分 |
| icon-compass | compass-filled | 发现 |
| icon-craft | tools-filled | 铸造 |
| icon-crown | crown-filled（需确认） | 皇冠 |
| icon-diamond | diamond-filled（需确认） | 钻石/星石 |
| icon-dice | control-platform（近似） | 骰子/随机 |
| icon-edit | edit-filled | 编辑 |
| icon-error | close-circle-filled | 错误 |
| icon-fire | flame（需确认） | 热门/火 |
| icon-gamepad | game-filled（需确认） | 游戏 |
| icon-gear | setting-filled | 设置 |
| icon-gift | gift-filled | 礼物 |
| icon-gold-coin | money-filled | 金币 |
| icon-headset | service-filled | 客服 |
| icon-hourglass | hourglass-filled | 等待 |
| icon-info | info-circle-filled | 信息 |
| icon-lightning | flash-filled（需确认） | 闪电 |
| icon-link | link | 链接 |
| icon-lock | lock-on-filled | 锁定 |
| icon-lock-closed | lock-on-filled | 锁定 |
| icon-logout | poweroff | 退出 |
| icon-megaphone | loudspeaker-filled | 公告 |
| icon-package | package（需确认） | 包裹 |
| icon-playing-card | card（需确认） | 扑克牌 |
| icon-question | help-circle-filled | 未知 |
| icon-receipt | file-filled | 收据 |
| icon-red-packet | wallet-filled | 红包 |
| icon-refresh | refresh | 刷新 |
| icon-ribbon | flag-filled（近似） | 彩带 |
| icon-shield | secured-filled | 盾牌 |
| icon-shopping-bag | shop-filled | 购物袋 |
| icon-slot-machine | control-platform（近似） | 老虎机 |
| icon-sparkle | star-filled | 闪光 |
| icon-star | star-filled | 星星 |
| icon-store | shop-filled | 商店 |
| icon-success | check-circle-filled | 成功 |
| icon-tag | discount-filled | 标签 |
| icon-target | precise-monitor（近似） | 目标 |
| icon-trophy | cup-filled（需确认） | 奖杯 |
| icon-user | user-filled | 用户 |
| icon-warning | error-circle-filled | 警告 |
| icon-wheel | setting | 转盘 |

> 标注"需确认"的图标需要在 TDesign 图标库中核实是否存在，不存在的保留自建 iconfont。

---

## 文件清单（按优先级排序）

### P0 — 核心页面（用户高频使用）

| # | 文件 | 图标数 | 涉及图标 |
|---|---|---|---|
| 1 | pages/lottery/lottery.wxml | 7 | hourglass, warning, coin, store, edit, bell |
| 2 | packageUser/auth/auth.wxml | 5 | warning, slot-machine, gamepad, gift, gold-coin |
| 3 | packageTrade/trade/inventory/inventory.wxml | 20 | package, trophy, refresh, gift, gear, lock-closed, sparkle, star, slot-machine, celebrate, bulb, hourglass, warning |
| 4 | packageTrade/records/trade-upload-records/trade-upload-records.wxml | 10 | gold-coin, lock-closed, diamond, refresh, celebrate, success, error, hourglass |
| 5 | packageExchange/components/exchange/exchange-shelf/exchange-shelf.wxml | 2 | lock-closed, refresh |

### P1 — 抽奖子玩法（用户常见）

| # | 文件 | 图标数 | 涉及图标 |
|---|---|---|---|
| 6 | packageLottery/lottery-activity/shared/result-modal/result-modal.wxml | 14 | celebrate, error, question, gift, dice, sparkle, warning |
| 7 | packageLottery/lottery-activity/sub/grid/grid.wxml | 6 | gift, trophy, diamond, circus-tent, ribbon, celebrate |
| 8 | packageLottery/lottery-activity/sub/flashsale/flashsale.wxml | 9 | lightning, gift, fire, error, hourglass, celebrate |
| 9 | packageLottery/lottery-activity/sub/card/card.wxml | 6 | playing-card, gift |
| 10 | packageLottery/lottery-activity/sub/gashapon/gashapon.wxml | 6 | sparkle, gamepad, gear, gift, gold-coin |
| 11 | packageLottery/lottery-activity/sub/scratch/scratch.wxml | 3 | gift, question |
| 12 | packageLottery/lottery-activity/sub/redpacket/redpacket.wxml | 4 | red-packet, sparkle, gift |
| 13 | packageLottery/lottery-activity/sub/wheel/wheel.wxml | 1 | gift |
| 14 | packageLottery/lottery-activity/sub/luckybag/luckybag.wxml | 1 | gift |
| 15 | packageLottery/lottery-activity/sub/cardcollect/cardcollect.wxml | 3 | playing-card, ribbon |
| 16 | packageLottery/lottery-activity/sub/pinball/pinball.wxml | 2 | gift, gold-coin |

### P2 — 交易/商城模块

| # | 文件 | 图标数 | 涉及图标 |
|---|---|---|---|
| 17 | packageTrade/trade/market/market.wxml | 2 | fire, warning |
| 18 | packageTrade/trade/listing-detail/listing-detail.wxml | 3 | warning, lock-closed, celebrate |
| 19 | packageTrade/trade/my-orders/my-orders.wxml | 1 | warning |
| 20 | packageTrade/trade/dispute/dispute.wxml | 1 | warning |
| 21 | packageExchange/exchange-order-detail/exchange-order-detail.wxml | 1 | warning |
| 22 | packageExchange/exchange-orders/exchange-orders.wxml | 3 | package, star, info |
| 23 | packageExchange/components/exchange/exchange-market/exchange-market.wxml | 2 | shopping-bag, package |
| 24 | packageExchange/components/exchange/exchange-shelf/sub/premium-space/premium-space.wxml | 3 | diamond, craft, gift |

### P3 — 管理员/广告/其他

| # | 文件 | 图标数 | 涉及图标 |
|---|---|---|---|
| 25 | packageAdmin/audit-list/audit-list.wxml | 4 | bulb, success, hourglass |
| 26 | packageAdmin/consume-submit/consume-submit.wxml | 2 | bulb, warning |
| 27 | packageAdmin/customer-service/customer-service.wxml | 2 | link, error |
| 28 | packageAd/ad-create/ad-create.wxml | 3 | diamond |
| 29 | packageAd/ad-campaigns/ad-campaigns.wxml | 6 | bulb, diamond |
| 30 | packageAd/ad-detail/ad-detail.wxml | 8 | diamond |
| 31 | packageUser/chat/chat.wxml | 4 | hourglass, bulb, warning, success |
| 32 | components/popup-banner/popup-banner.wxml | 1 | celebrate |
| 33 | components/prize-detail-modal/prize-detail-modal.wxml | 1 | gift |

---

## 每个文件的操作步骤

1. 在该文件对应的 `.json` 中注册 `t-icon` 组件：
   ```json
   "t-icon": "/miniprogram_npm/tdesign-miniprogram/icon/icon"
   ```

2. 替换 WXML 中的图标写法：
   ```html
   <!-- 之前 -->
   <text class="xxx iconfont icon-gift"></text>
   
   <!-- 之后 -->
   <t-icon name="gift-filled" size="32rpx" color="#C8A06A" class="xxx" />
   ```

3. 清理对应 SCSS 中 `font-size`/`color` 相关的图标样式（t-icon 通过 props 控制）

---

## 注意事项

- TDesign 图标库中没有的图标（playing-card、slot-machine、circus-tent、mole 等游戏专属图标）保留自建 iconfont
- `t-icon` 组件会增加少量 WXML 节点，对性能影响可忽略
- 每个页面/组件的 JSON 都需要单独注册 `t-icon`
- 建议按 P0 → P1 → P2 → P3 顺序逐步推进，每批完成后验证效果

---

## 预估工作量

| 优先级 | 文件数 | 图标数 | 预估时间 |
|--------|--------|--------|----------|
| P0 | 5 | 44 | 1 小时 |
| P1 | 11 | 55 | 1.5 小时 |
| P2 | 8 | 16 | 0.5 小时 |
| P3 | 9 | 31 | 1 小时 |
| **合计** | **33** | **~150** | **~4 小时** |
