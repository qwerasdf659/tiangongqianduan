# CDN 图片存储方案与建议
一遍项目现有的安全防护配置,看看有没有明显缺口
> 版本：v1.0（2026-07-15）｜独立文档，不并入《DIY饰品定制-三端落地方案与拍板决议.md》
> 核对方式：Node.js + mysql2 直连真实库 `restaurant_points_dev`（读 `.env`，非备份文件）+ 通读当前 worktree 实际代码（`services/SealosStorageService.js`、`services/MediaService.js`、`utils/ImageUrlHelper.js`、`routes/v4/images.js`、`models/MediaFile.js`、`admin/src/alpine/mixins/image-upload.js`）。不引用任何历史报告。
> 权威原则：接口路径 / 字段名 / 响应格式 / 存储 key 口径以**后端数据库项目为唯一权威**；前端直接用后端字段名、不做映射层；不兼容旧写法，前端适配后端。
> 结论先行：本项目**不需要引入任何新框架/新服务**即可上 CDN。当前图片链路已是"对象存储（Sealos S3）+ 后端图片代理 + 内容哈希缓存 + 预生成宽度档衍生图"的成熟形态，上 CDN 只是在既有链路前**加一层缓存**并切换 URL 域名，属配置级改动。是否上、怎么上，见 F.7 需要你拍板的 5 项。

---

## 1. 一句话结论

**当前无 CDN，但代码早已为 CDN 预留了切换位**（`SealosStorageService` 有 `CDN_DOMAIN` 逻辑、`.env` 有 `PUBLIC_BASE_URL`）。真正决定成本与收益的是选哪条路：

- **路线 A（推荐，最低改动）**：给现有后端图片代理域名 `PUBLIC_BASE_URL`（`https://omqktqrtntnn.sealosbja.site`）**挂一层 CDN 回源**。零代码改动、URL 不变、内容哈希缓存策略天然适配 CDN。
- **路线 B（次选）**：让 CDN 直接回源到 Sealos 对象存储公网端点，URL 改指向 CDN 域名。需改 `ImageUrlHelper` 出口，绕过后端代理。
- **路线 C（不推荐）**：引入独立第三方图床/云图片处理服务。与现有栈重复造轮子，制造技术债。

---

## 2. 现状核对（真实代码 + 真实库，2026-07-15）

### 2.1 存储与 URL 链路（读代码实证）

| 环节 | 实现 | 位置 |
|---|---|---|
| 对象存储 | Sealos 对象存储（S3 兼容，AWS SDK），bucket=`br0za7uc-tiangong`，`public-read` ACL，`Cache-Control: max-age=31536000` | `SealosStorageService.js` |
| 上传端点 | 内网优先（`SEALOS_INTERNAL_ENDPOINT`）+ 失败自动回退公网（`SEALOS_ENDPOINT`） | `SealosStorageService._uploadWithFallback` |
| 存的是什么 | **只存对象 key**（如 `diy-materials/1784120589431_xxx.png`），不存完整 URL（架构已拍板） | `models/MediaFile.js` `object_key` |
| URL 生成 | `getImageUrl(objectKey, contentHash)` → `${PUBLIC_BASE_URL}/api/v4/images/{objectKey}?h={hash前8位}` | `utils/ImageUrlHelper.js` |
| 图片访问 | **后端图片代理**：小程序/浏览器请求 `/api/v4/images/*`，后端从 Sealos 内网取二进制、以 `inline` 返回 | `routes/v4/images.js` |
| 衍生图 | 上传时预生成 3 档宽度 WebP：`w375`/`w750`/`w1080`，登记进 `media_files.thumbnail_keys` | `SealosStorageService.uploadImageWithThumbnails` |
| 缓存策略 | 带 `?h=`（内容哈希）→ `public, max-age=31536000, immutable`（永久缓存）；否则 24h 协商缓存 | `routes/v4/images.js` |

**为什么现在要走后端代理而不是直连对象存储**（代码注释实证）：

