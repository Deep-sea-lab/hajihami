// 测试 Vercel 函数的优化功能
import axios from 'axios';

console.log('🧪 开始测试优化后的 Vercel 函数...');

const BASE_URL = process.env.VERCEL_URL ? 
  `https://${process.env.VERCEL_URL}` : 
  'http://localhost:3000';

async function testApiEndpoints() {
  console.log('\n🔍 测试 API 端点...');

  try {
    // 测试 ping 端点
    console.log('\n1. 测试 /api/ping 端点...');
    const pingResponse = await axios.get(`${BASE_URL}/api/ping`);
    console.log('✅ ping 端点正常:', pingResponse.data.message);

    // 测试 songs 端点
    console.log('\n2. 测试 /api/songs 端点...');
    const songsResponse = await axios.get(`${BASE_URL}/api/songs`);
    console.log('✅ songs 端点正常:', `返回 ${songsResponse.data.total || songsResponse.data.data?.length || 0} 项`);

    // 测试 search 端点
    console.log('\n3. 测试 /api/search 端点...');
    const searchResponse = await axios.get(`${BASE_URL}/api/search?keywords=test`);
    console.log('✅ search 端点正常:', `返回 ${searchResponse.data.result?.songCount || 0} 项`);

    console.log('\n🎉 所有 API 端点测试通过！');
  } catch (error) {
    console.error('❌ API 测试失败:', error.message);
  }
}

async function testSyncEndpoint() {
  console.log('\n🔄 测试同步端点...');
  
  try {
    console.log('⚠️  注意：同步端点会实际调用 Notion API，请确保环境变量已设置');
    
    // 检查环境变量
    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_IDS) {
      console.log('⚠️  未设置 Notion 环境变量，跳过同步测试');
      return;
    }
    
    // 由于同步可能需要较长时间，我们只测试请求是否成功启动
    console.log('⏳ 发送同步请求...');
    const syncResponse = await axios.post(`${BASE_URL}/api/sync`, {}, {
      timeout: 30000 // 30秒超时
    });
    
    console.log('✅ 同步请求成功启动:', syncResponse.data.message);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log('⚠️  同步请求超时（这在长时间同步中是正常的）');
    } else if (error.response) {
      // 检查是否是预期的错误（如 Notion API 未配置）
      if (error.response.data?.error?.includes('NOTION_API_KEY') || 
          error.response.data?.error?.includes('NOTION_DATABASE_IDS')) {
        console.log('⚠️  同步端点返回预期错误（缺少环境变量）:', error.response.data.error);
      } else {
        console.log('❌ 同步端点返回错误:', error.response.data);
      }
    } else {
      console.log('❌ 同步端点请求失败:', error.message);
    }
  }
}

async function runTests() {
  console.log('🚀 开始运行测试...');
  console.log(`📊 测试目标: ${BASE_URL}`);
  
  await testApiEndpoints();
  await testSyncEndpoint();
  
  console.log('\n✅ 测试完成！');
}

// 运行测试
runTests().catch(console.error);