import { execSync } from 'child_process';

// Vercel定时任务执行器
// 这个文件会被Vercel的crons定期调用

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 执行同步命令
    console.log('⚡ Vercel Cron: 触发定时同步...');

    // 在Vercel环境中运行同步
    execSync('node index.js sync', { stdio: 'inherit' });

    res.status(200).json({
      success: true,
      message: '同步完成',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('同步失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
