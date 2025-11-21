// Vercel API endpoint for Meting API compatible format
// Supports: /api?server=netease&type=search&id=keyword
import cloudCache from '../cloud-cache-adapter.js';

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');
  
  // 设置缓存头
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    const { server = 'hajihami', type, id } = req.query;

    if (!type) {
      return res.status(400).json({
        code: 400,
        message: '缺少type参数'
      });
    }

    // 转换数据为Meting API兼容格式
    const convertToNetEaseFormat = (songData) => {
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
        source: server, // 使用传入的server参数
        platform: server, // 平台标识
        tencent: 0,
        kugou: 0,
        migu: 0,
        kuwo: 0,
        // 音质信息
        br: 128000, // 比特率
        // 其他可能的字段
        mid: '',
        lyric: songData.lyric || '', // 歌词信息
        // 额外的原始字段
        bv_number: songData.bv_number,
        creation_time: songData.creation_time,
        publish_time: songData.publish_time,
        style: songData.style
      };
    };

    // 根据type参数处理不同操作
    switch (type) {
      case 'search':
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '搜索操作需要id参数（关键词）'
          });
        }

        // 从云端缓存获取数据
        let allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const searchSongs = allSongs.map(song => convertToNetEaseFormat(song));

        // 搜索匹配的歌曲
        const matchedSongs = searchSongs.filter(song => {
          const searchTerm = id.toLowerCase();
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
          const searchTerm = id.toLowerCase();
          
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

        res.status(200).json(sortedSongs);

        break;

      case 'song':
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '歌曲详情操作需要id参数（歌曲ID）'
          });
        }

        // 从云端缓存获取数据
        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const songSongs = allSongs.map(song => convertToNetEaseFormat(song));

        // 过滤匹配的歌曲
        const idList = id.toString().split(',');
        const matchedSong = songSongs.filter(song => {
          const songId = song.id.toString();
          return idList.includes(songId);
        });

        res.status(200).json(matchedSong);

        break;

      case 'album':
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '专辑操作需要id参数（专辑ID）'
          });
        }

        // 从云端缓存获取数据
        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const albumSongs = allSongs.map(song => convertToNetEaseFormat(song));

        // 根据专辑ID查找相关歌曲（这里简化处理，按专辑名称匹配）
        const albumMatchedSongs = albumSongs.filter(song => 
          song.album.toLowerCase().includes(id.toLowerCase())
        );

        res.status(200).json(albumMatchedSongs);

        break;

      case 'artist':
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '艺术家操作需要id参数（艺术家ID）'
          });
        }

        // 从云端缓存获取数据
        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const artistSongs = allSongs.map(song => convertToNetEaseFormat(song));

        // 根据艺术家ID查找相关歌曲（这里简化处理，按艺术家名称匹配）
        const artistMatchedSongs = artistSongs.filter(song => 
          song.artists.some(artist => 
            artist.name.toLowerCase().includes(id.toLowerCase())
          )
        );

        res.status(200).json(artistMatchedSongs);

        break;

      case 'lrc':
      case 'lyric':
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '歌词操作需要id参数（歌曲ID）'
          });
        }

        // 从云端缓存获取数据
        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const lyricSongs = allSongs.map(song => convertToNetEaseFormat(song));

        // 查找匹配的歌曲
        const foundSong = lyricSongs.find(song => song.id.toString() === id.toString());
        
        if (!foundSong) {
          return res.status(200).send('[00:00.00] 暂无歌词\n');
        }

        // 返回歌词，如果有则返回实际歌词，否则返回空歌词
        const lyric = foundSong.lyric || '[00:00.00] 暂无歌词\n';
        res.status(200).send(lyric);

        break;

      case 'playlist':
        // 返回所有歌曲作为歌单
        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const playlistSongs = allSongs.map(song => convertToNetEaseFormat(song));
        res.status(200).json(playlistSongs);

        break;

      case 'pic':
        // 返回封面图片链接（302重定向）
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '封面图片操作需要id参数（歌曲ID）'
          });
        }

        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const picSongs = allSongs.map(song => convertToNetEaseFormat(song));

        const picSong = picSongs.find(song => song.id.toString() === id.toString());
        
        if (!picSong || !picSong.pic) {
          return res.status(404).json({ error: '未找到封面图片' });
        }

        // 302重定向到图片URL
        res.redirect(302, picSong.pic);

        break;

      case 'url':
        // 返回播放链接（302重定向）
        if (!id) {
          return res.status(400).json({
            code: 400,
            message: '播放链接操作需要id参数（歌曲ID）'
          });
        }

        allSongs = await cloudCache.getAllSongs();
        
        if (!allSongs) {
          allSongs = [];
        }

        const urlSongs = allSongs.map(song => convertToNetEaseFormat(song));

        const urlSong = urlSongs.find(song => song.id.toString() === id.toString());
        
        if (!urlSong || !urlSong.url) {
          return res.status(404).json({ error: '未找到播放链接' });
        }

        // 302重定向到音频URL
        res.redirect(302, urlSong.url);

        break;

      default:
        return res.status(400).json({
          code: 400,
          message: `不支持的操作类型: ${type}`
        });
    }

  } catch (error) {
    console.error('Meting API错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}