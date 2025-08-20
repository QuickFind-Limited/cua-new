// Test the fixed screenshot comparison
const fs = require('fs');
const path = require('path');
const { ScreenshotComparatorFixed } = require('./dist/main/screenshot-comparator-fixed');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testScreenshotComparison() {
  console.log('🔍 Testing Fixed Screenshot Comparison');
  console.log('======================================\n');
  
  try {
    // Define screenshot paths
    const originalScreenshot = path.join(__dirname, 'recordings', 'codegen-1755375046963-success-state.png');
    const executionScreenshot = path.join(__dirname, 'recordings', 'execution-final-state.png');
    
    // Check if files exist
    const hasOriginal = fs.existsSync(originalScreenshot);
    const hasExecution = fs.existsSync(executionScreenshot);
    
    console.log('📸 Screenshots:');
    console.log(`  Original success state: ${hasOriginal ? '✅ Found' : '❌ Not found'}`);
    console.log(`  Execution final state: ${hasExecution ? '✅ Found' : '❌ Not found'}`);
    
    if (!hasOriginal || !hasExecution) {
      console.log('\n❌ Cannot compare - missing screenshots');
      return;
    }
    
    // Get file sizes
    const originalSize = fs.statSync(originalScreenshot).size;
    const executionSize = fs.statSync(executionScreenshot).size;
    
    console.log('\n📊 File Information:');
    console.log(`  Original: ${(originalSize / 1024).toFixed(1)}KB`);
    console.log(`  Execution: ${(executionSize / 1024).toFixed(1)}KB`);
    console.log(`  Size difference: ${Math.abs(originalSize - executionSize)} bytes`);
    
    // Initialize comparator
    const comparator = new ScreenshotComparatorFixed();
    
    console.log('\n🤖 Running comparison...');
    console.log('  Method: Enhanced comparison with proper AI format\n');
    
    const startTime = Date.now();
    const comparison = await comparator.compareScreenshots(
      executionScreenshot,
      originalScreenshot
    );
    const duration = Date.now() - startTime;
    
    console.log(`⏱️ Comparison completed in ${duration}ms\n`);
    
    // Display results
    console.log('📈 COMPARISON RESULTS:');
    console.log('======================');
    console.log(`  Match: ${comparison.match ? '✅ YES' : '❌ NO'}`);
    console.log(`  Similarity: ${comparison.similarity}%`);
    
    if (comparison.differences && comparison.differences.length > 0) {
      console.log(`\n  📍 Differences (${comparison.differences.length}):`);
      comparison.differences.forEach((diff, index) => {
        console.log(`    ${index + 1}. [${diff.type}] ${diff.description || diff.message}`);
        if (diff.severity) {
          console.log(`       Severity: ${diff.severity}`);
        }
        if (diff.location) {
          console.log(`       Location: ${diff.location}`);
        }
      });
    }
    
    if (comparison.suggestions && comparison.suggestions.length > 0) {
      console.log(`\n  💡 Suggestions:`);
      comparison.suggestions.forEach((suggestion, index) => {
        console.log(`    ${index + 1}. ${suggestion}`);
      });
    }
    
    console.log('\n======================');
    
    // Interpret results
    console.log('\n📋 INTERPRETATION:');
    if (comparison.match) {
      console.log('✅ SUCCESS: Screenshots match! The automation reached the expected state.');
    } else if (comparison.similarity >= 80) {
      console.log('⚠️ PARTIAL SUCCESS: Screenshots are very similar with minor differences.');
      console.log('   This is typically acceptable for dynamic web content.');
    } else if (comparison.similarity >= 60) {
      console.log('⚠️ PARTIAL MATCH: Screenshots have moderate differences.');
      console.log('   Review the differences to determine if they are acceptable.');
    } else {
      console.log('❌ MISMATCH: Screenshots differ significantly.');
      console.log('   The automation may have reached a different state than expected.');
    }
    
    // Save comparison report
    const reportPath = path.join(__dirname, 'recordings', 'screenshot-comparison-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      originalScreenshot,
      executionScreenshot,
      comparison,
      duration: `${duration}ms`,
      interpretation: comparison.match ? 'SUCCESS' : 
                      comparison.similarity >= 80 ? 'PARTIAL_SUCCESS' :
                      comparison.similarity >= 60 ? 'PARTIAL_MATCH' : 'MISMATCH'
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('\n❌ Comparison failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testScreenshotComparison().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});