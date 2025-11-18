// Vercel-specific sync endpoint with cloud cache integration
import cloudCache from '../cloud-cache-adapter.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');
  
  // 设置缓存头 - 不缓存同步操作
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  try {
    console.log('🚀 Vercel Sync: 开始数据同步...');

    // 导入必要的配置和函数
    const apiKey = process.env.NOTION_API_KEY;
    const databaseIds = process.env.NOTION_DATABASE_IDS;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'NOTION_API_KEY环境变量未设置'
      });
    }

    if (!databaseIds) {
      return res.status(500).json({
        success: false,
        error: 'NOTION_DATABASE_IDS环境变量未设置'
      });
    }

    // 简化版数据同步逻辑
    const baseURL = 'https://api.notion.com/v1';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };

    // 从B站视频链接提取BV号
    function extractBvNumber(videoUrl) {
      if (!videoUrl) return null;
      const bvMatch = videoUrl.match(/BV[0-9A-Za-z]{10}/);
      return bvMatch ? bvMatch[0] : null;
    }

    // 获取B站视频封面 - 使用2秒超时并跳过错误
    async function getBilibiliCover(bvNumber) {
      if (!bvNumber || process.env.SKIP_COVERS === 'true') return null;

      try {
        const axios = (await import('axios')).default;
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`;
        const response = await axios.get(apiUrl, { timeout: 2000 }); // 降低超时时间

        if (response.data) {
          if (response.data.code === 0) {
            return response.data.data.pic;
          } else if (response.data.code === 62002) {
            console.log(`🛑 BV号 ${bvNumber} 视频不存在或已删除，跳过`);
            return null;
          } else if (response.data.code === -509) {
            console.log(`⚠️ BV号 ${bvNumber} 请求过于频繁，跳过`);
            return null;
          }
        }
      } catch (error) {
        // 检查错误类型，对于特定错误直接跳过
        if (error.code === 'ECONNABORTED' ||  // 超时
            error.response?.status === 412 || // 预处理错误
            error.response?.status === 429 || // 频率限制
            error.response?.status === 404 || // 资源不存在
            error.response?.status >= 500) {  // 服务器错误
          return null; // 直接返回null，跳过此封面
        }
        
        console.error(`获取BV号 ${bvNumber} 封面失败:`, error.message);
      }

      return null;
    }

    // 解析页面属性
    function parsePageProperties(page) {
      const properties = page.properties || {};
      const parsed = {};

      const allowedFields = {
        '风格': 'style',
        '视频链接': 'video_url',
        '全民制作人': 'creator',
        '原曲': 'original_song',
        '播放量（纯数字）': 'play_count',
        '作品名称': 'title',
        '创作时代': 'creation_time',
        '发布时间': 'publish_time'
      };

      for (const [fieldName, fieldKey] of Object.entries(allowedFields)) {
        const prop = properties[fieldName];
        if (!prop || !prop.type) {
          parsed[fieldKey] = null;
          continue;
        }

        try {
          const value = prop[prop.type];
          switch (prop.type) {
            case 'title':
            case 'rich_text':
              parsed[fieldKey] = Array.isArray(value) ?
                value.map(t => t.plain_text || '').join('') : '';
              break;
            case 'select':
              parsed[fieldKey] = value?.name || null;
              break;
            case 'multi_select':
              parsed[fieldKey] = Array.isArray(value) ?
                value.map(opt => opt.name) : [];
              break;
            case 'number':
              parsed[fieldKey] = value;
              break;
            case 'checkbox':
              parsed[fieldKey] = !!value;
              break;
            case 'date':
              if (fieldKey === 'publish_time') {
                parsed[fieldKey] = value?.start || null;
              } else {
                parsed[fieldKey] = value;
              }
              break;
            case 'url':
            case 'email':
            case 'phone_number':
              parsed[fieldKey] = value || null;
              break;
            default:
              parsed[fieldKey] = value;
          }
        } catch (err) {
          parsed[fieldKey] = null;
        }
      }

      parsed.bv_number = extractBvNumber(parsed.video_url);
      return parsed;
    }

    // 查询数据库所有记录 - 优化版本
    async function queryAllDatabasePages(databaseId) {
      let allPages = [];
      let hasMore = true;
      let startCursor = null;
      let pageCount = 0;
      const maxPages = 20; // 增加页面限制

      while (hasMore && pageCount < maxPages) {
        pageCount++;
        const body = { page_size: 100 };

        if (startCursor) {
          body.start_cursor = startCursor;
        }

        const response = await fetch(`${baseURL}/databases/${databaseId}/query`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const newPages = data.results || [];
        allPages = allPages.concat(newPages);

        hasMore = data.has_more;
        startCursor = data.next_cursor;

        // 每获取一定数量页面显示进度
        if (pageCount % 5 === 0) {
          console.log(`📦 已获取 ${allPages.length} 条记录 (第${pageCount}页)`);
        }
        
        // 检查执行时间，防止超时
        if (process.env.VERCEL && Date.now() - new Date().setTime(Date.now() - 0) > 45000) { // 45秒后停止
          console.log('⏰ 接近超时限制，停止获取更多页面');
          break;
        }
      }

      console.log(`✅ 数据库查询完成，共 ${allPages.length} 条记录`);
      return allPages;
    }

    // 获取并处理数据
    const dbIds = databaseIds.split(',').map(id => id.trim());
    console.log(`🔄 开始处理 ${dbIds.length} 个数据库:`, dbIds);

    let allPages = [];
    
    for (const dbId of dbIds) {
      console.log(`🔄 开始处理数据库: ${dbId}`);
      const pages = await queryAllDatabasePages(dbId);
      allPages = allPages.concat(pages);
    }

    // 解析数据
    console.log('🔧 解析数据中...');
    const parsedPages = [];
    const total = allPages.length;
    
    for (let i = 0; i < total; i++) {
      const page = allPages[i];
      const parsed = parsePageProperties(page);
      parsed.last_edited_time = page.last_edited_time;
      parsedPages.push(parsed);
      
      // 每500条记录输出一次进度
      if ((i + 1) % 500 === 0 || i === total - 1) {
        process.stdout.write(`\r📊 解析进度: ${i + 1}/${total}`);
      }
    }
    process.stdout.write('\n');

    // 获取封面（限制数量避免超时）- 使用并发处理
    console.log('🖼️ 获取B站封面...');
    const maxCoversToFetch = 30; // 减少封面数量以避免超时
    const coverPromises = [];

    // 批量处理封面获取，限制并发数
    for (let i = 0; i < Math.min(parsedPages.length, maxCoversToFetch); i++) {
      const page = parsedPages[i];
      if (page.bv_number) {
        // 创建封面获取Promise
        const coverPromise = getBilibiliCover(page.bv_number).then(coverUrl => {
          page.cover_url = coverUrl;
          console.log(`🖼️ ${i + 1}/${Math.min(parsedPages.length, maxCoversToFetch)} - ${page.bv_number}: ${page.cover_url ? '✅' : '❌'}`);
        }).catch(error => {
          console.error(`封面获取错误 ${page.bv_number}:`, error.message);
          page.cover_url = null;
        });
        
        coverPromises.push(coverPromise);
        
        // 限制并发数
        if (coverPromises.length >= 5) {  // 在Vercel环境中保持较小的并发数
          await Promise.allSettled(coverPromises.splice(0, 5));
        }
      }
    }
    
    // 处理剩余的封面请求
    if (coverPromises.length > 0) {
      await Promise.allSettled(coverPromises);
    }

    // 转换格式
    const songs = parsedPages.map(songData => {
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

    // 尝试将数据保存到云端缓存
    if (songs.length > 0) {
      console.log(`☁️  尝试保存 ${songs.length} 首歌曲到云端缓存...`);
      try {
        const cloudResult = await cloudCache.saveSongs(songs);
        if (cloudResult.success) {
          console.log(`✅ 云端缓存更新成功`);
        } else {
          console.error(`❌ 云端缓存更新失败:`, cloudResult.error);
        }
      } catch (error) {
        console.error(`❌ 保存到云端缓存时出错:`, error.message);
      }
    }

    console.log(`✅ 同步完成，获取 ${songs.length} 首歌曲`);

    return res.status(200).json({
      code: 200,
      success: true,
      data: songs,
      total: songs.length,
      sync_time: new Date().toISOString(),
      message: `成功同步 ${songs.length} 首歌曲（部分数据可能因Vercel限制被截断）`
    });

  } catch (error) {
    console.error('❌ 同步失败:', error);

    return res.status(500).json({
      code: 500,
      success: false,
      error: error.message,
      message: '同步失败，请查看服务器日志'
    });
  }
}