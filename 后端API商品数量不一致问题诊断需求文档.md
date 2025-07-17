# 后端API商品数量不一致问题诊断需求文档

## 🚨 问题描述

**报告时间**：2025年01月12日  
**问题类型**：后端API数据不一致  
**影响范围**：用户商品兑换功能  
**严重级别**：中等（影响用户体验）

### 问题现象
- **管理员后台**：显示3个商品（账号：13612227930）
- **用户界面**：只显示2个商品（同一账号）
- **前端状态**：✅ 正常（API请求成功，数据处理正确）

### 涉及接口
- **用户商品接口**：`GET /api/exchange/products`
- **管理员商品接口**：`GET /api/merchant/products`

## 📊 前端调试信息

**API响应数据确认**：
```javascript
// 前端实际收到的数据
{
  code: 0,
  data: {
    products: [
      { name: "玉石2", exchange_points: 500, ... },
      { name: "玉石3", exchange_points: 500, ... }
    ],
    total: 2  // 只有2个商品
  }
}
```

**前端请求参数**：
```javascript
GET /api/exchange/products?page=1&page_size=20&category=all&sort=points
Headers: {
  'Authorization': 'Bearer <13612227930的Token>'
}
```

## 🔍 需要后端开发人员提供的诊断信息

### 1. 数据库直接查询验证
请执行以下SQL并提供结果：

```sql
-- 1.1 验证管理员后台看到的3个商品
SELECT 
  commodity_id, name, category, status, exchange_points, stock,
  created_at, updated_at
FROM products 
ORDER BY commodity_id;

-- 1.2 验证哪些商品是active状态
SELECT 
  commodity_id, name, status, exchange_points, stock
FROM products 
WHERE status = 'active'
ORDER BY commodity_id;

-- 1.3 检查是否有其他状态的商品
SELECT 
  status, COUNT(*) as count
FROM products 
GROUP BY status;
```

### 2. API执行的实际SQL语句对比

**请提供两个接口实际执行的SQL语句**：

```sql
-- 2.1 用户商品接口 GET /api/exchange/products 执行的SQL
-- 预期：只查询active状态商品
-- 实际执行的SQL是什么？

-- 2.2 管理员商品接口 GET /api/merchant/products 执行的SQL  
-- 预期：查询所有状态商品
-- 实际执行的SQL是什么？
```

### 3. JWT Token解析验证

**使用管理员Token（13612227930）进行测试**：

```javascript
// 3.1 Token解析后的用户信息
{
  user_id: ?,
  mobile: "13612227930", 
  is_admin: ?, // 这个值是什么？
  // ... 其他字段
}

// 3.2 权限验证结果
// 该用户是否通过了权限验证？
// 是否有额外的查询条件被添加？
```

### 4. API控制器代码审查

**请检查 `/api/exchange/products` 接口的控制器代码**：

```javascript
// 4.1 查询条件检查
// 是否只查询 status = 'active' 的商品？
// 是否有其他隐含的过滤条件？

// 4.2 权限相关过滤
// 是否根据用户权限添加了额外的WHERE条件？
// 管理员用户和普通用户的查询条件是否相同？

// 4.3 分页逻辑检查
// 分页参数是否正确处理？
// LIMIT和OFFSET是否正确计算？
```

### 5. API日志分析

**请提供以下日志信息**：

```bash
# 5.1 API请求日志
# 时间：[刚才的请求时间]
# 接口：GET /api/exchange/products
# 参数：page=1&page_size=20&category=all&sort=points
# 用户：13612227930

# 5.2 SQL执行日志
# 该请求实际执行的SQL语句
# SQL执行结果的行数

# 5.3 错误或警告日志
# 是否有任何错误或警告信息？
```

### 6. 商品状态检查

**请逐个检查3个商品的状态**：

```sql
-- 6.1 详细商品信息
SELECT 
  commodity_id,
  name,
  status,
  exchange_points,
  stock,
  category,
  is_hot,
  sort_order,
  created_at,
  updated_at
FROM products 
ORDER BY commodity_id;

-- 6.2 检查是否有软删除字段
-- 表结构中是否有 deleted_at 或 is_deleted 字段？
DESCRIBE products;
```

## 🎯 重点排查方向

### 方向1：商品状态过滤问题
- **假设**：3个商品中有1个不是`active`状态
- **验证**：检查所有商品的status字段值
- **期望结果**：找到状态不是`active`的商品

### 方向2：权限过滤问题  
- **假设**：管理员用户访问用户接口时有特殊过滤逻辑
- **验证**：比较管理员和普通用户的查询条件
- **期望结果**：发现权限相关的额外WHERE条件

### 方向3：软删除机制问题
- **假设**：存在软删除字段，用户接口过滤了软删除商品
- **验证**：检查表结构和查询条件
- **期望结果**：发现软删除相关字段

### 方向4：数据库事务问题
- **假设**：数据库读写分离或事务隔离导致数据不一致
- **验证**：检查数据库连接和事务设置
- **期望结果**：发现数据一致性问题

## 📋 诊断检查清单

**请按以下顺序进行检查并提供结果**：

- [ ] 1. 执行SQL直接查询，确认数据库中实际有几个商品
- [ ] 2. 检查每个商品的status字段值
- [ ] 3. 对比两个API接口的实际SQL执行语句
- [ ] 4. 检查JWT Token解析和权限验证逻辑
- [ ] 5. 审查exchange/products接口的控制器代码
- [ ] 6. 提供相关API请求和SQL执行日志
- [ ] 7. 确认是否存在软删除或其他隐藏字段

## 🚨 预期结果

**完成诊断后，应该能够确定**：
1. 数据库中实际有几个商品，各自的状态是什么
2. 用户商品接口为什么只返回2个商品
3. 是状态过滤、权限过滤还是其他原因导致的数据不一致
4. 如何修复这个问题

## 📞 反馈方式

**请将诊断结果整理后反馈，包括**：
- 每个检查项的结果
- 发现的具体问题
- 建议的修复方案
- 是否需要前端配合修改

---

**文档创建时间**：2025年01月12日  
**创建人**：前端开发团队  
**使用模型**：Claude Sonnet 4 