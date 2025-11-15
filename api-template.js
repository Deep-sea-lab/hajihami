// netease-api-ultimate.js
const axios = require('axios');
const API_BASE = 'http://localhost:3456';

async function apiGet(path, params = {}) {
  try {
    const res = await axios.get(`${API_BASE}${path}`, { params, timeout: 20000 });
    return res.data;
  } catch (err) {
    console.error(`请求失败 [${path}]:`, err.message);
    return null;
  }
}

// 终极提取数组函数：支持 data / songs / result.songs
function extractSongs(data) {
  if (!data) return [];

  // 1. 直接是数组
  if (Array.isArray(data)) return data;

  // 2. { data: [...] }
  if (data.data && Array.isArray(data.data)) return data.data;

  // 3. { songs: [...] }
  if (data.songs && Array.isArray(data.songs)) return data.songs;

  // 4. { result: { songs: [...] } }
  if (data.result?.songs && Array.isArray(data.result.songs)) return data.result.songs;

  return [];
}

// 本地搜索（支持歌名、歌手、专辑）
function localSearch(songs, keyword) {
  if (!keyword) return songs;
  const kw = keyword.toLowerCase().trim();
  return songs.filter(s => {
    const name = (s.name || '').toLowerCase();
    const artists = s.artists?.map(a => a.name.toLowerCase()).join(' ') || '';
    const album = (s.album?.name || '').toLowerCase();
    return name.includes(kw) || artists.includes(kw) || album.includes(kw);
  });
}

// 格式化歌手
function formatArtists(artists) {
  return artists?.map(a => a.name).join(', ') || '未知歌手';
}

async function main() {
  console.log('1. 检查服务器...');
  const ping = await apiGet('/ping');
  console.log('Ping:', ping?.message || 'OK');

  // 2. 拉取所有歌曲
  console.log('\n2. 拉取所有歌曲...');
  const songsResp = await apiGet('/songs');
  const allSongs = extractSongs(songsResp);
  console.log(`共加载 ${allSongs.length} 首歌曲`);

  allSongs.slice(0, 3).forEach(s => {
    console.log(`   - ${s.name} | ${formatArtists(s.artists)} | ${s.playedCount} 次播放`);
  });

  // 3. 搜索（优先后端搜索，兜底本地搜索）
  const keyword = '哈基米';
  console.log(`\n3. 搜索 "${keyword}"...`);

  let results = [];

  // 优先使用后端 /search
  const searchResp = await apiGet('/search', { keywords: keyword });
  results = extractSongs(searchResp);

  if (results.length === 0) {
    console.log('   后端未命中，使用本地搜索...');
    results = localSearch(allSongs, keyword);
  }

  console.log(`搜索到 ${results.length} 首：`);
  results.slice(0, 5).forEach(s => {
    const bv = s.bv_number ? ` | BVID: ${s.bv_number}` : '';
    console.log(`   - ${s.name} | ${formatArtists(s.artists)}${bv}`);
  });

  // 4. 获取详情
  if (results.length > 0) {
    const id = results[0].id;
    console.log(`\n4. 获取歌曲详情 (ID: ${id})`);
    const detailResp = await apiGet('/song/detail', { ids: id });
    const song = extractSongs(detailResp)[0];
    if (song) {
      console.log(`   标题: ${song.name}`);
      console.log(`   歌手: ${formatArtists(song.artists)}`);
      console.log(`   专辑: ${song.album?.name || '未知'}`);
      console.log(`   播放: ${song.playedCount} 次`);
      console.log(`   链接: ${song.url}`);
      console.log(`   封面: ${song.picUrl}`);
    }
  }

  // 5. 播放次数排行榜 Top 5
  console.log('\n5. 播放次数排行榜 Top 5');
  allSongs
    .sort((a, b) => (b.playedCount || 0) - (a.playedCount || 0))
    .slice(0, 5)
    .forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} | ${formatArtists(s.artists)} | ${s.playedCount} 次`);
    });
}

main().catch(console.error);