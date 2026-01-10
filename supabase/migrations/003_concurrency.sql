-- Calibration Services CRM - Concurrency & Presence System
-- Run this AFTER 002_rls_policies.sql

-- ============================================
-- RECORD LOCKS TABLE
-- Tracks who is currently editing what
-- ============================================
CREATE TABLE record_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What's being locked
  entity_type TEXT NOT NULL,  -- 'company', 'branch', 'job', 'quote', etc.
  entity_id UUID NOT NULL,
  
  -- Who has the lock
  locked_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  locked_by_name TEXT NOT NULL,  -- Denormalized for quick display
  
  -- Lock timing
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- Auto-expire after timeout
  
  -- Unique constraint: only one lock per entity
  UNIQUE(entity_type, entity_id)
);

-- Index for cleanup queries
CREATE INDEX idx_locks_expires ON record_locks(expires_at);
CREATE INDEX idx_locks_user ON record_locks(locked_by);

-- ============================================
-- USER PRESENCE TABLE
-- Tracks who is viewing what (not editing, just viewing)
-- ============================================
CREATE TABLE user_presence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  
  -- Where they are
  current_page TEXT,  -- '/companies', '/jobs/123', etc.
  entity_type TEXT,   -- 'company', 'job', etc. (null if on list page)
  entity_id UUID,     -- Which specific record (null if on list page)
  
  -- Status
  status TEXT DEFAULT 'online',  -- 'online', 'idle', 'editing'
  
  -- Timing
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  
  -- One presence record per user
  UNIQUE(user_id)
);

CREATE INDEX idx_presence_entity ON user_presence(entity_type, entity_id);
CREATE INDEX idx_presence_last_seen ON user_presence(last_seen);

-- ============================================
-- LOCK MANAGEMENT FUNCTIONS
-- ============================================

-- Acquire a lock (returns true if successful, false if already locked by someone else)
CREATE OR REPLACE FUNCTION acquire_lock(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_lock_duration_minutes INTEGER DEFAULT 15
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_existing_lock record_locks%ROWTYPE;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user name
  SELECT full_name INTO v_user_name FROM profiles WHERE id = v_user_id;
  
  -- Check for existing lock
  SELECT * INTO v_existing_lock 
  FROM record_locks 
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  
  IF FOUND THEN
    -- Lock exists - check if it's ours or expired
    IF v_existing_lock.locked_by = v_user_id THEN
      -- It's our lock - extend it
      v_expires_at := NOW() + (p_lock_duration_minutes || ' minutes')::interval;
      UPDATE record_locks 
      SET expires_at = v_expires_at, locked_at = NOW()
      WHERE id = v_existing_lock.id;
      
      RETURN jsonb_build_object(
        'success', true, 
        'lock_id', v_existing_lock.id,
        'expires_at', v_expires_at,
        'extended', true
      );
    ELSIF v_existing_lock.expires_at < NOW() THEN
      -- Lock expired - take it over
      v_expires_at := NOW() + (p_lock_duration_minutes || ' minutes')::interval;
      UPDATE record_locks 
      SET locked_by = v_user_id,
          locked_by_name = v_user_name,
          locked_at = NOW(),
          expires_at = v_expires_at
      WHERE id = v_existing_lock.id;
      
      RETURN jsonb_build_object(
        'success', true, 
        'lock_id', v_existing_lock.id,
        'expires_at', v_expires_at,
        'took_over', true
      );
    ELSE
      -- Lock is held by someone else and not expired
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Record is being edited',
        'locked_by', v_existing_lock.locked_by,
        'locked_by_name', v_existing_lock.locked_by_name,
        'locked_at', v_existing_lock.locked_at,
        'expires_at', v_existing_lock.expires_at
      );
    END IF;
  ELSE
    -- No lock exists - create one
    v_expires_at := NOW() + (p_lock_duration_minutes || ' minutes')::interval;
    INSERT INTO record_locks (entity_type, entity_id, locked_by, locked_by_name, expires_at)
    VALUES (p_entity_type, p_entity_id, v_user_id, v_user_name, v_expires_at)
    RETURNING id INTO v_existing_lock.id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'lock_id', v_existing_lock.id,
      'expires_at', v_expires_at,
      'created', true
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release a lock
CREATE OR REPLACE FUNCTION release_lock(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Only delete if it's our lock
  DELETE FROM record_locks 
  WHERE entity_type = p_entity_type 
    AND entity_id = p_entity_id 
    AND locked_by = v_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a record is locked (and by whom)
CREATE OR REPLACE FUNCTION check_lock(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_lock record_locks%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_lock 
  FROM record_locks 
  WHERE entity_type = p_entity_type 
    AND entity_id = p_entity_id
    AND expires_at > NOW();  -- Only return non-expired locks
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', false);
  END IF;
  
  RETURN jsonb_build_object(
    'locked', true,
    'is_mine', v_lock.locked_by = v_user_id,
    'locked_by', v_lock.locked_by,
    'locked_by_name', v_lock.locked_by_name,
    'locked_at', v_lock.locked_at,
    'expires_at', v_lock.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired locks (run periodically via cron or Edge Function)
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM record_locks WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PRESENCE MANAGEMENT FUNCTIONS
-- ============================================

-- Update user presence (call this on page navigation and periodically)
CREATE OR REPLACE FUNCTION update_presence(
  p_current_page TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'online'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT full_name INTO v_user_name FROM profiles WHERE id = v_user_id;
  
  INSERT INTO user_presence (user_id, user_name, current_page, entity_type, entity_id, status, last_seen)
  VALUES (v_user_id, v_user_name, p_current_page, p_entity_type, p_entity_id, p_status, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    user_name = EXCLUDED.user_name,
    current_page = EXCLUDED.current_page,
    entity_type = EXCLUDED.entity_type,
    entity_id = EXCLUDED.entity_id,
    status = EXCLUDED.status,
    last_seen = NOW();
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get users currently viewing a specific record
CREATE OR REPLACE FUNCTION get_viewers(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  status TEXT,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.user_id,
    up.user_name,
    up.status,
    up.last_seen
  FROM user_presence up
  WHERE up.entity_type = p_entity_type
    AND up.entity_id = p_entity_id
    AND up.last_seen > NOW() - INTERVAL '2 minutes'  -- Only show recent viewers
    AND up.user_id != auth.uid();  -- Don't include current user
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup stale presence records
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM user_presence WHERE last_seen < NOW() - INTERVAL '5 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES FOR LOCK & PRESENCE TABLES
-- ============================================

ALTER TABLE record_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Everyone can view locks (need to see who's editing)
CREATE POLICY "View all locks" ON record_locks FOR SELECT USING (true);

-- Users can only manage their own locks (via functions)
CREATE POLICY "Manage own locks" ON record_locks 
  FOR ALL USING (locked_by = auth.uid());

-- Everyone can view presence
CREATE POLICY "View all presence" ON user_presence FOR SELECT USING (true);

-- Users can only manage their own presence
CREATE POLICY "Manage own presence" ON user_presence 
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE record_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;

-- ============================================
-- VERSION TRACKING FOR OPTIMISTIC CONCURRENCY
-- Add version column to main tables for conflict detection
-- ============================================

-- Add version columns to key tables
ALTER TABLE companies ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Auto-increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_companies_version BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION increment_version();
CREATE TRIGGER increment_branches_version BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION increment_version();
CREATE TRIGGER increment_equipment_version BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION increment_version();
CREATE TRIGGER increment_jobs_version BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION increment_version();
CREATE TRIGGER increment_quotes_version BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION increment_version();
CREATE TRIGGER increment_certificates_version BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION increment_version();
