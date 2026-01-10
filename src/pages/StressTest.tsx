// Stress Test Page - Test large dataset fetching and performance
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { 
  Database, 
  Clock, 
  Zap, 
  ChevronDown,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface TestResult {
  name: string;
  duration: number;
  records: number;
  status: 'success' | 'error';
  error?: string;
}

export default function StressTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  
  // Infinite scroll test state
  const [equipment, setEquipment] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [equipmentPage, setEquipmentPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false); // Prevent race conditions

  const addResult = (result: TestResult) => {
    setResults(prev => [...prev, result]);
  };

  const runTest = async (
    name: string, 
    testFn: () => Promise<{ records: number }>
  ) => {
    setCurrentTest(name);
    const start = performance.now();
    try {
      const { records } = await testFn();
      const duration = performance.now() - start;
      addResult({ name, duration, records, status: 'success' });
    } catch (err) {
      const duration = performance.now() - start;
      addResult({ 
        name, 
        duration, 
        records: 0, 
        status: 'error', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      });
    }
    setCurrentTest(null);
  };

  const runAllTests = async () => {
    if (!supabase) return;
    
    setIsRunning(true);
    setResults([]);

    // Test 1: Approximate counts (instant)
    await runTest('Approximate count - companies', async () => {
      const { data, error } = await supabase.rpc('get_approximate_count', { 
        p_table_name: 'companies' 
      });
      if (error) throw error;
      return { records: data || 0 };
    });

    await runTest('Approximate count - equipment', async () => {
      const { data, error } = await supabase.rpc('get_approximate_count', { 
        p_table_name: 'equipment' 
      });
      if (error) throw error;
      return { records: data || 0 };
    });

    // Test 2: Cursor pagination (fast at any offset)
    await runTest('Companies cursor page 1 (50 rows)', async () => {
      const { data, error } = await supabase.rpc('get_companies_cursor', { 
        p_limit: 50 
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    await runTest('Companies cursor page 100 (skip 5000)', async () => {
      const { data, error } = await supabase.rpc('get_companies_cursor', { 
        p_limit: 50,
        p_cursor: 'CMP-005000'  // Skip first 5000
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    // Test 3: Equipment cursor pagination
    await runTest('Equipment cursor (50 rows)', async () => {
      const { data, error } = await supabase.rpc('get_equipment_cursor', { 
        p_limit: 50 
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    await runTest('Equipment cursor page 1000 (skip 50k)', async () => {
      const { data, error } = await supabase.rpc('get_equipment_cursor', { 
        p_limit: 50,
        p_cursor: 'EQP-00050000'
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    // Test 4: Filtered queries
    await runTest('Equipment filter by category', async () => {
      const { data, error } = await supabase.rpc('get_equipment_cursor', { 
        p_limit: 50,
        p_category: 'multimeter'
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    await runTest('Equipment due in 30 days', async () => {
      const { data, error } = await supabase.rpc('get_equipment_cursor', { 
        p_limit: 100,
        p_due_within_days: 30
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    // Test 5: Search
    await runTest('Search companies "Pacific"', async () => {
      const { data, error } = await supabase.rpc('search_companies_fast', { 
        p_search: 'Pacific',
        p_limit: 20
      });
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    // Test 6: Dashboard stats
    await runTest('Dashboard stats (aggregates)', async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      return { records: data?.[0]?.total_companies || 0 };
    });

    // Test 7: Compare old vs new methods
    await runTest('OLD: Direct RLS query (slow)', async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .limit(50);
      if (error) throw error;
      return { records: data?.length || 0 };
    });

    await runTest('OLD: Exact count (slow)', async () => {
      const { count, error } = await supabase
        .from('equipment')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return { records: count || 0 };
    });

    setIsRunning(false);
  };

  // Infinite scroll for equipment (cursor-based)
  const [lastCursor, setLastCursor] = useState<string | null>(null);
  
  const loadMoreEquipment = useCallback(async () => {
    if (!supabase || loadingRef.current || !hasMore) return;
    
    loadingRef.current = true;
    setLoadingMore(true);
    const pageSize = 50;
    
    // Use cursor-based pagination (fast at any offset)
    const { data, error } = await supabase.rpc('get_equipment_cursor', {
      p_limit: pageSize,
      p_cursor: lastCursor
    });

    if (error) {
      console.error('Error loading equipment:', error);
      setLoadingMore(false);
      loadingRef.current = false;
      return;
    }

    if (data.length < pageSize) {
      setHasMore(false);
    }

    if (data.length > 0) {
      setLastCursor(data[data.length - 1].equipment_code);
    }

    // Deduplicate by id before adding
    setEquipment(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newItems = data.filter((e: any) => !existingIds.has(e.id));
      return [...prev, ...newItems];
    });
    setEquipmentPage(prev => prev + 1);
    setLoadingMore(false);
    loadingRef.current = false;
  }, [lastCursor, hasMore]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMoreEquipment();
    }
  }, [loadMoreEquipment]);

  const resetEquipmentList = () => {
    setEquipment([]);
    setEquipmentPage(0);
    setHasMore(true);
    setLastCursor(null);
  };

  // Load initial equipment
  useEffect(() => {
    if (equipment.length === 0 && hasMore) {
      loadMoreEquipment();
    }
  }, []);

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const totalRecords = results.reduce((sum, r) => sum + r.records, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-100">Stress Test</h1>
        <p className="text-primary-400 mt-1">
          Test large dataset fetching and query performance
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query Performance Tests */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <Zap size={18} />
              Query Performance Tests
            </h2>
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent-gold text-primary-900 rounded-lg hover:bg-accent-amber disabled:opacity-50 text-sm"
            >
              {isRunning ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Run All Tests
                </>
              )}
            </button>
          </div>

          <div className="p-4">
            {currentTest && (
              <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-sm flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin" />
                  Running: {currentTest}
                </p>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <div className="bg-primary-700 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary-100">{results.length}</p>
                    <p className="text-xs text-primary-400">Tests Run</p>
                  </div>
                  <div className="bg-primary-700 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary-100">{totalDuration.toFixed(0)}ms</p>
                    <p className="text-xs text-primary-400">Total Time</p>
                  </div>
                  <div className="bg-primary-700 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary-100">{totalRecords.toLocaleString()}</p>
                    <p className="text-xs text-primary-400">Records Fetched</p>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-auto">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border ${
                        result.status === 'success'
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {result.status === 'success' ? (
                            <CheckCircle size={16} className="text-green-400" />
                          ) : (
                            <AlertCircle size={16} className="text-red-400" />
                          )}
                          <span className="text-sm text-primary-100">{result.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-primary-400">
                            {result.records.toLocaleString()} records
                          </span>
                          <span className={
                            result.duration < 100 ? 'text-green-400' :
                            result.duration < 500 ? 'text-yellow-400' :
                            'text-red-400'
                          }>
                            {result.duration.toFixed(0)}ms
                          </span>
                        </div>
                      </div>
                      {result.error && (
                        <p className="text-xs text-red-400 mt-1">{result.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {results.length === 0 && !isRunning && (
              <div className="text-center py-8 text-primary-400">
                Click "Run All Tests" to start performance testing
              </div>
            )}
          </div>
        </div>

        {/* Infinite Scroll Test */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <Database size={18} />
              Equipment Infinite Scroll ({equipment.length.toLocaleString()} loaded)
            </h2>
            <button
              onClick={resetEquipmentList}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-700 text-primary-100 rounded-lg hover:bg-primary-600 text-sm"
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-96 overflow-auto"
          >
            <table className="w-full">
              <thead className="bg-primary-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-primary-300">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-primary-300">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-primary-300">Company</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-700">
                {equipment.map((eq, index) => (
                  <tr key={`${eq.id}-${index}`} className="hover:bg-primary-700/50">
                    <td className="px-3 py-2 text-xs text-primary-400 font-mono">
                      {eq.equipment_code}
                    </td>
                    <td className="px-3 py-2 text-sm text-primary-100">
                      {eq.description}
                    </td>
                    <td className="px-3 py-2 text-xs text-primary-400">
                      {eq.company_name || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {loadingMore && (
              <div className="p-4 text-center text-primary-400">
                <RefreshCw size={16} className="animate-spin inline mr-2" />
                Loading more...
              </div>
            )}

            {!hasMore && equipment.length > 0 && (
              <div className="p-4 text-center text-primary-400 text-sm">
                All {equipment.length.toLocaleString()} equipment loaded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Performance Tips */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h3 className="font-semibold text-blue-400 mb-2">Performance Targets</h3>
        <ul className="text-sm text-primary-300 space-y-1">
          <li>• <span className="text-green-400">&lt;100ms</span> - Excellent (cached or indexed)</li>
          <li>• <span className="text-yellow-400">100-500ms</span> - Good (acceptable for most queries)</li>
          <li>• <span className="text-red-400">&gt;500ms</span> - Slow (consider optimization)</li>
          <li className="pt-2">• Infinite scroll should load 50 records at a time smoothly</li>
          <li>• With 10k records, pagination performs better than loading all at once</li>
        </ul>
      </div>
    </div>
  );
}
