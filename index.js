// index.js - HajihamiAPI 2.0.3 (集成云端缓存版)
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import express from 'express';
import cloudCache from './cloud-cache-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class NotionSync {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.notion.com/v1';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    this.syncState = this.loadSyncState();
    this.specifiedDatabaseIds = this.getSpecifiedDatabaseIds();
  }

  // 从B站视频链接提取BV号
  extractBvNumber(videoUrl) {
    if (!videoUrl) return null;

    const bvMatch = videoUrl.match(/BV[0-9A-Za-z]{10}/);
    return bvMatch ? bvMatch[0] : null;
  }

  // 获取B站视频封面
  async getBilibiliCover(bvNumber) {
    if (!bvNumber || process.env.SKIP_COVERS === 'true') return null;

    try {
      const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvNumber}`;
      const response = await axios.get(apiUrl, {
        timeout: 2000  // 降低超时时间为2秒
      });

      if (response.data) {
        if (response.data.code === 0) {
          return response.data.data.pic;
        } else if (response.data.code === 62002) {
          // 视频不存在或已删除，抛出特殊错误
          throw new Error(`62002:视频不存在或已删除`);
        } else if (response.data.code === -509) {
          // 请求过于频繁
          throw new Error(`-509:请求过于频繁`);
        } else {
          // 其他API错误
          throw new Error(`API错误 ${response.data.code}: ${response.data.message || '未知错误'}`);
        }
      }
    } catch (error) {
      // 检查错误类型，对于特定错误直接跳过
      if (error.code === 'ECONNABORTED' ||  // 超时
          error.response?.status === 412 || // 预处理错误
          error.response?.status === 429 || // 频率限制
          error.response?.status === 404 || // 资源不存在
          error.response?.status >= 500) {  // 服务器错误
        return null; // 直接返回null，跳过此封面
      }
      
      // 重新抛出其他错误，让上级处理
      throw error;
    }

    return null;
  }

  // 获取环境变量中指定的数据库ID
  getSpecifiedDatabaseIds() {
    const ids = process.env.NOTION_DATABASE_IDS;
    if (!ids) return [];
    
    return ids.split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  }

  // 加载同步状态
  loadSyncState() {
    const statePath = path.join(__dirname, 'sync_state.json');
    try {
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
      }
    } catch (error) {
      console.error('加载同步状态失败:', error.message);
    }
    
    return {
      last_sync: null,
      database_states: {},
      last_cursor: null
    };
  }

  // 保存同步状态
  saveSyncState() {
    const statePath = path.join(__dirname, 'sync_state.json');
    try {
      fs.writeFileSync(statePath, JSON.stringify(this.syncState, null, 2));
    } catch (error) {
      console.error('保存同步状态失败:', error.message);
    }
  }

  // 测试 API 连接
  async testConnection() {
    try {
      const response = await fetch(`${this.baseURL}/users/me`, {
        method: 'GET',
        headers: this.headers
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API 连接正常');
        return true;
      } else {
        const errorText = await response.text();
        console.error('连接测试失败:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('连接测试异常:', error.message);
      return false;
    }
  }

  // 获取指定的数据库信息
  async getSpecifiedDatabases() {
    if (this.specifiedDatabaseIds.length === 0) {
      return [];
    }
    
    console.log(`🔍 获取指定的 ${this.specifiedDatabaseIds.length} 个数据库...`);
    const databases = [];
    
    for (const id of this.specifiedDatabaseIds) {
      try {
        const dbInfo = await this.getDatabaseInfo(id);
        databases.push(dbInfo);
        console.log(`✅ 数据库 ${id.substring(0, 8)} 可访问`);
      } catch (error) {
        console.error(`❌ 数据库 ${id.substring(0, 8)} 不可访问:`, error.message);
      }
    }
    
    return databases;
  }

  // 搜索所有数据库
  async searchDatabases() {
    try {
      console.log('🔍 搜索所有数据库...');
      const response = await fetch(`${this.baseURL}/search`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          filter: { property: 'object', value: 'database' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('搜索数据库失败:', error.message);
      return [];
    }
  }

  // 获取数据库信息
  async getDatabaseInfo(databaseId) {
    try {
      const response = await fetch(`${this.baseURL}/databases/${databaseId}`, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('获取数据库信息失败:', error.message);
      throw error;
    }
  }

  // 查询数据库所有记录（完整分页）
  async queryAllDatabasePages(databaseId) {
    let allPages = [];
    let hasMore = true;
    let startCursor = null;
    let pageCount = 0;

    console.log(`📄 查询数据库 ${databaseId.substring(0, 8)}...`);
    
    try {
      while (hasMore) {
        pageCount++;
        const body = { 
          page_size: 100 // 使用最大页面大小以减少请求数量
        };
        
        if (startCursor) {
          body.start_cursor = startCursor;
        }

        const response = await fetch(`${this.baseURL}/databases/${databaseId}/query`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const newPages = data.results || [];
        allPages = allPages.concat(newPages);
        
        hasMore = data.has_more;
        startCursor = data.next_cursor;
        
        process.stdout.write(`\r📦 已获取 ${allPages.length} 条记录 (第${pageCount}页)`);
        
        // 如果没有更多页面或没有游标，退出循环
        if (!hasMore || !startCursor) break;
        
        // 根据API响应中的ratelimit信息调整延迟，或者使用更小的固定延迟
        // 从100ms减少到20ms以提高速度，但仍需避免速率限制
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      console.log(`\n✅ 数据库查询完成，共 ${allPages.length} 条记录`);
      return allPages;
    } catch (error) {
      console.error('\n❌ 查询数据库失败:', error.message);
      return [];
    }
  }

  // 解析页面属性 - 只保留指定字段
  parsePageProperties(page) {
    const properties = page.properties || {};
    const parsed = {};
    
    // 只解析需要的字段
    const allowedFields = {
      '风格': 'style',
      '视频链接': 'video_url', 
      '全民制作人': 'creator',
      '原曲': 'original_song',
      '播放量（纯数字）': 'play_count',
      '作品名称': 'title',
      '创作时代': 'creation_time',
      '发布时间': 'publish_time'
    };
    
    for (const [fieldName, fieldKey] of Object.entries(allowedFields)) {
      const prop = properties[fieldName];
      if (!prop || !prop.type) {
        parsed[fieldKey] = null;
        continue;
      }
      
      try {
        const value = prop[prop.type];
        switch (prop.type) {
          case 'title':
          case 'rich_text':
            parsed[fieldKey] = Array.isArray(value) ? 
              value.map(t => t.plain_text || '').join('') : '';
            break;
          case 'select':
            parsed[fieldKey] = value?.name || null;
            break;
          case 'multi_select':
            parsed[fieldKey] = Array.isArray(value) ? 
              value.map(opt => opt.name) : [];
            break;
          case 'number':
            parsed[fieldKey] = value;
            break;
          case 'checkbox':
            parsed[fieldKey] = !!value;
            break;
          case 'date':
            if (fieldKey === 'publish_time') {
              parsed[fieldKey] = value?.start || null;
            } else {
              parsed[fieldKey] = value;
            }
            break;
          case 'url':
          case 'email':
          case 'phone_number':
            parsed[fieldKey] = value || null;
            break;
          default:
            parsed[fieldKey] = value;
        }
      } catch (err) {
        parsed[fieldKey] = null;
      }
    }

    // 提取BV号用于封面获取
    parsed.bv_number = this.extractBvNumber(parsed.video_url);

    return parsed;
  }

  // 加载本地数据
  loadLocalData(databaseId) {
    const filePath = this.getDataFilePath(databaseId);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (error) {
      console.error('加载本地数据失败:', error.message);
    }
    return [];
  }

  // 检查是否需要重新获取封面
  shouldRefetchCover(existingPage, newPage) {
    // 如果本地没有封面链接，必须获取
    if (!existingPage.cover_url) return true;

    // 如果BV号发生变化，必须重新获取
    if (existingPage.bv_number !== newPage.bv_number) return true;

    // 如果时间戳有变化，且超过1小时，认为可能更新了
    if (newPage.last_edited_time && existingPage.last_edited_time) {
      const existingTime = new Date(existingPage.last_edited_time).getTime();
      const newTime = new Date(newPage.last_edited_time).getTime();
      const hourMs = 60 * 60 * 1000;
      if (Math.abs(newTime - existingTime) > hourMs) return true;
    }

    // 如果之前的尝试次数未满3次，且封面仍为null，也应该重试
    const existingAttempts = existingPage.cover_attempt_count || 0;
    if (existingAttempts < 3 && !existingPage.cover_url) return true;

    // 其他情况保持现有封面
    newPage.cover_url = existingPage.cover_url;
    newPage.cover_attempt_count = existingPage.cover_attempt_count || 0;
    return false;
  }

  // 获取B站封面，支持重试
  async getBilibiliCoverWithRetry(bvNumber, maxRetries = 3) {
    if (!bvNumber || process.env.SKIP_COVERS === 'true') return null;

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const coverUrl = await this.getBilibiliCover(bvNumber);
        if (coverUrl) return coverUrl;

        // 如果失败了但没有抛出异常（即直接返回null），记录错误但继续重试
        lastError = `尝试${attempt}失败`;
      } catch (error) {
        lastError = error.message;
        
        // 如果返回62002（视频不存在等），提前停止重试
        if (lastError && lastError.includes('62002')) {
          console.log(`🛑 BV号 ${bvNumber} 视频不存在或已删除，跳过`);
          break;
        }
        
        // 对于特定错误类型，直接跳过重试
        if (error.message.includes('ECONNABORTED') ||  // 超时
            error.message.includes('412') ||           // 预处理错误
            error.message.includes('429') ||           // 频率限制
            error.message.includes('404') ||           // 资源不存在
            error.message.includes('500')) {           // 服务器错误
          console.log(`⏭️  BV号 ${bvNumber} 遇到不可恢复错误，跳过重试`);
          break;
        }
      }

      // 最后一次尝试失败，不需要等待
      if (attempt < maxRetries) {
        // 减少重试间隔时间，提高同步速度
        await new Promise(resolve => setTimeout(resolve, 200)); // 从1秒减少到0.2秒
      }
    }

    return null; // 所有尝试都失败了
  }

  // 保存完整数据 - 优化版本：增量更新和智能重试封面
  async saveLocalData(databaseId, pages, isIncremental = false) {
    const filePath = this.getDataFilePath(databaseId);

    try {
      console.log('🔧 解析数据中...');
      // 使用更高效的方式解析数据，减少日志输出频率
      const parsedPages = [];
      const total = pages.length;
      
      for (let i = 0; i < total; i++) {
        const page = pages[i];
        const parsed = this.parsePageProperties(page);
        // 添加notion更新时间用于比较
        parsed.last_edited_time = page.last_edited_time;
        parsedPages.push(parsed);
        
        // 每500条记录输出一次进度，减少I/O操作
        if ((i + 1) % 500 === 0 || i === total - 1) {
          process.stdout.write(`\r📊 解析进度: ${i + 1}/${total}`);
        }
      }
      process.stdout.write('\n');

      // 增量更新模式：只处理需要更新的封面
      const pagesNeedingCoverFetch = [];
      const existingData = isIncremental ? this.loadLocalData(databaseId) : [];

      if (isIncremental && existingData.length > 0) {
        console.log('🔍 比对本地数据与云端更新...');

        // 创建现有数据的映射，用于快速查找
        const existingMap = new Map();
        existingData.forEach(page => {
          if (page.bv_number) {
            existingMap.set(page.bv_number, page);
          }
        });

        // 检查每个页面是否需要重新获取封面
        parsedPages.forEach((page, index) => {
          if (page.bv_number) {
            const existing = existingMap.get(page.bv_number);
            if (existing && !this.shouldRefetchCover(existing, page)) {
              // 不需要重新获取，使用现有数据
              // cover_url 已由 shouldRefetchCover 方法设置
            } else {
              // 需要重新获取封面（包括新页面和需要刷新的现有页面）
              pagesNeedingCoverFetch.push({ index, bvNumber: page.bv_number });
            }
          }
        });

        console.log(`📊 本次更新需要获取 ${pagesNeedingCoverFetch.length} 个封面`);
      } else {
        // 全量更新：所有有效页面都需要获取封面
        parsedPages.forEach((page, index) => {
          if (page.bv_number) {
            pagesNeedingCoverFetch.push({ index, bvNumber: page.bv_number });
          }
        });
      }

      // 获取B站封面链接（只获取需要的）- 优化为并发处理
      if (pagesNeedingCoverFetch.length > 0) {
        console.log(`🖼️ 获取 ${pagesNeedingCoverFetch.length} 个B站封面信息中...`);
        
        // 设置并发限制，避免请求过多被限制
        const CONCURRENT_LIMIT = 5;
        const coverPromises = [];
        
        for (let i = 0; i < pagesNeedingCoverFetch.length; i++) {
          const { index, bvNumber } = pagesNeedingCoverFetch[i];
          const page = parsedPages[index];
          
          // 创建获取封面的异步任务
          const coverPromise = this.getBilibiliCoverWithRetry(bvNumber, 3)
            .then(coverUrl => {
              page.cover_url = coverUrl;
              page.cover_attempt_count = page.cover_url ? 0 : 3; // 记录尝试次数
              process.stdout.write(`\r🖼️ 封面获取进度: ${i + 1}/${pagesNeedingCoverFetch.length} (${bvNumber}: ${page.cover_url ? '✅' : '❌'})`);
            })
            .catch(error => {
              console.error(`\n获取封面失败 ${bvNumber}:`, error.message);
              page.cover_url = null;
              page.cover_attempt_count = 3;
            });
          
          coverPromises.push(coverPromise);
          
          // 控制并发数
          if (coverPromises.length >= CONCURRENT_LIMIT) {
            await Promise.allSettled(coverPromises.splice(0, CONCURRENT_LIMIT));
          }
        }
        
        // 等待剩余的请求完成
        if (coverPromises.length > 0) {
          await Promise.allSettled(coverPromises);
        }
        
        console.log('\n✅ 封面获取完成');
      } else {
        console.log('🖼️ 无需获取新的封面链接');
      }

      // 合并增量数据
      if (isIncremental && existingData.length > 0) {
        console.log('🔀 合并增量数据...');
        const mergedData = [...existingData];

        // 更新或添加新数据
        parsedPages.forEach(newPage => {
          const existingIndex = mergedData.findIndex(existing =>
            existing.bv_number === newPage.bv_number
          );

          if (existingIndex >= 0) {
            // 更新现有记录
            mergedData[existingIndex] = { ...mergedData[existingIndex], ...newPage };
          } else {
            // 添加新记录
            mergedData.push(newPage);
          }
        });

        // 增量同步后，检查并补全本地数据中的null封面
        const localPagesNeedingCoverFetch = [];
        mergedData.forEach((page, index) => {
          if (page.bv_number && !page.cover_url &&
              (page.cover_attempt_count || 0) < 3) {
            localPagesNeedingCoverFetch.push({ index, bvNumber: page.bv_number });
          }
        });

        if (localPagesNeedingCoverFetch.length > 0) {
          console.log(`🖼️ 补全 ${localPagesNeedingCoverFetch.length} 个本地null封面...`);
          
          // 使用并发处理来加快封面补全
          const CONCURRENT_LIMIT = 5;
          const coverPromises = [];
          
          for (let i = 0; i < localPagesNeedingCoverFetch.length; i++) {
            const { index, bvNumber } = localPagesNeedingCoverFetch[i];
            const page = mergedData[index];
            
            const coverPromise = this.getBilibiliCoverWithRetry(bvNumber, 3)
              .then(coverUrl => {
                page.cover_url = coverUrl;
                page.cover_attempt_count = page.cover_url ? 0 : (page.cover_attempt_count || 0) + 3;
                process.stdout.write(`\r🖼️ 本地封面补全进度: ${i + 1}/${localPagesNeedingCoverFetch.length} (${bvNumber}: ${page.cover_url ? '✅' : '❌'})`);
              })
              .catch(error => {
                console.error(`\n补全封面失败 ${bvNumber}:`, error.message);
                page.cover_url = null;
                page.cover_attempt_count = page.cover_attempt_count ? page.cover_attempt_count + 3 : 3;
              });
            
            coverPromises.push(coverPromise);
            
            // 控制并发数
            if (coverPromises.length >= CONCURRENT_LIMIT) {
              await Promise.allSettled(coverPromises.splice(0, CONCURRENT_LIMIT));
            }
          }
          
          // 等待剩余的请求完成
          if (coverPromises.length > 0) {
            await Promise.allSettled(coverPromises);
          }
          
          console.log('\n✅ 本地封面补全完成');
        } else {
          console.log('🖼️ 本地数据无null封面需要补全');
        }

        // 保存合并后的数据
        fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2));
        console.log(`💾 已保存 ${mergedData.length} 条记录到文件 (合并${existingData.length}条原有 + ${parsedPages.length}条更新)`);
        return { total: mergedData.length, filePath };
      } else {
        // 全量保存
        fs.writeFileSync(filePath, JSON.stringify(parsedPages, null, 2));
        console.log(`💾 已保存 ${parsedPages.length} 条记录到文件`);
        return { total: parsedPages.length, filePath };
      }

    } catch (error) {
      console.error('保存数据失败:', error.message);
      return { total: 0, filePath: null };
    }
  }

  // 获取数据文件路径
  getDataFilePath(databaseId) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // 使用数据库ID前8位作为文件名前缀，避免文件名过长
    const shortId = databaseId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0]; // 添加日期
    return path.join(dataDir, `db_${shortId}_${timestamp}.json`);
  }

  // 同步单个数据库（支持增量同步）
  async syncDatabase(database, forceFullSync = false) {
    const dbId = database.id;
    const dbTitle = database.title && database.title.length > 0 ?
      database.title.map(t => t.plain_text).join('') : '未命名数据库';

    console.log(`\n🔄 开始同步: ${dbTitle}`);
    console.log(`📋 数据库ID: ${dbId}`);

    try {
      // 验证数据库可访问性
      const dbInfo = await this.getDatabaseInfo(dbId);
      console.log(`✅ 数据库可访问，标题: ${dbTitle}`);

      // 检查是否为增量同步
      const existingData = this.loadLocalData(dbId);
      const isIncremental = !forceFullSync && existingData.length > 0;

      if (isIncremental) {
        console.log(`🔄 增量同步模式 - 本地已有 ${existingData.length} 条记录`);
      } else {
        console.log('🔄 全量同步模式');
      }

      // 查询所有记录
      const pages = await this.queryAllDatabasePages(dbId);

      if (pages.length === 0) {
        console.log('📭 数据库为空，跳过保存');
        return { success: true, changed: false, count: 0 };
      }

      // 保存数据（支持增量模式）
      const result = await this.saveLocalData(dbId, pages, isIncremental);

      if (result.total > 0) {
        // 更新同步状态
        this.syncState.database_states[dbId] = {
          last_sync: new Date().toISOString(),
          title: dbTitle,
          record_count: result.total,
          file_path: result.filePath,
          sync_mode: isIncremental ? 'incremental' : 'full'
        };

        console.log(`🎉 同步完成: ${dbTitle} (${result.total} 条记录)`);
        return { success: true, changed: true, count: result.total };
      } else {
        console.log('⚠️ 无有效数据保存');
        return { success: true, changed: false, count: 0 };
      }

    } catch (error) {
      console.error(`❌ 同步失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 同步所有数据库（无数量限制）
  async syncAllDatabases(forceFullSync = false) {
    console.log('🚀 开始同步数据库');
    console.log('='.repeat(50));

    if (forceFullSync) {
      console.log('🔄 强制全量同步模式');
    }
    
    console.log('🔗 测试API连接...');
    const connected = await this.testConnection();
    if (!connected) {
      console.log('❌ API连接失败，请检查配置');
      return { success: false };
    }
    
    let databases;
    
    // 检查是否指定了数据库ID
    if (this.specifiedDatabaseIds.length > 0) {
      databases = await this.getSpecifiedDatabases();
      
      if (databases.length === 0) {
        console.log('📭 未找到任何可访问的指定数据库');
        console.log('\n💡 可能的原因:');
        console.log('1. 数据库ID不正确');
        console.log('2. 集成未被邀请到这些数据库');
        console.log('3. 数据库与集成不在同一工作区');
        return { success: false };
      }
      
      console.log(`✅ 找到 ${databases.length} 个指定的数据库\n`);
    } else {
      databases = await this.searchDatabases();
      
      if (databases.length === 0) {
        console.log('📭 未找到任何数据库');
        console.log('\n💡 可能的原因:');
        console.log('1. 集成未激活或密钥错误');
        console.log('2. 集成未被邀请到任何数据库');
        console.log('3. 数据库与集成不在同一工作区');
        return { success: false };
      }
      
      console.log(`✅ 找到 ${databases.length} 个数据库\n`);
    }
    
    let successCount = 0;
    let totalRecords = 0;
    let failedCount = 0;
    
    // 同步每个数据库
    for (let i = 0; i < databases.length; i++) {
      const db = databases[i];
      const dbTitle = db.title && db.title.length > 0 ? 
        db.title.map(t => t.plain_text).join('') : `数据库${i + 1}`;
      
      console.log(`\n📊 进度: ${i + 1}/${databases.length} - ${dbTitle}`);
      console.log('-'.repeat(40));
      
      const result = await this.syncDatabase(db, forceFullSync);
      
      if (result.success) {
        successCount++;
        if (result.count) {
          totalRecords += result.count;
        }
      } else {
        failedCount++;
      }
      
      // 短暂延迟，避免速率限制
      if (i < databases.length - 1) {
        console.log('⏳ 等待2秒后继续下一个数据库...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // 保存最终状态
    this.syncState.last_sync = new Date().toISOString();
    this.syncState.total_databases = databases.length;
    this.syncState.successful_syncs = successCount;
    this.syncState.failed_syncs = failedCount;
    this.syncState.total_records = totalRecords;
    this.saveSyncState();
    
    // 将所有同步的数据上传到云端缓存
    if (totalRecords > 0) {
      console.log('\n☁️  正在上传数据到云端缓存...');
      const allSongs = this.getAllMusicData(); // 获取所有同步的数据
      const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));
      await this.saveToCloudCache(netEaseSongs);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 同步完成!');
    console.log(`📊 统计信息:`);
    console.log(`   - 数据库总数: ${databases.length}`);
    console.log(`   - 成功同步: ${successCount}`);
    console.log(`   - 同步失败: ${failedCount}`);
    console.log(`   - 总记录数: ${totalRecords}`);
    console.log(`   - 数据目录: ./data/`);
    console.log(`   - 云端缓存: 已更新`);
    console.log(`   - 下次同步: 实时监控中...\n`);
    
    return { 
      success: successCount > 0, 
      databases: databases.length, 
      successful: successCount,
      failed: failedCount,
      records: totalRecords 
    };
  }

  // 启动实时同步
  startRealtimeSync(intervalMinutes = 5, forceFullSync = false) {
    console.log('🔔 启动实时同步服务');
    console.log(`⏰ 同步间隔: ${intervalMinutes}分钟`);
    console.log('📁 数据目录: ./data/');
    if (forceFullSync) {
      console.log('🔄 全量同步模式');
    } else {
      console.log('🔄 自动模式 (有本地数据时增量，无本地数据时全量)');
    }
    console.log('⏸️  按 Ctrl+C 停止同步\n');

    const intervalMs = intervalMinutes * 60 * 1000;

    // 立即执行第一次同步
    const doSync = async () => {
      try {
        await this.syncAllDatabases(forceFullSync);
        console.log(`⏰ 下次同步将在 ${intervalMinutes} 分钟后进行...\n`);
      } catch (error) {
        console.error('同步出错:', error.message);
      }
    };

    doSync().then(() => {
      // 设置定时同步
      this.syncInterval = setInterval(doSync, intervalMs);
    });

    // 处理程序退出
    process.on('SIGINT', () => {
      console.log('\n🛑 停止同步服务...');
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }
      this.saveSyncState();
      console.log('✅ 同步状态已保存');
      process.exit(0);
    });
  }

  // 获取同步状态
  getStatus() {
    return this.syncState;
  }

  // 获取数据库列表
  async getDatabaseList() {
    let databases;
    
    // 检查是否指定了数据库ID
    if (this.specifiedDatabaseIds.length > 0) {
      databases = await this.getSpecifiedDatabases();
    } else {
      databases = await this.searchDatabases();
    }
    
    return databases.map((db, index) => ({
      index: index + 1,
      id: db.id,
      title: db.title && db.title.length > 0 ? 
        db.title.map(t => t.plain_text).join('') : '未命名数据库',
      last_edited: db.last_edited_time,
      url: db.url
    }));
  }

  // 显示数据统计
  showDataStats() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      console.log('📁 数据目录不存在');
      return;
    }
    
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    console.log(`\n📊 数据文件统计 (${files.length} 个文件):`);
    
    files.forEach(file => {
      const filePath = path.join(dataDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const size = (fs.statSync(filePath).size / 1024).toFixed(1);
        console.log(`   📄 ${file} (${data.length} 条记录, ${size} KB)`);
      } catch (error) {
        console.log(`   ❌ ${file} (读取失败)`);
      }
    });
  }

  // 清理所有同步数据
  cleanAllData() {
    console.log('🧹 开始清理所有同步数据...');

    // 删除数据目录
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
        console.log('✅ 已删除数据目录: ./data/');
      } catch (error) {
        console.error('❌ 删除数据目录失败:', error.message);
      }
    } else {
      console.log('📭 数据目录不存在');
    }

    // 删除同步状态文件
    const stateFile = path.join(__dirname, 'sync_state.json');
    if (fs.existsSync(stateFile)) {
      try {
        fs.unlinkSync(stateFile);
        console.log('✅ 已删除同步状态文件: sync_state.json');
      } catch (error) {
        console.error('❌ 删除状态文件失败:', error.message);
      }
    } else {
      console.log('📭 同步状态文件不存在');
    }

    // 重置内存中的状态
    this.syncState = {
      last_sync: null,
      database_states: {},
      last_cursor: null
    };

    console.log('🎉 清理完成！所有同步数据已被清除。');
    console.log('💡 下次运行同步时将重新开始。');
  }

  // 获取所有音乐数据
  getAllMusicData() {
    const dataDir = path.join(__dirname, 'data');
    const allData = [];

    if (!fs.existsSync(dataDir)) {
      return allData;
    }

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

    return allData;
  }

  // 转换数据为网易云格式
  convertToNetEaseFormat(songData) {
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
      // 额外的原始字段
      bv_number: songData.bv_number,
      creation_time: songData.creation_time,
      publish_time: songData.publish_time,
      style: songData.style
    };
  }

  // 保存数据到云端缓存
  async saveToCloudCache(songs) {
    if (!songs || songs.length === 0) {
      console.log('⚠️  没有歌曲数据需要保存到云端');
      return { success: false, message: '没有数据需要保存' };
    }

    try {
      console.log(`☁️  正在保存 ${songs.length} 首歌曲到云端缓存...`);
      const result = await cloudCache.saveSongs(songs);
      
      if (result.success) {
        console.log(`✅ 成功保存 ${result.count || songs.length} 首歌曲到云端缓存`);
      } else {
        console.error('❌ 保存到云端缓存失败:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ 保存到云端缓存时发生错误:', error.message);
      return { success: false, error: error.message };
    }
  }

  // 从云端缓存获取所有歌曲
  async getAllSongsFromCloud() {
    try {
      console.log('☁️  正在从云端缓存获取歌曲...');
      const songs = await cloudCache.getAllSongs();
      console.log(`✅ 从云端缓存获取 ${songs.length} 首歌曲`);
      return songs;
    } catch (error) {
      console.error('❌ 从云端缓存获取歌曲失败:', error.message);
      return [];
    }
  }

  // 启动音乐API服务器
  startMusicApiServer(port = 3456) {
    console.log('🎵 启动音乐API服务器');
    console.log(`🌐 服务器端口: ${port}`);
    console.log('📁 数据目录: ./data/');
    console.log('☁️  云端缓存: 已启用');

    const app = express();

    // CORS 中间件
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // 网易云音乐API兼容路由

    // 歌曲详情
    app.get('/song/detail', async (req, res) => {
      try {
        const ids = req.query.ids;
        if (!ids) {
          return res.json({ code: 400, message: '缺少歌曲ID参数' });
        }

        const idList = ids.split(',').map(id => parseInt(id));
        
        // 优先从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        // 如果云端缓存不可用，回退到本地数据
        if (!allSongs || allSongs.length === 0) {
          console.log('⚠️  云端缓存不可用，使用本地数据');
          allSongs = this.getAllMusicData();
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 过滤匹配的歌曲
        const matchedSongs = netEaseSongs.filter(song => idList.includes(song.id));

        res.json({
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
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 搜索歌曲
    app.get('/search', async (req, res) => {
      try {
        const keywords = req.query.keywords;
        if (!keywords) {
          return res.json({ code: 400, result: { songs: [] } });
        }

        // 优先从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        // 如果云端缓存不可用，回退到本地数据
        if (!allSongs || allSongs.length === 0) {
          console.log('⚠️  云端缓存不可用，使用本地数据');
          allSongs = this.getAllMusicData();
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        // 简单关键词匹配
        const matchedSongs = netEaseSongs.filter(song => {
          const searchText = (song.name + (song.artists[0]?.name || '') + (song.album.name || '')).toLowerCase();
          return searchText.includes(keywords.toLowerCase());
        });

        res.json({
          code: 200,
          result: {
            songs: matchedSongs,
            songCount: matchedSongs.length
          }
        });
      } catch (error) {
        console.error('搜索API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 获取所有歌曲
    app.get('/songs', async (req, res) => {
      try {
        // 优先从云端缓存获取数据
        let allSongs = await this.getAllSongsFromCloud();
        
        // 如果云端缓存不可用，回退到本地数据
        if (!allSongs || allSongs.length === 0) {
          console.log('⚠️  云端缓存不可用，使用本地数据');
          allSongs = this.getAllMusicData();
        }
        
        const netEaseSongs = allSongs.map(song => this.convertToNetEaseFormat(song));

        res.json({
          code: 200,
          data: netEaseSongs,
          total: netEaseSongs.length
        });
      } catch (error) {
        console.error('获取歌曲API错误:', error);
        res.json({ code: 500, message: '服务器错误' });
      }
    });

    // 存活检查
    app.get('/ping', (req, res) => {
      res.json({ code: 200, message: 'OK', timestamp: new Date().toISOString() });
    });

    // 启动服务器
    const server = app.listen(port, () => {
      console.log(`✅ 服务器已启动，访问 http://localhost:${port}`);
      console.log('🎵 支持的API端点:');
      console.log(`   - /song/detail?ids=123,456 (歌曲详情)`);
      console.log(`   - /search?keywords=关键词 (搜索歌曲)`);
      console.log(`   - /songs (获取所有歌曲)`);
      console.log(`   - /ping (存活检查)`);
      console.log('\n🛑 按 Ctrl+C 停止服务器\n');
    });

    // 处理程序退出
    process.on('SIGINT', () => {
      console.log('\n🛑 停止音乐API服务器...');
      server.close(() => {
        console.log('✅ 服务器已停止');
        process.exit(0);
      });
    });
  }
}

// 主函数
async function main() {
  const apiKey = process.env.NOTION_API_KEY;

  if (!apiKey) {
    console.error('❌ 请设置 NOTION_API_KEY 环境变量');
    console.log('💡 在 .env 文件中添加: NOTION_API_KEY=你的Notion集成密钥');
    return;
  }

  const args = process.argv.slice(2);
  const command = args[0] || 'realtime';
  const forceFullSync = args.includes('--full') || args.includes('--force');

  const sync = new NotionSync(apiKey);

  switch (command) {
    case 'sync':
    case 'once':
      // 单次同步（支持--full强制全量同步）
      if (forceFullSync) {
        console.log('🔄 强制全量同步模式');
      }
      await sync.syncAllDatabases(forceFullSync);
      break;

    case 'status':
      // 显示状态
      console.log('📊 同步状态:');
      sync.showDataStats();
      console.log('\n详细状态:');
      console.log(JSON.stringify(sync.getStatus(), null, 2));
      break;

    case 'list':
      // 列出数据库（显示完整ID）
      const dbs = await sync.getDatabaseList();
      console.log('🗃️ 数据库列表:');
      dbs.forEach(db => {
        console.log(`${db.index}. ${db.title}`);
        console.log(`   ID: ${db.id}`);
        console.log(`   链接: ${db.url}`);
        console.log(`   最后编辑: ${new Date(db.last_edited).toLocaleString()}`);
        console.log('');
      });
      break;

    case 'test':
      // 测试连接
      await sync.testConnection();
      break;

    case 'stats':
      // 显示数据统计
      sync.showDataStats();
      break;

    case 'clean':
      // 清理所有同步数据
      sync.cleanAllData();
      break;

    case 'api':
    case 'server':
      // 启动音乐API服务器（默认端口3456）
      const port = parseInt(args[1]) || 3456;
      sync.startMusicApiServer(port);
      break;

    case 'realtime':
    default:
      // 实时同步（默认5分钟间隔，支持--full强制全量同步）
      const interval = parseInt(args[1]) || 5;
      sync.startRealtimeSync(interval, forceFullSync);
      break;
  }
}

export { NotionSync };

// 如果直接运行，执行主函数
try {
  if (require.main === module) {
    console.log('🚀 启动 HajihamiAPI (CommonJS 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
} catch (e) {
  // ES Module fallback
  if (import.meta.url.includes(process.argv[1]?.split(/[/\\]/).pop() || 'index.js')) {
    console.log('🚀 启动 HajihamiAPI (ES Module 模式)...');
    console.log('运行参数:', process.argv.slice(2));
    main().catch(console.error);
  }
}
