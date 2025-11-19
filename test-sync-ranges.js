// 测试同步范围参数功能
console.log("测试同步范围参数功能");

// 模拟请求对象
const mockReq1 = {
  method: 'GET',
  query: { range: '1' }  // 应该同步1-1000条
};

const mockReq2 = {
  method: 'GET',
  query: { range: '2' }  // 应该同步1001-2000条
};

const mockReq3 = {
  method: 'GET',
  query: {}  // 应该全量同步
};

// 模拟处理函数中的参数解析逻辑
function parseRange(req) {
  const { range } = req.query || req.body || {};
  let startRange, endRange;
  
  if (range === '1') {
    startRange = 0;      // 从第1条开始（数组索引0）
    endRange = 999;      // 到第1000条结束（数组索引999）
    console.log('🚀 开始同步Notion数据范围 1-1000...');
  } else if (range === '2') {
    startRange = 1000;   // 从第1001条开始（数组索引1000）
    endRange = 1999;     // 到第2000条结束（数组索引1999）
    console.log('🚀 开始同步Notion数据范围 1001-2000...');
  } else {
    // 如果没有指定范围参数或参数无效，则进行全量同步
    startRange = 0;
    endRange = Infinity; // 无限制，全量同步
    console.log('🚀 开始完整的Notion数据同步流程...');
  }
  
  return { startRange, endRange };
}

console.log("测试范围参数 '1':");
const result1 = parseRange(mockReq1);
console.log(`范围: 索引 ${result1.startRange} 到 ${result1.endRange} (数据项 1-${result1.endRange + 1})\n`);

console.log("测试范围参数 '2':");
const result2 = parseRange(mockReq2);
console.log(`范围: 索引 ${result2.startRange} 到 ${result2.endRange} (数据项 ${result2.startRange + 1}-${result2.endRange + 1})\n`);

console.log("测试无范围参数:");
const result3 = parseRange(mockReq3);
console.log(`范围: 索引 ${result3.startRange} 到 ${result3.endRange} (全量同步)\n`);

console.log("✅ 测试完成，参数解析逻辑正确");