// 异步同步处理器
import cloudCache from '../cloud-cache-adapter.js';

// 模拟一个简单的任务队列（实际生产中应该使用数据库或外部服务）
const taskQueue = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'POST') {
    // 创建一个新的同步任务
    const taskId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 启动后台同步任务
    processSyncTask(taskId).catch(error => {
      console.error(`后台同步任务失败 ${taskId}:`, error);
      const task = taskQueue.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
        taskQueue.set(taskId, task);
      }
    });

    return res.status(200).json({
      code: 200,
      success: true,
      taskId,
      message: '同步任务已启动，请稍后查询状态'
    });
  } else if (req.method === 'GET') {
    // 查询任务状态
    const { taskId } = req.query;
    if (!taskId) {
      return res.status(400).json({
        code: 400,
        success: false,
        error: '缺少 taskId 参数'
      });
    }

    const task = taskQueue.get(taskId);
    if (!task) {
      return res.status(404).json({
        code: 404,
        success: false,
        status: 'not_found',
        message: '任务不存在或已过期'
      });
    }

    return res.status(200).json({
      code: 200,
      success: true,
      taskId,
      status: task.status,
      progress: task.progress,
      total: task.total,
      completed: task.completed,
      error: task.error,
      message: `任务状态: ${task.status}`
    });
  }
}

async function processSyncTask(taskId) {
  // 初始化任务状态
  taskQueue.set(taskId, {
    status: 'running',
    progress: 0,
    total: 0,
    completed: 0,
    error: null
  });

  try {
    console.log(`🚀 后台同步任务开始: ${taskId}`);

    // 从环境变量获取配置
    const apiKey = process.env.NOTION_API_KEY;
    const databaseIds = process.env.NOTION_DATABASE_IDS;

    if (!apiKey || !databaseIds) {
      throw new Error('缺少必要的环境变量配置');
    }

    // 更新任务状态
    taskQueue.set(taskId, {
      status: 'running',
      progress: 5,
      total: 100,
      completed: 5,
      error: null
    });

    // 简化版同步逻辑（实际实现需要复制完整的同步逻辑）
    const baseURL = 'https://api.notion.com/v1';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };

    // 更新任务状态
    taskQueue.set(taskId, {
      status: 'running',
      progress: 10,
      total: 100,
      completed: 10,
      error: null
    });

    // 获取数据库 ID
    const dbIds = databaseIds.split(',').map(id => id.trim());
    let allPages = [];

    // 更新任务状态
    taskQueue.set(taskId, {
      status: 'running',
      progress: 15,
      total: 100,
      completed: 15,
      error: null
    });

    // 查询所有数据库
    for (let i = 0; i < dbIds.length; i++) {
      const dbId = dbIds[i];
      console.log(`🔄 正在处理数据库 ${i + 1}/${dbIds.length}: ${dbId.substring(0, 8)}`);

      // 查询数据库所有记录
      let hasMore = true;
      let startCursor = null;
      let pageCount = 0;
      const dbPages = [];

      while (hasMore) {
        pageCount++;
        const body = { page_size: 100 };

        if (startCursor) {
          body.start_cursor = startCursor;
        }

        const response = await fetch(`${baseURL}/databases/${dbId}/query`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const newPages = data.results || [];
        dbPages.push(...newPages);

        hasMore = data.has_more;
        startCursor = data.next_cursor;

        // 更新进度
        const progress = 15 + Math.floor(((i + (pageCount * 0.1) / (data.total ?? 100)) / dbIds.length) * 75);
        taskQueue.set(taskId, {
          status: 'running',
          progress: Math.min(progress, 90),
          total: 100,
          completed: Math.min(progress, 90),
          error: null
        });

        if (!hasMore || !startCursor) break;

        // 短暂延迟避免速率限制
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      allPages.push(...dbPages);
      console.log(`✅ 数据库 ${dbId.substring(0, 8)} 查询完成，共 ${dbPages.length} 条记录`);
    }

    // 更新任务状态
    taskQueue.set(taskId, {
      status: 'running',
      progress: 95,
      total: 100,
      completed: 95,
      error: null
    });

    // 转换数据格式
    const songs = allPages.map(page => {
      const properties = page.properties || {};
      
      const extractBvNumber = (videoUrl) => {
        if (!videoUrl) return null;
        const bvMatch = videoUrl.match(/BV[0-9A-Za-z]{10}/);
        return bvMatch ? bvMatch[0] : null;
      };

      const songData = {
        title: ((properties['作品名称']?.title || properties['作品名称']?.rich_text || [])[0] || {}).plain_text || '',
        creator: ((properties['全民制作人']?.rich_text || [])[0] || {}).plain_text || '',
        original_song: ((properties['原曲']?.rich_text || [])[0] || {}).plain_text || '',
        video_url: properties['视频链接']?.url || '',
        play_count: properties['播放量（纯数字）']?.number || 0,
        style: (properties['风格']?.select || {}).name || '',
        creation_time: ((properties['创作时代']?.rich_text || [])[0] || {}).plain_text || '',
        publish_time: (properties['发布时间']?.date || {}).start || null,
        bv_number: null,
        cover_url: null
      };

      songData.bv_number = extractBvNumber(songData.video_url);

      // 生成歌曲ID
      let songId;
      if (songData.bv_number) {
        let hash = 0;
        for (let i = 0; i < songData.bv_number.length; i++) {
          const char = songData.bv_number.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        songId = Math.abs(hash);
      } else {
        songId = Math.floor(Math.random() * 10000000);
      }

      return {
        id: songId,
        name: songData.title || '',
        artists: songData.creator ? [{ name: songData.creator }] : [],
        album: { name: songData.original_song || '未知' },
        url: songData.video_url || '',
        picUrl: songData.cover_url || '',
        playedCount: songData.play_count || 0,
        fee: 0,
        feeReason: 0,
        pc: true,
        noCopyrightRcmd: null,
        bv_number: songData.bv_number,
        creation_time: songData.creation_time,
        publish_time: songData.publish_time,
        style: songData.style
      };
    });

    // 保存到云端缓存（异步进行）
    if (songs.length > 0) {
      console.log(`☁️  尝试保存 ${songs.length} 首歌曲到云端缓存...`);
      cloudCache.saveSongs(songs).then(cloudResult => {
        if (cloudResult.success) {
          console.log(`✅ 云端缓存更新成功`);
        } else {
          console.error(`❌ 云端缓存更新失败:`, cloudResult.error);
        }
      }).catch(error => {
        console.error(`❌ 保存到云端缓存时出错:`, error.message);
      });
    }

    // 任务完成
    taskQueue.set(taskId, {
      status: 'completed',
      progress: 100,
      total: 100,
      completed: 100,
      error: null
    });

    console.log(`✅ 后台同步任务完成: ${taskId}, 同步了 ${songs.length} 首歌曲`);
  } catch (error) {
    console.error(`❌ 后台同步任务失败 ${taskId}:`, error);

    // 更新任务状态为失败
    taskQueue.set(taskId, {
      status: 'failed',
      progress: 0,
      total: 100,
      completed: 0,
      error: error.message
    });
  }

  // 1小时后清理任务记录
  setTimeout(() => {
    taskQueue.delete(taskId);
  }, 60 * 60 * 1000); // 1小时
}