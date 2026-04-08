# DIY 饰品设计引擎 — 前端需要后端配合的工作清单

> 生成时间: 2026-04-08
> 来源: 微信小程序前端项目代码审查，对照《DIY饰品设计引擎-后端重构落地方案》
> 用途: 交给后端开发人员，明确前端已完成的对接和后端需要提供/修改的内容

---

## 一、需要后端新增的接口

### 1.1 小程序码生成接口（前端已对接，后端未实现）

| 项目 | 内容 |
|---|---|
| 路径 | `GET /api/v4/diy/works/:id/qrcode` |
| 认证 | 需登录（authenticateToken） |
| 前端调用位置 | `utils/api/diy.ts` → `getDiyWorkQrcode(workId)` |
| 前端使用场景 | diy-result 页面"保存海报"功能，海报底部展示小程序码 |
| 期望返回格式 | `{ success: true, data: { qrcode_url: "https://..." } }` |
| 业务逻辑 | 调用微信 `wxacode.getUnlimited` 生成小程序码 → 上传 Sealos 对象存储 → 返回图片URL |
| 小程序码扫码路径 | `/packageDIY/diy-design/diy-design?workId={diy_work_id}` |
| 前端降级处理 | 接口失败时海报中显示占位圆圈 + "小程序码"文字，不阻塞海报生成 |

### 1.2 DIY 可用支付资产余额接口（前端已对接，需确认后端路由）

| 项目 | 内容 |
|---|---|
| 路径 | `GET /api/v4/diy/payment-assets` |
| 认证 | 需登录 |
| 前端调用位置 | `utils/api/diy.ts` → `getDiyPaymentAssets()` |
| 前端使用场景 | 支付确认面板（payment-panel 组件），展示用户可用资产余额 |
| 期望返回格式 | `{ success: true, data: [{ asset_code, display_name, group_code, form, tier, visible_value_points, image_url, available_amount, frozen_amount }] }` |
| 业务规则 | 排除 points（积分）和 budget_points（预算积分），只返回可用于 DIY 支付的资产 |
| 备注 | 文档中提到将 `GET /api/v4/diy/templates/:id/materials` 改名为此路径，请确认是否已完成 |

---

## 二、需要后端修改的接口

### 2.1 确认设计接口增加 payments 参数

| 项目 | 内容 |
|---|---|
| 路径 | `POST /api/v4/diy/works/:id/confirm` |
| 当前问题 | 后端从 `work.total_cost` 直接读取冻结明细，该值是前端传入的，后端没有校验价格 |
| 前端现在传什么 | `{ payments: [{ asset_code: "star_stone", amount: 320 }, { asset_code: "red_core_gem", amount: 40 }] }` |
| 期望后端行为 | 1. 根据 design_data 查 diy_materials 当前价格计算 total_price |
|  | 2. 校验 payments 总额覆盖 total_price |
|  | 3. 遍历 payments 逐项 `BalanceService.freeze({ asset_code, amount, system_code: 'diy_freeze' })` |
|  | 4. 生成 total_cost 快照保存到 diy_works |
| 期望返回格式 | `{ success: true, data: { diy_work_id, status: 'frozen', frozen_at } }` |

### 2.2 saveWork 不再接受前端 total_cost

| 项目 | 内容 |
|---|---|
| 路径 | `POST /api/v4/diy/works` |
| 前端现在传什么 | `{ diy_template_id, work_name, design_data }` — 不再传 total_cost |
| 期望后端行为 | 创建时 total_cost 固定为 `[]`，由 confirmDesign 时服务端计算 |
| 对应文档决策 | F9: saveWork 不再接受前端 total_cost（安全隐患修复） |

---

## 三、需要后端修复的已知问题（文档 B 系列）

以下问题在文档中已详细描述，前端无法处理，需后端修复:

| 编号 | 问题 | 严重程度 |
|---|---|---|
| B1 | `getTemplateMaterials()` 查的是 `material_asset_types` 而非 `diy_materials` | 核心缺陷 |
| B2 | `confirmDesign()` 信任前端传入的 total_cost，无服务端价格校验 | 核心缺陷 |
| B3 | `_validateDesignMaterials()` 查错表 + 空数组跳过校验 | 核心缺陷 |
| B4 | `confirmDesign()` 没有按 price_asset_code 分组汇总冻结 | 核心缺陷 |
| B5 | diy_materials.price 是 decimal，余额是 bigint，无精度转换 | 需处理 |
| B7-B9 | freeze/settleFromFrozen/unfreeze 调用缺少 system_code 参数 | 需处理 |

---

## 四、需要后端处理的数据问题

| 编号 | 问题 | 建议处理方式 |
|---|---|---|
| DB1 | `user_addresses` 表不存在（实物履约需要收货地址） | 新建表 + 提供 CRUD 接口 |
| DB3 | `exchange_records` 缺少 `address_snapshot` 字段 | ALTER TABLE 添加字段 |
| F5 | 5 条 diy_works 测试数据残留（JADE/AGATE/DIAMOND 编码） | DELETE 清理 |
| B6 | diy_materials.price_asset_code 默认值是 'DIAMOND'（历史遗留） | 迁移脚本改为无默认值 |

---

## 五、前端已完成的工作（后端无需关注）

| 完成项 | 说明 |
|---|---|
| API 层 13 个接口全部对接 | `utils/api/diy.ts`，含 getDiyWorkQrcode（后端未实现，前端有降级） |
| 字段名对齐后端 snake_case | design_data 使用 material_code，不使用 asset_code |
| 支付面板组件 | `packageDIY/sub/payment-panel/`，展示费用明细 + 资产余额 + 充足性校验 |
| 费用按 price_asset_code 分组 | `store/diy.ts` costBreakdown getter，支持多币种 |
| confirm 传 payments 参数 | `confirmDiyWork(workId, payments)` |
| saveWork 不传 total_cost | 文档决策 F9 已落地 |
| 我的作品列表页 | `packageDIY/diy-works/`，状态筛选 + 跳转操作 |
| 设计器核心功能 | 串珠/镶嵌双模式、Canvas渲染、撤销重做、缓存恢复、分享还原 |
| 海报生成 | 750x1334 三段式离屏Canvas，含饰品渲染 + 材料标签 + 小程序码占位 |

---

## 六、收货地址功能（前端暂未实现，等后端就绪后对接）

DIY 产品是实物珠子饰品，完成设计后需要实物发货。当前整个系统缺少收货地址能力:

| 需要后端提供 | 说明 |
|---|---|
| `user_addresses` 表 | 用户收货地址表（姓名、手机、省市区、详细地址） |
| `GET /api/v4/user/addresses` | 获取用户地址列表 |
| `POST /api/v4/user/addresses` | 新增地址 |
| `PUT /api/v4/user/addresses/:id` | 修改地址 |
| `DELETE /api/v4/user/addresses/:id` | 删除地址 |
| `exchange_records.address_snapshot` | 实物发货地址快照字段 |
| completeDesign 时收集地址 | 前端在 complete 请求中携带 address_id，后端快照到 exchange_records |

后端就绪后请告知，前端将新增地址管理页 + 在 completeDesign 流程中集成地址选择。
