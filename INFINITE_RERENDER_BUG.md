# Infinite Re-render Bug Diagnosis

## Problem Statement
After implementing reactive subscriptions with Zustand, the app enters an infinite re-render loop with the error:
"Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate."

## When It Started
The bug appeared after adding:
1. `subscriptionStore.ts` - Zustand store for managing subscriptions
2. `useNostrSubscription` hook - React hook for reactive subscriptions
3. Replacing React Query with the new subscription system

## Current Call Stack
```
ElementRenderer component
  ↓
useNostrSubscription hook
  ↓
useEffect creates/updates subscription
  ↓
subscriptionStore.createSubscription
  ↓
State update in Zustand
  ↓
Component re-renders
  ↓
Back to ElementRenderer (LOOP!)
```

## Potential Causes

### 1. Unstable Dependencies
- `filters` object might be recreated on every render
- `JSON.stringify(filters)` in deps creates new string each time
- Function references from Zustand changing

### 2. Subscription ID Issues
- ID might be regenerating on each render
- Multiple subscriptions being created with different IDs

### 3. State Update Loop
- Creating subscription triggers state update
- State update causes re-render
- Re-render creates new subscription
- Infinite loop

### 4. ElementRenderer Re-rendering
- ElementRenderer is called for each element in the loop
- Each instance might be creating its own subscription
- Multiple subscriptions fighting with each other

## Debugging Steps

### Step 1: Add Console Logging
Let's add detailed logging to trace the execution:

```javascript
// In useNostrSubscription hook
console.log('[Hook] useNostrSubscription called with:', {
  filters,
  stableId,
  subscriptionId,
  timestamp: Date.now()
});

// In subscriptionStore
console.log('[Store] createSubscription called:', {
  id,
  filters,
  timestamp: Date.now()
});
```

### Step 2: Check What's Changing
We need to identify what's causing re-renders:
- Are filters being recreated?
- Is the subscription ID stable?
- Is the store updating unnecessarily?

### Step 3: Isolate the Problem
Try these tests:
1. Comment out the subscription creation - does loop stop?
2. Use a hardcoded filter - does loop stop?
3. Disable state updates - does loop stop?

## Hypothesis

The most likely cause is that `processedQueryConfig` in the renderer is creating a new object on every render:

```javascript
// This creates a new object every time
const processedQueryConfig = substituteQueryVariables(queryConfig);

// Then we destructure it
const { pipe, ...filters } = processedQueryConfig || {};

// filters is a NEW object every render!
```

## Proposed Solutions

### Solution 1: Memoize the Processed Config
```javascript
const processedQueryConfig = useMemo(
  () => substituteQueryVariables(queryConfig),
  [queryConfig] // But queryConfig might also be unstable!
);
```

### Solution 2: Use Stable Filter Reference
```javascript
// Stringify the filters for comparison
const filtersKey = JSON.stringify(filters);
const stableFilters = useMemo(
  () => filters,
  [filtersKey]
);
```

### Solution 3: Skip Subscription on Same Filters
Already implemented in subscriptionStore but might not be working because filters object is always new.

### Solution 4: Move Subscription Higher Up
Instead of creating subscriptions in ElementRenderer (which renders multiple times), create them at the HypernoteRenderer level.

## Quick Fix Attempt

The fastest fix might be to completely disable the effect temporarily:

```javascript
useEffect(() => {
  return; // TEMPORARY: Skip subscription creation
  // ... rest of effect
}, []);
```

## Root Cause Analysis

**FOUND IT!** The issue is in the Zustand selector:

```javascript
const events = useSubscriptionStore((state) => 
  state.subscriptions.get(subscriptionId)?.events || []  // <-- THIS IS THE PROBLEM!
);
```

The `|| []` creates a NEW empty array every time the selector runs if there's no subscription. Zustand uses referential equality to determine if the state changed. Since we return a new array reference each time, Zustand thinks the state changed and triggers a re-render, which runs the selector again, creating another new array, and so on.

### Why This Happens

1. Component renders
2. Selector runs: `state.subscriptions.get(id)?.events || []`
3. No subscription exists yet, so it returns a new `[]`
4. Zustand sees new array reference, triggers re-render
5. Component re-renders
6. Back to step 2 - infinite loop!

### The Fix

We need to return a stable reference:

```javascript
// Option 1: Use a constant empty array
const EMPTY_ARRAY = [];
const events = useSubscriptionStore((state) => 
  state.subscriptions.get(subscriptionId)?.events || EMPTY_ARRAY
);

// Option 2: Use shallow equality check
const events = useSubscriptionStore(
  (state) => state.subscriptions.get(subscriptionId)?.events || [],
  shallow // From zustand/shallow
);
```

## Proper Solution

We should:
1. Lift subscription management to a higher level (HypernoteRenderer)
2. Create subscriptions once for all queries in the document
3. Pass down events to ElementRenderer as props
4. Avoid creating subscriptions inside components that render in loops

## Testing Plan

1. First, confirm the bug by adding console logs
2. Try disabling subscription creation to confirm it's the cause
3. Implement proper memoization
4. If that fails, restructure to lift subscriptions up
5. Test with multiple browser windows for real-time updates