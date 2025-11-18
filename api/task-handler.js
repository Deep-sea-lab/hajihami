// 改进的异步同步处理器
import cloudCache from '../cloud-cache-adapter.js';

// 简单的内存任务存储（生产环境应使用数据库）
const taskStorage = new Map();

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
    
    // 初始化任务状态
    const taskData = {
      id: taskId,
      status: 'pending',
      progress: 0,
      total: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
      result: null
    };
    
    taskStorage.set(taskId, taskData);
    
    // 在后台启动同步任务
    setTimeout(async () => {
      await runSyncTask(taskId);
    }, 100); // 稍微延迟开始任务

    return res.status(200).json({
      code: 200,
      success: true,
      taskId,
      message: '同步任务已启动，请使用 GET /api/task/status?taskId=' + taskId + ' 查询状态'
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

    const task = taskStorage.get(taskId);
    if (!task) {
      return res.status(404).json({
        code: 404,
        success: false,
        error: '任务不存在或已过期'
      });
    }

    return res.status(200).json({
      code: 200,
      success: true,
      ...task
    });
  }
}

async function runSyncTask(taskId) {
  try {
    // 更新任务状态为运行中
    updateTaskStatus(taskId, 'running', 0, '开始同步 Notion 数据库');

    console.log(`🔄 同步任务 ${taskId} 开始执行...`);

    // 获取环境变量
    const apiKey = process.env.NOTION_API_KEY;
    const databaseIds = process.env.NOTION_DATABASE_IDS;

    if (!apiKey) {
      throw new Error('NOTION_API_KEY 未配置');
    }

    if (!databaseIds) {
      throw new Error('NOTION_DATABASE_IDS 未配置');
    }

    // 这里实现简化版同步逻辑
    // 在实际实现中，您需要从您的 NotionSync 类复制完整的同步逻辑
    const result = await performSync();

    // 更新任务状态为完成
    updateTaskStatus(taskId, 'completed', 100, '同步完成', result);
    console.log(`✅ 同步任务 ${taskId} 完成`);
  } catch (error) {
    console.error(`❌ 同步任务 ${taskId} 失败:`, error);
    updateTaskStatus(taskId, 'failed', 0, error.message);
  }
}

function updateTaskStatus(taskId, status, progress, message, result = null) {
  const task = taskStorage.get(taskId);
  if (task) {
    task.status = status;
    task.progress = progress;
    task.updated_at = new Date().toISOString();
    task.message = message;
    if (result) {
      task.result = result;
    }
    taskStorage.set(taskId, task);
  }
}

async function performSync() {
  // 这里是简化版的同步实现
  // 实际中应该调用您现有的同步逻辑
  return {
    success: true,
    recordsProcessed: Math.floor(Math.random() * 10000), // 模拟处理的记录数
    message: '同步完成'
  };
}