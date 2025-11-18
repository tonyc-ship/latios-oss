-- Supabase Database Initialization SQL
-- This file creates the necessary tables for transcription and summarization functionality.

-- Table: tbl_podcast
-- Stores podcast/show information
CREATE TABLE IF NOT EXISTS tbl_podcast (
  id BIGSERIAL PRIMARY KEY,
  itunes_id TEXT UNIQUE NOT NULL,
  title TEXT DEFAULT '',
  short_title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  introduction TEXT DEFAULT '',
  image TEXT DEFAULT '',
  itunes_image TEXT DEFAULT '',
  itunes_author TEXT DEFAULT '',
  pub_date TIMESTAMPTZ,
  items INTEGER DEFAULT 0,
  update_time TIMESTAMPTZ DEFAULT NOW(),
  recommend INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  delete_status INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tbl_podcast_itunes_id ON tbl_podcast(itunes_id);
CREATE INDEX IF NOT EXISTS idx_tbl_podcast_recommend ON tbl_podcast(recommend);
CREATE INDEX IF NOT EXISTS idx_tbl_podcast_delete_status ON tbl_podcast(delete_status);
CREATE INDEX IF NOT EXISTS idx_tbl_podcast_sort ON tbl_podcast(sort);

-- Table: tbl_episode
-- Stores podcast episode information
CREATE TABLE IF NOT EXISTS tbl_episode (
  id BIGSERIAL PRIMARY KEY,
  guid TEXT NOT NULL,
  podcast_id TEXT,
  podcast_name TEXT DEFAULT '',
  title TEXT DEFAULT '',
  line_title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  pub_date TIMESTAMPTZ,
  author TEXT DEFAULT '',
  itunes_image TEXT DEFAULT '',
  itunes_duration TEXT DEFAULT '',
  itunes_summary TEXT DEFAULT '',
  itunes_subtitle TEXT DEFAULT '',
  enclosure_url TEXT DEFAULT '',
  enclosure_type TEXT DEFAULT '',
  enclosure_length TEXT DEFAULT '',
  type INTEGER DEFAULT 1,
  status INTEGER DEFAULT 1,
  delete_status INTEGER DEFAULT 1,
  update_time TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guid)
);

CREATE INDEX IF NOT EXISTS idx_tbl_episode_guid ON tbl_episode(guid);
CREATE INDEX IF NOT EXISTS idx_tbl_episode_podcast_id ON tbl_episode(podcast_id);
CREATE INDEX IF NOT EXISTS idx_tbl_episode_type ON tbl_episode(type);
CREATE INDEX IF NOT EXISTS idx_tbl_episode_delete_status ON tbl_episode(delete_status);
CREATE INDEX IF NOT EXISTS idx_tbl_episode_pub_date ON tbl_episode(pub_date);
CREATE INDEX IF NOT EXISTS idx_tbl_episode_update_time ON tbl_episode(update_time);

-- Table: tbl_transcript
-- Stores podcast episode transcriptions
CREATE TABLE IF NOT EXISTS tbl_transcript (
  id BIGSERIAL PRIMARY KEY,
  episode_id TEXT NOT NULL,
  show_title TEXT DEFAULT '',
  episode_title TEXT DEFAULT '',
  language INTEGER NOT NULL DEFAULT 1,
  content TEXT DEFAULT '',
  publish_date TIMESTAMPTZ,
  count INTEGER DEFAULT 0,
  create_user_id TEXT DEFAULT 'guest',
  update_user_id TEXT DEFAULT 'guest',
  create_time TIMESTAMPTZ DEFAULT NOW(),
  update_time TIMESTAMPTZ DEFAULT NOW(),
  status INTEGER DEFAULT 1,
  delete_status INTEGER DEFAULT 1,
  UNIQUE(episode_id, language)
);

CREATE INDEX IF NOT EXISTS idx_tbl_transcript_episode_id ON tbl_transcript(episode_id);
CREATE INDEX IF NOT EXISTS idx_tbl_transcript_language ON tbl_transcript(language);
CREATE INDEX IF NOT EXISTS idx_tbl_transcript_status ON tbl_transcript(status);
CREATE INDEX IF NOT EXISTS idx_tbl_transcript_delete_status ON tbl_transcript(delete_status);
CREATE INDEX IF NOT EXISTS idx_tbl_transcript_create_time ON tbl_transcript(create_time);

-- Table: tbl_summarize
-- Stores episode summaries
CREATE TABLE IF NOT EXISTS tbl_summarize (
  id BIGSERIAL PRIMARY KEY,
  episode_id TEXT NOT NULL,
  show_title TEXT DEFAULT '',
  episode_title TEXT DEFAULT '',
  episode_duration TEXT DEFAULT '',
  publish_date TIMESTAMPTZ,
  language INTEGER NOT NULL DEFAULT 1,
  content TEXT DEFAULT '',
  count INTEGER DEFAULT 0,
  create_user_id TEXT DEFAULT 'guest',
  update_user_id TEXT DEFAULT 'guest',
  create_time TIMESTAMPTZ DEFAULT NOW(),
  update_time TIMESTAMPTZ DEFAULT NOW(),
  status INTEGER DEFAULT 1,
  delete_status INTEGER DEFAULT 1,
  UNIQUE(episode_id, language)
);

CREATE INDEX IF NOT EXISTS idx_tbl_summarize_episode_id ON tbl_summarize(episode_id);
CREATE INDEX IF NOT EXISTS idx_tbl_summarize_language ON tbl_summarize(language);
CREATE INDEX IF NOT EXISTS idx_tbl_summarize_status ON tbl_summarize(status);
CREATE INDEX IF NOT EXISTS idx_tbl_summarize_delete_status ON tbl_summarize(delete_status);
CREATE INDEX IF NOT EXISTS idx_tbl_summarize_create_time ON tbl_summarize(create_time);

-- Table: tbl_user_summarize_ref
-- Tracks user interactions with summaries and transcripts
CREATE TABLE IF NOT EXISTS tbl_user_summarize_ref (
  user_id TEXT NOT NULL,
  data_id TEXT NOT NULL,
  data_type INTEGER NOT NULL,
  delete_status INTEGER DEFAULT 1,
  user_name TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  user_country TEXT DEFAULT '',
  user_city TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  show_title TEXT DEFAULT '',
  episode_title TEXT DEFAULT '',
  episode_duration TEXT DEFAULT '',
  publish_date TIMESTAMPTZ,
  PRIMARY KEY (user_id, data_id, data_type)
);

CREATE INDEX IF NOT EXISTS idx_tbl_user_summarize_ref_user_id ON tbl_user_summarize_ref(user_id);
CREATE INDEX IF NOT EXISTS idx_tbl_user_summarize_ref_data_id ON tbl_user_summarize_ref(data_id);
CREATE INDEX IF NOT EXISTS idx_tbl_user_summarize_ref_data_type ON tbl_user_summarize_ref(data_type);
CREATE INDEX IF NOT EXISTS idx_tbl_user_summarize_ref_delete_status ON tbl_user_summarize_ref(delete_status);
