# 天工餐厅积分系统 - 主包分包优化方案

> 生成日期: 2025-02-19
> 基于项目实际代码状态分析，非引用历史文档

---

## 一、项目概况（基于实际代码分析）

### 1.1 业务模型

天工是一个**餐厅积分抽奖系统**微信小程序，核心业务线：

| 业务线 | 说明 | 对应页面 |
|--------|------|----------|
| **抽奖** | 14种抽奖模式（九宫格/转盘/翻牌/砸蛋/刮刮乐/盲盒/扭蛋/福袋/红包/老虎机/打地鼠/弹珠/集卡/秒杀） | `pages/lottery` + `components/lottery-activity` |
| **兑换** | 积分兑换商品，含幸运空间/臻选空间两大分区 + 交易市场 | `pages/exchange` |
| **交易** | 用户间物品交易（市场浏览/仓库管理/我的上架） | `pages/trade/*` |
| **发现** | 拍照上传小票获取积分 | `pages/camera` |
| **客服** | Socket.IO实时在线聊天 | `pages/chat` |
| **管理** | 管理员核销/审核/扫码/客服管理 | `packageAdmin/*` |

### 1.2 技术架构

- **语言**: TypeScript + SCSS（微信开发者工具内建编译）
- **状态管理**: MobX（`mobx-miniprogram` + `mobx-miniprogram-bindings`）
- **实时通信**: Socket.IO（`weapp.socket.io@3.0.0`）
- **认证**: JWT双Token机制（access_token + refresh_token）
- **组件框架**: glass-easel
- **懒加载**: `lazyCodeLoading: "requiredComponents"` 已启用
- **NPM构建**: 微信开发者工具内建npm

### 1.3 当前包体积实测数据

**当前主包体积: ~2052 KB（2.00 MB）—— 恰好触及2MB限制**

| 模块 | 体积 | 占主包比例 |
|------|------|-----------|
| `components/lottery-activity` (14种抽奖模式) | **577 KB** | **28.1%** |
| `pages/exchange` (兑换页+3个handler拆分文件) | **277 KB** | **13.5%** |
| `miniprogram_npm` (MobX+Socket.IO) | **285 KB** | **13.9%** |
| `utils/` (API客户端+工具函数+QR码) | **203 KB** | **9.9%** |
| `pages/trade` (市场+仓库+我的上架) | **128 KB** | **6.2%** |
| `pages/lottery` (薄壳页面+config) | **106 KB** | **5.2%** |
| `pages/chat` (客服聊天+消息处理器) | **105 KB** | **5.1%** |
| `pages/auth` (登录注册) | **71 KB** | **3.5%** |
| `pages/records` (上传记录) | **56 KB** | **2.7%** |
| `pages/points-detail` (积分明细) | **41 KB** | **2.0%** |
| `pages/user` (个人中心) | **38 KB** | **1.9%** |
| `components/popup-banner` (弹窗横幅) | **32 KB** | **1.6%** |
| `pages/feedback` (意见反馈) | **28 KB** | **1.4%** |
| `pages/camera` (拍照发现) | **23 KB** | **1.1%** |
| `store/` (MobX Stores) | **17 KB** | **0.8%** |
| `images/` (TabBar图标+默认图) | **15 KB** | **0.7%** |
| `config/` (环境配置+常量) | **14 KB** | **0.7%** |
| `styles/` (全局样式变量+混入) | **8 KB** | **0.4%** |
| 根文件 (app.ts/scss/json 等) | **30 KB** | **1.5%** |

已有分包: `packageAdmin` = 141 KB

---

## 二、约束条件分析

### 2.1 不可移出主包的部分（微信硬性规则）

**TabBar页面必须在主包**（微信开发者文档强制要求）：

- `pages/lottery/lottery` — 抽奖（首页）
- `pages/camera/camera` — 发现
- `pages/exchange/exchange` — 兑换
- `pages/user/user` — 我的

**TabBar页面引用的组件必须在主包**：

- `components/lottery-activity/*` — lottery.json 中 usingComponents 引用
- `components/popup-banner/*` — lottery.json 中 usingComponents 引用

**公共模块必须在主包**（被多个分包共用）：

- `utils/` — 所有页面都 require
- `store/` — 所有页面都 require（MobX Store）
- `config/` — app.ts require
- `styles/` — 全局样式变量
- `images/` — TabBar图标
- `miniprogram_npm/` — MobX + Socket.IO

### 2.2 可移出主包的部分

以下页面**不是TabBar页面**，且**不被其他页面的 usingComponents 引用**，可以安全移到分包：

