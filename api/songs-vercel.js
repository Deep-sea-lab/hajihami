// Vercel API endpoint for /api/songs
// Since we can't persist data, this will either:
// 1. Redirect to sync if no recent data
// 2. Return cached data from recent sync

let cachedData = null;
let lastSyncTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');

    // 检查是否需要重新同步
    const now = Date.now();
    if (!cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      console.log('📡 /api/songs: 缓存过期或不存在，正在调用同步...');

      // 调用同步API获取数据
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
            console.log(`✅ 缓存更新: ${cachedData.length} 首歌曲`);
          }
        }
      } catch (error) {
        console.error('同步调用失败:', error);
        // 如果同步失败，尝试返回旧缓存数据（如果有的话）
        if (cachedData) {
          console.log('⚠️ 同步失败，使用旧缓存数据');
        }
      }
    }

    if (!cachedData) {
      return res.status(200).json({
        code: 200,
        data: [],
        total: 0,
        message: '暂无数据，请稍后重试或手动调用 /api/sync'
      });
    }

    res.status(200).json({
      code: 200,
      data: cachedData,
      total: cachedData.length,
      cached: true,
      cache_age: Math.floor((now - lastSyncTime) / 1000),
      message: `${cachedData.length} 首歌曲 (缓存数据)`
    });
  } catch (error) {
    console.error('获取歌曲API错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}
