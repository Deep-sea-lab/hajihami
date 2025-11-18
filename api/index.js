// API 根路径路由
export default function handler(req, res) {
  res.status(200).json({
    message: "HajihamiAPI 服务运行中",
    version: "2.0.3",
    endpoints: {
      sync: "/api/sync",
      songs: "/api/songs", 
      search: "/api/search",
      ping: "/api/ping",
      clearCache: "/api/clear-cache"
    },
    documentation: "请访问 /api/songs, /api/search, /api/sync, /api/clear-cache 等端点"
  });
}