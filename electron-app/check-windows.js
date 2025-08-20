const { desktopCapturer } = require('electron');

async function listWindows() {
  const sources = await desktopCapturer.getSources({ 
    types: ['window'],
    thumbnailSize: { width: 100, height: 100 }
  });
  
  console.log('Available windows:');
  sources.forEach(source => {
    console.log(`- "${source.name}" (ID: ${source.id})`);
  });
  
  // Find Playwright windows
  const playwrightWindows = sources.filter(source => 
    source.name.toLowerCase().includes('playwright') ||
    source.name.toLowerCase().includes('chromium') ||
    source.name.toLowerCase().includes('inspector') ||
    source.name.toLowerCase().includes('recorder')
  );
  
  if (playwrightWindows.length > 0) {
    console.log('\nPotential Playwright windows:');
    playwrightWindows.forEach(source => {
      console.log(`- "${source.name}"`);
    });
  }
}

listWindows();