1. Sealos 对象存储强制 `Content-Disposition: attachment`，微信小程序 `<image>` 组件无法直接渲染；后端代理改成 `inline` 返回。
2. 免去在微信小程序后台白名单里额外配置对象存储域名（只需配一个 `PUBLIC_BASE_URL` 域名）。

> ⚠️ 这正是"是否上 CDN"的关键约束：**上 CDN 不能破坏这两点**（inline 返回 + 单一白名单域名）。路线 A 天然满足；路线 B 需要额外处理 Content-Disposition 与小程序白名单。

### 2.2 真实库图片数据现状（直连实测）

| 项 | 实测值 |
|---|---|
| `media_files` active 总数 | **51 张**，合计约 **9.4 MB** |
| 分文件夹 | diy-materials 19 / materials 15 / categories 9 / diy-templates 6 / uploads 2 |
| 衍生图覆盖 | **51 张全部有 `thumbnail_keys`（w375/w750/w1080）** |
| 内容哈希 | **51 张全部有 `content_hash`**（0 缺失） |
| 脏 object_key | **0**（无完整 URL、无本地路径，全部是规范对象 key） |
| 回收站 | trashed 3 张 |

> 结论：图片数据本身干净、规范、衍生图齐全，内容哈希缓存策略已全量生效。**这是上 CDN 的理想前置状态**——URL 已经是 immutable 语义（文件变→hash 变→URL 变），CDN 可放心长缓存、无需主动 purge。

### 2.3 CDN 预留位（读代码实证）

- `SealosStorageService` 构造函数：`const cdnDomain = process.env.CDN_DOMAIN || publicEndpoint`——**已预留 `CDN_DOMAIN` 环境变量**，但 `getPublicUrl()` 生成的是"对象存储直连 URL"，而项目实际对外 URL 走的是 `ImageUrlHelper` 的后端代理路径，二者是两条路（见 F.4 注意点）。
- `.env`：有 `PUBLIC_BASE_URL=https://omqktqrtntnn.sealosbja.site`，`ImageUrlHelper` 用它拼图片代理 URL。**没有** `CDN_DOMAIN`（未配置，走回退）。

---

## 3. 三条路线详解与选型

### 3.1 路线 A（推荐）：给后端代理域名挂 CDN 回源

**做法**：在 CDN 服务商（Cloudflare / 阿里云 CDN / 腾讯云 CDN 等）配置一个加速域名（如 `cdn.你的域名`），**回源地址设为现有 `PUBLIC_BASE_URL`**（`omqktqrtntnn.sealosbja.site`），只加速 `/api/v4/images/*` 路径。然后把 `PUBLIC_BASE_URL`（或新增 `IMAGE_CDN_BASE_URL`）指向 CDN 域名。

**为什么最优**：
- **零代码或极小代码改动**：URL 结构不变（仍是 `/api/v4/images/{key}?h=xxx`），只换域名。
- **缓存策略天然适配**：后端代理已对 `?h=` 返回 `immutable, max-age=1年`，CDN 直接遵循，命中率极高、几乎不回源。
- **不破坏现有约束**：inline 返回、单一白名单域名两点都保留（CDN 透传后端响应头）。
- **回源省流**：CDN 边缘缓存命中后不再打到后端/对象存储，降低后端代理压力和 Sealos 出网流量。

**代价**：需要一个可配置 CDN 的域名 + 备案（国内 CDN 通常要求域名备案）。

**改动点**：
- `.env`：`PUBLIC_BASE_URL` 指向 CDN 域名（或新增 `IMAGE_CDN_BASE_URL` 供 `ImageUrlHelper` 优先取，保留 `PUBLIC_BASE_URL` 作 API 用途）。
- 微信小程序后台：`downloadFile`/`<image>` 合法域名加 CDN 域名（若换域名）。

### 3.2 路线 B（次选）：CDN 直接回源对象存储

