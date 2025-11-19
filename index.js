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

  

  // 转换数据为网易云格式
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

    // 网易云音乐API兼容路由

    // 歌曲详情
    app.get('/song/detail', async (req, res) => {
      try {
        const ids = req.query.ids;
        if (!ids) {
          return res.json({ code: 400, message: '缺少歌曲ID参数' });
        }

        const idList = ids.split(',').map(id => parseInt(id));
        
        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 过滤匹配的歌曲
        const matchedSongs = netEaseSongs.filter(song => idList.includes(song.id));

        res.json({
          code: 200,
          songs: matchedSongs,
          privileges: matchedSongs.map(() => ({
            id: 0,
            fee: 0,
            payed: 0,
            realPayed: 0,
            st: 0,
            pl: 128000,
            dl: 128000,
            sp: 7,
            cp: 1,
            subp: 1,
            cs: false,
            maxbr: 128000,
            fl: 128000,
            toast: false,
            flag: 0,
            preSell: false
          }))
        });
      } catch (error) {
        console.error('歌曲详情API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 搜索歌曲
    app.get('/search', async (req, res) => {
      try {
        const keywords = req.query.keywords;
        const type = req.query.type || 'all'; // all, song, artist, album
        
        if (!keywords) {
          return res.json({ code: 400, result: { songs: [] } });
        }

        // 从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        if (!allSongs) {
          allSongs = [];
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 分类关键词匹配
        const matchedSongs = netEaseSongs.filter(song => {
          const searchTerm = keywords.toLowerCase();
          
          switch (type) {
            case 'song':
              // 只搜索歌曲名称
              return song.name.toLowerCase().includes(searchTerm);
            
            case 'artist':
              // 只搜索歌手名称
              return song.artists.some(artist => 
                artist.name.toLowerCase().includes(searchTerm)
              );
            
            case 'album':
              // 只搜索专辑名称
              return song.album.name.toLowerCase().includes(searchTerm);
            
            case 'all':
            default:
              // 搜索所有字段
              const searchText = (
                song.name + 
                (song.artists[0]?.name || '') + 
                (song.album.name || '')
              ).toLowerCase();
              return searchText.includes(searchTerm);
          }
        });

        // 按匹配度排序
        const sortedSongs = matchedSongs.sort((a, b) => {
          const searchTerm = keywords.toLowerCase();
          
          // 计算匹配分数
          const getScore = (song) => {
            let score = 0;
            const name = song.name.toLowerCase();
            const artist = song.artists[0]?.name.toLowerCase() || '';
            const album = song.album.name.toLowerCase();
            
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

        res.json({
          code: 200,
          result: {
            songs: sortedSongs,
            songCount: sortedSongs.length,
            searchType: type,
            keywords: keywords
          }
        });
      } catch (error) {
        console.error('搜索API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取所有歌曲
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

    // 启动服务器
    const server = app.listen(port, () => {
      console.log(`✅ 服务器已启动，访问 http://localhost:${port}`);
      console.log('🎵 支持的API端点:');
      console.log(`   - /song/detail?ids=123,456 (歌曲详情)`);
      console.log(`   - /search?keywords=关键词 (搜索歌曲)`);
      console.log(`   - /songs (获取所有歌曲)`);
      console.log(`   - /ping (存活检查)`);
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
  if (require.main === module) {
    console.log('🚀 启动 HajihamiAPI (CommonJS 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
} catch (e) {
  // ES Module fallback
  if (import.meta.url.includes(process.argv[1]?.split(/[/\\]/).pop() || 'index.js')) {
    console.log('🚀 启动 HajihamiAPI (ES Module 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
}