-- 首次建库时自动执行（docker-entrypoint-initdb.d）
-- pgvector 扩展：游戏向量存储与相似度检索
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- 中文 bigram 模糊搜索备用（见任务拆解风险 R2）
