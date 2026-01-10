// Presence and Record Locking Service
// Handles real-time sync, presence tracking, and optimistic locking
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export interface LockInfo {
  locked: boolean;
  is_mine?: boolean;
  locked_by?: string;
  locked_by_name?: string;
  locked_at?: string;
  expires_at?: string;
}

export interface LockResult {
  success: boolean;
  lock_id?: string;
  expires_at?: string;
  extended?: boolean;
  took_over?: boolean;
  created?: boolean;
  error?: string;
  locked_by?: string;
  locked_by_name?: string;
  locked_at?: string;
}

export interface Viewer {
  user_id: string;
  user_name: string;
  status: string;
  last_seen: string;
}

export interface PresenceState {
  currentPage: string;
  entityType?: string;
  entityId?: string;
  status: 'online' | 'idle' | 'editing';
}

// ============================================
// LOCK MANAGEMENT
// ============================================

/**
 * Attempt to acquire a lock on a record
 * @param entityType - Type of entity ('company', 'job', etc.)
 * @param entityId - UUID of the entity
 * @param durationMinutes - How long the lock should last (default 15)
 */
export async function acquireLock(
  entityType: string,
  entityId: string,
  durationMinutes: number = 15
): Promise<LockResult> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.rpc('acquire_lock', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_lock_duration_minutes: durationMinutes,
  });

  if (error) {
    console.error('Failed to acquire lock:', error);
    return { success: false, error: error.message };
  }

  return data as LockResult;
}

/**
 * Release a lock on a record
 */
export async function releaseLock(
  entityType: string,
  entityId: string
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc('release_lock', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    console.error('Failed to release lock:', error);
    return false;
  }

  return data as boolean;
}

/**
 * Check if a record is currently locked
 */
export async function checkLock(
  entityType: string,
  entityId: string
): Promise<LockInfo> {
  if (!supabase) return { locked: false };

  const { data, error } = await supabase.rpc('check_lock', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    console.error('Failed to check lock:', error);
    return { locked: false };
  }

  return data as LockInfo;
}

/**
 * Extend an existing lock (call periodically while editing)
 */
export async function extendLock(
  entityType: string,
  entityId: string,
  durationMinutes: number = 15
): Promise<boolean> {
  const result = await acquireLock(entityType, entityId, durationMinutes);
  return result.success && (result.extended || result.created);
}

// ============================================
// PRESENCE MANAGEMENT
// ============================================

/**
 * Update current user's presence
 */
export async function updatePresence(state: PresenceState): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc('update_presence', {
    p_current_page: state.currentPage,
    p_entity_type: state.entityType || null,
    p_entity_id: state.entityId || null,
    p_status: state.status,
  });

  if (error) {
    console.error('Failed to update presence:', error);
    return false;
  }

  return data as boolean;
}

/**
 * Get users currently viewing a specific record
 */
export async function getViewers(
  entityType: string,
  entityId: string
): Promise<Viewer[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_viewers', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    console.error('Failed to get viewers:', error);
    return [];
  }

  return (data as Viewer[]) || [];
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export type EntityChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => void;

export type LockChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId: string;
  lockedBy?: string;
  lockedByName?: string;
}) => void;

export type PresenceChangeCallback = (viewers: Viewer[]) => void;

/**
 * Subscribe to changes on a specific entity
 */
export function subscribeToEntity(
  table: string,
  entityId: string,
  callback: EntityChangeCallback
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`${table}-${entityId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table,
        filter: `id=eq.${entityId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Record<string, unknown>,
          old: payload.old as Record<string, unknown>,
        });
      }
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to all changes on a table (for list views)
 */
export function subscribeToTable(
  table: string,
  callback: EntityChangeCallback,
  filter?: string
): RealtimeChannel | null {
  if (!supabase) return null;

  const channelConfig: {
    event: '*';
    schema: 'public';
    table: string;
    filter?: string;
  } = {
    event: '*',
    schema: 'public',
    table: table,
  };

  if (filter) {
    channelConfig.filter = filter;
  }

  const channel = supabase
    .channel(`${table}-all${filter ? `-${filter}` : ''}`)
    .on('postgres_changes', channelConfig, (payload) => {
      callback({
        eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: payload.new as Record<string, unknown>,
        old: payload.old as Record<string, unknown>,
      });
    })
    .subscribe();

  return channel;
}

/**
 * Subscribe to lock changes for a specific entity
 */
export function subscribeToLocks(
  entityType: string,
  entityId: string,
  callback: LockChangeCallback
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`locks-${entityType}-${entityId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'record_locks',
        filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
      },
      (payload) => {
        const data = (payload.new || payload.old) as Record<string, unknown>;
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          entityType: data.entity_type as string,
          entityId: data.entity_id as string,
          lockedBy: data.locked_by as string | undefined,
          lockedByName: data.locked_by_name as string | undefined,
        });
      }
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to presence changes for a specific entity
 */
export function subscribeToPresence(
  entityType: string,
  entityId: string,
  callback: PresenceChangeCallback
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel(`presence-${entityType}-${entityId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_presence',
        filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
      },
      async () => {
        // Refetch viewers when presence changes
        const viewers = await getViewers(entityType, entityId);
        callback(viewers);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribe(channel: RealtimeChannel | null): void {
  if (channel && supabase) {
    supabase.removeChannel(channel);
  }
}

// ============================================
// OPTIMISTIC LOCKING HELPER
// ============================================

/**
 * Check version before update to detect conflicts
 * @returns true if versions match, false if conflict detected
 */
export async function checkVersion(
  table: string,
  entityId: string,
  expectedVersion: number
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(table)
    .select('version')
    .eq('id', entityId)
    .single();

  if (error) {
    console.error('Failed to check version:', error);
    return false;
  }

  return data?.version === expectedVersion;
}

/**
 * Perform update with version check
 * Throws error if version mismatch (someone else edited)
 */
export async function updateWithVersionCheck<T extends { version?: number }>(
  table: string,
  entityId: string,
  updates: Partial<T>,
  expectedVersion: number
): Promise<T> {
  if (!supabase) throw new Error('Supabase not configured');

  // Use the version in the WHERE clause for optimistic locking
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', entityId)
    .eq('version', expectedVersion)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(
        'This record has been modified by another user. Please refresh and try again.'
      );
    }
    throw error;
  }

  if (!data) {
    throw new Error(
      'This record has been modified by another user. Please refresh and try again.'
    );
  }

  return data as T;
}