**做法**：CDN 回源到 Sealos 公网端点 `objectstorageapi.bja.sealos.run/br0za7uc-tiangong`，`ImageUrlHelper.getImageUrl` 改为输出 `${CDN_DOMAIN}/{bucket}/{objectKey}`，绕过后端 `/api/v4/images` 代理。

**收益**：图片请求完全不经过后端，路径最短。

**代价 / 风险**（这些正是当初改走后端代理要解决的问题，选 B 要重新处理）：
- **Content-Disposition**：对象存 `attachment` 时小程序无法渲染。需在上传时确保写 `inline`（现有 `uploadImageWithThumbnails` 已写 `ContentDisposition: 'inline'`，✅ 满足），且 CDN 不覆盖该头。
- **小程序白名单**：要把 CDN 域名加进微信合法域名。
- **内容哈希缓存**：`?h=` 参数当前由 `ImageUrlHelper` 拼，改路线 B 后仍可保留，但要确认 CDN 把 query 参与缓存键。
- `getPublicUrl()`（`SealosStorageService`）当前已支持 `CDN_DOMAIN`，但项目实际对外 URL 出口是 `ImageUrlHelper`，需改的是后者。

### 3.3 路线 C（不推荐）：独立第三方图床/云图片处理

引入七牛/又拍/阿里云 OSS+CDN 一体等独立图片服务。与现有 Sealos + sharp 预生成衍生 + 内容哈希缓存链路**功能重叠**，需迁移存量 51 张图、改上传链路、改 URL 出口，属重复造轮子，**制造技术债，违背"基于现有技术栈、降低长期维护成本"的原则**。除非未来图片量级/流量增长到 Sealos + 单 CDN 撑不住，否则不选。

---

## 3.5 CDN 服务商选型与费用对比（2026-07-15 官方计费口径核实）

> 核实方式：查阅腾讯云 CDN 官方计费文档 + Cloudflare 官方定价（2026 年）。价格随官方调整，接入时以官方公示为准。

### 3.5.1 有没有免费的 CDN？

**有——Cloudflare 免费版（Free 计划 $0）**：无限流量、无限请求、免费 SSL、免费 DDoS 防护，图片加速功能够用。

**但对本项目有一个关键约束**：Cloudflare 免费版**节点在境外，中国大陆没有直连节点**。本项目用户主体是**微信小程序用户（国内）**，走 Cloudflare 免费版国内访问首字节延迟通常在 **200~400ms**，明显不如国内 CDN。

- 想要 Cloudflare 国内低延迟需 **China Network**（工信部备案 + 百度智能云接入），**年费数万元起**，仅适合中大型企业，**不适合本项目**。
- 结论：Cloudflare 免费版**只适合海外流量为主**的场景；国内小程序为主则不推荐单用它。

### 3.5.2 腾讯云 CDN 是付费的吗？

**是付费的，但有部分免费额度**（2026 年官方口径）：

| 计费项 | 是否免费 | 说明 |
|---|---|---|
| 基础流量/带宽 | **无免费额度**，按量后付费 | 按流量阶梯累进（0–2TB 一档价、往上递减）或按带宽计费，二选一。CDN 侧不收回源流量费 |
| HTTPS 请求数 | **每账号每月免费 300 万次** | 超出部分 0.05 元/万次；免费额度每自然月重置、不结转 |

> 对本项目这种小体量（真实库仅 51 张图约 9.4MB、流量小）：即便接入腾讯云 CDN，**月费大致就是几毛到几块钱级别**的流量费，HTTPS 请求数基本落在 300 万次免费额度内。开销极低，但严格说**不是"免费"**。阿里云 CDN 计费模型类似（按量 + 少量免费额度）。

### 3.5.3 结合本项目的三方案对比

