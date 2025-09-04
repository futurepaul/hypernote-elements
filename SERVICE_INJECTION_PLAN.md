# SERVICE_INJECTION_PLAN.md - Completing Dependency Inversion

## Current Status

✅ **Completed:**
- Service interfaces created (QueryEngine, ActionExecutor, TargetParser, Clock)
- Adapter implementations created (SNSTRQueryEngine, RelayActionExecutor, etc.)
- Optional services prop added to RenderHypernoteContent
- Dangerous patterns eliminated (setTimeout, new Function)

🎯 **Next:** Complete the service injection to eliminate store imports from renderer

## Step-by-Step Service Injection

### Step 1: Update App.tsx to inject services
**Goal:** Create services bundle and pass to renderer

```tsx
// In App.tsx
const services = createServices(snstrClient, relayHandler, signEvent, pubkey);
return <RenderHypernoteContent content={content} services={services} />
```

**Test:** Ensure services are passed correctly, fallback to stores still works

### Step 2: Implement real QueryEngine adapter
**Goal:** Replace useHypernoteExecutor with services.queryEngine

Current:
```tsx
const { queryResults, executeAction } = useHypernoteExecutor(content, options);
```

After:
```tsx
const { queryResults } = await services.queryEngine.runAll(content, options);
```

**Test:** Ensure queries still resolve, all examples work

### Step 3: Implement real ActionExecutor adapter  
**Goal:** Replace executeAction with services.actionExecutor

Current:
```tsx
const executeAction = async (actionName: string) => {
  const eventId = await hypernoteExecuteAction(actionName, formData);
}
```

After:
```tsx
const executeAction = async (actionName: string) => {
  return services.actionExecutor.execute(actionName, formData);
}
```

**Test:** Ensure action publishing still works

### Step 4: Implement ComponentWrapper service injection
**Goal:** Replace ComponentWrapper store imports

Current:
```tsx
const { snstrClient } = useNostrStore();
const target = await parseTarget(resolvedArgument, kind, snstrClient);
```

After:
```tsx
const target = await services.targetParser.parse(resolvedArgument, kind);
```

**Test:** Ensure components render correctly

### Step 5: Remove store imports from renderer
**Goal:** Clean up unused imports

Remove:
```tsx
import { useNostrStore } from './stores/nostrStore';
import { useAuthStore } from './stores/authStore';
```

**Test:** Ensure no functionality lost

## Risk Mitigation

### Test After Each Step
- Action publishing works
- Query resolution works  
- Component rendering works
- All examples load correctly

### Rollback Strategy
If any step breaks functionality:
1. Immediately revert the commit
2. Analyze what went wrong
3. Make smaller, safer change
4. Re-test thoroughly

### Gradual Migration Pattern
Keep fallbacks throughout:
```tsx
const queryEngine = services?.queryEngine || fallbackToCurrentSystem();
```

Only remove fallbacks after confirming everything works.

## Success Criteria

After service injection:
✅ **Zero store imports** in renderer.tsx
✅ **All functionality preserved** 
✅ **Clean architecture** with dependency inversion
✅ **Testable services** isolated from React
✅ **Ready for pure renderer extraction**

This sets up the foundation for the full dependency inversion architecture.