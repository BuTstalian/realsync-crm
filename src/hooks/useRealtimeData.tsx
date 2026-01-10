// Hook for real-time data synchronization
// Automatically updates local state when database changes
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { subscribeToTable, subscribeToEntity, unsubscribe } from '../services/presence';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// SINGLE RECORD HOOK
// For detail views - subscribes to one record
// ============================================

interface UseRealtimeRecordOptions<T> {
  table: string;
  id: string | null;
  initialData?: T | null;
  select?: string;
  onUpdate?: (data: T) => void;
  onDelete?: () => void;
}

interface UseRealtimeRecordReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  version: number; // For optimistic locking
}

export function useRealtimeRecord<T extends { id: string; version?: number }>({
  table,
  id,
  initialData = null,
  select = '*',
  onUpdate,
  onDelete,
}: UseRealtimeRecordOptions<T>): UseRealtimeRecordReturn<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(initialData?.version ?? 0);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch the record
  const fetchData = useCallback(async () => {
    if (!id || !supabase) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data: record, error: fetchError } = await supabase
        .from(table)
        .select(select)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      setData(record as T);
      setVersion(record?.version ?? 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [table, id, select]);

  // Subscribe to changes
  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }

    // Initial fetch
    fetchData();

    // Subscribe to realtime changes
    channelRef.current = subscribeToEntity(table, id, (payload) => {
      if (payload.eventType === 'UPDATE') {
        const newData = payload.new as T;
        setData(newData);
        setVersion(newData.version ?? 0);
        onUpdate?.(newData);
      } else if (payload.eventType === 'DELETE') {
        setData(null);
        onDelete?.();
      }
    });

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [table, id, fetchData, onUpdate, onDelete]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchData,
    version,
  };
}

// ============================================
// LIST HOOK
// For list views - subscribes to table changes
// ============================================

interface UseRealtimeListOptions<T> {
  table: string;
  select?: string;
  filter?: Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

interface UseRealtimeListReturn<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  refresh: () => Promise<void>;
}

export function useRealtimeList<T extends { id: string }>({
  table,
  select = '*',
  filter,
  orderBy,
  limit,
  offset,
  enabled = true,
}: UseRealtimeListOptions<T>): UseRealtimeListReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // Build filter string for realtime subscription
  const filterString = filter
    ? Object.entries(filter)
        .map(([key, value]) => `${key}=eq.${value}`)
        .join(',')
    : undefined;

  // Fetch the list
  const fetchData = useCallback(async () => {
    if (!enabled || !supabase) return;

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(table)
        .select(select, { count: 'exact' });

      // Apply filters
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      // Apply ordering
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }

      // Apply pagination
      if (limit !== undefined) {
        const start = offset ?? 0;
        query = query.range(start, start + limit - 1);
      }

      const { data: records, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      setData((records as T[]) || []);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [table, select, filter, orderBy, limit, offset, enabled]);

  // Subscribe to changes
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchData();

    // Subscribe to realtime changes
    channelRef.current = subscribeToTable(table, (payload) => {
      if (payload.eventType === 'INSERT') {
        const newRecord = payload.new as T;
        // Check if record matches our filter
        if (!filter || matchesFilter(newRecord, filter)) {
          setData((prev) => [newRecord, ...prev]);
          setTotalCount((prev) => prev + 1);
        }
      } else if (payload.eventType === 'UPDATE') {
        const updatedRecord = payload.new as T;
        setData((prev) =>
          prev.map((item) => (item.id === updatedRecord.id ? updatedRecord : item))
        );
      } else if (payload.eventType === 'DELETE') {
        const deletedId = payload.old.id as string;
        setData((prev) => prev.filter((item) => item.id !== deletedId));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    }, filterString);

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [table, filterString, filter, enabled, fetchData]);

  return {
    data,
    isLoading,
    error,
    totalCount,
    refresh: fetchData,
  };
}

// Helper to check if record matches filter
function matchesFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined || value === null) return true;
    return record[key] === value;
  });
}

// ============================================
// COMBINED HOOK FOR DETAIL VIEWS
// Combines record data, locking, and presence
// ============================================

import { useRecordLock, useEditMode } from './useRecordLock';
import { usePresence, PresenceIndicator, LockWarning } from './usePresence';

interface UseDetailViewOptions<T> {
  table: string;
  entityType: string;
  id: string | null;
  select?: string;
  onSave: (data: T) => Promise<void>;
}

export function useDetailView<T extends { id: string; version?: number }>({
  table,
  entityType,
  id,
  select = '*',
  onSave,
}: UseDetailViewOptions<T>) {
  // Real-time data
  const {
    data,
    isLoading,
    error,
    refresh,
    version,
  } = useRealtimeRecord<T>({
    table,
    id,
    select,
  });

  // Presence tracking
  const {
    viewers,
    updateStatus,
  } = usePresence({
    currentPage: `/${entityType}/${id}`,
    entityType,
    entityId: id ?? undefined,
  });

  // Edit mode with locking
  const editMode = useEditMode<T>({
    entityType,
    entityId: id,
    initialData: data,
    onSave: async (editData) => {
      // Update status to show we're saving
      updateStatus('online');
      await onSave(editData);
    },
    onCancel: () => {
      updateStatus('online');
    },
  });

  // Update presence when entering/exiting edit mode
  const startEdit = async () => {
    const success = await editMode.startEdit();
    if (success) {
      updateStatus('editing');
    }
    return success;
  };

  return {
    // Data
    data,
    isLoading,
    error,
    version,
    refresh,

    // Presence
    viewers,
    PresenceIndicator: () => <PresenceIndicator viewers={viewers} />,

    // Edit mode
    isEditing: editMode.isEditing,
    editData: editMode.editData,
    isDirty: editMode.isDirty,
    isSaving: editMode.isSaving,
    startEdit,
    cancelEdit: editMode.cancelEdit,
    saveEdit: editMode.saveEdit,
    updateField: editMode.updateField,

    // Lock state
    isLockedByOther: editMode.isLockedByOther,
    lockInfo: editMode.lockInfo,
    LockWarning: () =>
      editMode.isLockedByOther ? (
        <LockWarning
          lockedByName={editMode.lockInfo?.locked_by_name}
          lockedAt={editMode.lockInfo?.locked_at}
        />
      ) : null,
  };
}