| 方案 | 费用 | 国内小程序体验 | 是否需域名备案 | 适配度 |
|---|---|---|---|---|
| **暂不上 CDN**（现状：Sealos + 后端代理 + 内容哈希永久缓存） | 已含在 Sealos 成本内，无额外费用 | 够用（51 张图、流量小、有 immutable 缓存） | 否 | ✅ **当前体量最划算** |
| 腾讯云 / 阿里云 CDN | 流量费（本体量约几毛~几块/月）+ HTTPS 300 万次/月免费 | **最佳**（国内节点） | **需备案** | ✅ 未来流量增长时首选 |
| Cloudflare 免费版 | $0 | 一般（境外节点，200~400ms） | 否 | ⚠️ 仅适合海外为主流量 |

**选型建议**：
- **以本项目现在的体量，最划算的是"暂不上 CDN"**——现有后端图片代理 + 内容哈希永久缓存已能扛住，上线初期无需额外投入。
- 若未来国内流量增长、要降后端代理压力：优先**国内 CDN（腾讯云/阿里云）**，费用极低但需域名备案，且天然适配路线 A（挂现有代理域名回源）。
- **Cloudflare 免费版**只在"海外用户为主"或"临时验证链路（用其提供的加速域名）"时考虑，不作为国内小程序的主力方案。

---

## 4. 关键注意点（上 CDN 前必须知道，读代码得出）

1. **两条 URL 出口不要混淆**：
   - 项目**对外**图片 URL 由 `utils/ImageUrlHelper.getImageUrl()` 生成，走 `PUBLIC_BASE_URL + /api/v4/images/`（后端代理）。
   - `SealosStorageService.getPublicUrl()`（带 `CDN_DOMAIN` 逻辑）生成的是**对象存储直连 URL**，当前仅被 chat/exchange 等少数处直接调用，DIY/媒体主链路不用它。
   - **上 CDN 改哪个出口决定路线**：路线 A 改 `ImageUrlHelper` 的 base（或 CDN 挂在该域名前，代码都不用改）；路线 B 要改 `ImageUrlHelper` 让它直出对象存储/CDN key。

2. **内容哈希 = 天然缓存失效机制**：`?h={content_hash前8位}`，文件内容变→hash 变→URL 变→客户端与 CDN 自动取新图，**无需手动 purge CDN**。这是本项目上 CDN 最大的便利，务必保留。

3. **衍生图也走同一套 URL**：`w375/w750/w1080` 的 key 同样经 `getImageUrl` 输出、同样带 `?h=`，CDN 一并加速，无需单独配置。

4. **图片代理已剥离安全响应头**：`routes/v4/images.js` 主动 `removeHeader` 了 CSP/COOP/CORP 等，并设 `Access-Control-Allow-Origin: *`。路线 A 下 CDN 透传即可；路线 B 要确认对象存储响应头满足跨域渲染。

5. **回源鉴权**：当前 `/api/v4/images/*` 是公开无认证接口（图片本就 public-read），CDN 回源无需带 token，简单。

---

## 5. 推荐执行步骤（路线 A，按性价比排序）

1. **准备域名**：备一个可配 CDN 的域名（国内 CDN 需备案）。若暂无备案域名，可先用 CDN 服务商提供的临时加速域名验证链路。
2. **配置 CDN**：加速域名回源到 `omqktqrtntnn.sealosbja.site`，回源协议 HTTPS，只加速 `/api/v4/images/*`（其余 API 不加速，避免误缓存动态接口）。
3. **缓存规则**：遵循源站响应头（后端已下发 `immutable, max-age=1年`）；或按 query 命中（保留 `?h=`/`?v=` 参与缓存键）。
4. **切 URL**：`.env` 新增 `IMAGE_CDN_BASE_URL=https://cdn.你的域名`，`ImageUrlHelper` 优先取它、回退 `PUBLIC_BASE_URL`（这样 API 域名与图片 CDN 域名解耦，改动最小且可灰度）。
5. **小程序白名单**：微信小程序后台把 CDN 域名加入 `downloadFile`/`<image>` 合法域名。
6. **验证**：抽查 DIY 素材图/模板底图/衍生图三类 URL 走 CDN 返回 200 + `inline` + 命中缓存（`X-Cache: HIT`），小程序渲染正常。
7. **灰度回滚**：`IMAGE_CDN_BASE_URL` 留空即回退后端代理域名，随时可关。

