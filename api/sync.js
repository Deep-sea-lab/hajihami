import { NotionSync } from '../index.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('⏰ 定时同步开始...');
    const apiKey = process.env.NOTION_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'NOTION_API_KEY not set' });
    }

    const sync = new NotionSync(apiKey);
    const result = await sync.syncAllDatabases();

    console.log('✅ 定时同步完成');
    res.status(200).json({
      success: true,
      message: '同步完成',
      data: result
    });
  } catch (error) {
    console.error('❌ 定时同步失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