| 页面 | 体积 | 进入方式 | 来源页面 |
|------|------|---------|---------|
| `pages/auth/auth` | 71 KB | reLaunch/redirectTo/navigateTo | lottery, exchange, user, camera, trade/my-listings |
| `pages/chat/chat` | 105 KB | navigateTo | user |
| `pages/points-detail/points-detail` | 41 KB | navigateTo | user |
| `pages/trade/market/market` | 30 KB | navigateTo | market自身详情跳转 |
| `pages/trade/inventory/inventory` | 69 KB | navigateTo | lottery, trade/my-listings |
| `pages/trade/my-listings/my-listings` | 29 KB | navigateTo | user |
| `pages/records/trade-upload-records` | 56 KB | navigateTo | user |
| `pages/feedback/feedback` | 28 KB | navigateTo | user |

**可移出总量: ~429 KB**

---

## 三、分包方案

### 3.1 推荐方案：2个新业务分包

将非TabBar页面按业务域归类为2个分包：

```
主包 (main)                          → ~1623 KB (1.59 MB) ✅ 安全
├── app.ts / app.scss / app.json
├── pages/lottery/                    ← TabBar: 抽奖
├── pages/camera/                     ← TabBar: 发现
├── pages/exchange/                   ← TabBar: 兑换
├── pages/user/                       ← TabBar: 我的
├── components/lottery-activity/      ← lottery引用的组件
├── components/popup-banner/          ← lottery引用的组件
├── utils/                            ← 公共工具（所有包共享）
├── store/                            ← MobX Store（所有包共享）
├── config/                           ← 环境配置
├── styles/                           ← 全局样式
├── images/                           ← TabBar图标
└── miniprogram_npm/                  ← NPM包

packageTrade (交易分包)               → ~255 KB
├── trade/market/market               ← 交易市场浏览
├── trade/inventory/inventory         ← 我的仓库
├── trade/my-listings/my-listings     ← 我的上架
└── records/trade-upload-records      ← 上传交易记录

packageUser (用户服务分包)             → ~245 KB
├── auth/auth                         ← 登录注册
├── chat/chat                         ← 在线客服
├── points-detail/points-detail       ← 积分明细
└── feedback/feedback                 ← 意见反馈

packageAdmin (管理员分包, 已有)        → 141 KB
├── consume-submit/consume-submit
├── audit-list/audit-list
├── scan-verify/scan-verify
└── customer-service/customer-service
```

### 3.2 app.json 配置变更（目标结构）

```json
{
  "pages": [
    "pages/lottery/lottery",
    "pages/exchange/exchange",
    "pages/user/user",
    "pages/camera/camera"
  ],
  "subpackages": [
    {
      "root": "packageTrade",
      "name": "trade",
      "pages": [
        "trade/market/market",
        "trade/inventory/inventory",
        "trade/my-listings/my-listings",
        "records/trade-upload-records/trade-upload-records"
      ]
    },
    {
      "root": "packageUser",
      "name": "user-services",
      "pages": [
        "auth/auth",
        "chat/chat",
        "points-detail/points-detail",
        "feedback/feedback"
      ]
    },
    {
      "root": "packageAdmin",
      "name": "admin",
      "pages": [
        "consume-submit/consume-submit",
        "audit-list/audit-list",
        "scan-verify/scan-verify",
        "customer-service/customer-service"
      ]
    }
  ],
  "preloadRule": {
    "pages/lottery/lottery": {
      "network": "all",
      "packages": ["trade"]
    },
    "pages/exchange/exchange": {
      "network": "all",
      "packages": ["trade"]
    },
    "pages/user/user": {
      "network": "all",
      "packages": ["user-services", "trade", "admin"]
    }
  }
}
```

### 3.3 preloadRule 设计依据

| 当用户处于 | 预加载分包 | 原因 |
|-----------|-----------|------|
| lottery（抽奖页） | packageTrade | lottery页有"去仓库"入口跳转 trade/inventory |
| exchange（兑换页） | packageTrade | exchange有"我的上架"入口跳转 trade/my-listings |
| user（我的页） | packageUser + packageTrade + packageAdmin | 我的页面是所有功能的入口，菜单项通往所有分包 |

通过预加载，用户在TabBar页面浏览时分包已在后台下载完毕，点击跳转时**零等待**。

---

## 四、需要修改的路由路径（完整清单）

分包后页面URL变更，所有 `wx.navigateTo` / `wx.redirectTo` / `wx.reLaunch` 调用需要更新。

### 4.1 auth 页面路径变更

旧路径: `/pages/auth/auth`
新路径: `/packageUser/auth/auth`

