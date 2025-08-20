# Test Recording File Behavior

## Test Plan

### Test 1: Check file during recording
1. Launch `npx playwright codegen`
2. Perform ONE action
3. Check the file content
4. Perform ANOTHER action
5. Check the file content again
6. DON'T click stop yet

### Test 2: Check file after stop button
1. Click STOP button in toolbar
2. Check file immediately
3. Keep browser open

### Test 3: Check file after browser close
1. Close browser (without clicking stop)
2. Check final file

## Commands to Run

```bash
# Terminal 1: Launch recorder
cd electron-app
npx playwright codegen https://example.com --output=test-recording.spec.ts

# Terminal 2: Watch file
cd electron-app
watch cat test-recording.spec.ts
```

## What to Look For

- Does the file have `});` during recording?
- Does it get added when stop is clicked?
- Or only when browser closes?
- What's the exact structure difference?