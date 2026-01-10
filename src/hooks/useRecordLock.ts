// Hook for record locking with automatic extension and cleanup
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  acquireLock,
  releaseLock,
  checkLock,
  subscribeToLocks,
  unsubscribe,
  type LockInfo,
  type LockResult,
} from '../services/presence';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRecordLockOptions {
  entityType: string;
  entityId: string | null;
  autoAcquire?: boolean;  // Automatically acquire lock when hook mounts
  lockDuration?: number;   // Minutes before lock expires
  extendInterval?: number; // Seconds between auto-extensions
  onLockLost?: () => void; // Callback when lock is taken by someone else
  onLockAcquired?: () => void;
  onLockReleased?: () => void;
}

interface UseRecordLockReturn {
  // State
  isLocked: boolean;        // Is the record locked by anyone?
  isLockedByMe: boolean;    // Do I have the lock?
  isLockedByOther: boolean; // Is it locked by someone else?
  lockInfo: LockInfo | null;
  isAcquiring: boolean;
  error: string | null;

  // Actions
  acquire: () => Promise<LockResult>;
  release: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useRecordLock({
  entityType,
  entityId,
  autoAcquire = false,
  lockDuration = 15,
  extendInterval = 60, // Extend every 60 seconds
  onLockLost,
  onLockAcquired,
  onLockReleased,
}: UseRecordLockOptions): UseRecordLockReturn {
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const extendIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLockedByMeRef = useRef(false);

  // Derived state
  const isLocked = lockInfo?.locked ?? false;
  const isLockedByMe = lockInfo?.is_mine ?? false;
  const isLockedByOther = isLocked && !isLockedByMe;

  // Keep ref in sync for interval callback
  isLockedByMeRef.current = isLockedByMe;

  // Check current lock status
  const refresh = useCallback(async () => {
    if (!entityId) return;

    try {
      const info = await checkLock(entityType, entityId);
      setLockInfo(info);

      // Detect if we lost our lock
      if (isLockedByMeRef.current && !info.is_mine && info.locked) {
        onLockLost?.();
      }
    } catch (err) {
      console.error('Failed to check lock:', err);
    }
  }, [entityType, entityId, onLockLost]);

  // Acquire the lock
  const acquire = useCallback(async (): Promise<LockResult> => {
    if (!entityId) {
      return { success: false, error: 'No entity ID' };
    }

    setIsAcquiring(true);
    setError(null);

    try {
      const result = await acquireLock(entityType, entityId, lockDuration);

      if (result.success) {
        setLockInfo({
          locked: true,
          is_mine: true,
          expires_at: result.expires_at,
        });
        onLockAcquired?.();
      } else {
        setLockInfo({
          locked: true,
          is_mine: false,
          locked_by: result.locked_by,
          locked_by_name: result.locked_by_name,
          locked_at: result.locked_at,
          expires_at: result.expires_at,
        });
        setError(result.error || 'Failed to acquire lock');
      }

      return result;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsAcquiring(false);
    }
  }, [entityType, entityId, lockDuration, onLockAcquired]);

  // Release the lock
  const release = useCallback(async (): Promise<boolean> => {
    if (!entityId) return false;

    try {
      const success = await releaseLock(entityType, entityId);
      if (success) {
        setLockInfo({ locked: false });
        onLockReleased?.();
      }
      return success;
    } catch (err) {
      console.error('Failed to release lock:', err);
      return false;
    }
  }, [entityType, entityId, onLockReleased]);

  // Set up realtime subscription and auto-extension
  useEffect(() => {
    if (!entityId) return;

    // Subscribe to lock changes
    channelRef.current = subscribeToLocks(entityType, entityId, (payload) => {
      if (payload.eventType === 'DELETE') {
        setLockInfo({ locked: false });
      } else {
        refresh();
      }
    });

    // Initial check
    refresh();

    // Auto-acquire if requested
    if (autoAcquire) {
      acquire();
    }

    return () => {
      // Cleanup
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [entityType, entityId, autoAcquire, refresh, acquire]);

  // Auto-extend lock while we have it
  useEffect(() => {
    if (!isLockedByMe || !entityId) {
      if (extendIntervalRef.current) {
        clearInterval(extendIntervalRef.current);
        extendIntervalRef.current = null;
      }
      return;
    }

    // Extend lock periodically
    extendIntervalRef.current = setInterval(async () => {
      if (isLockedByMeRef.current) {
        const result = await acquireLock(entityType, entityId, lockDuration);
        if (!result.success) {
          // Lost the lock
          setLockInfo({
            locked: true,
            is_mine: false,
            locked_by: result.locked_by,
            locked_by_name: result.locked_by_name,
          });
          onLockLost?.();
        }
      }
    }, extendInterval * 1000);

    return () => {
      if (extendIntervalRef.current) {
        clearInterval(extendIntervalRef.current);
        extendIntervalRef.current = null;
      }
    };
  }, [isLockedByMe, entityType, entityId, lockDuration, extendInterval, onLockLost]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (isLockedByMeRef.current && entityId) {
        releaseLock(entityType, entityId);
      }
    };
  }, [entityType, entityId]);

  return {
    isLocked,
    isLockedByMe,
    isLockedByOther,
    lockInfo,
    isAcquiring,
    error,
    acquire,
    release,
    refresh,
  };
}

// ============================================
// EDIT MODE HOOK
// Combines locking with edit state management
// ============================================

interface UseEditModeOptions<T> {
  entityType: string;
  entityId: string | null;
  initialData: T | null;
  onSave: (data: T) => Promise<void>;
  onCancel?: () => void;
  lockDuration?: number;
}

interface UseEditModeReturn<T> {
  // Edit state
  isEditing: boolean;
  editData: T | null;
  isDirty: boolean;
  isSaving: boolean;

