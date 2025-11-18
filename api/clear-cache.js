// API endpoint to clear all cached songs
// 清空缓存数据库中的所有内容，但保留表结构和列

import cloudCache from '../cloud-cache-adapter.js';

export default async function handler(req, res) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      code: 405, 
      success: false, 
      message: 'Method not allowed, only POST is supported' 
    });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');

  try {
    console.log('🗑️ 开始清空缓存数据库...');

    // 清空所有歌曲数据
    const result = await cloudCache.clearAllSongs();

    if (result.success) {
      console.log('✅ 缓存数据库已清空');
      return res.status(200).json({
        code: 200,
        success: true,
        message: result.message || '缓存数据库已清空',
        cleared: true
      });
    } else {
      console.error('❌ 清空缓存数据库失败:', result.error);
      return res.status(500).json({
        code: 500,
        success: false,
        message: '清空缓存数据库失败',
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ 清空缓存数据库时发生错误:', error);
    return res.status(500).json({
      code: 500,
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
}