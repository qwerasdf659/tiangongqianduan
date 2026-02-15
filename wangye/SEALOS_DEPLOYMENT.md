# Sealos部署指南 - 数字显示网站

## 📖 项目概述

本项目是一个简单的静态网站，显示大写的数字1、2、3，通过Sealos云原生平台部署到网络上。

## 🛠️ 技术栈

- **前端**: HTML5 + CSS3
- **服务器**: Nginx (Alpine版本)
- **容器化**: Docker
- **编排平台**: Kubernetes + Sealos
- **部署方式**: 云原生容器化部署

## 📋 部署前准备

### 1. 环境要求

- ✅ 已安装并配置好的Sealos集群
- ✅ 具有kubectl访问权限
- ✅ Docker环境（用于构建镜像，可选）
- ✅ 网络连接正常

### 2. 文件结构

```
wangye/
├── index.html              # 主页面文件
├── Dockerfile             # Docker镜像构建文件
├── k8s-deployment.yaml    # 标准Kubernetes部署配置
├── sealos-app.yaml        # Sealos优化配置文件
└── SEALOS_DEPLOYMENT.md   # 本部署指南
```

## 🚀 部署步骤

### 方案一：使用Sealos应用管理界面（推荐）

#### 步骤1：登录Sealos控制台

1. 打开Sealos控制台：`https://your-sealos-domain.com`
2. 使用您的账户登录

#### 步骤2：进入应用管理

1. 在Sealos桌面点击"应用管理"
2. 选择"创建新应用"

#### 步骤3：使用YAML配置部署

1. 选择"YAML部署"方式
2. 将`sealos-app.yaml`文件内容复制粘贴到配置框中
3. 点击"部署应用"按钮

#### 步骤4：等待部署完成

1. 系统会自动创建以下资源：
   - ConfigMap（HTML内容和Nginx配置）
   - Deployment（应用部署）
   - Service（服务暴露）
   - App（Sealos应用入口）

#### 步骤5：访问应用

1. 部署完成后，在应用列表中找到"数字显示网站"
2. 点击应用图标即可访问
3. 或者通过外部URL访问（如果配置了Ingress）

### 方案二：使用kubectl命令行部署

#### 步骤1：连接到Sealos集群

```bash
# 确保kubectl已正确配置
kubectl cluster-info

# 检查节点状态
kubectl get nodes
```

#### 步骤2：部署应用资源

```bash
# 部署所有资源
kubectl apply -f sealos-app.yaml

# 验证部署状态
kubectl get deployments
kubectl get services
kubectl get pods
```

#### 步骤3：检查部署状态

```bash
# 查看Pod运行状态
kubectl get pods -l app=numbers-website

# 查看Service状态
kubectl get svc numbers-website-service

# 查看详细日志
kubectl logs -l app=numbers-website
```

#### 步骤4：访问应用

```bash
# 获取Service外部IP
kubectl get svc numbers-website-service

# 如果是LoadBalancer类型，等待外部IP分配
# 如果是NodePort类型，使用节点IP + 端口访问
```

### 方案三：使用Docker镜像部署（高级用户）

#### 步骤1：构建Docker镜像

```bash
# 构建镜像
docker build -t numbers-website:latest .

# 查看构建结果
docker images | grep numbers-website
```

#### 步骤2：推送到镜像仓库

```bash
# 标记镜像（替换为您的仓库地址）
docker tag numbers-website:latest your-registry/numbers-website:latest

# 推送镜像
docker push your-registry/numbers-website:latest
```

#### 步骤3：更新部署配置

1. 修改`sealos-app.yaml`中的镜像地址
2. 将`image: nginx:alpine`替换为`image: your-registry/numbers-website:latest`
3. 重新部署应用

## 🔧 配置说明

### 资源配置

- **CPU限制**: 100m（0.1核心）
- **内存限制**: 64Mi
- **副本数量**: 1个（可根据需要调整）
- **端口**: 80（HTTP）

### 安全配置

- 只读文件系统挂载
- 最小权限运行
- 资源限制保护

### 监控配置

- 健康检查探针
- 就绪状态检查
- 自动重启策略

## 🐛 故障排查

### 常见问题及解决方案

#### 1. Pod无法启动

```bash
# 查看Pod状态
kubectl describe pod <pod-name>

# 查看事件
kubectl get events --sort-by=.metadata.creationTimestamp
```

**可能原因**：
- 镜像拉取失败
- 资源不足
- 配置错误

#### 2. 无法访问服务

```bash
# 检查Service状态
kubectl get svc numbers-website-service -o wide

# 检查Endpoints
kubectl get endpoints numbers-website-service
```

**可能原因**：
- Service选择器错误
- Pod标签不匹配
- 端口配置错误

#### 3. 页面显示异常

```bash
# 进入Pod查看日志
kubectl logs -f <pod-name>

# 进入Pod检查文件
kubectl exec -it <pod-name> -- /bin/sh
```

**可能原因**：
- HTML文件挂载失败
- Nginx配置错误
- 文件权限问题

## 📊 监控和维护

### 资源监控

```bash
# 查看资源使用情况
kubectl top pods -l app=numbers-website

# 查看节点资源
kubectl top nodes
```

### 扩容操作

```bash
# 手动扩容（增加副本数）
kubectl scale deployment numbers-website --replicas=3

# 查看扩容状态
kubectl get deployment numbers-website
```

### 更新应用

```bash
# 滚动更新镜像
kubectl set image deployment/numbers-website numbers-website=new-image:tag

# 查看更新状态
kubectl rollout status deployment/numbers-website

# 回滚更新
kubectl rollout undo deployment/numbers-website
```

## 🔐 安全建议

1. **定期更新镜像**: 使用最新的nginx:alpine镜像
2. **资源限制**: 设置适当的CPU和内存限制
3. **网络策略**: 配置网络访问控制（如需要）
4. **HTTPS配置**: 生产环境建议配置SSL证书

## 📈 性能优化

1. **静态资源压缩**: 启用Gzip压缩
2. **缓存策略**: 配置适当的HTTP缓存头
3. **CDN加速**: 对于全球访问，考虑使用CDN
4. **监控指标**: 配置Prometheus监控

## 🆘 技术支持

### 有用的命令

```bash
# 查看所有相关资源
kubectl get all -l app=numbers-website

# 查看配置映射
kubectl get configmap numbers-website-html -o yaml

# 删除所有资源
kubectl delete -f sealos-app.yaml
```

### 联系支持

如果遇到问题，请收集以下信息：
- Pod状态和日志
- 事件信息
- 集群版本信息
- 错误截图

---

**部署完成！** 🎉

您的数字显示网站现在已经成功部署在Sealos平台上，可以通过生成的URL访问网站。 