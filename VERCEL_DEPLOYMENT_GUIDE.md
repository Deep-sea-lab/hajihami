# HajihamiAPI Vercel 部署与使用教程

## 1. 项目概述

HajihamiAPI 是一个将 Notion 数据库同步到本地并提供音乐 API 服务的项目。支持 Vercel 部署，具有云端缓存功能。

## 2. 部署到 Vercel

### 2.1 前提条件

- 拥有 Vercel 账户
- 准备好 Notion 集成密钥和数据库 ID
- 配置好 Supabase 项目（可选，用于云端缓存）

### 2.2 部署步骤

1. **Fork 或克隆项目**
   ```
   git clone <your-repo-url>
   cd hajihami
   ```

2. **安装依赖**
   ```
   npm install
   ```

3. **在 Vercel 项目中配置环境变量**
   - 进入 Vercel 项目设置
   - 在 Environment Variables 中添加以下变量：

   | Key | Value |
   |-----|-------|
   | `NOTION_API_KEY` | 你的 Notion 集成密钥 |
   | `NOTION_DATABASE_IDS` | 你的 Notion 数据库 ID（多个用逗号分隔） |
   | `SUPABASE_URL` | 你的 Supabase 项目 URL |
   | `SUPABASE_ANON_KEY` | 你的 Supabase anon 密钥 |
   | `CACHE_PROVIDER` | `supabase` |

4. **部署项目**
   - 在 Vercel 项目中重新部署
   - 确保框架选择为 "Other" 或自动检测

## 3. API 端点说明

### 3.1 同步接口
- **路径**: `/api/sync`
- **方法**: `GET` 或 `POST`
- **功能**: 手动触发 Notion 数据库同步
- **说明**: 同步完成后会自动上传数据到云端缓存

### 3.2 获取所有歌曲
- **路径**: `/api/songs`
- **方法**: `GET`
- **功能**: 获取所有同步的歌曲数据
- **返回**: 歌曲列表（优先从云端缓存获取）

### 3.3 搜索歌曲
- **路径**: `/api/search?keywords=<关键词>`
- **方法**: `GET`
- **功能**: 按关键词搜索歌曲
- **参数**: 
  - `keywords`: 搜索关键词
  - `limit`: 搜索结果数量限制（可选，默认50）

### 3.4 心跳检测
- **路径**: `/api/ping`
- **方法**: `GET`
- **功能**: 检查服务是否正常运行

## 4. 定时同步

项目包含 Vercel Cron 功能，可以配置定时同步：

1. 在 Vercel 项目设置中启用 Cron Job
2. 配置定时任务路径为 `/api/cron`
3. 设置调度表达式，例如 `0 0 * * *` 表示每天 UTC 时间 00:00 运行

## 5. 本地开发

### 5.1 环境配置

在项目根目录创建 `.env` 文件：

```
# Notion 配置
NOTION_API_KEY=your_notion_integration_token
NOTION_DATABASE_IDS=database_id_1,database_id_2

# Supabase 配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# 缓存配置
CACHE_PROVIDER=supabase

# 其他配置
SKIP_COVERS=false
```

### 5.2 启动命令

- **同步数据**: `npm run sync`
- **启动 API 服务**: `npm run api` 或 `npm start`
- **实时同步**: `npm run realtime`

## 6. 数据库配置

### 6.1 Supabase 表结构

如果使用 Supabase 作为缓存，请在 Supabase SQL 编辑器中运行以下命令创建表：

```sql
-- 重新创建表，包含所有必需的列，全部使用双引号确保大小写匹配
CREATE TABLE IF NOT EXISTS songs (
  "id" BIGINT PRIMARY KEY,
  "name" TEXT,
  "artists" JSONB,
  "album" JSONB,
  "url" TEXT,
  "picUrl" TEXT,
  "playedCount" INTEGER DEFAULT 0,
  "fee" INTEGER DEFAULT 0,
  "feeReason" INTEGER DEFAULT 0,
  "pc" BOOLEAN DEFAULT true,
  "noCopyrightRcmd" JSONB,
  "bv_number" TEXT,
  "creation_time" TEXT,
  "publish_time" TEXT,
  "style" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_songs_bv_number ON songs("bv_number");
CREATE INDEX IF NOT EXISTS idx_songs_name ON songs("name");
CREATE INDEX IF NOT EXISTS idx_songs_style ON songs("style");
CREATE INDEX IF NOT EXISTS idx_songs_creation_time ON songs("creation_time");
```

## 7. 常见问题

### 7.1 同步失败
- 检查 Notion 集成是否正确配置
- 确认数据库 ID 是否正确
- 检查集成是否有访问数据库的权限

### 7.2 API 响应缓慢
- 检查是否正确配置了云端缓存
- 确认 Supabase 连接是否正常

### 7.3 环境变量未生效
- 确认在 Vercel 中正确设置了环境变量
- 检查变量名称是否完全匹配

## 8. 维护建议

- 定期轮换 API 密钥
- 监控同步日志，及时发现错误
- 保持依赖包更新
- 定期备份重要数据

## 9. 性能优化

- 启用云端缓存以提高查询速度
- 根据实际需求调整同步频率
- 合理设置封面获取策略以避免超时