| 调用位置 | 调用方式 |
|---------|---------|
| `pages/lottery/lottery.ts` 第586行 | `wx.redirectTo` |
| `pages/lottery/lottery.ts` 第789行 | `wx.navigateTo` |
| `pages/exchange/exchange.ts` 第408行 | `wx.reLaunch` |
| `pages/exchange/exchange-market-handlers.ts` 第90行 | `wx.reLaunch` |
| `pages/trade/my-listings/my-listings.ts` 第155/245行 | `wx.navigateTo` |
| `pages/user/user.ts` 第579/591行 | `wx.reLaunch`/`wx.navigateTo` |
| `pages/camera/camera.ts` 第335行 | `wx.navigateTo` |
| `app.ts` 第199行 | `wx.redirectTo` |

### 4.2 trade 页面路径变更

| 旧路径 | 新路径 | 调用位置 |
|--------|--------|---------|
| `/pages/trade/inventory/inventory` | `/packageTrade/trade/inventory/inventory` | lottery.ts 第1154行, my-listings.ts 第346行, user.ts 第82行 |
| `/pages/trade/my-listings/my-listings` | `/packageTrade/trade/my-listings/my-listings` | user.ts 第91行 |
| `/pages/trade/market/market` | `/packageTrade/trade/market/market` | market.ts 自身详情跳转 第233行 |
| `/pages/records/trade-upload-records/...` | `/packageTrade/records/trade-upload-records/...` | user.ts 第100/109行 |

### 4.3 chat / points-detail / feedback 路径变更

| 旧路径 | 新路径 | 调用位置 |
|--------|--------|---------|
| `/pages/chat/chat` | `/packageUser/chat/chat` | user.ts 第622行 |
| `/pages/points-detail/points-detail` | `/packageUser/points-detail/points-detail` | user.ts 第73/519行 |
| `/pages/feedback/feedback` | `/packageUser/feedback/feedback` | (需确认具体调用位置) |

### 4.4 分包内部的跨分包跳转

分包页面跳转TabBar页面（用 `switchTab`）**不受影响**，因为TabBar页面路径不变：

- `trade/inventory/inventory.ts` → `wx.switchTab({ url: '/pages/lottery/lottery' })` — 无需改
- `trade/my-listings/my-listings.ts` → `wx.switchTab({ url: '/pages/exchange/exchange' })` — 无需改
- `records/trade-upload-records.ts` → `wx.switchTab({ url: '/pages/lottery/lottery' })` — 无需改

分包页面跳转其他分包页面需要用**完整路径**（已是绝对路径，只需更新）：

- `records/trade-upload-records.ts` → `/pages/camera/camera` — camera 在主包，无需改

---

## 五、文件目录迁移计划

### 5.1 文件移动操作

```
1. 创建 packageTrade/ 目录
   ├── 移动 pages/trade/market/       → packageTrade/trade/market/
   ├── 移动 pages/trade/inventory/    → packageTrade/trade/inventory/
   ├── 移动 pages/trade/my-listings/  → packageTrade/trade/my-listings/
   └── 移动 pages/records/            → packageTrade/records/

2. 创建 packageUser/ 目录
   ├── 移动 pages/auth/               → packageUser/auth/
   ├── 移动 pages/chat/               → packageUser/chat/
   ├── 移动 pages/points-detail/      → packageUser/points-detail/
   └── 移动 pages/feedback/           → packageUser/feedback/
```

### 5.2 require 路径调整

分包内的页面 require 公共模块时，路径需要根据目录层级调整：

| 分包页面 | 原 require 路径 | 新 require 路径 |
|---------|----------------|----------------|
| packageTrade/trade/market/market.ts | `../../../utils/index` | `../../../utils/index` (层级不变) |
| packageTrade/trade/inventory/inventory.ts | `../../../utils/index` | `../../../utils/index` (层级不变) |
| packageTrade/trade/my-listings/my-listings.ts | `../../../utils/index` | `../../../utils/index` (层级不变) |
| packageTrade/records/trade-upload-records.ts | `../../../utils/index` | `../../../utils/index` (层级不变) |
| packageUser/auth/auth.ts | `../../utils/index` | `../../utils/index` (层级不变) |
| packageUser/chat/chat.ts | `../../utils/index` | `../../utils/index` (层级不变) |
| packageUser/points-detail/points-detail.ts | `../../utils/index` | `../../utils/index` (层级不变) |
| packageUser/feedback/feedback.ts | `../../utils/index` | `../../utils/index` (层级不变) |

store require 路径同理，跟 utils 层级一致。

---

## 六、对用户体验的影响评估

### 6.1 零影响项