> 若选路线 A 且用同一域名挂 CDN（不换域名），第 4~5 步可省，纯 CDN 侧配置，**零代码改动**。

---

## 6. 三方问题归属（谁的问题谁改）

- **后端数据库项目**：路线 A 下**零代码改动**（或仅 `ImageUrlHelper` 增加 `IMAGE_CDN_BASE_URL` 优先取值，1 处小改）；路线 B 下改 `ImageUrlHelper` 出口 + 确认对象存储响应头。图片链路（对象存储/衍生图/内容哈希/代理）本身无缺陷，无需重构。
- **Web 管理后台前端**：**无改动**。上传走 `image-upload.js` → 后端媒体 API，拿回的是 `public_url`/`thumbnails`，URL 由后端生成，CDN 切换对前端透明。
- **微信小程序前端**：**无代码改动**（仍消费后端下发的 `image_media.public_url` / `thumbnails`）；仅需在微信后台把 CDN 域名加入合法域名白名单（若换域名）。
- **运维/你**：CDN 服务商选型、域名备案、CDN 侧回源与缓存规则配置。

---

## 7. 需要你拍板的事项

| # | 决策点 | 选项 | 建议 |
|---|---|---|---|
| 1 | **是否现在上 CDN** | 上 / 暂不上（现有后端代理 + 内容哈希缓存已够小体量） | 当前仅 51 张图约 9.4MB、流量小，**功能上暂不上 CDN 也完全能跑**；上 CDN 主要为未来流量增长与降后端压力提前布局。可按上线节奏决定 |
| 2 | **走哪条路线** | A（挂现有代理域名，推荐）/ B（直连对象存储）/ C（第三方，不推荐） | **A**：零/极小改动、保留现有约束、内容哈希免 purge |
| 3 | **是否换独立图片域名** | 复用现域名挂 CDN（零代码）/ 新增 `IMAGE_CDN_BASE_URL` 独立域名（API 与图片解耦、可灰度） | 若已有备案域名，建议**独立图片域名**，便于灰度与流量隔离 |
| 4 | **CDN 服务商** | 腾讯云/阿里云（国内需备案，付费但本体量约几毛~几块/月）/ Cloudflare 免费版（$0，境外节点国内 200~400ms）/ 暂不选（先不上） | 用户主要在国内（小程序）→ **国内 CDN 体验最佳**但需域名备案；Cloudflare 免费版仅适合海外为主流量。费用与免费额度详见 3.5 |
| 5 | **缓存 TTL 与刷新策略** | 遵循源站 immutable（推荐）/ 自定义 TTL | **遵循源站**：后端已下发 immutable + 内容哈希，天然免手动刷新 |

---

## 7.5 前置条件：域名 / 备案 / SSL 费用与购买（2026-07-15 核实）

> 背景：上 CDN（除 Cloudflare 免费版外的国内 CDN）都需要**自有域名**。经确认**本项目当前无自有域名**，当前对外用的是 Sealos 分配的 `omqktqrtntnn.sealosbja.site`（NS 不在自己手上，无法接入 CDN，但已自带 HTTPS）。本节把"若要自购域名"的费用与入口讲清，供决策。

### 7.5.1 三项费用清单

| 项目 | 费用 | 说明 |
|---|---|---|
| 域名 | **约 33~90 元/年**（看后缀） | 唯一硬性支出。见 7.5.2 价格表 |
| 备案 | **0 元** | 工信部与云厂商均不收费；前提是已在该云厂商买了服务器/云资源；耗时 **7~20 个工作日**，需实名+拍照+审核 |
| SSL 证书 | **0 元** | 免费 SSL（Let's Encrypt / 云厂商免费版 / Cloudflare）加密强度与付费版相同，自动续期；付费 OV/EV 证书（几千~上万/年）仅银行/大企业需要 |

