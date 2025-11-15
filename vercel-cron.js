// Vercel Cron Job Handler
// 每日0点UTC执行同步（适合Hobby免费版）

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('⏰ Vercel Cron: 每日同步开始...');

    // 由于Vercel环境的限制，我们直接调用同步API
    // 可以通过API触发同步，而不是直接执行
    return res.status(200).json({
      success: false,
      message: 'Hobby版每日同步已禁用，请使用/api/sync接口手动触发',
      timestamp: new Date().toISOString(),
      solution: '使用POST请求到/api/sync来触发同步'
    });

    // 以下代码在Hobby版一个函数最多运行10秒的限制下可能无法完成
    /*
    const { NotionSync } = await import('./index.js');

    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      throw new Error('未配置NOTION_API_KEY');
    }

    const sync = new NotionSync(apiKey);
    const result = await sync.syncAllDatabases(); // 这个可能超时

    console.log('✅ 每日同步完成');

    res.status(200).json({
      success: true,
      message: '每日同步完成',
      result,
      timestamp: new Date().toISOString()
    });
    */
  } catch (error) {
    console.error('❌ 同步失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
