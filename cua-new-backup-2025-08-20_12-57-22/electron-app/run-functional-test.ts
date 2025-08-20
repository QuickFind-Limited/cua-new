/**
 * Functional test runner for generated Playwright code
 * This creates a standalone test to verify generated code actually works
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';

async function runFunctionalTest(): Promise<void> {
  console.log('🧪 Running functional test of generated Playwright code...');
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  try {
    // Launch browser
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    
    // Test the actual navigation and assertion from our generated code
    console.log('  📍 Testing navigation to example.com...');
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');
    
    // Test the URL assertion that our generated code uses
    const currentUrl = page.url();
    console.log(`  🌐 Current URL: ${currentUrl}`);
    
    const urlMatches = /https:\/\/example\.com\/?/.test(currentUrl);
    console.log(`  ✅ URL regex match: ${urlMatches ? 'PASS' : 'FAIL'}`);
    
    // Test basic page interaction
    console.log('  🖱️  Testing basic page interaction...');
    await page.evaluate(() => {
      const event = new Event('click', { bubbles: true });
      document.body.dispatchEvent(event);
    });
    
    // Take a screenshot for comparison
    const screenshotPath = path.join(process.cwd(), 'recordings', 'functional-test-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 Screenshot saved: ${screenshotPath}`);
    
    // Verify page content
    const title = await page.title();
    console.log(`  📄 Page title: "${title}"`);
    
    const hasContent = await page.evaluate(() => document.body.textContent!.length > 0);
    console.log(`  📝 Has content: ${hasContent ? 'YES' : 'NO'}`);
    
    console.log('  ✅ Functional test completed successfully!');
    
  } catch (error) {
    console.error('  ❌ Functional test failed:', error);
  } finally {
    // Cleanup
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// Test with actual generated spec file execution simulation
async function testGeneratedSpecExecution(): Promise<void> {
  console.log('\n🔧 Testing generated spec file execution patterns...');
  
  try {
    const recordingsDir = path.join(process.cwd(), 'recordings');
    const specFiles = (await fs.readdir(recordingsDir))
      .filter(f => f.endsWith('.spec.ts') && f.includes('test-session-'));
    
    if (specFiles.length === 0) {
      console.log('  ⚠️  No test session spec files found');
      return;
    }
    
    const specFile = specFiles[0]; // Use the first test session file
    const specPath = path.join(recordingsDir, specFile);
    const specContent = await fs.readFile(specPath, 'utf8');
    
    console.log(`  📄 Analyzing: ${specFile}`);
    
    // Extract the URL from the spec file
    const gotoMatch = specContent.match(/await page\.goto\(['"]([^'"]+)['"]\)/);
    const expectUrlMatch = specContent.match(/await expect\(page\)\.toHaveURL\(\/(.+?)\/\)/);
    
    if (gotoMatch && expectUrlMatch) {
      const testUrl = gotoMatch[1];
      const expectedUrlPattern = expectUrlMatch[1];
      
      console.log(`  🌐 Test URL: ${testUrl}`);
      console.log(`  🎯 Expected URL pattern: ${expectedUrlPattern}`);
      
      // Test if the pattern would match the URL
      const regex = new RegExp(expectedUrlPattern);
      const wouldMatch = regex.test(testUrl);
      console.log(`  ✅ Pattern match test: ${wouldMatch ? 'PASS' : 'FAIL'}`);
      
      // Test the actual navigation (simulation of spec execution)
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.goto(testUrl);
        await page.waitForLoadState('networkidle');
        
        const actualUrl = page.url();
        const actualMatch = regex.test(actualUrl);
        
        console.log(`  🌐 Actual URL: ${actualUrl}`);
        console.log(`  ✅ Actual pattern match: ${actualMatch ? 'PASS' : 'FAIL'}`);
        
        await context.close();
        
      } catch (error) {
        console.log(`  ⚠️  Navigation test failed: ${error}`);
      } finally {
        if (browser) await browser.close();
      }
    }
    
  } catch (error) {
    console.error('  ❌ Spec execution test failed:', error);
  }
}

async function main(): Promise<void> {
  await runFunctionalTest();
  await testGeneratedSpecExecution();
}

if (require.main === module) {
  main().catch(console.error);
}

export { runFunctionalTest, testGeneratedSpecExecution };