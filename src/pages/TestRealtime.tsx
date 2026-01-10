// Test page for demonstrating real-time sync and locking
// Access via /test-realtime (add to routes temporarily)
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../services/supabase';
import { 
  acquireLock, 
  releaseLock, 
  checkLock,
  updatePresence,
  getViewers
} from '../services/presence';
import { Users, Lock, Unlock, RefreshCw, Send, Eye } from 'lucide-react';

export default function TestRealtime() {
  const { profile, user } = useAuthStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [viewers, setViewers] = useState<any[]>([]);
  const [editValue, setEditValue] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  // Load companies on mount
  useEffect(() => {
    loadCompanies();
  }, []);

  // Subscribe to real-time changes on selected company
  useEffect(() => {
    if (!selectedCompany || !supabase) return;

    log(`Subscribing to real-time updates for company ${selectedCompany.id}`);

    // Subscribe to company changes
    const companyChannel = supabase
      .channel(`company-${selectedCompany.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'companies',
          filter: `id=eq.${selectedCompany.id}`,
        },
        (payload) => {
          log(`🔄 Real-time update received: ${JSON.stringify(payload.new.name)}`);
          setSelectedCompany(payload.new);
          setEditValue(payload.new.name);
        }
      )
      .subscribe((status) => {
        log(`Company subscription: ${status}`);
      });

    // Subscribe to lock changes for this company
    // Note: We subscribe to ALL lock changes and filter in callback
    // because DELETE events don't work well with filters
    const lockChannel = supabase
      .channel(`locks-company-${selectedCompany.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'record_locks',
          filter: `entity_id=eq.${selectedCompany.id}`,
        },
        (payload) => {
          log(`🔒 Lock acquired by someone`);
          checkLockStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'record_locks',
          filter: `entity_id=eq.${selectedCompany.id}`,
        },
        (payload) => {
          log(`🔒 Lock updated`);
          checkLockStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'record_locks',
        },
        (payload) => {
          // Log the full payload to debug
          log(`🔓 DELETE event received: ${JSON.stringify(payload.old)}`);
          // Check if this DELETE was for our entity
          const old = payload.old as any;
          if (!old || Object.keys(old).length === 0) {
            // No old data - REPLICA IDENTITY might not be set, refresh anyway
            log(`🔓 No old data in DELETE, refreshing lock status...`);
            checkLockStatus();
          } else if (old?.entity_id === selectedCompany.id) {
            log(`🔓 Lock released for our company`);
            checkLockStatus();
          }
        }
      )
      .subscribe((status) => {
        log(`Lock subscription: ${status}`);
      });

    // Update presence
    updatePresence({
      currentPage: `/companies/${selectedCompany.id}`,
      entityType: 'company',
      entityId: selectedCompany.id,
      status: 'online',
    });

    // Check lock status
    checkLockStatus();

    // Load viewers
    loadViewers();

    // Poll viewers every 10 seconds
    const viewerInterval = setInterval(loadViewers, 10000);
    
    // Also poll lock status every 5 seconds as fallback
    const lockInterval = setInterval(() => {
      checkLockStatus();
    }, 5000);

    return () => {
      log(`Unsubscribing from company ${selectedCompany.id}`);
      supabase.removeChannel(companyChannel);
      supabase.removeChannel(lockChannel);
      clearInterval(viewerInterval);
      clearInterval(lockInterval);
    };
  }, [selectedCompany?.id]);

  const loadCompanies = async () => {
    if (!supabase) return;
    
    log('Loading companies...');
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, company_code')
      .order('name')
      .limit(20);

    if (error) {
      log(`Error loading companies: ${error.message}`);
      return;
    }

    setCompanies(data || []);
    log(`Loaded ${data?.length || 0} companies`);
  };

  const selectCompany = async (company: any) => {
    log(`Selected company: ${company.name}`);
    setSelectedCompany(company);
    setEditValue(company.name);
    setLockStatus(null);
    setViewers([]);
  };

  const checkLockStatus = async () => {
    if (!selectedCompany) return;
    
    const status = await checkLock('company', selectedCompany.id);
    setLockStatus(status);
    log(`Lock status: ${JSON.stringify(status)}`);
  };

  const loadViewers = async () => {
    if (!selectedCompany) return;
    
    const v = await getViewers('company', selectedCompany.id);
    setViewers(v);
    if (v.length > 0) {
      log(`Viewers: ${v.map(x => x.user_name).join(', ')}`);
    }
  };

  const handleAcquireLock = async () => {
    if (!selectedCompany) return;
    
    log('Attempting to acquire lock...');
    try {
      const result = await acquireLock('company', selectedCompany.id);
      log(`Lock result: ${JSON.stringify(result)}`);
      
      if (result.success) {
        log('✅ Lock acquired!');
        updatePresence({
          currentPage: `/companies/${selectedCompany.id}`,
          entityType: 'company',
          entityId: selectedCompany.id,
          status: 'editing',
        });
      } else {
        log(`❌ Lock failed: ${result.error || 'Unknown error'}`);
      }
      
      await checkLockStatus();
    } catch (err) {
      log(`❌ Lock error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const handleReleaseLock = async () => {
    if (!selectedCompany) return;
    
    log('Releasing lock...');
    const result = await releaseLock('company', selectedCompany.id);
    log(`Release result: ${result}`);
    
    updatePresence({
      currentPage: `/companies/${selectedCompany.id}`,
      entityType: 'company',
      entityId: selectedCompany.id,
      status: 'online',
    });
    
    await checkLockStatus();
  };

  const handleSave = async () => {
    if (!selectedCompany || !supabase) return;
    
    log(`Saving company name: ${editValue}`);
    
    const { error } = await supabase
      .from('companies')
      .update({ name: editValue })
      .eq('id', selectedCompany.id);

    if (error) {
      log(`Save error: ${error.message}`);
      return;
    }

    log('✅ Saved successfully!');
    
    // Release lock after save
    await handleReleaseLock();
    
    // Reload companies list
    loadCompanies();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-100">Real-Time Sync Test</h1>
        <p className="text-primary-400 mt-1">
          Open this page in two browser windows (one incognito) with different users
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company List */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700">
            <h2 className="font-semibold text-primary-100">Companies</h2>
          </div>
          <div className="divide-y divide-primary-700 max-h-96 overflow-auto">
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => selectCompany(company)}
                className={`w-full px-4 py-3 text-left hover:bg-primary-700/50 transition-colors ${
                  selectedCompany?.id === company.id ? 'bg-primary-700' : ''
                }`}
              >
                <p className="text-sm text-primary-100">{company.name}</p>
                <p className="text-xs text-primary-400">{company.company_code}</p>
              </button>
            ))}
            {companies.length === 0 && (
              <div className="p-4 text-center text-primary-400">
                No companies. Run seed script first.
              </div>
            )}
          </div>
        </div>

        {/* Selected Company */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700">
            <h2 className="font-semibold text-primary-100">Selected Company</h2>
          </div>
          
          {selectedCompany ? (
            <div className="p-4 space-y-4">
              {/* Viewers */}
              {viewers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-primary-400">
                  <Eye size={16} />
                  <span>Also viewing: {viewers.map(v => v.user_name).join(', ')}</span>
                </div>
              )}

              {/* Lock Status */}
              <div className={`p-3 rounded-lg ${
                lockStatus?.locked 
                  ? lockStatus.is_mine 
                    ? 'bg-green-500/20 border border-green-500/30' 
                    : 'bg-yellow-500/20 border border-yellow-500/30'
                  : 'bg-primary-700'
              }`}>
                {lockStatus?.locked ? (
                  lockStatus.is_mine ? (
                    <p className="text-green-400 text-sm flex items-center gap-2">
                      <Lock size={16} /> You have the lock
                    </p>
                  ) : (
                    <p className="text-yellow-400 text-sm flex items-center gap-2">
                      <Lock size={16} /> Locked by {lockStatus.locked_by_name}
                    </p>
                  )
                ) : (
                  <p className="text-primary-400 text-sm flex items-center gap-2">
                    <Unlock size={16} /> Not locked
                  </p>
                )}
              </div>

              {/* Edit Form */}
              <div>
                <label className="block text-sm text-primary-300 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  disabled={lockStatus?.locked && !lockStatus?.is_mine}
                  className="w-full bg-primary-900 border border-primary-600 rounded-lg px-3 py-2 text-primary-100 disabled:opacity-50"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {!lockStatus?.locked && (
                  <button
                    onClick={handleAcquireLock}
                    className="flex items-center gap-2 px-3 py-2 bg-accent-gold text-primary-900 rounded-lg hover:bg-accent-amber text-sm"
                  >
                    <Lock size={16} /> Acquire Lock
                  </button>
                )}
                
                {lockStatus?.is_mine && (
                  <>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 text-sm"
                    >
                      <Send size={16} /> Save
                    </button>
                    <button
                      onClick={handleReleaseLock}
                      className="flex items-center gap-2 px-3 py-2 bg-primary-700 text-primary-100 rounded-lg hover:bg-primary-600 text-sm"
                    >
                      <Unlock size={16} /> Release Lock
                    </button>
                  </>
                )}

                <button
                  onClick={checkLockStatus}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-700 text-primary-100 rounded-lg hover:bg-primary-600 text-sm"
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              {/* Current User */}
              <div className="text-xs text-primary-500 pt-2 border-t border-primary-700">
                Logged in as: {profile?.full_name} ({profile?.staff_role})
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-primary-400">
              Select a company to test
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100">Activity Log</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-primary-400 hover:text-primary-100"
            >
              Clear
            </button>
          </div>
          <div className="p-2 max-h-96 overflow-auto font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="py-1 px-2 text-primary-300 border-b border-primary-700/50">
                {log}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-4 text-center text-primary-400">
                Activity will appear here
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-2">How to Test</h3>
        <ol className="text-sm text-primary-300 space-y-1 list-decimal list-inside">
          <li>Open this page in a normal browser window (User 1)</li>
          <li>Open in an Incognito window and sign in as a different user (User 2)</li>
          <li>Both users select the same company</li>
          <li>User 1 clicks "Acquire Lock" and edits the name</li>
          <li>User 2 should see "Locked by [User 1]" and be unable to edit</li>
          <li>User 1 saves - User 2 should see the name update in real-time</li>
        </ol>
      </div>
    </div>
  );
}
