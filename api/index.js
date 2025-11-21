// API 根路径路由
export default function handler(req, res) {
  res.status(200).json({
    message: "HajihamiAPI 服务运行中 (Meting API 兼容)",
    version: "2.0.3",
    endpoints: {
      songs: "/api/songs", 
      search: "/api/search",
      song: "/api/song",
      lyric: "/api/lyric",
      album: "/api/album",
      artist: "/api/artist",
      ping: "/api/ping",
      meting: "/api?server=...&type=...&id=..."
    },
    documentation: "支持Meting API格式，请访问 /api/songs, /api/search, /api/song, /api/lyric, /api/album, /api/artist, /api/ping 等端点，或使用标准Meting格式: /api?server=netease&type=search&id=keyword"
  });
}