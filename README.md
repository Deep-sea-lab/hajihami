# Hajihami API 详细文档

## 项目简介

Hajihami API 是一个轻量级的音乐数据 API 服务，从 Supabase 数据库提供音乐数据，并兼容网易云音乐的 API 格式。该项目专注于提供高效、稳定的音乐数据查询服务。

## 功能特性

- 🎵 **网易云音乐兼容 API** - 提供与网易云音乐 API 兼容的数据格式
- 🔍 **智能搜索** - 支持按歌曲名称、歌手、专辑分类搜索，并按匹配度排序
- ☁️ **Supabase 集成** - 使用 Supabase 作为数据存储和缓存
- 🚀 **轻量级** - 仅依赖 Express 和 Supabase，启动快速
- 🌐 **CORS 支持** - 完全支持跨域请求
- 📊 **实时数据** - 直接从 Supabase 获取最新数据

## 目录结构

```
hajihami/
├── index.js                 # 主入口文件
├── package.json            # 项目配置和依赖
├── cloud-cache-adapter.js  # Supabase 缓存适配器
├── .env.example           # 环境变量示例
├── api/                   # API 端点目录
│   ├── index.js          # API 主路由
│   ├── songs-vercel.js   # 歌曲数据端点
│   ├── search-vercel.js  # 搜索端点
│   └── ping-vercel.js    # 健康检查端点
└── README.md             # 项目说明
```

## 快速开始

### 1. 环境要求

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0

### 2. 克隆项目

```bash
git clone https://github.com/Deep-sea-lab/hajihami.git
cd hajihami
```

### 3. 安装依赖

```bash
npm install
```

### 4. 环境配置

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# Supabase 配置
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# 可选配置
PORT=3456
NODE_ENV=production
```

### 5. 获取 Supabase 凭据

1. 访问 [Supabase 官网](https://supabase.com)
2. 创建新项目或选择现有项目
3. 在项目设置中找到 API 配置
4. 复制 **Project URL** 和 **anon public** key

### 6. 启动服务

```bash
# 开发模式启动
npm start

# 或直接使用 node
node index.js api

# 指定端口启动
node index.js api 8080
```

### 7. 验证安装

测试 Supabase 连接：

```bash
npm test
```

如果看到 "✅ Supabase 连接正常" 消息，说明配置成功。

## API 文档

### 基础信息

- **本地 Express 版本基础 URL**: `http://localhost:3456`
- **Vercel 云函数版本基础 URL**: `https://your-project.vercel.app`
- **数据格式**: JSON
- **字符编码**: UTF-8
- **时间格式**: ISO 8601

### API 路径说明

本项目支持两种部署模式，API 路径略有不同：

#### 1. 本地 Express 版本
直接访问根路径下的端点：
- `http://localhost:3456/songs`
- `http://localhost:3456/search`
- `http://localhost:3456/song/detail`
- `http://localhost:3456/ping`

#### 2. Vercel 云函数版本
所有端点都在 `/api` 路径下：
- `https://your-project.vercel.app/api/songs`
- `https://your-project.vercel.app/api/search`
- `https://your-project.vercel.app/api/song/detail`
- `https://your-project.vercel.app/api/ping`

### 通用响应格式

所有 API 响应都遵循统一格式：

```json
{
  "code": 200,
  "message": "成功消息",
  "data": { /* 具体数据 */ }
}
```

### 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### API 端点

#### 1. 健康检查

检查 API 服务是否正常运行。

**请求**
```http
# 本地版本
GET /ping

# Vercel 版本  
GET /api/ping
```

**响应示例**
```json
{
  "code": 200,
  "message": "OK",
  "timestamp": "2025-11-19T03:14:12.096Z"
}
```

#### 2. 获取所有歌曲

获取数据库中的所有歌曲数据。

**请求**
```http
# 本地版本
GET /songs

# Vercel 版本
GET /api/songs
```

**分页参数（可选）**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| pageSize | number | 每页数量，默认 1000 |
| limit | number | 每页数量（pageSize 的别名） |
| force | boolean | 强制刷新缓存，设置为 true |
| refresh | boolean | 刷新缓存，设置为 true |
| all | boolean | 获取所有歌曲，设置为 true |

**响应示例**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1852784062,
      "name": "【补档】活全村音乐：哈人米",
      "artists": [
        {
          "name": "65折"
        }
      ],
      "album": {
        "name": "楚人美"
      },
      "url": "https://www.bilibili.com/video/BV1WDjrz7Ebj",
      "picUrl": "https://i2.hdslb.com/bfs/archive/xxx.jpg",
      "playedCount": 190647,
      "fee": 0,
      "feeReason": 0,
      "pc": true,
      "noCopyrightRcmd": null,
      "bv_number": "BV1WDjrz7Ebj",
      "creation_time": "现代主义",
      "publish_time": "2025-05-29",
      "style": "现代主义"
    }
  ],
  "total": 1
}
```

#### 3. 搜索歌曲

支持按歌曲名称、歌手、专辑进行分类搜索。

**请求**
```http
# 本地版本
GET /search?keywords=关键词&type=搜索类型

