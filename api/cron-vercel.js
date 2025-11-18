// Vercel Cron Job Handler
// 每日0点UTC执行同步（适合Hobby免费版）

export default async function handler(req, res) {
  // 验证是否来自 Vercel Cron
  if (req.headers['user-agent'] !== 'vercel-cron') {
    return res.status(400).json({ error: 'Invalid cron request' });
  }

  try {
    console.log('⏰ Vercel Cron: 每日同步开始...');

    // 由于Vercel环境的限制，我们直接调用同步API
    // 使用简化的同步逻辑来避免超时
    const syncResult = await triggerSync();

    res.status(200).json({
      success: true,
      message: '每日同步完成',
      result: syncResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 同步失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// 触发同步的函数
async function triggerSync() {
  try {
    // 使用fetch触发同步，设置较短超时时间
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒超时

    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'vercel-cron'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`同步API返回错误: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('同步API超时');
    }
    throw error;
  }
}

export const config = {
  runtime: 'edge', // 使用 Edge Runtime 优化性能
};