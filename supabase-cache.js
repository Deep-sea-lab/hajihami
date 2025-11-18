// Supabase 缓存实现，用于云端存储 Notion 同步数据
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

class SupabaseCache {
  constructor() {
    // 从环境变量获取配置
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('缺少 Supabase 环境变量配置');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  // 初始化数据库表
  async initializeTables() {
    // 这里需要通过 Supabase 控制台或 migrations 创建表
    console.log('请在 Supabase 控制台中创建以下表：');
    console.log(`
-- 创建 songs 表
CREATE TABLE songs (
  id BIGINT PRIMARY KEY,
  name TEXT,
  artists JSONB,
  album JSONB,
  url TEXT,
  picUrl TEXT,
  playedCount INTEGER DEFAULT 0,
  fee INTEGER DEFAULT 0,
  feeReason INTEGER DEFAULT 0,
  pc BOOLEAN DEFAULT true,
  noCopyrightRcmd JSONB,
  bv_number TEXT,
  creation_time TEXT,
  publish_time TEXT,
  style TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_songs_bv_number ON songs(bv_number);
CREATE INDEX idx_songs_name ON songs(name);
CREATE INDEX idx_songs_style ON songs(style);
CREATE INDEX idx_songs_creation_time ON songs(creation_time);
    `);
  }

  // 保存歌曲数据到云端
  async saveSongs(songs) {
    if (!songs || songs.length === 0) {
      console.log('没有歌曲数据需要保存');
      return { success: true, count: 0 };
    }

    try {
      // 去重：根据 id 去除重复的歌曲
      const uniqueSongs = [];
      const seenIds = new Set();
      
      for (const song of songs) {
        if (!seenIds.has(song.id)) {
          seenIds.add(song.id);
          uniqueSongs.push(song);
        }
      }
      
      console.log(`去重前: ${songs.length} 首, 去重后: ${uniqueSongs.length} 首`);

      // 批量插入数据
      const { data, error } = await this.supabase
        .from('songs')
        .upsert(uniqueSongs, {
          onConflict: 'id', // 根据 id 字段处理冲突，如果存在则更新
          ignoreDuplicates: true // 忽略重复项
        });

      if (error) {
        console.error('保存歌曲数据到 Supabase 失败:', error);
        throw error;
      }

      console.log(`✅ 成功保存 ${uniqueSongs.length} 首歌曲到云端缓存`);
      return { success: true, count: uniqueSongs.length };
    } catch (error) {
      console.error('保存歌曲数据时发生错误:', error);
      return { success: false, error: error.message };
    }
  }

  // 从云端获取所有歌曲
  async getAllSongs() {
    try {
      const { data, error } = await this.supabase
        .from('songs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('从 Supabase 获取歌曲数据失败:', error);
        throw error;
      }

      console.log(`✅ 从云端获取 ${data.length} 首歌曲`);
      return data || [];
    } catch (error) {
      console.error('获取歌曲数据时发生错误:', error);
      return [];
    }
  }

  // 按关键词搜索歌曲
  async searchSongs(keywords, limit = 50) {
    if (!keywords) {
      return [];
    }

    try {
      // 使用全文搜索或模糊匹配
      const { data, error } = await this.supabase
        .from('songs')
        .select('*')
        .or(`name.ilike.%${keywords}%,artists->>0->>name.ilike.%${keywords}%,album->>name.ilike.%${keywords}%,style.ilike.%${keywords}%,original_song.ilike.%${keywords}%`)
        .limit(limit);

      if (error) {
        console.error('搜索歌曲失败:', error);
        throw error;
      }

      console.log(`✅ 搜索到 ${data.length} 首歌曲 (关键词: ${keywords})`);
      return data || [];
    } catch (error) {
      console.error('搜索歌曲时发生错误:', error);
      return [];
    }
  }

  // 根据 ID 获取特定歌曲
  async getSongsByIds(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('songs')
        .select('*')
        .in('id', ids);

      if (error) {
        console.error('根据ID获取歌曲失败:', error);
        throw error;
      }

      console.log(`✅ 根据ID获取 ${data.length} 首歌曲`);
      return data || [];
    } catch (error) {
      console.error('根据ID获取歌曲时发生错误:', error);
      return [];
    }
  }

  // 获取缓存统计信息
  async getStats() {
    try {
      const { count, error } = await this.supabase
        .from('songs')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('获取缓存统计信息失败:', error);
        throw error;
      }

      const lastUpdated = await this.getLastUpdated();

      return {
        totalSongs: count || 0,
        lastUpdated: lastUpdated,
        cacheProvider: 'Supabase'
      };
    } catch (error) {
      console.error('获取统计信息时发生错误:', error);
      return {
        totalSongs: 0,
        lastUpdated: null,
        cacheProvider: 'Supabase'
      };
    }
  }

  // 获取最后更新时间
  async getLastUpdated() {
    try {
      const { data, error } = await this.supabase
        .from('songs')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('获取最后更新时间失败:', error);
        return null;
      }

      return data && data[0] ? data[0].updated_at : null;
    } catch (error) {
      console.error('获取最后更新时间时发生错误:', error);
      return null;
    }
  }

  // 清除过期数据（可选）
  async cleanup() {
    try {
      // 可以根据需要实现清除逻辑，例如删除超过一定时间的数据
      console.log('云端缓存清理功能待实现');
      return { success: true };
    } catch (error) {
      console.error('清理缓存时发生错误:', error);
      return { success: false, error: error.message };
    }
  }
}

export default SupabaseCache;