# Vercel 版本
GET /api/search?keywords=关键词&type=搜索类型
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keywords | string | 是 | 搜索关键词 |
| type | string | 否 | 搜索类型：`all`(默认), `song`, `artist`, `album` |

**搜索类型说明**

- `all`: 在歌曲名称、歌手、专辑中搜索
- `song`: 仅在歌曲名称中搜索
- `artist`: 仅在歌手名称中搜索  
- `album`: 仅在专辑名称中搜索

**响应示例**
```json
{
  "code": 200,
  "result": {
    "songs": [
      {
        "id": 1852784062,
        "name": "【补档】活全村音乐：哈人米",
        "artists": [
          {
            "name": "65折"
          }
        ],
        "album": {
          "name": "楚人美"
        }
      }
    ],
    "songCount": 1,
    "searchType": "song",
    "keywords": "哈人米"
  }
}
```

#### 4. 获取歌曲详情

根据歌曲 ID 获取详细信息，支持批量查询。

**请求**
```http
# 本地版本
GET /song/detail?ids=歌曲ID1,歌曲ID2

# Vercel 版本
GET /api/song/detail?ids=歌曲ID1,歌曲ID2
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string | 是 | 歌曲ID，多个ID用逗号分隔 |

**响应示例**
```json
{
  "code": 200,
  "songs": [
    {
      "id": 1852784062,
      "name": "【补档】活全村音乐：哈人米",
      "artists": [
        {
          "name": "65折"
        }
      ],
      "album": {
        "name": "楚人美"
      },
      "url": "https://www.bilibili.com/video/BV1WDjrz7Ebj",
      "picUrl": "https://i2.hdslb.com/bfs/archive/xxx.jpg",
      "playedCount": 190647,
      "fee": 0,
      "feeReason": 0,
      "pc": true,
      "noCopyrightRcmd": null,
      "bv_number": "BV1WDjrz7Ebj",
      "creation_time": "现代主义",
      "publish_time": "2025-05-29",
      "style": "现代主义"
    }
  ],
  "privileges": [
    {
      "id": 0,
      "fee": 0,
      "payed": 0,
      "realPayed": 0,
      "st": 0,
      "pl": 128000,
      "dl": 128000,
      "sp": 7,
      "cp": 1,
      "subp": 1,
      "cs": false,
      "maxbr": 128000,
      "fl": 128000,
      "toast": false,
      "flag": 0,
      "preSell": false
    }
  ]
}
```

## 数据模型

### 歌曲对象 (Song)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 歌曲唯一标识 |
| name | string | 歌曲名称 |
| artists | array | 歌手列表 |
| artists[0].name | string | 歌手名称 |
| album | object | 专辑信息 |
| album.name | string | 专辑名称 |
| url | string | 播放链接 |
| picUrl | string | 封面图片链接 |
| playedCount | number | 播放次数 |
| fee | number | 付费类型 |
| bv_number | string | B站视频BV号 |
| creation_time | string | 创作时代 |
| publish_time | string | 发布时间 |
| style | string | 风格标签 |

## 使用示例

### JavaScript (Fetch API)

```javascript
// 获取所有歌曲
async function getAllSongs() {
  // 本地版本
  const response = await fetch('http://localhost:3456/songs');
  // Vercel 版本
  // const response = await fetch('https://your-project.vercel.app/api/songs');
  const data = await response.json();
  console.log(data.data);
}

// 搜索歌曲
async function searchSongs(keyword) {
  // 本地版本
  const response = await fetch(`http://localhost:3456/search?keywords=${keyword}&type=song`);
  // Vercel 版本
  // const response = await fetch(`https://your-project.vercel.app/api/search?keywords=${keyword}&type=song`);
  const data = await response.json();
  console.log(data.result.songs);
}

// 获取歌曲详情
async function getSongDetail(songId) {
  // 本地版本
  const response = await fetch(`http://localhost:3456/song/detail?ids=${songId}`);
  // Vercel 版本
  // const response = await fetch(`https://your-project.vercel.app/api/song/detail?ids=${songId}`);
  const data = await response.json();
  console.log(data.songs[0]);
}

// 使用示例
getAllSongs();
searchSongs('哈人米');
getSongDetail(1852784062);
```

### Python (requests)

```python
import requests

# 本地版本
BASE_URL = 'http://localhost:3456'
# Vercel 版本
# BASE_URL = 'https://your-project.vercel.app'

# 获取所有歌曲
def get_all_songs():
    # 本地版本
    response = requests.get(f'{BASE_URL}/songs')
    # Vercel 版本
    # response = requests.get(f'{BASE_URL}/api/songs')
    data = response.json()
    return data['data']

