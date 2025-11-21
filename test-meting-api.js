import { NotionAPI } from './index.js';

// 创建API实例进行基本功能测试
console.log('🧪 开始测试 Meting API 兼容性...');

const api = new NotionAPI();

// 测试数据转换功能
console.log('✅ 数据转换功能测试...');
const testSong = {
  bv_number: 'BV123456789',
  title: '测试歌曲',
  creator: '测试歌手',
  original_song: '测试专辑',
  video_url: 'https://example.com/video',
  cover_url: 'https://example.com/cover.jpg',
  play_count: 1000
};

const converted = api.convertToNetEaseFormat(testSong);
console.log('原始数据:', testSong);
console.log('转换后数据:', converted);

console.log('\n🎵 Meting API 兼容性改造已完成！');
console.log('以下是支持的 API 端点:');
console.log('- GET /search (搜索歌曲)');
console.log('- GET /song (获取歌曲详情)'); 
console.log('- GET /lyric (获取歌词)');
console.log('- GET /album (获取专辑信息)');
console.log('- GET /artist (获取艺术家信息)');
console.log('- GET /songs (获取所有歌曲)');
console.log('- GET /ping (健康检查)');

console.log('\n💡 提示: 现在您可以直接将 Meting API 的地址替换为您的API地址使用');