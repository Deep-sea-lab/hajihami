// API endpoint to get sync progress
// 获取同步进度

export default async function handler(req, res) {
  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      code: 405, 
      success: false, 
      message: 'Method not allowed, only GET is supported' 
    });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');

  try {
    // 读取进度文件
    const fs = require('fs');
    const progressFile = '/tmp/sync_progress.json';
    
    if (fs.existsSync(progressFile)) {
      const progressData = fs.readFileSync(progressFile, 'utf8');
      const progress = JSON.parse(progressData);
      
      return res.status(200).json({
        code: 200,
        success: true,
        progress: progress,
        message: `同步进度: ${progress.current} 条记录`
      });
    } else {
      return res.status(200).json({
        code: 200,
        success: true,
        progress: { current: 0, lastUpdate: null },
        message: '暂无同步进度'
      });
    }
  } catch (error) {
    console.error('❌ 获取同步进度时发生错误:', error);
    return res.status(500).json({
      code: 500,
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
}