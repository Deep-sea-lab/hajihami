// Vercel API endpoint that returns empty data
// Note: Vercel serverless functions can't persist file data
// Use /api/sync to trigger data updates which are lost on function restart

export default async function handler(req, res) {
  // 在Vercel环境中，由于文件系统是临时的
  // 我们需要返回空数据或错误信息

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');

  try {
    res.status(200).json({
      code: 200,
      data: [],
      total: 0,
      message: 'Vercel环境不支持持久化数据存储。请使用/api/sync手动同步数据后立即访问。'
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
