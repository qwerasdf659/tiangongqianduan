# TabBar 图标制作指导

## 需要制作的图标

根据 app.json 配置，需要制作以下图标文件：

### 1. 抽奖页面图标
- **普通状态**: `images/lottery.png`
- **选中状态**: `images/lottery-active.png`
- **图标含义**: 转盘、老虎机或骰子等抽奖相关图标

### 2. 兑换页面图标  
- **普通状态**: `images/exchange.png`
- **选中状态**: `images/exchange-active.png`
- **图标含义**: 礼品盒、购物袋或兑换箭头等

### 3. 拍照页面图标
- **普通状态**: `images/camera.png`
- **选中状态**: `images/camera-active.png`  
- **图标含义**: 相机、拍照或上传图标

### 4. 用户页面图标
- **普通状态**: `images/user.png`
- **选中状态**: `images/user-active.png`
- **图标含义**: 用户头像或人形图标

### 5. 商家页面图标
- **普通状态**: `images/merchant.png`
- **选中状态**: `images/merchant-active.png`
- **图标含义**: 商店、管理或商家图标

## 图标规格要求

### 尺寸规范
- **标准尺寸**: 81x81 像素
- **高清尺寸**: 162x162 像素（推荐）
- **格式**: PNG 格式，支持透明背景
- **文件大小**: 每个图标 < 40KB

### 颜色规范
- **普通状态**: #999999 (灰色)
- **选中状态**: #FF6B35 (橙色)
- **背景**: 透明

### 设计风格
- **风格**: 简洁扁平化设计
- **线条**: 清晰可辨，适合小尺寸显示
- **对比度**: 确保在不同背景下都清晰可见

## 制作工具推荐

1. **在线工具**: 
   - Canva (https://www.canva.com)
   - Figma (https://www.figma.com)
   - IconFont (https://www.iconfont.cn)

2. **设计软件**:
   - Adobe Illustrator
   - Sketch
   - Adobe Photoshop

## 临时解决方案

如果暂时无法制作图标，可以使用以下方案：
1. 使用 Emoji 字符代替图标
2. 使用在线占位图服务
3. 从免费图标库下载相似图标

## 文件存放位置

创建 `images` 文件夹在项目根目录下：
```
/project-root
  /images
    lottery.png
    lottery-active.png
    exchange.png
    exchange-active.png
    camera.png
    camera-active.png
    user.png
    user-active.png
    merchant.png
    merchant-active.png
``` 