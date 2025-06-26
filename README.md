# 餐厅积分抽奖系统

> 基于微信小程序的餐厅积分抽奖系统，集成抽奖、商品兑换、拍照上传、商家管理等完整功能
//kk//
## 📖 项目介绍

餐厅积分抽奖系统是一个为餐厅行业打造的数字化营销工具，通过游戏化的积分抽奖机制，提升用户粘性和复购率。系统包含用户端、商家端和管理端的完整功能模块。

## 🚀 核心功能

### 用户端功能
- **🎰 积分抽奖**: 转盘抽奖系统，支持单抽/三连抽/五连抽/十连抽
- **🛍️ 商品兑换**: 丰富的商品库，支持筛选、排序、实时库存显示
- **📸 拍照上传**: 小票拍照上传，AI智能识别消费金额
- **👤 个人中心**: 积分余额、兑换记录、抽奖历史等

### 商家端功能
- **👨‍💼 商家权限**: 权限申请和审核管理
- **📋 审核管理**: 小票审核、批量处理、数据统计
- **📦 商品管理**: 商品CRUD、库存管理、状态控制

### 管理端功能
- **📊 数据统计**: 用户数据、抽奖数据、兑换数据分析
- **⚙️ 系统配置**: 抽奖概率、积分规则、商品管理
- **🔐 权限管理**: 用户权限、商家权限控制

## 🛠️ 技术栈

### 前端技术
- **框架**: 微信小程序原生开发
- **UI组件**: Vant Weapp v1.10.8
- **动画**: Canvas 2D API
- **状态管理**: 微信小程序 globalData
- **网络通信**: wx.request + WebSocket
- **本地存储**: wx.storage

### 后端技术（对接中）
- **框架**: Node.js + Express / Spring Boot
- **数据库**: MySQL 8.0+
- **缓存**: Redis 6.0+
- **存储**: Sealos 对象存储
- **认证**: JWT + Refresh Token
- **实时通信**: WebSocket

## 📁 项目结构

```
tiangongqianduan/
├── app.js                 # 小程序入口文件
├── app.json               # 小程序配置文件
├── app.wxss               # 全局样式文件
├── pages/                 # 页面目录
│   ├── lottery/           # 抽奖页面
│   ├── exchange/          # 兑换页面
│   ├── photo/             # 拍照上传页面
│   ├── merchant/          # 商家管理页面
│   ├── profile/           # 个人中心页面
│   └── ...
├── components/            # 自定义组件
├── utils/                 # 工具函数
├── config/                # 配置文件
├── images/                # 图片资源
└── docs/                  # 项目文档
    ├── 开发总文档1号.md
    └── 前端1号.md
```

## 🔧 开发环境配置

### 1. 环境要求
- 微信开发者工具 >= 1.06.0
- 微信小程序基础库 >= 2.15.0
- Node.js >= 16.0.0 (后端开发)

### 2. 本地开发
```bash
# 克隆项目
git clone https://github.com/qwerasdf659/tiangongqianduan.git

# 进入项目目录
cd tiangongqianduan

# 打开微信开发者工具，导入项目
# 配置 AppID 和基础库版本
```

### 3. 环境配置
```javascript
// app.js 开发环境配置
globalData: {
  isDev: true,              // 开发模式
  needAuth: false,          // 跳过认证
  baseUrl: 'dev-api-url',   // 开发环境API
  wsUrl: 'dev-ws-url'       // 开发环境WebSocket
}
```

## 📋 部署指南

### 生产环境配置
```javascript
// app.js 生产环境配置
globalData: {
  isDev: false,             // 关闭开发模式
  needAuth: true,           // 启用认证
  baseUrl: 'prod-api-url',  // 生产环境API
  wsUrl: 'prod-ws-url'      // 生产环境WebSocket
}
```

### 部署检查清单
- [ ] 修改 `isDev: false`
- [ ] 启用 `needAuth: true`
- [ ] 配置生产环境API地址
- [ ] 配置Sealos存储密钥
- [ ] 移除所有Mock数据和调试代码
- [ ] 测试所有核心功能

## 🔌 API接口对接

### 认证接口
```javascript
POST /api/auth/login        // 用户登录
POST /api/auth/refresh      // Token刷新
```

### 抽奖接口
```javascript
GET /api/lottery/config     // 获取抽奖配置
POST /api/lottery/draw      // 执行抽奖
```

### 兑换接口
```javascript
GET /api/exchange/products  // 商品列表
POST /api/exchange/redeem   // 商品兑换
```

### 上传接口
```javascript
POST /api/photo/upload      // 图片上传
GET /api/photo/records      // 上传记录
```

### WebSocket消息
```javascript
// 库存变更推送
{
  "type": "stock_update",
  "data": {
    "product_id": 1,
    "stock": 15
  }
}

// 积分变更推送
{
  "type": "points_update", 
  "data": {
    "user_id": 123,
    "total_points": 1500,
    "change_points": 100
  }
}
```

## 📊 性能指标

- **页面加载时间**: < 2秒
- **Canvas动画帧率**: ≥ 30fps
- **API响应时间**: < 500ms
- **错误率**: < 1%
- **WebSocket连接成功率**: > 95%

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 MIT 协议 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

- 项目负责人: [联系邮箱]
- 技术支持: [技术支持邮箱]
- 项目地址: https://github.com/qwerasdf659/tiangongqianduan

## 📝 更新日志

### v1.0.0 (2024-12-19)
- ✅ 完成基础功能开发
- ✅ 实现抽奖、兑换、上传、商家管理等核心模块
- ✅ 完善前后端对接规范
- ✅ 添加项目文档和部署指南

---

> **⚠️ 注意**: 本项目前端功能已基本完成，目前处于后端对接阶段。使用前请确保后端服务已部署并配置相应的API接口。 