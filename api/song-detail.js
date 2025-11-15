const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  try {
    const { ids } = req.query;

    if (!ids) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        code: 400,
        message: '缺少歌曲ID参数'
      });
    }

    const idList = ids.split(',').map(id => parseInt(id));
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

    // 过滤匹配的歌曲
    const matchedSongs = netEaseSongs.filter(song => idList.includes(song.id));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');

    res.status(200).json({
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

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}
