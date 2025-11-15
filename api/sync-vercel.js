// Vercel-specific sync endpoint that fetches and returns data immediately
// This works around Vercel's temporary file system limitation

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // 获取B站视频封面
    async function getBilibiliCover(bvNumber) {
      if (!bvNumber || process.env.SKIP_COVERS === 'true') return null;

      try {
        const axios = (await import('axios')).default;
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`;
        const response = await axios.get(apiUrl, { timeout: 5000 });

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

    // 查询数据库所有记录
    async function queryAllDatabasePages(databaseId) {
      let allPages = [];
      let hasMore = true;
      let startCursor = null;
      let pageCount = 0;

      while (hasMore && pageCount < 10) { // 限制页数避免超时
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

        // 每获取100页显示进度
        if (pageCount % 10 === 0) {
          console.log(`📦 已获取 ${allPages.length} 条记录 (第${pageCount}页)`);
        }
      }

      console.log(`✅ 数据库查询完成，共 ${allPages.length} 条记录`);
      return allPages;
    }

    // 获取并处理数据
    const dbId = databaseIds.split(',')[0].trim(); // 使用第一个数据库ID
    console.log(`🔄 开始处理数据库: ${dbId}`);

    const pages = await queryAllDatabasePages(dbId);

    // 解析数据
    console.log('🔧 解析数据中...');
    const parsedPages = pages.map(page => ({
      ...parsePageProperties(page),
      last_edited_time: page.last_edited_time
    }));

    // 获取封面（限制数量避免超时）
    console.log('🖼️ 获取B站封面...');
    const maxCoversToFetch = 50; // 每次同步最多获取50个封面

    for (let i = 0; i < Math.min(parsedPages.length, maxCoversToFetch); i++) {
      const page = parsedPages[i];
      if (page.bv_number) {
        page.cover_url = await getBilibiliCover(page.bv_number);
        console.log(`🖼️ ${i + 1}/${Math.min(parsedPages.length, maxCoversToFetch)} - ${page.bv_number}: ${page.cover_url ? '✅' : '❌'}`);
      }
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

    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'max-age=3600'); // 缓存1小时

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

    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    return res.status(500).json({
      code: 500,
      success: false,
      error: error.message,
      message: '同步失败，请查看服务器日志'
    });
  }
}
