// Hook for presence tracking and viewing who else is on a page
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  updatePresence,
  getViewers,
  subscribeToPresence,
  unsubscribe,
  type Viewer,
  type PresenceState,
} from '../services/presence';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuthStore } from '../stores/authStore';

interface UsePresenceOptions {
  currentPage: string;
  entityType?: string;
  entityId?: string;
  heartbeatInterval?: number; // Seconds between presence updates
}

interface UsePresenceReturn {
  viewers: Viewer[];
  isLoading: boolean;
  updateStatus: (status: 'online' | 'idle' | 'editing') => void;
}

export function usePresence({
  currentPage,
  entityType,
  entityId,
  heartbeatInterval = 30,
}: UsePresenceOptions): UsePresenceReturn {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuthStore();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const statusRef = useRef<'online' | 'idle' | 'editing'>('online');

  // Update presence on server
  const sendPresence = useCallback(async (status?: 'online' | 'idle' | 'editing') => {
    if (!user) return;

    const currentStatus = status || statusRef.current;
    statusRef.current = currentStatus;

    const state: PresenceState = {
      currentPage,
      entityType,
      entityId,
      status: currentStatus,
    };

    await updatePresence(state);
  }, [user, currentPage, entityType, entityId]);

  // Fetch current viewers
  const fetchViewers = useCallback(async () => {
    if (!entityType || !entityId) {
      setViewers([]);
      setIsLoading(false);
      return;
    }

    try {
      const data = await getViewers(entityType, entityId);
      setViewers(data);
    } catch (err) {
      console.error('Failed to fetch viewers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  // Update status (e.g., when user starts editing)
  const updateStatus = useCallback((status: 'online' | 'idle' | 'editing') => {
    statusRef.current = status;
    sendPresence(status);
  }, [sendPresence]);

  // Set up presence tracking
  useEffect(() => {
    if (!user) return;

    // Send initial presence
    sendPresence();

    // Set up heartbeat
    heartbeatRef.current = setInterval(() => {
      sendPresence();
    }, heartbeatInterval * 1000);

    // Subscribe to presence changes for this entity
    if (entityType && entityId) {
      channelRef.current = subscribeToPresence(entityType, entityId, (newViewers) => {
        setViewers(newViewers);
      });

      // Initial fetch
      fetchViewers();
    }

    return () => {
      // Cleanup
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [user, entityType, entityId, heartbeatInterval, sendPresence, fetchViewers]);

  // Track idle state based on user activity
  useEffect(() => {
    let idleTimeout: NodeJS.Timeout | null = null;

    const resetIdleTimer = () => {
      if (statusRef.current === 'editing') return; // Don't interrupt editing status

      if (statusRef.current === 'idle') {
        updateStatus('online');
      }

      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }

      // Go idle after 2 minutes of inactivity
      idleTimeout = setTimeout(() => {
        if (statusRef.current !== 'editing') {
          updateStatus('idle');
        }
      }, 2 * 60 * 1000);
    };

    // Listen for user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    });

    // Initial timer
    resetIdleTimer();

    return () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [updateStatus]);

  return {
    viewers,
    isLoading,
    updateStatus,
  };
}

// ============================================
// PRESENCE INDICATOR COMPONENT
// Shows avatars of other users viewing the same record
// ============================================

import React from 'react';

interface PresenceIndicatorProps {
  viewers: Viewer[];
  className?: string;
}

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  viewers,
  className = '',
}) => {
  if (viewers.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm text-primary-400">Also viewing:</span>
      <div className="flex -space-x-2">
        {viewers.slice(0, 5).map((viewer) => (
          <div
            key={viewer.user_id}
            className="relative"
            title={`${viewer.user_name}${viewer.status === 'editing' ? ' (editing)' : ''}`}
          >
            {/* Avatar placeholder - could be actual avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 border-primary-900 ${
                viewer.status === 'editing'
                  ? 'bg-status-warning text-primary-900'
                  : viewer.status === 'idle'
                  ? 'bg-primary-600 text-primary-300'
                  : 'bg-accent-gold text-primary-900'
              }`}
            >
              {viewer.user_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            {/* Status dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-primary-900 ${
                viewer.status === 'editing'
                  ? 'bg-status-warning'
                  : viewer.status === 'idle'
                  ? 'bg-primary-500'
                  : 'bg-status-success'
              }`}
            />
          </div>
        ))}
        {viewers.length > 5 && (
          <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center text-xs font-medium border-2 border-primary-900">
            +{viewers.length - 5}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// LOCK WARNING COMPONENT
// Shows when someone else is editing
// ============================================

interface LockWarningProps {
  lockedByName?: string;
  lockedAt?: string;
  className?: string;
}

export const LockWarning: React.FC<LockWarningProps> = ({
  lockedByName,
  lockedAt,
  className = '',
}) => {
  const timeAgo = lockedAt
    ? formatTimeAgo(new Date(lockedAt))
    : '';

  return (
    <div
      className={`flex items-center gap-3 p-4 bg-status-warning/10 border border-status-warning/30 rounded-lg ${className}`}
    >
      <div className="flex-shrink-0">
        <svg
          className="w-5 h-5 text-status-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6V7a4 4 0 00-8 0v4m-4 0h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-status-warning">
          This record is being edited
        </p>
        <p className="text-sm text-primary-400">
          {lockedByName || 'Another user'} started editing {timeAgo}
        </p>
      </div>
    </div>
  );
};

// Helper function
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
