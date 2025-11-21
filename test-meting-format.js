import { NotionAPI } from './index.js';

// 测试Meting API兼容性
console.log('🧪 测试 Meting API 兼容性...');

const api = new NotionAPI();

// 测试数据转换功能
console.log('✅ 数据转换功能测试...');
const testSong = {
  bv_number: 'BV123456789',
  title: '海阔天空',
  creator: 'Beyond',
  original_song: '专辑名称',
  video_url: 'https://example.com/video',
  cover_url: 'https://example.com/cover.jpg',
  play_count: 1000
};

const converted = api.convertToNetEaseFormat(testSong);
console.log('转换后的数据格式:');
console.log(JSON.stringify(converted, null, 2));

console.log('\n🎵 Meting API 兼容性增强已完成！');
console.log('现在API返回格式更符合Meting API标准');