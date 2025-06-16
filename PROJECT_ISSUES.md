# 项目问题及待办事项

## 🚨 紧急问题

### 1. 缺少图标资源
- **问题**: tabBar配置了图标路径，但缺少实际的图标文件
- **影响**: 小程序无法正常显示底部导航
- **解决方案**: 需要在 `images/` 目录下添加以下图标文件：
  ```
  images/lottery.png
  images/lottery-active.png
  images/exchange.png
  images/exchange-active.png
  images/camera.png
  images/camera-active.png
  images/user.png
  images/user-active.png
  images/merchant.png
  images/merchant-active.png
  ```

### 2. 后端服务地址未配置
- **问题**: 所有API地址都是占位符
- **影响**: 无法连接实际后端服务
- **当前占位符**:
  - `https://your-backend-api.com`
  - `wss://your-websocket-server.com`
  - `https://your-sealos-endpoint.com`

## ⚠️ 开发问题

### 3. 认证流程不完整
- 当前跳过了认证检查 (`needAuth: false`)
- Token刷新机制未完全实现
- 开发环境使用模拟用户数据

### 4. 大量TODO项目未完成
搜索到 **25+** 个TODO标记，包括：
- 所有API接口对接
- 文件上传功能
- 用户认证流程
- 数据持久化
- 错误处理优化

## 📝 待办事项清单

### 高优先级
- [ ] 添加tabBar图标资源
- [ ] 配置实际的后端API地址
- [ ] 完成用户认证流程
- [ ] 实现Token管理机制

### 中优先级
- [ ] 对接所有后端API
- [ ] 完善错误处理
- [ ] 添加数据验证
- [ ] 优化用户体验

### 低优先级
- [ ] 移除开发调试代码
- [ ] 清理TODO注释
- [ ] 添加单元测试
- [ ] 性能优化

## 🛠️ 建议的修复顺序

1. **立即修复**: 添加图标资源文件
2. **配置环境**: 设置正确的API地址
3. **完善认证**: 实现完整的登录流程
4. **API对接**: 逐个对接后端接口
5. **测试验证**: 全面测试功能
6. **代码清理**: 移除TODO和调试代码

## 💡 改进建议

1. **使用环境配置文件** (已创建 `config/env.js`)
2. **统一错误处理机制**
3. **添加日志记录**
4. **实现离线缓存**
5. **优化用户界面**

## 📊 项目状态

- **完成度**: ~70%
- **主要功能**: 界面完成，逻辑待完善
- **部署状态**: 开发阶段
- **测试状态**: 未测试 