import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import express from 'express';
import cloudCache from './cloud-cache-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class NotionAPI {
  constructor() {
    // 不再需要 Notion API 配置
  }

  // 测试 Supabase 连接
  async testConnection() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ 请设置 SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量');
        return false;
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      console.log('🔗 测试 Supabase 连接...');
      
      // 尝试获取歌曲表的第一条数据
      const { data, error } = await supabase
        .from('songs')
        .select('id, name')
        .limit(1);
      
      if (error) {
        console.error('❌ Supabase 连接失败:', error.message);
        return false;
      }
      
      console.log('✅ Supabase 连接正常');
      if (data && data.length > 0) {
        console.log(`📊 数据库中有数据，示例歌曲: ${data[0].name}`);
      } else {
        console.log('📊 数据库为空，但连接正常');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Supabase 连接异常:', error.message);
      return false;
    }
  }

  

  // 转换数据为Meting API兼容格式
  convertToNetEaseFormat(songData) {
    // 使用bv_number作为ID，如果没有则生成hash
    let songId;
    if (songData.bv_number) {
      // 简单hash算法生成数字ID
      let hash = 0;
      for (let i = 0; i < songData.bv_number.length; i++) {
        const char = songData.bv_number.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      songId = Math.abs(hash);
    } else {
      songId = Math.floor(Math.random() * 10000000);
    }

    return {
      id: songId.toString(), // Meting API使用字符串ID
      name: songData.title || '',
      // 艺术家信息
      artist: songData.creator ? songData.creator : '未知歌手',
      artists: songData.creator ? [{ name: songData.creator, id: 0, tencent: 0 }] : [{ name: '未知歌手', id: 0, tencent: 0 }],
      // 专辑信息
      album: songData.original_song || '未知专辑',
      album_id: 0,
      album_mid: '', // 专辑mid
      album_pic: songData.cover_url || '',
      // 音乐链接
      url: songData.video_url || '', // 实际播放链接
      // 封面图片
      pic: songData.cover_url || '', // 封面图片链接
      pic_url: songData.cover_url || '', // 封面图片链接
      // 播放统计
      play_count: songData.play_count || 0,
      played_count: songData.play_count || 0,
      // 其他字段
      source: 'netease', // 标识来源
      platform: 'netease', // 平台标识
      tencent: 0,
      kugou: 0,
      migu: 0,
      kuwo: 0,
      // 音质信息
      br: 128000, // 比特率
      // 其他可能的字段
      mid: '',
      lyric: '', // 歌词信息
      // 额外的原始字段
      bv_number: songData.bv_number,
      creation_time: songData.creation_time,
      publish_time: songData.publish_time,
      style: songData.style
    };
  }

  // 从云端缓存获取所有歌曲
  async getAllSongsFromCloud() {
    try {
      console.log('☁️  正在从云端缓存获取歌曲...');
      const songs = await cloudCache.getAllSongs();
      console.log(`✅ 从云端缓存获取 ${songs.length} 首歌曲`);
      return songs;
    } catch (error) {
      console.error('❌ 从云端缓存获取歌曲失败:', error.message);
      return [];
    }
  }

  // 启动音乐API服务器
  startMusicApiServer(port = 3456) {
    console.log('🎵 启动音乐API服务器');
    console.log(`🌐 服务器端口: ${port}`);
    console.log('📁 数据目录: ./data/');
    console.log('☁️  云端缓存: 已启用');

    const app = express();

    // CORS 中间件
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // Meting API 兼容路由

    // 搜索歌曲 - Meting API格式
    app.get('/search', async (req, res) => {
      try {
        const keywords = req.query.s || req.query.keywords || '';
        const type = req.query.type || 'hajihami'; // 默认使用hajihami平台
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        
        if (!keywords) {
          return res.json({ code: 400, result: { songs: [] } });
        }

        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 搜索匹配的歌曲
        const matchedSongs = netEaseSongs.filter(song => {
          const searchTerm = keywords.toLowerCase();
          // 搜索所有字段
          const searchText = (
            song.name + 
            (song.artist || '') + 
            (song.album || '')
          ).toLowerCase();
          return searchText.includes(searchTerm);
        });

        // 按匹配度排序
        const sortedSongs = matchedSongs.sort((a, b) => {
          const searchTerm = keywords.toLowerCase();
          
          // 计算匹配分数
          const getScore = (song) => {
            let score = 0;
            const name = song.name.toLowerCase();
            const artist = (song.artist || '').toLowerCase();
            const album = (song.album || '').toLowerCase();
            
            // 完全匹配得分最高
            if (name === searchTerm) score += 100;
            if (artist === searchTerm) score += 90;
            if (album === searchTerm) score += 80;
            
            // 开头匹配得分较高
            if (name.startsWith(searchTerm)) score += 50;
            if (artist.startsWith(searchTerm)) score += 45;
            if (album.startsWith(searchTerm)) score += 40;
            
            // 包含匹配得分较低
            if (name.includes(searchTerm)) score += 20;
            if (artist.includes(searchTerm)) score += 18;
            if (album.includes(searchTerm)) score += 15;
            
            return score;
          };
          
          return getScore(b) - getScore(a);
        });

        // 分页处理
        const startIndex = (page - 1) * limit;
        const paginatedSongs = sortedSongs.slice(startIndex, startIndex + limit);

        res.json({
          code: 200,
          songs: paginatedSongs,
          count: sortedSongs.length,
          total: sortedSongs.length,
          result: {
            songs: paginatedSongs,
            songCount: sortedSongs.length,
            searchType: type,
            keywords: keywords,
            page: page,
            limit: limit,
            total: sortedSongs.length
          }
        });
      } catch (error) {
        console.error('搜索API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取歌曲详情 - Meting API格式
    app.get('/song', async (req, res) => {
      try {
        const id = req.query.id || req.query.ids;
        const type = req.query.type || 'hajihami'; // 默认使用hajihami平台
        
        if (!id) {
          return res.json({ code: 400, message: '缺少歌曲ID参数' });
        }

        const idList = Array.isArray(id) ? id : id.toString().split(',');
        
        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 过滤匹配的歌曲
        const matchedSongs = netEaseSongs.filter(song => {
          const songId = song.id.toString();
          return idList.includes(songId);
        });

        if (matchedSongs.length === 0) {
          // Meting API返回空数组而不是错误
          return res.json({
            code: 200,
            songs: [],
            count: 0
          });
        }

        // 返回Meting API兼容格式
        res.json({
          code: 200,
          songs: matchedSongs,  // Meting API使用songs字段
          data: matchedSongs,   // 同时提供data字段保持兼容
          count: matchedSongs.length
        });
      } catch (error) {
        console.error('歌曲详情API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取歌词 - Meting API格式
    app.get('/lyric', async (req, res) => {
      try {
        const id = req.query.id;
        const type = req.query.type || 'hajihami'; // 默认使用hajihami平台
        
        if (!id) {
          return res.json({ code: 400, message: '缺少歌曲ID参数' });
        }

        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 查找匹配的歌曲
        const matchedSong = netEaseSongs.find(song => song.id.toString() === id.toString());
        
        if (!matchedSong) {
          return res.json({ code: 404, lyric: '', message: '未找到歌曲' });
        }

        // 模拟歌词数据（如果数据库中有歌词字段，可以从那里获取）
        const lyric = matchedSong.lyric || '[00:00.00] 暂无歌词\n';
        
        res.json({
          code: 200,
          lyric: lyric,
          translation: '' // 可以添加翻译歌词
        });
      } catch (error) {
        console.error('歌词API错误:', error);
        res.json({ code: 500, lyric: '', message: '服务器错误' });
      }
    });

    // 获取专辑信息 - Meting API格式
    app.get('/album', async (req, res) => {
      try {
        const id = req.query.id;
        const type = req.query.type || 'hajihami'; // 默认使用hajihami平台
        
        if (!id) {
          return res.json({ code: 400, message: '缺少专辑ID参数' });
        }

        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 根据专辑ID查找相关歌曲（这里简化处理，实际中专辑ID可能需要单独的处理逻辑）
        // 按专辑名称匹配歌曲
        const albumSongs = netEaseSongs.filter(song => 
          song.album.name.toLowerCase().includes(id.toLowerCase())
        );

        // 获取专辑信息
        const albumInfo = albumSongs.length > 0 ? {
          id: id,
          name: albumSongs[0].album.name,
          cover: albumSongs[0].picUrl,
          artist: albumSongs[0].artists[0]?.name || '未知',
          songs: albumSongs,
          count: albumSongs.length
        } : null;

        if (!albumInfo) {
          return res.json({ code: 404, message: '未找到专辑' });
        }

        res.json({
          code: 200,
          data: albumInfo,
          count: albumInfo.count
        });
      } catch (error) {
        console.error('专辑API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取艺术家信息 - Meting API格式
    app.get('/artist', async (req, res) => {
      try {
        const id = req.query.id;
        const type = req.query.type || 'hajihami'; // 默认使用hajihami平台
        
        if (!id) {
          return res.json({ code: 400, message: '缺少艺术家ID参数' });
        }

        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 根据艺术家ID查找相关歌曲（这里简化处理，按艺术家名称匹配）
        const artistSongs = netEaseSongs.filter(song => 
          song.artists.some(artist => 
            artist.name.toLowerCase().includes(id.toLowerCase())
          )
        );

        // 获取艺术家信息
        const artistInfo = artistSongs.length > 0 ? {
          id: id,
          name: artistSongs[0].artists[0]?.name || '未知艺术家',
          cover: artistSongs[0].picUrl,
          songs: artistSongs,
          count: artistSongs.length
        } : null;

        if (!artistInfo) {
          return res.json({ code: 404, message: '未找到艺术家' });
        }

        res.json({
          code: 200,
          data: artistInfo,
          count: artistInfo.count
        });
      } catch (error) {
        console.error('艺术家API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取所有歌曲（保留原有端点）
    app.get('/songs', async (req, res) => {
      try {
        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        res.json({
          code: 200,
          data: netEaseSongs,
          total: netEaseSongs.length
        });
      } catch (error) {
        console.error('获取歌曲API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 存活检查
    app.get('/ping', (req, res) => {
      res.json({ code: 200, message: 'OK', timestamp: new Date().toISOString() });
    });

    // 为Vercel等无服务器环境导出app
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = app; // For CommonJS
    }
    
    // 在非Vercel环境（本地）启动服务器
    if (typeof process.env.VERCEL === 'undefined' && 
        typeof process.env.NETLIFY === 'undefined' &&
        !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const server = app.listen(port, () => {
        console.log(`✅ 服务器已启动，访问 http://localhost:${port}`);
        console.log('🎵 支持的API端点 (Meting API 兼容):');
        console.log(`   - /song?id=123,456 (歌曲详情)`);
        console.log(`   - /search?s=关键词&type=netease (搜索歌曲)`);
        console.log(`   - /lyric?id=123 (获取歌词)`);
        console.log(`   - /album?id=专辑ID (获取专辑)`);
        console.log(`   - /artist?id=艺术家ID (获取艺术家)`);
        console.log(`   - /songs (获取所有歌曲)`);
        console.log(`   - /ping (存活检查)`);
        console.log(`   - /?server=netease&type=search&id=关键词 (标准Meting格式)`);
        console.log('\n🛑 按 Ctrl+C 停止服务器\n');
      });

      // 处理程序退出
      process.on('SIGINT', () => {
        console.log('\n🛑 停止音乐API服务器...');
        server.close(() => {
          console.log('✅ 服务器已停止');
          process.exit(0);
        });
      });
    } else {
      // 为无服务器环境导出处理函数
      return app;
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'api';

  const api = new NotionAPI();

  switch (command) {
    case 'test':
      // 测试 Supabase 连接
      await api.testConnection();
      break;

    case 'api':
    case 'server':
    default:
      // 启动音乐API服务器（默认端口3456）
      const port = parseInt(args[1]) || 3456;
      api.startMusicApiServer(port);
      break;
  }
}

export { NotionAPI };

// 如果直接运行，执行主函数
try {
  if (require.main === module && !process.env.VERCEL) {
    console.log('🚀 启动 HajihamiAPI (CommonJS 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
} catch (e) {
  // ES Module fallback
  if (import.meta.url.includes(process.argv[1]?.split(/[/\\]/).pop() || 'index.js') && !process.env.VERCEL) {
    console.log('🚀 启动 HajihamiAPI (ES Module 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
}

// 为Vercel等无服务器环境导出API
export default async function vercelHandler(req, res) {
  // 检查请求路径并路由到适当的处理函数
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  
  // 检查是否是标准Meting API请求格式（/api?server=...&type=...&id=...）
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const server = urlParams.get('server');
  const type = urlParams.get('type');
  const id = urlParams.get('id');
  
  if (pathname === '/api' && server && type) {
    // 这是标准Meting API格式请求
    const metingHandler = (await import('./api/meting-vercel.js')).default;
    return metingHandler(req, res);
  }
  
  // 根据路径路由到不同的处理函数
  if (pathname === '/api/song' || pathname === '/song') {
    // 动态导入处理函数
    const songHandler = (await import('./api/song-vercel.js')).default;
    return songHandler(req, res);
  } else if (pathname === '/api/search' || pathname === '/search') {
    const searchHandler = (await import('./api/search-vercel.js')).default;
    return searchHandler(req, res);
  } else if (pathname === '/api/lyric' || pathname === '/lyric') {
    const lyricHandler = (await import('./api/lyric-vercel.js')).default;
    return lyricHandler(req, res);
  } else if (pathname === '/api/album' || pathname === '/album') {
    const albumHandler = (await import('./api/album-vercel.js')).default;
    return albumHandler(req, res);
  } else if (pathname === '/api/artist' || pathname === '/artist') {
    const artistHandler = (await import('./api/artist-vercel.js')).default;
    return artistHandler(req, res);
  } else if (pathname === '/api/songs' || pathname === '/songs') {
    const songsHandler = (await import('./api/songs-vercel.js')).default;
    return songsHandler(req, res);
  } else if (pathname === '/api/ping' || pathname === '/ping') {
    const pingHandler = (await import('./api/ping-vercel.js')).default;
    return pingHandler(req, res);
  } else if (pathname === '/api' || pathname === '/') {
    // 默认返回API信息
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      message: "HajihamiAPI 服务运行中 (Meting API 兼容)",
      version: "2.0.3",
      endpoints: {
        songs: "/api/songs", 
        search: "/api/search",
        song: "/api/song",
        lyric: "/api/lyric",
        album: "/api/album",
        artist: "/api/artist",
        ping: "/api/ping",
        meting: "/api?server=...&type=...&id=..."
      },
      documentation: "支持Meting API格式，请访问 /api/songs, /api/search, /api/song, /api/lyric, /api/album, /api/artist, /api/ping 等端点，或使用标准Meting格式: /api?server=netease&type=search&id=keyword"
    });
  } else {
    // 未找到端点
    res.status(404).json({
      code: 404,
      message: "端点未找到"
    });
  }
}