  // Lock state (forwarded)
  isLockedByOther: boolean;
  lockInfo: LockInfo | null;
  lockError: string | null;

  // Actions
  startEdit: () => Promise<boolean>;
  cancelEdit: () => void;
  saveEdit: () => Promise<boolean>;
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  setEditData: (data: T) => void;
}

export function useEditMode<T extends Record<string, unknown>>({
  entityType,
  entityId,
  initialData,
  onSave,
  onCancel,
  lockDuration = 15,
}: UseEditModeOptions<T>): UseEditModeReturn<T> {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<T | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    isLockedByOther,
    isLockedByMe,
    lockInfo,
    error: lockError,
    acquire,
    release,
  } = useRecordLock({
    entityType,
    entityId,
    lockDuration,
    onLockLost: () => {
      // Someone took our lock - exit edit mode
      if (isEditing) {
        setIsEditing(false);
        setEditData(null);
        alert('Your editing session was interrupted. Another user is now editing this record.');
      }
    },
  });

  const isDirty = isEditing && editData !== null && 
    JSON.stringify(editData) !== JSON.stringify(initialData);

  // Start editing (acquire lock first)
  const startEdit = useCallback(async (): Promise<boolean> => {
    if (!initialData) return false;

    const result = await acquire();
    if (result.success) {
      setIsEditing(true);
      setEditData({ ...initialData });
      return true;
    }

    return false;
  }, [initialData, acquire]);

  // Cancel editing (release lock)
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditData(null);
    release();
    onCancel?.();
  }, [release, onCancel]);

  // Save changes
  const saveEdit = useCallback(async (): Promise<boolean> => {
    if (!editData || !isLockedByMe) return false;

    setIsSaving(true);
    try {
      await onSave(editData);
      setIsEditing(false);
      setEditData(null);
      await release();
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [editData, isLockedByMe, onSave, release]);

  // Update a single field
  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setEditData((prev) => (prev ? { ...prev, [field]: value } : null));
  }, []);

  return {
    isEditing,
    editData,
    isDirty,
    isSaving,
    isLockedByOther,
    lockInfo,
    lockError,
    startEdit,
    cancelEdit,
    saveEdit,
    updateField,
    setEditData,
  };
}