# 搜索歌曲
def search_songs(keyword, search_type='all'):
    # 本地版本
    response = requests.get(f'{BASE_URL}/search', params={
        'keywords': keyword,
        'type': search_type
    })
    # Vercel 版本
    # response = requests.get(f'{BASE_URL}/api/search', params={
    #     'keywords': keyword,
    #     'type': search_type
    # })
    data = response.json()
    return data['result']['songs']

# 获取歌曲详情
def get_song_detail(song_id):
    # 本地版本
    response = requests.get(f'{BASE_URL}/song/detail', params={
        'ids': song_id
    })
    # Vercel 版本
    # response = requests.get(f'{BASE_URL}/api/song/detail', params={
    #     'ids': song_id
    # })
    data = response.json()
    return data['songs'][0]

# 使用示例
songs = get_all_songs()
search_results = search_songs('哈人米', 'song')
song_detail = get_song_detail(1852784062)
```

### cURL

```bash
# 健康检查
# 本地版本
curl http://localhost:3456/ping
# Vercel 版本
# curl https://your-project.vercel.app/api/ping

# 获取所有歌曲
# 本地版本
curl http://localhost:3456/songs
# Vercel 版本
# curl https://your-project.vercel.app/api/songs

# 搜索歌曲
# 本地版本
curl "http://localhost:3456/search?keywords=哈人米&type=song"
# Vercel 版本
# curl "https://your-project.vercel.app/api/search?keywords=哈人米&type=song"

# 获取歌曲详情
# 本地版本
curl "http://localhost:3456/song/detail?ids=1852784062"
# Vercel 版本
# curl "https://your-project.vercel.app/api/song/detail?ids=1852784062"
```

## 部署指南

### 本地部署

1. 确保已安装 Node.js 18+
2. 克隆项目并安装依赖
3. 配置环境变量
4. 运行 `npm start`

### Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3456

CMD ["npm", "start"]
```

构建和运行：

```bash
docker build -t hajihami-api .
docker run -p 3456:3456 --env-file .env hajihami-api
```

### Vercel 部署

1. 安装 Vercel CLI: `npm i -g vercel`
2. 运行 `vercel` 并按提示配置
3. 在 Vercel 控制台配置环境变量

### PM2 进程管理

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start index.js --name hajihami-api -- api

# 查看状态
pm2 status

# 查看日志
pm2 logs hajihami-api

# 重启应用
pm2 restart hajihami-api

# 停止应用
pm2 stop hajihami-api
```

## 性能优化

### 缓存策略

- Supabase 内置缓存层
- API 响应缓存（可选）
- CDN 静态资源缓存

### 数据库优化

- 确保 Supabase 表有适当索引
- 使用分页查询大数据集
- 定期清理过期数据

### 监控指标

- API 响应时间
- 错误率
- 并发连接数
- 数据库查询性能

## 故障排除

### 常见问题

1. **Supabase 连接失败**
   - 检查环境变量配置
   - 验证 Supabase URL 和 API Key
   - 确认网络连接

2. **端口占用**
   ```bash
   # 查看端口占用
   lsof -i :3456
   
   # 或使用其他端口
   node index.js api 8080
   ```

3. **依赖安装失败**
   ```bash
   # 清理缓存重新安装
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

### 日志调试

```bash
# 开发模式查看详细日志
DEBUG=* npm start

# PM2 日志
pm2 logs hajihami-api --lines 100
```

## 安全建议

1. **环境变量安全**
   - 不要在代码中硬编码敏感信息
   - 使用 `.env` 文件并添加到 `.gitignore`
   - 生产环境使用安全的密钥管理服务

2. **API 安全**
   - 实施请求频率限制
   - 添加 API 认证（如需要）
   - 使用 HTTPS

3. **数据安全**
   - 定期备份 Supabase 数据
   - 实施适当的访问控制
   - 监控异常访问

## 贡献指南

1. Fork 项目
2. 创建功能分支: `git checkout -b feature/new-feature`
3. 提交更改: `git commit -am 'Add new feature'`
4. 推送分支: `git push origin feature/new-feature`
5. 提交 Pull Request

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 联系方式

- 项目主页: https://github.com/Deep-sea-lab/hajihami
- 问题反馈: https://github.com/Deep-sea-lab/hajihami/issues
- 邮箱: [项目邮箱]

## 更新日志

### v2.0.3 (2025-11-19)
- 移除 realtime 和 sync 功能
- 专注于纯 API 服务
- 增强搜索功能，支持分类搜索
- 优化匹配度排序算法

### v2.0.2
- 添加 Supabase 集成
- 优化 API 性能
- 修复已知问题

---

**感谢使用 Hajihami API！如有问题或建议，欢迎提交 Issue 或 Pull Request。**