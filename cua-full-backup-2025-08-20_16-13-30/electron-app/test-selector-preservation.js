/**
 * Test script to verify that Intent Spec generation preserves Playwright's modern selectors
 * 
 * Run with: node test-selector-preservation.js
 */

const { analyzeRecording } = require('./dist/main/llm');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Sample Playwright recording with modern selectors (getByRole, getByLabel, etc.)
const modernPlaywrightRecording = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.getByRole('button', { name: 'Stay signed out' }).click();
  await page.goto('https://accounts.zoho.com/signin?servicename=ZohoInventory');
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).click();
  await page.getByRole('textbox', { name: 'Email address or mobile number' }).fill('shane@quickfindai.com');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'Enter password' }).fill('#QuickFind2024');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('link', { name: 'Inventory Summary' }).click();
  await page.getByLabel('Search items').fill('Widget');
  await page.getByText('Advanced Search').click();
  await page.getByTestId('submit-button').click();
});`;

async function testSelectorPreservation() {
  console.log('🧪 Testing Intent Spec Generation - Selector Preservation');
  console.log('='.repeat(60));
  
  try {
    console.log('\n📝 Input Recording:');
    console.log('Contains modern Playwright selectors:');
    console.log('- getByRole()');
    console.log('- getByLabel()');
    console.log('- getByText()');
    console.log('- getByTestId()');
    
    console.log('\n🤖 Analyzing with Claude...');
    const intentSpec = await analyzeRecording(modernPlaywrightRecording);
    
    console.log('\n✅ Analysis complete!');
    console.log('\n📋 Generated Intent Spec:');
    console.log(JSON.stringify(intentSpec, null, 2));
    
    // Validate that modern selectors are preserved
    console.log('\n🔍 Validation Results:');
    console.log('='.repeat(40));
    
    let preservedCount = 0;
    let convertedCount = 0;
    let totalSteps = intentSpec.steps?.length || 0;
    
    if (intentSpec.steps) {
      intentSpec.steps.forEach((step, index) => {
        console.log(`\nStep ${index + 1}: ${step.name}`);
        console.log(`Snippet: ${step.snippet?.substring(0, 100)}...`);
        
        // Check if modern selectors are preserved
        if (step.snippet) {
          if (step.snippet.includes('getByRole') || 
              step.snippet.includes('getByLabel') || 
              step.snippet.includes('getByText') ||
              step.snippet.includes('getByTestId')) {
            console.log('✅ Modern selector preserved!');
            preservedCount++;
          } else if (step.snippet.includes('page.click(') || 
                     step.snippet.includes('page.fill(') ||
                     step.snippet.includes('page.locator(')) {
            console.log('❌ Converted to CSS selector');
            convertedCount++;
          } else if (step.snippet.includes('page.goto(') ||
                     step.snippet.includes('page.waitFor')) {
            console.log('➖ Navigation/Wait step (no selector)');
          }
        }
      });
    }
    
    console.log('\n📊 Summary:');
    console.log('='.repeat(40));
    console.log(`Total steps: ${totalSteps}`);
    console.log(`Modern selectors preserved: ${preservedCount}`);
    console.log(`Converted to CSS: ${convertedCount}`);
    console.log(`Preservation rate: ${totalSteps > 0 ? Math.round((preservedCount / totalSteps) * 100) : 0}%`);
    
    // Check for extracted variables
    console.log('\n🔑 Extracted Variables:');
    if (intentSpec.params && intentSpec.params.length > 0) {
      intentSpec.params.forEach(param => {
        console.log(`  - {{${param}}}`);
      });
    } else {
      console.log('  None found');
    }
    
    // Success criteria
    const success = preservedCount > convertedCount;
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('✅ TEST PASSED: Modern selectors are being preserved!');
    } else {
      console.log('❌ TEST FAILED: Modern selectors are being converted to CSS');
      console.log('The prompt updates may need further refinement.');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  }
}

// Run the test
testSelectorPreservation().catch(console.error);