# HajihamiAPI - 云端缓存配置指南

## 配置云端缓存

本项目现在支持将数据存储到云端，以提高访问速度和可靠性。默认使用 Supabase 作为云端缓存。

### 1. 设置 Supabase

1. 访问 [Supabase](https://supabase.io) 并创建一个新项目
2. 在项目设置中获取 URL 和匿名密钥
3. 在数据库中创建 songs 表（SQL 语句见 `supabase-cache.js`）

### 2. 环境变量配置

复制 `.env.example` 到 `.env` 并填入相应的值：

```bash
# Notion 配置
NOTION_API_KEY=your_notion_integration_token
NOTION_DATABASE_IDS=database_id_1,database_id_2

# Supabase 配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# 缓存配置
CACHE_PROVIDER=supabase  # 当前仅支持 supabase

# 其他配置
SKIP_COVERS=false
```

### 3. 数据库表结构

在 Supabase SQL 编辑器中运行以下命令创建 songs 表：

```sql
-- 创建 songs 表
CREATE TABLE songs (
  id BIGINT PRIMARY KEY,
  name TEXT,
  artists JSONB,
  album JSONB,
  url TEXT,
  picUrl TEXT,
  playedCount INTEGER DEFAULT 0,
  fee INTEGER DEFAULT 0,
  feeReason INTEGER DEFAULT 0,
  pc BOOLEAN DEFAULT true,
  noCopyrightRcmd JSONB,
  bv_number TEXT,
  creation_time TEXT,
  publish_time TEXT,
  style TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_songs_bv_number ON songs(bv_number);
CREATE INDEX idx_songs_name ON songs(name);
CREATE INDEX idx_songs_style ON songs(style);
CREATE INDEX idx_songs_creation_time ON songs(creation_time);
```

### 4. 使用方式

- 同步数据时会自动上传到云端缓存
- API 请求会优先从云端缓存获取数据
- 如果云端缓存不可用，会自动回退到本地缓存策略

### 5. Vercel 部署

在 Vercel 部署时，确保在环境变量中设置：
- SUPABASE_URL
- SUPABASE_ANON_KEY
- NOTION_API_KEY
- NOTION_DATABASE_IDS

## API 端点

- `GET /api/songs` - 获取所有歌曲（优先从云端缓存）
- `GET /api/search?keywords=...` - 搜索歌曲（优先从云端缓存）
- `GET /api/sync` - 同步 Notion 数据并更新云端缓存
- `GET /api/ping` - 检查服务状态