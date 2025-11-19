// Vercel云函数：完整的Notion数据获取和同步到云端缓存
import cloudCache from '../cloud-cache-adapter.js';
import fs from 'fs';
import path from 'path';

// 本地缓存路径 - 在Vercel环境中使用/tmp目录
const LOCAL_CACHE_DIR = '/tmp/data';
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, 'songs.json');

// 确保本地缓存目录存在
if (!fs.existsSync(LOCAL_CACHE_DIR)) {
  fs.mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
}

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
    // 获取查询参数
    const { range } = req.query || req.body || {};
    let startRange, endRange;
    
    if (range === '1') {
      startRange = 0;      // 从第1条开始（数组索引0）
      endRange = 999;      // 到第1000条结束（数组索引999）
      console.log('🚀 开始同步Notion数据范围 1-1000...');
    } else if (range === '2') {
      startRange = 1000;   // 从第1001条开始（数组索引1000）
      endRange = 1999;     // 到第2000条结束（数组索引1999）
      console.log('🚀 开始同步Notion数据范围 1001-2000...');
    } else {
      // 如果没有指定范围参数或参数无效，则进行全量同步
      startRange = 0;
      endRange = Infinity; // 无限制，全量同步
      console.log('🚀 开始完整的Notion数据同步流程...');
    }

    // 1. 获取环境变量
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

    // 2. 初始化API配置
    const baseURL = 'https://api.notion.com/v1';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };

    // 3. 从B站视频链接提取BV号
    function extractBvNumber(videoUrl) {
      if (!videoUrl) return null;
      const bvMatch = videoUrl.match(/BV[0-9A-Za-z]{10}/);
      return bvMatch ? bvMatch[0] : null;
    }

    // 4. 获取B站视频封面 - 使用环境变量判定
    async function getBilibiliCover(bvNumber) {
      // 检查环境变量是否跳过封面获取
      if (!bvNumber || process.env.SKIP_COVERS === 'true') {
        console.log('⏭️  环境变量设置跳过封面获取');
        return null;
      }

      try {
        const axios = (await import('axios')).default;
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`;
        const response = await axios.get(apiUrl, { timeout: 1000 }); // 1秒超时

        if (response.data) {
          if (response.data.code === 0) {
            console.log(`🖼️  成功获取BV号 ${bvNumber} 的封面`);
            return response.data.data.pic;
          } else if (response.data.code === 62002) {
            console.log(`🛑 BV号 ${bvNumber} 视频不存在或已删除，跳过`);
            return null;
          } else if (response.data.code === -509) {
            console.log(`⚠️  BV号 ${bvNumber} 请求过于频繁，跳过`);
            return null;
          }
        }
      } catch (error) {
        console.log(`⚠️  获取BV号 ${bvNumber} 封面失败:`, error.message);
        return null;
      }

      return null;
    }

    // 5. 解析页面属性
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

    // 6. 查询指定范围的页面（跳过前面不需要的数据）
    async function queryRangePages(databaseId, startRange, endRange) {
      let allPages = [];
      let hasMore = true;
      let currentCursor = null;
      const startTime = new Date().getTime(); // 初始化开始时间

      // 需要跳过的页面数量
      let skipCount = startRange;
      let processedCount = 0;

      while (hasMore && processedCount <= endRange - startRange) {
        const body = { 
          page_size: 100,
        };

        if (currentCursor) {
          body.start_cursor = currentCursor;
        }

        const response = await fetch(`${baseURL}/databases/${databaseId}/query`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          console.warn(`数据库 ${databaseId} 查询失败: ${response.status} ${await response.text()}`);
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        let newPages = data.results || [];
        
        // 跳过前面不需要的页面
        if (skipCount > 0) {
          const skipFromThisBatch = Math.min(skipCount, newPages.length);
          newPages = newPages.slice(skipCount);
          skipCount -= skipFromThisBatch;
          processedCount += skipFromThisBatch;
        }
        
        // 添加到结果中，但不超过所需数量
        const remainingSlots = (endRange - startRange + 1) - allPages.length;
        if (newPages.length > remainingSlots) {
          newPages = newPages.slice(0, remainingSlots);
        }
        
        allPages = allPages.concat(newPages);
        processedCount += newPages.length;
        
        console.log(`📦 已获取 ${allPages.length} 条记录 (本次批次: ${newPages.length})`);
        
        // 更新同步进度到临时存储
        try {
          const progressInfo = {
            current: allPages.length,
            lastUpdate: new Date().toISOString()
          };
          // 将进度信息存储到临时文件，以便外部访问
          fs.writeFileSync('/tmp/sync_progress.json', JSON.stringify(progressInfo));
        } catch (e) {
          console.log('⚠️ 无法更新同步进度文件:', e.message);
        }

        hasMore = data.has_more && allPages.length < (endRange - startRange + 1);
        currentCursor = data.next_cursor;

        // 检查执行时间，防止超时
        if (process.env.VERCEL && Date.now() - startTime > 50000) { // 50秒后停止，留出处理时间
          console.log('⏰ 接近超时限制，停止获取更多页面，当前已获取:', allPages.length);
          break;
        }
        
        // 如果已经获取了足够的数据，停止
        if (allPages.length >= (endRange - startRange + 1)) {
          break;
        }
      }

      console.log(`✅ 数据库范围查询完成，共 ${allPages.length} 条记录`);
      return allPages;
    }

    // 7. 获取并处理数据（根据范围参数）
    const dbIds = databaseIds.split(',').map(id => id.trim());
    console.log(`🔄 开始处理 ${dbIds.length} 个数据库:`, dbIds);

    let allPages = [];
    
    for (const dbId of dbIds) {
      console.log(`🔄 开始处理数据库: ${dbId}`);
      
      // 根据是否有范围参数决定查询方式
      if (startRange !== 0 || endRange !== Infinity) {
        // 只查询指定范围的数据
        const rangePages = await queryRangePages(dbId, startRange, endRange);
        allPages = allPages.concat(rangePages);
      } else {
        // 查询所有数据
        let hasMore = true;
        let startCursor = null;
        
        while (hasMore) {
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
          
          console.log(`🔄 当前总计获取: ${allPages.length} 条记录`);
        }
      }
    }
    
    console.log(`📋 最终数据量: ${allPages.length} 条`);

    // 8. 解析数据
    console.log('🔧 解析数据中...');
    const parsedPages = [];
    const total = allPages.length;
    
    for (let i = 0; i < total; i++) {
      const page = allPages[i];
      const parsed = parsePageProperties(page);
      parsed.last_edited_time = page.last_edited_time;
      parsedPages.push(parsed);
      
      // 每100条记录输出一次进度
      if ((i + 1) % 100 === 0 || i === total - 1) {
        process.stdout.write(`\r📊 解析进度: ${i + 1}/${total}`);
      }
    }
    process.stdout.write('\n');

    // 9. 转换格式
    const allSongs = parsedPages.map(songData => {
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

    // 10. 获取封面（根据环境变量判定）
    console.log('🖼️ 获取B站封面...');
    const maxCoversToFetch = process.env.MAX_COVERS ? parseInt(process.env.MAX_COVERS) : 100; // 默认获取100个封面
    const coverPromises = [];

    // 批量处理封面获取，限制并发数
    for (let i = 0; i < Math.min(allSongs.length, maxCoversToFetch); i++) {
      const song = allSongs[i];
      if (song.bv_number) {
        // 创建封面获取Promise，但不等待
        const coverPromise = getBilibiliCover(song.bv_number).then(coverUrl => {
          song.picUrl = coverUrl; // 更新歌曲的封面URL
          console.log(`🖼️ ${i + 1}/${Math.min(allSongs.length, maxCoversToFetch)} - ${song.bv_number}: ${song.picUrl ? '✅' : '❌'}`);
        }).catch(() => {
          // 忽略所有错误
          song.picUrl = null;
        });
        
        coverPromises.push(coverPromise);
        
        // 控制并发数，避免超时
        if (coverPromises.length >= 5) {  // 每5个并发
          await Promise.allSettled(coverPromises.splice(0, 5));
        }
      }
    }
    
    // 处理剩余的封面请求
    if (coverPromises.length > 0) {
      await Promise.allSettled(coverPromises);
    }

    // 11. 分片保存数据到云端缓存（避免Vercel截断问题）
    console.log(`☁️ 分片保存 ${allSongs.length} 首歌曲到云端缓存...`);
    let cloudResult;
    if (allSongs.length > 1000) {
      // 如果数据量大，分片保存
      const chunkSize = 1000;
      let successCount = 0;
      let totalCount = Math.ceil(allSongs.length / chunkSize);
      
      for (let i = 0; i < allSongs.length; i += chunkSize) {
        const chunk = allSongs.slice(i, i + chunkSize);
        const chunkResult = await cloudCache.saveSongs(chunk);
        if (chunkResult.success) {
          successCount++;
          console.log(`☁️ 分片 ${Math.floor(i / chunkSize) + 1}/${totalCount} 保存成功 (${chunk.length} 首)`);
        } else {
          console.error(`❌ 分片 ${Math.floor(i / chunkSize) + 1} 保存失败:`, chunkResult.error);
        }
      }
      
      cloudResult = { success: successCount === totalCount, totalChunks: totalCount, successfulChunks: successCount };
    } else {
      // 如果数据量不大，直接保存
      cloudResult = await cloudCache.saveSongs(allSongs);
    }
    
    if (cloudResult.success) {
      console.log(`✅ 云端缓存全量更新成功`);
    } else {
      console.error(`❌ 云端缓存全量更新失败:`, cloudResult);
    }

    // 12. 更新本地缓存
    try {
      fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(allSongs, null, 2));
      console.log(`💾 本地缓存已更新，总计 ${allSongs.length} 首歌曲`);
    } catch (error) {
      console.error('❌ 保存本地缓存失败:', error.message);
    }

    // 13. 返回同步结果（对于大量数据，避免返回完整数据集以防止截断）
    const response = {
      code: 200,
      success: cloudResult.success,
      total: allSongs.length,
      sync_time: new Date().toISOString(),
      message: `全量同步完成，同步 ${allSongs.length} 首歌曲`
    };

    // 如果数据量较小，可以返回完整数据；否则只返回基本信息以避免截断
    if (allSongs.length <= 1000) {
      response.updatedSongs = allSongs;
    } else {
      response.message += ` (数据量较大，如需获取数据请使用 /api/songs 接口分页获取)`;
    }

    console.log(`✅ 全量同步完成，同步 ${allSongs.length} 首歌曲`);
    return res.status(200).json(response);

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

