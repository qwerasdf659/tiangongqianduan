# 微信小程序导航栏沉浸式方案指南

## 背景

微信小程序在 `navigationStyle: "custom"` 模式下，系统状态栏和微信胶囊按钮（右上角 `···` `○`）是**强制存在的**，无法移除。开发者只能控制这块区域下方的内容和背景色。

本项目使用 Skyline 渲染模式，所有页面均设置 `navigationStyle: "custom"`，通过 `custom-navbar` 组件统一处理导航栏。

---

## 系统强制占用区域

```
┌─────────────────────────────────────┐
│  状态栏（时间/信号/电量）           │ ← 系统强制，不可移除
├─────────────────────────────────────┤
│  胶囊按钮区域（··· ○）             │ ← 微信强制，不可移除
├─────────────────────────────────────┤
│                                     │
│  页面内容区域（开发者可控）         │
│                                     │
└─────────────────────────────────────┘
```

- **状态栏高度**：通过 `wx.getWindowInfo().statusBarHeight` 获取（通常 20-44px）
- **胶囊按钮**：通过 `wx.getMenuButtonBoundingClientRect()` 获取位置和尺寸
- **安全区域总高度** = statusBarHeight + navBarHeight（胶囊上下间距对齐）

---

## 三种视觉方案对比

### 方案 A：保留标题栏（默认）

```
┌─────────────────────────────────────┐
│  状态栏                             │ bgColor
├─────────────────────────────────────┤
│  ←  标题文字          [··· ○]       │ bgColor
├─────────────────────────────────────┤
│  页面内容                           │ 页面背景色
└─────────────────────────────────────┘
```

**实现方式**：使用 `custom-navbar` 组件

```xml
<custom-navbar title="页面标题" bgColor="#F5F0E8" textColor="#4A3728" />
```

**适用场景**：功能性子页面（审核列表、消费录入、设置页等），需要返回按钮和标题帮助用户导航。

---

### 方案 B：去掉标题，背景色统一（当前抽奖页）

```
┌─────────────────────────────────────┐
│  状态栏                             │
├─────────────────────────────────────┤ 同色背景，无标题
│              [··· ○]                │ 视觉一体化
├─────────────────────────────────────┤
│  页面内容                           │
└─────────────────────────────────────┘
```

**实现方式**：

1. 移除 `<custom-navbar />`
2. 页面 scss 中设置 `page` 背景色与内容区一致
3. 内容区通过 `padding-top` 避让胶囊按钮

```scss
page {
  background-color: var(--tg-color-bg-accent-soft); // #F5F0E8
}

.header {
  padding-top: calc(env(safe-area-inset-top, 20px) + 88rpx);
}
```

**适用场景**：Tab 首页、不需要标题的主页面。

---

### 方案 C：内容/图片延伸到顶部（蜜雪冰城/霸王茶姬风格）

```
┌─────────────────────────────────────┐
│  状态栏（叠在图片上）               │
├─────────────────────────────────────┤ 图片/内容铺满
│  图片内容        [··· ○]            │ 从 0px 开始
├─────────────────────────────────────┤
│  其他页面内容                       │
└─────────────────────────────────────┘
```

**实现方式**：

1. 移除 `<custom-navbar />`
2. 容器不设 `padding-top`，让轮播图/大图从顶部开始
3. 图片下方的文字内容仍需避让胶囊

```scss
page {
  background-color: var(--tg-color-bg-accent-soft);
}

.container {
  padding: 0;
}

// 顶部轮播图 — 从 0 开始，铺满状态栏区域
.top-banner {
  width: 100%;
  height: calc(env(safe-area-inset-top, 20px) + 88rpx + 320rpx);
  padding-top: 0;
}

// 轮播图下方的内容 — 正常布局，无需额外 padding
.content-below-banner {
  padding: 0 20rpx;
}
```

**适用场景**：首页有大图/轮播图的场景，图片被状态栏遮挡一部分不影响阅读。

---

## 当前项目抽奖页改动记录

| 文件 | 改动 |
|------|------|
| `pages/lottery/lottery.wxml` | 移除 `<custom-navbar>` 组件 |
| `pages/lottery/lottery.scss` | 添加 `page { background-color }` 统一底色 |
| `pages/lottery/lottery.scss` | `.header` 添加 `padding-top` 避让胶囊 |
| `pages/lottery/lottery.scss` | `.header` 的 `overflow: hidden` 改为 `visible` |
| `components/custom-navbar/custom-navbar.wxml` | 占位块去掉独立背景色 |

---

## 注意事项

1. **胶囊按钮不可隐藏** — 这是微信的硬性规定，任何小程序都无法移除
2. **状态栏高度因机型而异** — iPhone 刘海屏约 44px，普通安卓约 20-24px，必须动态获取
3. **`env(safe-area-inset-top)` 兼容性** — Skyline 模式下支持良好，WebView 模式需要 iOS 11.2+ / 微信 7.0+
4. **其他页面保留 `custom-navbar`** — 子页面需要返回按钮和标题，不建议全部去掉
5. **`navigationStyle: "custom"` 必须保留** — Skyline 模式下这是必需配置，去掉会导致页面异常

---

## 参考

- [微信官方文档 - 自定义导航栏](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/page.html#navigationStyle)
- [微信官方文档 - getMenuButtonBoundingClientRect](https://developers.weixin.qq.com/miniprogram/dev/api/ui/menu/wx.getMenuButtonBoundingClientRect.html)
- [微信官方文档 - Skyline 渲染引擎](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html)
