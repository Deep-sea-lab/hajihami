#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HajihamiCLI {
  constructor() {
    this.commands = {
      'sync': this.sync.bind(this),
      'status': this.status.bind(this),
      'deploy': this.deploy.bind(this),
      'test': this.test.bind(this),
      'stats': this.stats.bind(this),
      'help': this.help.bind(this),
      'list': this.list.bind(this),
      'clean': this.clean.bind(this),
      'start-api': this.startAPI.bind(this),
      'realtime': this.realtime.bind(this),
    };
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    console.log('🚀 HajihamiAPI 操作中心 v2.0.3');
    console.log('🌍 统一数据管理，掌控同步全局\n');
    
    if (this.commands[command]) {
      await this.commands[command](args.slice(1));
    } else {
      console.log(`❌ 未知命令: ${command}`);
      await this.help();
    }
  }

  async sync(args) {
    console.log('🔄 开始同步 Notion 数据库...');
    console.log('🔍 检测到配置：');
    console.log(`   - Notion API Key: ${process.env.NOTION_API_KEY ? '已配置' : '未配置'}`);
    console.log(`   - 数据库 IDs: ${process.env.NOTION_DATABASE_IDS || '未配置'}`);
    console.log(`   - 缓存提供者: ${process.env.CACHE_PROVIDER || '未配置'}`);
    
    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_IDS) {
      console.log('❌ 缺少必要配置，请检查环境变量');
      return;
    }
    
    try {
      console.log('⚡ 执行同步命令...');
      await execAsync('npm run sync');
      console.log('✅ 同步完成！');
    } catch (error) {
      console.log(`❌ 同步失败: ${error.message}`);
    }
  }

  async status() {
    console.log('📊 检查系统状态...');
    
    // 检查环境变量
    console.log('🔍 环境变量检查：');
    console.log(`   - NOTION_API_KEY: ${process.env.NOTION_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   - NOTION_DATABASE_IDS: ${process.env.NOTION_DATABASE_IDS ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`   - SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ 已配置' : '❌ 未配置'}`);
    
    // 检查数据文件
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      console.log(`📁 数据文件: ${files.length} 个`);
      files.forEach(file => {
        const stats = fs.statSync(path.join(dataDir, file));
        console.log(`   - ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
      });
    } else {
      console.log('📁 数据目录: 不存在');
    }
  }

  async deploy() {
    console.log('🌐 部署功能（Vercel 相关，已移除）');
    console.log('💡 如需部署，请参考部署指南文档');
  }

  async test(args) {
    console.log('🧪 运行测试...');
    
    // 简单的健康检查
    console.log('🔍 检查本地 API 服务...');
    try {
      const { NotionSync } = await import('../index.js');
      const apiKey = process.env.NOTION_API_KEY;
      
      if (apiKey) {
        console.log('✅ Notion API 配置正常');
      } else {
        console.log('❌ Notion API 未配置');
      }
    } catch (error) {
      console.log(`❌ 测试失败: ${error.message}`);
    }
  }

  async stats() {
    console.log('📈 数据统计...');
    
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      let totalRecords = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
            const data = JSON.parse(content);
            totalRecords += Array.isArray(data) ? data.length : 0;
          } catch (error) {
            console.log(`⚠️  无法解析文件: ${file}`);
          }
        }
      }
      
      console.log(`📊 总记录数: ${totalRecords}`);
      console.log(`📁 JSON 文件数: ${files.filter(f => f.endsWith('.json')).length}`);
    } else {
      console.log('📊 暂无统计数据');
    }
  }

  async list() {
    console.log('📚 数据库列表...');
    
    try {
      const { NotionSync } = await import('../index.js');
      const apiKey = process.env.NOTION_API_KEY;
      
      if (!apiKey) {
        console.log('❌ 未配置 NOTION_API_KEY');
        return;
      }
      
      const sync = new NotionSync(apiKey);
      const databases = await sync.getDatabaseList();
      
      if (databases.length > 0) {
        console.log(`✅ 找到 ${databases.length} 个数据库:`);
        databases.forEach(db => {
          console.log(`   ${db.index}. ${db.title}`);
          console.log(`      ID: ${db.id}`);
        });
      } else {
        console.log('❌ 未找到任何数据库');
      }
    } catch (error) {
      console.log(`❌ 获取数据库列表失败: ${error.message}`);
    }
  }

  async clean() {
    console.log('🧹 清理数据...');
    
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      console.log(`🗑️  将删除 ${files.length} 个数据文件`);
      
      for (const file of files) {
        const filePath = path.join(dataDir, file);
        fs.unlinkSync(filePath);
        console.log(`   ✅ 删除: ${file}`);
      }
      
      fs.rmdirSync(dataDir);
      console.log('✅ 数据目录已清理');
    } else {
      console.log('ℹ️  数据目录不存在，无需清理');
    }
  }

  async startAPI(args) {
    console.log('🌐 启动 API 服务...');
    
    const port = args[0] || '3456';
    console.log(`🔌 启动端口: ${port}`);
    
    try {
      console.log('⚡ 执行: npm run api');
      await execAsync(`PORT=${port} npm run api`);
    } catch (error) {
      console.log(`❌ 启动失败: ${error.message}`);
    }
  }

  async realtime(args) {
    console.log('🔄 启动实时同步...');
    
    const interval = args[0] || '5';
    console.log(`⏰ 同步间隔: ${interval} 分钟`);
    
    try {
      console.log('⚡ 执行: npm run realtime');
      await execAsync(`npm run realtime ${interval}`);
    } catch (error) {
      console.log(`❌ 启动失败: ${error.message}`);
    }
  }

  async help() {
    console.log('📖 可用命令:');
    console.log('   sync          - 同步 Notion 数据库');
    console.log('   status        - 检查系统状态');
    console.log('   stats         - 查看数据统计');
    console.log('   list          - 列出数据库');
    console.log('   test          - 运行测试');
    console.log('   clean         - 清理数据');
    console.log('   start-api     - 启动 API 服务 (可选端口)');
    console.log('   realtime      - 启动实时同步 (可选间隔分钟数)');
    console.log('   help          - 显示此帮助信息');
    console.log('');
    console.log('💡 示例:');
    console.log('   node cli.js sync');
    console.log('   node cli.js start-api 8080');
    console.log('   node cli.js realtime 10');
  }
}

// 运行 CLI
const cli = new HajihamiCLI();
cli.run().catch(console.error);