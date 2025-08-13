/**
 * Query Planner - Collects and batches queries before execution
 * Solves the N+1 query problem by combining similar queries
 */

import type { Filter } from './snstr/client';
import type { NostrEvent } from './snstr/nip07';
import type { Hypernote } from './schema';

interface PlannedQuery {
  id: string;
  filter: Filter;
  pipe?: any[];
  componentId?: string; // Which component instance needs this
}

interface BatchedQuery {
  filters: Filter[];
  queryIds: string[]; // Original query IDs that were batched
  pipe?: any[]; // Only if all queries have the same pipe
}

export class QueryPlanner {
  private queries = new Map<string, PlannedQuery>();
  private componentQueries = new Map<string, Set<string>>(); // component ID -> query IDs
  private executed = false;
  private results = new Map<string, NostrEvent[]>();
  
  /**
   * Reset the planner for a new render cycle
   */
  reset() {
    this.queries.clear();
    this.componentQueries.clear();
    this.executed = false;
    this.results.clear();
    console.log('[QueryPlanner] Reset for new planning cycle');
  }
  
  /**
   * Add a query to the plan
   */
  addQuery(
    id: string,
    filter: Filter,
    pipe?: any[],
    componentId?: string
  ): void {
    if (this.executed) {
      console.warn('[QueryPlanner] Cannot add queries after execution');
      return;
    }
    
    // Check if we already have this exact query
    const existingQuery = Array.from(this.queries.values()).find(q => 
      JSON.stringify(q.filter) === JSON.stringify(filter) &&
      JSON.stringify(q.pipe) === JSON.stringify(pipe)
    );
    
    if (existingQuery) {
      console.log(`[QueryPlanner] Query ${id} is duplicate of ${existingQuery.id}`);
      // Map this query ID to the existing one
      this.queries.set(id, existingQuery);
    } else {
      this.queries.set(id, { id, filter, pipe, componentId });
      console.log(`[QueryPlanner] Added query ${id}:`, filter);
    }
    
    // Track which component needs this query
    if (componentId) {
      if (!this.componentQueries.has(componentId)) {
        this.componentQueries.set(componentId, new Set());
      }
      this.componentQueries.get(componentId)!.add(id);
    }
  }
  
  /**
   * Batch similar queries together
   * Queries are similar if they have the same kinds and other filters,
   * but different authors or ids
   */
  private batchQueries(): BatchedQuery[] {
    const batches: BatchedQuery[] = [];
    const processed = new Set<string>();
    
    for (const [queryId, query] of this.queries) {
      if (processed.has(queryId)) continue;
      
      // Find all queries that can be batched with this one
      const batchable: PlannedQuery[] = [query];
      const batchIds = [queryId];
      processed.add(queryId);
      
      // Check if this query has authors or ids that can be batched
      const canBatch = query.filter.authors || query.filter.ids;
      if (!canBatch) {
        // Can't batch, create single query batch
        batches.push({
          filters: [query.filter],
          queryIds: batchIds,
          pipe: query.pipe
        });
        continue;
      }
      
      // Find other queries with same structure but different authors/ids
      for (const [otherId, other] of this.queries) {
        if (processed.has(otherId)) continue;
        if (!this.canBatchQueries(query, other)) continue;
        
        batchable.push(other);
        batchIds.push(otherId);
        processed.add(otherId);
      }
      
      // Create batched filter
      if (batchable.length > 1) {
        console.log(`[QueryPlanner] Batching ${batchable.length} queries into one`);
        const batchedFilter = this.mergeBatchableQueries(batchable);
        batches.push({
          filters: [batchedFilter],
          queryIds: batchIds,
          pipe: query.pipe // Only if all have same pipe
        });
      } else {
        batches.push({
          filters: [query.filter],
          queryIds: batchIds,
          pipe: query.pipe
        });
      }
    }
    
    console.log(`[QueryPlanner] Created ${batches.length} batched queries from ${this.queries.size} original queries`);
    return batches;
  }
  
  /**
   * Check if two queries can be batched together
   */
  private canBatchQueries(a: PlannedQuery, b: PlannedQuery): boolean {
    // Must have same pipe operations
    if (JSON.stringify(a.pipe) !== JSON.stringify(b.pipe)) return false;
    
    // Must have same filter structure except authors/ids
    const aFilter = { ...a.filter };
    const bFilter = { ...b.filter };
    
    // Remove the fields that can differ
    delete aFilter.authors;
    delete aFilter.ids;
    delete bFilter.authors;
    delete bFilter.ids;
    
    // Rest must be identical
    return JSON.stringify(aFilter) === JSON.stringify(bFilter);
  }
  
