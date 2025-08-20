# Test Plan: Disabled Begin Analysis Button

## Test Scenario
Test that the "Begin Analysis" button appears immediately when recording starts but is disabled until the browser closes.

## Test Steps

### 1. Launch the Electron App
```bash
cd electron-app
npm start
```

### 2. Start Recording
- Click the "Launch Recorder" button
- Playwright browser should open without inspector (PW_CODEGEN_NO_INSPECTOR=true)

### 3. Perform Actions in Browser
- Navigate to any website  
- Perform at least one action (click, type, etc.)

### 4. Verify Button State - DISABLED
- **Expected**: As soon as recording file is created (first action):
  - "Begin Analysis" button appears immediately
  - Button is DISABLED (grayed out)
  - Tooltip shows: "Close browser to enable"
  - Console shows: "Recording started: {buttonEnabled: false}"

### 5. Close Browser
- Close the Playwright browser window (don't need to click stop)

### 6. Verify Button State - ENABLED  
- **Expected**: When browser closes:
  - "Begin Analysis" button becomes ENABLED (green)
  - Tooltip changes to: "Analyze Recording"
  - Console shows: "Browser closed, enabling button"
  - Button is clickable and can trigger analysis

## Console Logs to Check

In the renderer console (DevTools):
```javascript
// When recording starts
"Recording started: {path: ..., buttonEnabled: false}"
"Showing Begin Analysis button, enabled: false"

// When browser closes
"Browser closed, enabling button"
```

In the main process console:
```javascript
// When recording starts
"Recording started - capturing initial screenshot..."
"[Recording] File created: recording-xxxxx.spec.ts"

// When browser closes  
"Playwright recorder exited with code 0"
```

## Visual Indicators

### Button Disabled State
- Background color: #cccccc (gray)
- Cursor: not-allowed
- Not clickable

### Button Enabled State
- Background color: #4caf50 (green)
- Cursor: pointer
- Clickable

## Edge Cases to Test

1. **No Actions Recorded**: Start recorder but close immediately without any actions
   - Expected: No button appears (no recording file created)

2. **Multiple Recording Sessions**: Start and stop recording multiple times
   - Expected: Button state resets properly each time

3. **Browser Crash**: Kill Playwright process unexpectedly
   - Expected: Button should still enable (handleRecorderClosed handles all exits)

## Implementation Details

### Key Files Modified:
1. **playwright-launcher-recorder.ts**:
   - Sends `recording-started` with `buttonEnabled: false`
   - Sends `browser-closed` with `buttonEnabled: true` in handleRecorderClosed()

2. **tabbar.js**:
   - showBeginAnalysisButton() accepts enabled parameter
   - Sets button disabled attribute based on parameter
   - Listens for browser-closed event to enable button

3. **preload.js**:
   - Added onBrowserClosed handler to expose IPC event

4. **styles.css**:
   - Already has `.begin-analysis-btn:disabled` styles