| 方面 | 说明 |
|------|------|
| UI界面 | 所有页面的 wxml/scss 完全不改动，视觉效果100%一致 |
| TabBar | 4个TabBar页面都在主包，切换体验完全不变 |
| 组件 | lottery-activity 14种抽奖模式全部在主包，组件行为不变 |
| 业务逻辑 | 所有ts文件的业务逻辑不做任何修改，只改路径引用 |
| 数据 | MobX Store 在主包，所有页面数据同步机制不变 |
| 实时通信 | Socket.IO 在 app.ts（主包），聊天功能不受影响 |

### 6.2 需要关注的点

| 关注点 | 风险 | 缓解措施 |
|--------|------|---------|
| 首次进入分包页面 | 首次可能有短暂加载（分包未缓存时） | `preloadRule` 预加载，用户到达TabBar页时分包已在后台下载 |
| 登录页跳转 | auth在分包中，首次打开可能有延迟 | user页预加载packageUser；且auth仅在未登录时访问，频率低 |
| 分包大小限制 | 每个分包不超过2MB | packageTrade 255KB、packageUser 245KB，远低于限制 |

---

## 七、附加优化建议（可选，非必需）

### 7.1 移除 source map 文件（可额外节省 ~148 KB）

当前 `miniprogram_npm/` 中包含 `.js.map` 文件共计约 148 KB。在 `project.config.json` 的 `packOptions.ignore` 中添加：

```json
{ "value": ".map", "type": "suffix" }
```

这不会影响任何运行时功能，仅影响开发者工具的调试体验（NPM包内部的sourcemap，实际调试价值不大）。

### 7.2 lottery-activity 组件的进一步懒加载（未来优化）

`lottery-activity` 组件（577KB）目前有14种抽奖子模式，但用户同一时间只会使用1种。当前已通过 `lazyCodeLoading: "requiredComponents"` 开启了组件懒加载，微信框架会按需加载子组件。

如果未来主包继续增长，可以考虑将 `lottery-activity` 整个组件迁入独立分包，lottery页面使用 `componentPlaceholder` 占位加载。但这需要微信基础库 2.11.2+ 支持，且会引入首屏渲染延迟，**当前阶段不建议**。

### 7.3 体积预算

分包后的体积预算：

| 包 | 体积 | 限制 | 余量 |
|----|------|------|------|
| 主包 | ~1623 KB | 2048 KB | **425 KB** |
| packageTrade | ~255 KB | 2048 KB | 1793 KB |
| packageUser | ~245 KB | 2048 KB | 1803 KB |
| packageAdmin | ~141 KB | 2048 KB | 1907 KB |
| **总计** | ~2264 KB | 20480 KB | 18216 KB |

主包从 2052 KB 降至 1623 KB，释放了 **425 KB 的增长空间**（约20%余量），足以支撑后续新功能开发。

---

## 八、实施步骤（执行顺序）

1. **创建分包目录结构** — 创建 `packageTrade/` 和 `packageUser/` 目录
2. **迁移文件** — 将对应页面文件夹移动到分包目录下
3. **更新 app.json** — 修改 pages 数组和 subpackages 配置，添加 preloadRule
4. **更新路由路径** — 按第四章清单修改所有 `wx.navigateTo` / `wx.redirectTo` / `wx.reLaunch` 的 url
5. **更新 require 路径** — 检查并修正分包页面中对 `utils/`、`store/` 的相对路径引用
6. **微信开发者工具验证** — 编译检查，确认所有页面路由和组件引用正常
7. **测试全流程** — 逐个验证每条导航链路（登录 → 各TabBar → 各分包页面）

---

## 附录：lottery-activity 子组件体积明细

| 子组件 | 体积 |
|--------|------|
| sub/whackmole (打地鼠) | 72.23 KB |
| sub/pinball (弹珠) | 57.15 KB |
| sub/slotmachine (老虎机) | 49.76 KB |
| sub/flashsale (秒杀) | 43.40 KB |
| sub/gashapon (扭蛋) | 31.69 KB |
| sub/luckybag (福袋) | 31.93 KB |
| sub/egg (砸蛋) | 30.45 KB |
| sub/cardcollect (集卡) | 30.25 KB |
| sub/card (翻牌) | 24.76 KB |
| sub/blindbox (盲盒) | 23.72 KB |
| sub/redpacket (红包) | 21.34 KB |
| sub/scratch (刮刮乐) | 18.17 KB |
| sub/grid (九宫格) | 17.09 KB |
| sub/wheel (转盘) | 10.05 KB |
| shared/ (结果弹窗+抽奖按钮+稀有度特效) | 54.13 KB |
| root (主组件+模式切换+主题) | 49.04 KB |
| **合计** | **577 KB** |
