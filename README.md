# Hajihami API

从 **Notion 数据库** 同步音乐数据，并提供 **兼容网易云音乐格式** 的轻量级 API。

---

## 功能特性

- **Notion to JSON** 自动同步（单次 / 实时）  
- **网易云音乐兼容** 的 RESTful 接口（`/songs`、`/search`、`/song/detail`）  
- **字段过滤 & 安全**：去除 `id`、`created_time`、`last_edited_time` 等敏感字段  
- **B 站封面自动抓取**（`picUrl`）  
- **跨域支持**（CORS）  
- **多数据库合并**（支持 `DATABASE_IDS=ID1,ID2`）  
- **热重载 & 轻量**（仅 `express` + `node-fetch`）

---

## 数据格式对比

| 原始 Notion 数据 | 转换后网易云格式 |
|------------------|------------------|
| ```json { "title": "【补档】活全村音乐：哈人米", "creator": "65折", "original_song": "楚人美", "video_url": "https://www.bilibili.com/video/BV1WDjrz7Ebj", "play_count": 190647, "publish_time": "2025-05-29", "style": ["现代主义"] } ``` | ```json { "id": 1852784062, "name": "【补档】活全村音乐：哈人米", "artists": [{"name":"65折"}], "album": {"name":"楚人美"}, "url": "https://www.bilibili.com/video/BV1WDjrz7Ebj", "picUrl": "https://i2.hdslb.com/...", "playedCount": 190647, "bv_number": "BV1WDjrz7Ebj", "publish_time": "2025-05-29", "style": ["现代主义"] } ``` |

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 `.env`

```env
# Notion 集成密钥（Integration Token）
NOTION_API_KEY=secret_XXXXXXXXXXXXXXXXXXXXXXXXXXXX

# 多个数据库 ID，用逗号分隔（可选）
NOTION_DATABASE_IDS=xxxxxxxxxxxxxxxx,yyyyyyyyyyyyyyyyy
```

> **提示**：在 Notion 中 **分享数据库给集成**，否则无法读取。

### 3. 同步数据

```bash
# 单次同步（推荐首次使用）
npm run sync

# 实时同步（每 5 分钟自动拉取）
npm run realtime

# 查看同步统计
npm run stats
```

### 4. 启动 API 服务器

```bash
# 默认端口 3456
npm start

# 自定义端口
node index.js api 8080
```

> 启动后访问：http://localhost:3456/ping

---

## API 文档

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/ping` | - | 存活检查 |
| `GET` | `/songs` | - | 返回 **所有歌曲**（网易云格式） |
| `GET` | `/search` | `keywords=关键词` | 搜索 **歌名 / 歌手 / 专辑** |
| `GET` | `/song/detail` | `ids=ID1,ID2` | 获取歌曲详情（支持批量） |

### 返回结构统一

```json
{
  "code": 200,
  ...
}
```

---

### 示例响应

#### `/songs`（部分）

```json
{
  "code": 200,
  "data": [
    {
      "id": 1852784062,
      "name": "【补档】活全村音乐：哈人米",
      "artists": [{"name": "65折"}],
      "album": {"name": "楚人美"},
      "url": "https://www.bilibili.com/video/BV1WDjrz7Ebj",
      "picUrl": "http://i2.hdslb.com/...",
      "playedCount": 190647,
      "bv_number": "BV1WDjrz7Ebj",
      "publish_time": "2025-05-29",
      "style": ["现代主义"]
    }
  ]
}
```

#### `/search?keywords=哈基米`

```json
{
  "code": 200,
  "result": {
    "songs": [ /* 歌曲数组 */ ],
    "songCount": 127
  }
}
```

#### `/song/detail?ids=1772404276`

```json
{
  "code": 200,
  "songs": [ /* 单首歌曲详情 */ ],
  "privileges": []   // 兼容网易云，始终为空数组
}
```

---

## 性能优化特性

### 🖼️ 智能封面获取
- **3 次重试机制**：每个失败的封面获取会自动重试最多 3 次，减少因网络问题导致的遗漏
- **增量同步**：只重新下载发生变化的封面，避免重复下载
- **本地缓存**：成功获取的封面在本地上次被保存，避免不必要的网络请求
- **超时保护**：5秒超时防阻塞，提高同步稳定性

### 🔄 增量 vs 全量同步
- **增量模式**（默认）：对比本地数据与云端内容，只下载新增或变更的封面
- **全量模式**：通过 `--full` 或 `--force` 参数强制重新抓取所有封面

### 💾 智能数据合并
- 对每个页面记录比较更新时间，仅处理有实际变化的内容
- 定期重试失败的封面获取，提高成功率
- 保留成功获取的数据，避免因单次失败而丢失全量数据

---

## 可用命令（`node index.js <cmd> [args]`）

| 命令 | 参数 | 说明 |
|------|------|------|
| `sync` | `[--full] [--force]` | 手动执行一次数据同步，可用 `--full` 强制全量更新封面 |
| `realtime` | - | 启动后台定时同步（默认增量模式，每 5 分钟） |
| `api [port]` | - | 启动 API 服务器（默认 3456） |
| `stats` | - | 显示数据库歌曲总数、最新更新时间 |
| `status` | - | 查看当前同步状态 |
| `list` | - | 列出所有配置的 Notion 数据库 |
| `test` | - | 测试 Notion API 连接 |
| `clean` | - | 清除 `data/` 目录和 `sync_state.json` |

---

## 项目结构

```text
.
├── index.js              # 主入口（CLI + API）
├── package.json
├── README.md
├── .env                  # 环境变量
├── sync_state.json       # 同步状态缓存
├── data/
│   └── db_*.json         # 每个数据库的原始数据
└── songs.json            # 合并后的最终歌曲数据（API 使用）
```

---

## 数据映射规则（Notion to 网易云）

| Notion 字段 | 网易云字段 | 说明 |
|-------------|------------|------|
| `title` | `name` | 歌曲名 |
| `creator` | `artists[0].name` | 主创作者 |
| `original_song` | `album.name` | 原曲 / 专辑 |
| `video_url` | `url` | B 站播放链接 |
| `cover_url` | `picUrl` | 封面图（若无则抓取 B 站） |
| `play_count` | `playedCount` | 播放次数 |
| `publish_time` | `publish_time` | 仅保留 `YYYY-MM-DD` |
| `style` | `style` | 标签数组 |
| `video_url` to BVID | `bv_number` | 提取 `BVxxxxxxxxxx` |

**已自动移除**：`id`、`created_time`、`last_edited_time`、`archived` 等

---

## 开发 & 调试

```bash
# 开启调试日志
DEBUG=hajihami:* npm start

# 手动触发 B 站封面抓取（测试）
node index.js fetch-covers
```

---

## 许可证

[MIT License](LICENSE)

---

**Made with Love for 哈基米音乐爱好者**  
有问题？提交 Issue 或 PR 欢迎贡献！
