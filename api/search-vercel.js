// Vercel API endpoint for /api/search
// This will search through cached data

let cachedData = null;
let lastSyncTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');

    const { keywords } = req.query;

    if (!keywords) {
      return res.status(400).json({
        code: 400,
        result: { songs: [] },
        message: '缺少搜索关键词参数'
      });
    }

    // 获取数据（从缓存或同步）
    const now = Date.now();
    if (!cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      try {
        const syncResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (syncResponse.ok) {
          const syncResult = await syncResponse.json();
          if (syncResult.success && syncResult.data) {
            cachedData = syncResult.data;
            lastSyncTime = now;
          }
        }
      } catch (error) {
        console.error('同步调用失败:', error);
      }
    }

    if (!cachedData) {
      return res.status(200).json({
        code: 200,
        result: { songs: [] },
        message: '暂无数据可搜索'
      });
    }

    // 执行搜索
    const matchedSongs = cachedData.filter(song => {
      const searchText = [
        song.name,
        song.artists?.[0]?.name,
        song.album?.name,
        song.style,
        song.original_song
      ].filter(Boolean).join(' ').toLowerCase();

      return searchText.includes(keywords.toLowerCase());
    });

    res.status(200).json({
      code: 200,
      result: {
        songs: matchedSongs,
        songCount: matchedSongs.length
      },
      keywords: keywords,
      message: `搜索到 ${matchedSongs.length} 首歌曲`
    });

  } catch (error) {
    console.error('搜索API错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}
