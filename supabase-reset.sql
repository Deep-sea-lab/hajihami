-- 删除所有歌曲数据
DELETE FROM songs;

-- 如果需要重新创建表（会清除所有数据和表结构）
DROP TABLE IF EXISTS songs;

-- 重新创建表，包含所有必需的列，全部使用双引号确保大小写匹配
CREATE TABLE songs (
  "id" BIGINT PRIMARY KEY,
  "name" TEXT,
  "artists" JSONB,
  "album" JSONB,
  "url" TEXT,
  "picUrl" TEXT,
  "playedCount" INTEGER DEFAULT 0,
  "fee" INTEGER DEFAULT 0,
  "feeReason" INTEGER DEFAULT 0,
  "pc" BOOLEAN DEFAULT true,
  "noCopyrightRcmd" JSONB,
  "bv_number" TEXT,
  "creation_time" TEXT,
  "publish_time" TEXT,
  "style" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_songs_bv_number ON songs("bv_number");
CREATE INDEX idx_songs_name ON songs("name");
CREATE INDEX idx_songs_style ON songs("style");
CREATE INDEX idx_songs_creation_time ON songs("creation_time");

-- 验证表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'songs'
ORDER BY ordinal_position;