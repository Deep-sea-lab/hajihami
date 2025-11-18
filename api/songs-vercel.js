// Vercel API endpoint for /api/songs
// 优先从云端缓存获取数据，如果失败则回退到本地同步

import cloudCache from '../cloud-cache-adapter.js';

let cachedData = null;
let lastSyncTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟本地缓存

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');
  
  // 设置缓存头，让CDN或浏览器缓存
  res.setHeader('Cache-Control', 'public, s-maxage=300'); // 5分钟CDN缓存
  
  try {
    console.log('🎵 获取歌曲数据...');
    
    // 首先尝试从云端缓存获取数据
    let songs = null;
    try {
      console.log('☁️  尝试从云端缓存获取歌曲...');
      songs = await cloudCache.getAllSongs();
      
      if (songs && songs.length > 0) {
        console.log(`✅ 从云端缓存获取 ${songs.length} 首歌曲`);
        return res.status(200).json({
          code: 200,
          data: songs,
          total: songs.length,
          cached: true,
          cache_source: 'cloud',
          message: `${songs.length} 首歌曲 (云端缓存)`
        });
      } else {
        console.log('⚠️  云端缓存为空，尝试本地缓存...');
      }
    } catch (cloudError) {
      console.error('❌ 从云端缓存获取数据失败:', cloudError.message);
      console.log('⚠️  回退到本地缓存策略...');
    }

    // 如果云端缓存不可用，使用本地缓存策略
    const now = Date.now();
    if (!cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      console.log('📡 /api/songs: 本地缓存过期或不存在，正在调用同步...');

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒超时

      try {
        // 调用同步API获取数据
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
            console.log(`✅ 本地缓存更新: ${cachedData.length} 首歌曲`);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('同步请求超时:', error);
        } else {
          console.error('同步调用失败:', error);
        }
        
        // 如果同步失败，尝试返回旧缓存数据（如果有的话）
        if (cachedData) {
          console.log('⚠️ 同步失败，使用旧缓存数据');
        }
      } finally {
        clearTimeout(timeoutId);
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

    // 添加缓存信息到响应
    res.status(200).json({
      code: 200,
      data: cachedData,
      total: cachedData.length,
      cached: true,
      cache_source: 'local',
      cache_age: Math.floor((now - lastSyncTime) / 1000),
      cache_expires_in: Math.floor((CACHE_DURATION - (now - lastSyncTime)) / 1000),
      message: `${cachedData.length} 首歌曲 (本地缓存)`
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
