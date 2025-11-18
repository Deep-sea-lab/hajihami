// Vercel-specific sync endpoint with cloud cache integration - 增量同步
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
    console.log('🚀 Vercel Sync: 开始增量数据同步...');

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

    // 获取B站视频封面 - 使用1秒超时并立即跳过错误
    async function getBilibiliCover(bvNumber) {
      if (!bvNumber || process.env.SKIP_COVERS === 'true') return null;

      try {
        const axios = (await import('axios')).default;
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`;
        const response = await axios.get(apiUrl, { timeout: 1000 }); // 进一步降低超时时间

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
        // 立即跳过任何错误
        return null;
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

    // 查询所有页面
    async function queryAllPages(databaseId) {
      let allPages = [];
      let hasMore = true;
      let startCursor = null;
      const startTime = new Date().getTime(); // 初始化开始时间

      while (hasMore) {
        const body = { 
          page_size: 100, // 增加页面大小以提高效率
        };

        if (startCursor) {
          body.start_cursor = startCursor;
        }

        const response = await fetch(`${baseURL}/databases/${databaseId}/query`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          console.warn(`数据库 ${databaseId} 查询失败`);
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        const newPages = data.results || [];
        allPages = allPages.concat(newPages);
        hasMore = data.has_more;
        startCursor = data.next_cursor;

        // 每获取页面显示进度
        console.log(`📦 已获取 ${allPages.length} 条记录`);
        
        // 检查执行时间，防止超时
        if (process.env.VERCEL && Date.now() - startTime > 20000) { // 20秒后停止，留出处理时间
          console.log('⏰ 接近超时限制，停止获取更多页面');
          break;
        }
      }

      console.log(`✅ 数据库查询完成，共 ${allPages.length} 条记录`);
      return allPages;
    }

    // 获取云端缓存的歌曲数据用于对比
    let cachedSongs = [];
    try {
      cachedSongs = await cloudCache.getAllSongs();
      console.log(`🔄 从云端缓存获取 ${cachedSongs.length} 首歌曲用于对比`);
    } catch (error) {
      console.log('⚠️ 从云端缓存获取数据失败，继续同步:', error.message);
    }

    // 获取并处理数据
    const dbIds = databaseIds.split(',').map(id => id.trim());
    console.log(`🔄 开始处理 ${dbIds.length} 个数据库:`, dbIds);

    let allPages = [];
    
    for (const dbId of dbIds) {
      console.log(`🔄 开始处理数据库: ${dbId}`);
      const pages = await queryAllPages(dbId);
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
      
      // 每100条记录输出一次进度
      if ((i + 1) % 100 === 0 || i === total - 1) {
        process.stdout.write(`\r📊 解析进度: ${i + 1}/${total}`);
      }
    }
    process.stdout.write('\n');

    // 转换格式
    const newSongs = parsedPages.map(songData => {
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

    // 增量同步逻辑：对比云端缓存，只添加新数据或更新变化的数据
    const cachedSongIds = new Set(cachedSongs.map(song => song.id));
    const newSongsToSave = [];

    for (const newSong of newSongs) {
      if (!cachedSongIds.has(newSong.id)) {
        // 新歌曲，添加到保存列表
        newSongsToSave.push(newSong);
      } else {
        // 检查是否需要更新现有歌曲（比较关键字段）
        const existingSong = cachedSongs.find(song => song.id === newSong.id);
        if (existingSong) {
          // 如果关键信息发生变化，则更新
          if (existingSong.name !== newSong.name || 
              existingSong.url !== newSong.url || 
              existingSong.picUrl !== newSong.picUrl) {
            newSongsToSave.push(newSong); // 添加以覆盖更新
          }
        }
      }
    }

    console.log(`📊 增量同步统计: 总共${newSongs.length}首, 新增/更新${newSongsToSave.length}首, 已存在${newSongs.length - newSongsToSave.length}首`);

    // 如果有新数据需要保存
    if (newSongsToSave.length > 0) {
      // 获取封面（最小化数量和并发数以避免超时）
      console.log('🖼️ 获取B站封面（最小化处理）...');
      const maxCoversToFetch = 5; // 极大减少封面数量
      const coverPromises = [];

      // 批量处理封面获取，极小并发数
      for (let i = 0; i < Math.min(newSongsToSave.length, maxCoversToFetch); i++) {
        const page = newSongsToSave[i];
        if (page.bv_number) {
          // 创建封面获取Promise，但不等待
          const coverPromise = getBilibiliCover(page.bv_number).then(coverUrl => {
            page.cover_url = coverUrl;
            console.log(`🖼️ ${i + 1}/${Math.min(newSongsToSave.length, maxCoversToFetch)} - ${page.bv_number}: ${page.cover_url ? '✅' : '❌'}`);
          }).catch(() => {
            // 忽略所有错误
            page.cover_url = null;
          });
          
          coverPromises.push(coverPromise);
          
          // 极小并发数
          if (coverPromises.length >= 1) {  // 每次只处理1个
            await Promise.allSettled(coverPromises.splice(0, 1));
          }
        }
      }
      
      // 处理剩余的封面请求
      if (coverPromises.length > 0) {
        await Promise.allSettled(coverPromises);
      }

      // 将增量数据保存到云端缓存
      console.log(`☁️ 保存 ${newSongsToSave.length} 首新/更新歌曲到云端缓存...`);
      cloudCache.saveSongs(newSongsToSave).then(cloudResult => {
        if (cloudResult.success) {
          console.log(`✅ 云端缓存增量更新成功`);
        } else {
          console.error(`❌ 云端缓存增量更新失败:`, cloudResult.error);
        }
      }).catch(error => {
        console.error(`❌ 保存到云端缓存时出错:`, error.message);
      });

      // 更新本地缓存
      try {
        const allSongs = [...cachedSongs, ...newSongsToSave];
        fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(allSongs, null, 2));
        console.log(`💾 本地缓存已更新，总计 ${allSongs.length} 首歌曲`);
      } catch (error) {
        console.error('❌ 保存本地缓存失败:', error.message);
      }
    } else {
      console.log('✅ 无需更新，所有歌曲已是最新');
      // 如果没有新数据，仍然更新本地缓存（以防本地缓存丢失）
      try {
        if (!fs.existsSync(LOCAL_CACHE_FILE) && cachedSongs.length > 0) {
          fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(cachedSongs, null, 2));
          console.log(`💾 本地缓存已创建，总计 ${cachedSongs.length} 首歌曲`);
        }
      } catch (error) {
        console.error('❌ 创建本地缓存失败:', error.message);
      }
    }

    // 只返回同步统计信息，不返回完整数据以减少响应大小
    const response = {
      code: 200,
      success: true,
      newAdded: newSongsToSave.length,
      total: cachedSongs.length + newSongsToSave.length, // 显示总数
      sync_time: new Date().toISOString(),
      message: `增量同步完成，新增/更新 ${newSongsToSave.length} 首歌曲`
    };

    console.log(`✅ 增量同步完成，新增/更新 ${newSongsToSave.length} 首歌曲`);
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
