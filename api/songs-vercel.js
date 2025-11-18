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

    // Vercel API endpoint for /api/songs
// 优先从云端缓存获取数据，支持分片以避免Vercel截断

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
        
        // 获取分页参数
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.limit) || 1000; // 默认分片大小为1000
        
        // 如果请求参数包含分页，则返回分片数据
        if (page && pageSize && (page > 1 || req.query.page || req.query.pageSize || req.query.limit)) {
          const startIndex = (page - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const pagedSongs = songs.slice(startIndex, endIndex);
          
          return res.status(200).json({
            code: 200,
            data: pagedSongs,
            total: songs.length,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(songs.length / pageSize),
            hasMore: endIndex < songs.length,
            cached: true,
            cache_source: 'cloud',
            message: `${pagedSongs.length} 首歌曲 (第${page}页/${Math.ceil(songs.length / pageSize)}页, 云端缓存)`
          });
        }
        
        // 如果数据量很大，建议使用分页参数
        if (songs.length > 1000) {
          console.log(`⚠️ 数据量较大 (${songs.length} 首)，建议使用分页参数如 ?page=1&pageSize=1000`);
        }
        
        return res.status(200).json({
          code: 200,
          data: songs,
          total: songs.length,
          cached: true,
          cache_source: 'cloud',
          message: `${songs.length} 首歌曲 (云端缓存)`
        });
      } else {
        console.log('⚠️  云端缓存为空');
      }
    } catch (cloudError) {
      console.error('❌ 从云端缓存获取数据失败:', cloudError.message);
    }

    // 检查是否有强制刷新参数
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const getAllSongs = req.query.all === 'true' || req.query.getAll === 'true';
    const now = Date.now();
    
    if (forceRefresh || getAllSongs || !cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      if (forceRefresh) {
        console.log('🔄 强制刷新模式，调用同步API...');
      } else if (getAllSongs) {
        console.log('🔄 获取所有歌曲模式，调用同步API...');
      } else {
        console.log('📡 /api/songs: 本地缓存过期或不存在，正在调用同步...');
      }

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 恢复到标准超时时间

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

    // 获取分页参数
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.limit) || 1000; // 默认分片大小为1000
    
    // 如果请求参数包含分页，则返回分片数据
    if (page && pageSize && (page > 1 || req.query.page || req.query.pageSize || req.query.limit)) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pagedSongs = cachedData.slice(startIndex, endIndex);
      
      return res.status(200).json({
        code: 200,
        data: pagedSongs,
        total: cachedData.length,
        page: page,
        pageSize: pageSize,
        totalPages: Math.ceil(cachedData.length / pageSize),
        hasMore: endIndex < cachedData.length,
        cached: true,
        cache_source: 'local',
        message: `${pagedSongs.length} 首歌曲 (第${page}页/${Math.ceil(cachedData.length / pageSize)}页, 本地缓存)`
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
    
    // 检查是否有强制刷新参数
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    const getAllSongs = req.query.all === 'true' || req.query.getAll === 'true';
    
    if (forceRefresh || getAllSongs || !cachedData || !lastSyncTime || (now - lastSyncTime) > CACHE_DURATION) {
      if (forceRefresh) {
        console.log('🔄 强制刷新模式，调用同步API...');
      } else if (getAllSongs) {
        console.log('🔄 获取所有歌曲模式，调用同步API...');
      } else {
        console.log('📡 /api/songs: 本地缓存过期或不存在，正在调用同步...');
      }

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 增加超时时间到45秒

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