> 合计：真正花钱的只有**域名（约几十元/年）**；备案、SSL 均可 0 元。若上国内 CDN 再加流量费（本体量约几毛~几块/月）。

### 7.5.2 概念澄清：域名 vs SSL 证书

- **域名** = 门牌地址（别人怎么找到你），本质是给 IP 起的好记名字，需按年租。解决"**找得到**"。
- **SSL 证书** = 身份证 + 加密对讲机（证明地址是你的 + 通信不被偷看），颁发给具体域名，有它才是 `https://`。解决"**安全**"。
- **依赖关系**：先有域名，才能给该域名签 SSL。顺序：租域名 → 指向服务器 → 申请 SSL → 站点变 https。
- 本项目现状：Sealos 域名**已自带 HTTPS**，图片访问本就是加密安全的，域名/SSL 当前都无需操心。

### 7.5.3 腾讯云域名购买入口与价格

**购买入口**：腾讯云域名注册（由旗下 DNSPod 承接）`https://dnspod.cloud.tencent.com/`，或腾讯云控制台搜"域名注册"，用已有腾讯云账号登录即可。

**价格（2026 年，以官网实时为准）**：

| 后缀 | 首年注册 | 续费/年 | 备注 |
|---|---|---|---|
| **.com** | 个人新用户约 33 元；企业新用户常有 1 元首年活动 | 约 **85~90 元** | 最通用，**推荐** |
| **.cn** | 新用户约 8.8~33 元 | 约 **38 元** | 国内后缀，最便宜 |
| **.net** | 约 90 元 | 约 95 元 | 一般用不上 |

**⚠️ 购买两个坑**：
1. **看续费价、别只看首年**："1 元首年"是营销价，第二年按原价续（.com 约 85 元/年）。长期用按续费价预算。
2. **必须实名认证**：国内域名注册后要求上传身份证实名，否则被暂停解析（几分钟的事，但必做）。

> 建议：若确要买，选 **.com**（最通用），按 **约 85 元/年**（续费价）预算。但**当前非必须买**——无自有域名也能正常跑，买域名的唯一理由是想上国内 CDN 或要品牌网址。

### 7.5.4 本项目决议（2026-07-15）

**当前无自有域名 → 结论：维持现状，暂不上 CDN。** 现有 Sealos 对象存储 + 后端图片代理 + 内容哈希永久缓存 + 预生成衍生图链路已满足需求，图片体量小（51 张/9.4MB），加 CDN 收益微小。待未来"图片流量增长 / 用户反馈图片慢 / 需品牌域名"任一触发，再自购域名（约 85 元/年）+ 免费备案 + 免费 SSL + 国内 CDN，且届时多半已需备案可一并办理。

---

## 8. 可复用 / 可扩展盘点（基于现有技术栈）

**可复用（零新增）**：
- `SealosStorageService`（含 `CDN_DOMAIN` 预留位、内网优先+公网回退、`uploadImageWithThumbnails` 预生成衍生图）
- `MediaService`（去重/关联/回收站/引用完整性校验/存量批量优化 `batchOptimize`）
- `ImageUrlHelper`（内容哈希缓存、衍生图 URL、占位图降级）
- `routes/v4/images.js`（inline 代理 + 304 协商 + 剥离安全头）
- `admin` 图片上传 mixin（`image-upload.js`），CDN 切换对它透明

**可扩展（无需改表）**：
- `IMAGE_CDN_BASE_URL` 环境变量（新增即可让 `ImageUrlHelper` 优先输出 CDN 域名，API 与图片域名解耦）
- 衍生图档位可按需增减（`DERIVATIVE_WIDTH_TIERS` 常量），CDN 无感
- 内容哈希缓存机制对任意新增图片类型自动生效

**符合性总结**：上 CDN 完全在后端现有 Express + Sequelize + Sealos(S3) + sharp 技术栈内完成，不引入任何新框架/新服务，路线 A 下几乎零代码改动，是长期维护成本最低的路径。
