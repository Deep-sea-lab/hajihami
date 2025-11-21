// Vercel API endpoint for /api/artist (Meting API compatible)
import cloudCache from '../cloud-cache-adapter.js';

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');
  
  // 设置缓存头
  res.setHeader('Cache-Control', 'no-cache');
  
  try {
    // 从查询参数获取ID
    const { id, type = 'hajihami' } = req.query;

    // 不再限制平台类型，允许所有类型
    // if (type !== 'hajihami') {
    //   return res.status(400).json({
    //     code: 400,
    //     message: '只接受hajihami格式',
    //     data: null,
    //     count: 0
    //   });
    // }

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '缺少艺术家ID参数'
      });
    }

    // 从云端缓存获取数据
    let allSongs = await cloudCache.getAllSongs();
    
    if (!allSongs) {
      allSongs = [];
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
    };

    const netEaseSongs = allSongs.map(song => convertToNetEaseFormat(song));

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
      return res.status(404).json({ 
        code: 404, 
        message: '未找到艺术家' 
      });
    }

    res.status(200).json({
      code: 200,
      data: artistInfo,
      count: artistInfo.count
    });

  } catch (error) {
    console.error('艺术家API错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}