  /**
   * Merge multiple queries into a single batched filter
   */
  private mergeBatchableQueries(queries: PlannedQuery[]): Filter {
    const merged: Filter = { ...queries[0].filter };
    
    // Collect all authors
    if (queries[0].filter.authors) {
      const allAuthors = new Set<string>();
      for (const q of queries) {
        if (q.filter.authors) {
          for (const author of q.filter.authors) {
            allAuthors.add(author);
          }
        }
      }
      merged.authors = Array.from(allAuthors);
      console.log(`[QueryPlanner] Merged ${queries.length} queries with ${merged.authors.length} total authors`);
    }
    
    // Collect all ids
    if (queries[0].filter.ids) {
      const allIds = new Set<string>();
      for (const q of queries) {
        if (q.filter.ids) {
          for (const id of q.filter.ids) {
            allIds.add(id);
          }
        }
      }
      merged.ids = Array.from(allIds);
    }
    
    return merged;
  }
  
  /**
   * Execute all planned queries with smart caching
   */
  async execute(
    fetchEvents: (filter: Filter) => Promise<NostrEvent[]>,
    cache?: Map<string, NostrEvent[]> // Optional cache from previous execution
  ): Promise<void> {
    if (this.executed) {
      console.warn('[QueryPlanner] Already executed');
      return;
    }
    
    console.log('[QueryPlanner] Starting execution phase');
    const batches = this.batchQueries();
    
    // Execute each batch
    for (const batch of batches) {
      for (const filter of batch.filters) {
        let events: NostrEvent[] = [];
        
        // Smart caching for author queries
        if (filter.authors && cache) {
          const cachedEvents: NostrEvent[] = [];
          const uncachedAuthors: string[] = [];
          
          // Check cache for each author
          for (const author of filter.authors) {
            const cacheKey = JSON.stringify({ ...filter, authors: [author] });
            const cached = cache.get(cacheKey);
            
            if (cached) {
              console.log(`[QueryPlanner] Using cached events for author ${author.substring(0, 8)}...`);
              cachedEvents.push(...cached);
            } else {
              uncachedAuthors.push(author);
            }
          }
          
          // Only fetch uncached authors
          if (uncachedAuthors.length > 0) {
            console.log(`[QueryPlanner] Fetching ${uncachedAuthors.length} uncached authors (had ${filter.authors.length - uncachedAuthors.length} cached)`);
            const newEvents = await fetchEvents({ ...filter, authors: uncachedAuthors });
            
            // Update cache for individual authors
            for (const author of uncachedAuthors) {
              const authorEvents = newEvents.filter(e => e.pubkey === author);
              const cacheKey = JSON.stringify({ ...filter, authors: [author] });
              cache.set(cacheKey, authorEvents);
            }
            
            events = [...cachedEvents, ...newEvents];
          } else {
            console.log(`[QueryPlanner] All ${filter.authors.length} authors were cached!`);
            events = cachedEvents;
          }
        } else {
          // No caching possible, fetch everything
          console.log('[QueryPlanner] Executing batched query:', filter);
          events = await fetchEvents(filter);
        }
        
        // Distribute results to original queries
        for (const queryId of batch.queryIds) {
          const originalQuery = this.queries.get(queryId);
          if (!originalQuery) continue;
          
          // Filter events to match original query
          let filteredEvents = events;
          if (originalQuery.filter.authors && originalQuery.filter.authors.length === 1) {
            // This was a single-author query, filter to just their events
            filteredEvents = events.filter(e => 
              originalQuery.filter.authors!.includes(e.pubkey)
            );
          }
          
          // Apply pipes if needed
          if (originalQuery.pipe && originalQuery.pipe.length > 0) {
            const { applyPipes } = await import('./pipes');
            filteredEvents = applyPipes(filteredEvents, originalQuery.pipe);
          }
          
          this.results.set(queryId, filteredEvents);
        }
      }
    }
    
    this.executed = true;
    console.log('[QueryPlanner] Execution complete');
  }
  
  /**
   * Get results for a specific query
   */
  getResults(queryId: string): NostrEvent[] | undefined {
    if (!this.executed) {
      console.warn('[QueryPlanner] Cannot get results before execution');
      return undefined;
    }
    return this.results.get(queryId);
  }
  
  /**
   * Check if planner has been executed
   */
  isExecuted(): boolean {
    return this.executed;
  }
  
  /**
   * Get all queries for a component
   */
  getComponentQueries(componentId: string): string[] {
    const queryIds = this.componentQueries.get(componentId);
    return queryIds ? Array.from(queryIds) : [];
  }
}