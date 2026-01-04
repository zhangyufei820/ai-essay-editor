-- 🎵 为 chat_messages 表添加 metadata 字段，用于存储音乐数据
-- 
-- 执行方式：在 Supabase SQL Editor 中运行此脚本

-- 添加 metadata 字段（JSONB 类型，可存储任意 JSON 数据）
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- 添加注释
COMMENT ON COLUMN public.chat_messages.metadata IS '消息元数据，用于存储音乐、图片等附加信息';

-- 创建索引（可选，如果需要按 metadata 查询）
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata 
ON public.chat_messages USING GIN (metadata);

-- 示例：音乐数据结构
-- {
--   "type": "music",
--   "taskId": "xxx-xxx-xxx",
--   "songs": [
--     {
--       "id": 1,
--       "status": "ready",
--       "audioUrl": "https://...",
--       "coverUrl": "https://...",
--       "title": "歌曲名",
--       "duration": 180
--     },
--     {
--       "id": 2,
--       "status": "ready",
--       "audioUrl": "https://...",
--       "coverUrl": "https://...",
--       "title": "歌曲名",
--       "duration": 180
--     }
--   ]
-- }
