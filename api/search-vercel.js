// Vercel API endpoint for /api/search
// 优先从云端缓存搜索数据，如果失败则回退到本地缓存

import cloudCache from '../cloud-cache-adapter.js';

let cachedData = null;
let lastSyncTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟本地缓存
let searchIndex = null; // 用于快速搜索的索引

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');
  
  // 设置缓存头
  res.setHeader('Cache-Control', 'no-cache'); // 搜索结果不缓存，但API响应可以被CDN缓存
  
  try {
    const { keywords, limit = 50 } = req.query;

    if (!keywords) {
      return res.status(400).json({
        code: 400,
        result: { songs: [] },
        message: '缺少搜索关键词参数'
      });
    }

    // 限制搜索结果数量
    const maxLimit = 100;
    const searchLimit = Math.min(parseInt(limit) || 50, maxLimit);

    // 首先尝试从云端缓存搜索数据
    console.log('🔍 尝试从云端缓存搜索数据...');
    try {
      const searchResults = await cloudCache.searchSongs(keywords, searchLimit);
      
      if (searchResults && searchResults.length > 0) {
        console.log(`✅ 从云端缓存搜索到 ${searchResults.length} 首歌曲`);
        return res.status(200).json({
          code: 200,
          result: {
            songs: searchResults,
            songCount: searchResults.length,
            limit: searchLimit,
            total_available: searchResults.length
          },
          keywords: keywords,
          cache_source: 'cloud',
          message: `搜索到 ${searchResults.length} 首歌曲 (云端缓存)`
        });
      } else {
        console.log('⚠️  云端缓存搜索无结果，尝试本地缓存...');
      }
    } catch (cloudError) {
      console.error('❌ 从云端缓存搜索数据失败:', cloudError.message);
      console.log('⚠️  回退到本地缓存搜索...');
    }

    // 如果云端缓存搜索失败，使用本地缓存策略
    const now = Date.now();
    if (!cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      console.log('📡 /api/search: 本地缓存过期或不存在，正在更新数据...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒超时
      
      try {
        const syncResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });

        if (syncResponse.ok) {
          const syncResult = await syncResponse.json();
          if (syncResult.success && syncResult.data) {
            cachedData = syncResult.data;
            lastSyncTime = now;
            // 重置搜索索引，将在搜索时重建
            searchIndex = null;
            console.log(`✅ 搜索数据更新: ${cachedData.length} 首歌曲`);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('搜索数据同步请求超时:', error);
        } else {
          console.error('搜索数据同步调用失败:', error);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!cachedData) {
      return res.status(200).json({
        code: 200,
        result: { songs: [] },
        message: '暂无数据可搜索'
      });
    }

    // 构建搜索索引（如果不存在）
    if (!searchIndex) {
      console.log('🔍 构建本地搜索索引...');
      searchIndex = cachedData.map((song, index) => ({
        index,
        searchText: [
          song.name,
          song.artists?.[0]?.name,
          song.album?.name,
          song.style,
          song.original_song,
          song.bv_number
        ].filter(Boolean).join(' | ').toLowerCase()
      }));
    }

    // 执行搜索
    const searchTerm = keywords.toLowerCase().trim();
    
    // 使用更灵活的搜索算法
    const matchedIndices = searchIndex.filter(item => 
      item.searchText.includes(searchTerm)
    ).slice(0, searchLimit);

    const matchedSongs = matchedIndices.map(item => cachedData[item.index]);

    res.status(200).json({
      code: 200,
      result: {
        songs: matchedSongs,
        songCount: matchedSongs.length,
        limit: searchLimit,
        total_available: cachedData.length
      },
      keywords: keywords,
      cache_source: 'local',
      message: `搜索到 ${matchedSongs.length} 首歌曲 (本地缓存，最多显示 ${searchLimit} 首)`
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
