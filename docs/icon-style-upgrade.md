# 图标风格升级方案 — 霸王茶姬风 vs 当前方案对比

## 当前状态

抽奖页面图标已从自建 iconfont 切换为 TDesign 官方图标（`t-icon` 组件），配色使用项目品牌金色 `#C8A06A`。

### 当前方案特点
- TDesign 标准填充式图标
- 金色品牌配色
- 积分图标有圆形金色渐变背景
- 风格：现代简约、干净利落

---

## 霸王茶姬风格特征

| 维度 | 霸王茶姬 | 当前方案 |
|------|----------|----------|
| 图标风格 | 中国风纹样细节、装饰感强 | TDesign 标准填充图标 |
| 配色 | 金色+深棕渐变、烫金质感 | 单色金色 `#C8A06A` |
| 光影 | 带光泽高光、内阴影 | 简单投影 |
| 按钮 | 中国风纹理底纹、圆润饱满 | 纯色渐变胶囊 |
| 整体感受 | 精致、奢华、东方美学 | 简洁、现代、通用 |

---

## 如果要做霸王茶姬风格，需要调整的内容

### 1. 图标加金色渐变 + 阴影质感

给 `t-icon` 组件外层包裹渐变容器，通过 CSS 实现烫金效果：

```scss
// 烫金图标效果
.icon-golden {
  background: linear-gradient(135deg, #F5E6C8 0%, #C8A06A 40%, #8B6914 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 2rpx 4rpx rgba(139, 105, 20, 0.4));
}
```

### 2. 按钮/胶囊加中国风纹理底纹

在按钮背景上叠加半透明纹理图案（祥云、回纹等）：

```scss
// 中国风按钮
.btn-chinese-style {
  background: linear-gradient(135deg, #C8A06A, #8B6914);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/images/pattern-cloud.png') repeat;
    opacity: 0.08;
  }
}
```

### 3. 整体配色更浓郁

```scss
// 霸王茶姬色系 Token
--bwcj-gold-light: #F5E6C8;      // 浅金（高光）
--bwcj-gold: #C8A06A;            // 主金色
--bwcj-gold-dark: #8B6914;       // 深金（阴影）
--bwcj-brown: #5C3D1E;           // 深棕（文字/边框）
--bwcj-cream: #FDF8F0;           // 奶油白（背景）
--bwcj-red-accent: #8B2500;      // 中国红点缀
```

---

## 决策点

| 选项 | 工作量 | 效果 |
|------|--------|------|
| A. 保持当前 TDesign 图标 + 金色配色 | 已完成 | 简洁现代，与 tab 栏统一 |
| B. 在当前基础上加渐变/阴影质感 | 约 2 小时 | 更精致，有品质感提升 |
| C. 全面霸王茶姬风格改造 | 约 1-2 天 | 整体 UI 风格大改，需要纹理素材 |

---

## 备注

- 选项 B 和 C 属于整体 UI 风格调整，不仅仅是图标的事
- 霸王茶姬风格需要额外的纹理图片素材（祥云、回纹等）
- 建议先确认选项 A 的效果是否满意，再决定是否继续深入
