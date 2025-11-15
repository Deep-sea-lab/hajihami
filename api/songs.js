const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const allData = [];

    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        const filePath = path.join(dataDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          allData.push(...data);
        } catch (error) {
          console.error(`读取文件 ${file} 失败:`, error.message);
        }
      });
    }

    // 转换格式
    const netEaseSongs = allData.map(songData => {
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');

    res.status(200).json({
      code: 200,
      data: netEaseSongs,
      total: netEaseSongs.length
    });
  } catch (error) {
    console.error('获取歌曲API错误:', error);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}
