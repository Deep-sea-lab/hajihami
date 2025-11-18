// 云端缓存适配器 - 支持多种缓存后端
import SupabaseCache from './supabase-cache.js';

class CloudCacheAdapter {
  constructor() {
    this.cacheProvider = process.env.CACHE_PROVIDER || 'supabase'; // 默认使用 Supabase
    this.cache = null;
    
    this.initializeCache();
  }

  initializeCache() {
    switch (this.cacheProvider.toLowerCase()) {
      case 'supabase':
        this.cache = new SupabaseCache();
        break;
      default:
        console.warn(`不支持的缓存提供者: ${this.cacheProvider}，使用默认的 Supabase`);
        this.cache = new SupabaseCache();
    }
  }

  // 保存歌曲数据
  async saveSongs(songs) {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.saveSongs(songs);
  }

  // 获取所有歌曲
  async getAllSongs() {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.getAllSongs();
  }

  // 搜索歌曲
  async searchSongs(keywords, limit = 50) {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.searchSongs(keywords, limit);
  }

  // 根据ID获取歌曲
  async getSongsByIds(ids) {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.getSongsByIds(ids);
  }

  // 获取缓存统计
  async getStats() {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.getStats();
  }

  // 获取最后更新时间
  async getLastUpdated() {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.getLastUpdated();
  }

  // 获取最后同步信息
  async getLastSyncInfo() {
    if (!this.cache) {
      throw new Error('缓存未初始化');
    }
    
    return await this.cache.getLastSyncInfo();
  }

  // 检查缓存是否可用
  async isAvailable() {
    try {
      await this.getStats();
      return true;
    } catch (error) {
      console.error('缓存不可用:', error.message);
      return false;
    }
  }
}

// 导出单例实例
const cloudCache = new CloudCacheAdapter();
export default cloudCache;

// 导出类本身以便直接使用
export { CloudCacheAdapter };