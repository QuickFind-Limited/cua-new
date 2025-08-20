#!/usr/bin/env node

/**
 * Execution Paths Test Runner
 * 
 * This script runs all execution path tests and provides a comprehensive summary
 * of the results, verifying that AI and snippet execution paths work correctly.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const testFiles = [
  'tests/execution-paths-ai-first.spec.ts',
  'tests/execution-paths-snippet-first.spec.ts', 
  'tests/execution-paths-mixed.spec.ts',
  'tests/execution-reporting.spec.ts',
  'tests/sdk-decider-verification.spec.ts'
];

const testResults = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader() {
  console.log('\n' + '='.repeat(80));
  console.log(colorize('🧪 EXECUTION PATHS TEST SUITE', 'bold'));
  console.log('   Testing AI and Snippet Execution Path Logic');
  console.log('='.repeat(80));
  console.log();
}

function printTestStart(testFile) {
  const testName = path.basename(testFile, '.spec.ts');
  console.log(colorize(`📋 Running: ${testName}`, 'blue'));
  console.log(colorize(`   File: ${testFile}`, 'cyan'));
}

function runTest(testFile) {
  return new Promise((resolve) => {
    printTestStart(testFile);
    
    const startTime = Date.now();
    const testProcess = spawn('npx', ['playwright', 'test', testFile, '--reporter=line'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code) => {
      const duration = Date.now() - startTime;
      const testName = path.basename(testFile, '.spec.ts');
      
      // Parse test results from output
      const passed = stdout.match(/(\d+) passed/);
      const failed = stdout.match(/(\d+) failed/);
      const skipped = stdout.match(/(\d+) skipped/);
      
      const testResult = {
        name: testName,
        file: testFile,
        exitCode: code,
        duration,
        passed: passed ? parseInt(passed[1]) : 0,
        failed: failed ? parseInt(failed[1]) : 0,
        skipped: skipped ? parseInt(skipped[1]) : 0,
        stdout,
        stderr
      };

      testResults.push(testResult);
      
      if (code === 0) {
        console.log(colorize(`   ✅ PASSED (${duration}ms)`, 'green'));
        console.log(colorize(`   📊 Tests: ${testResult.passed} passed${testResult.skipped ? `, ${testResult.skipped} skipped` : ''}`, 'green'));
      } else {
        console.log(colorize(`   ❌ FAILED (${duration}ms)`, 'red'));
        console.log(colorize(`   📊 Tests: ${testResult.passed} passed, ${testResult.failed} failed${testResult.skipped ? `, ${testResult.skipped} skipped` : ''}`, 'red'));
        if (stderr) {
          console.log(colorize(`   🔍 Error output:`, 'yellow'));
          console.log(colorize(`   ${stderr.slice(0, 500)}...`, 'yellow'));
        }
      }
      
      totalTests += testResult.passed + testResult.failed;
      passedTests += testResult.passed;
      failedTests += testResult.failed;
      
      console.log();
      resolve();
    });
  });
}

function printSummary() {
  console.log('='.repeat(80));
  console.log(colorize('📊 TEST EXECUTION SUMMARY', 'bold'));
  console.log('='.repeat(80));
  
  testResults.forEach((result, index) => {
    const status = result.exitCode === 0 ? 
      colorize('✅ PASSED', 'green') : 
      colorize('❌ FAILED', 'red');
    
    console.log(`${index + 1}. ${colorize(result.name, 'cyan')} - ${status} (${result.duration}ms)`);
    console.log(`   Tests: ${result.passed} passed${result.failed ? `, ${result.failed} failed` : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}`);
  });
  
  console.log();
  console.log('='.repeat(80));
  
  const overallStatus = failedTests === 0 ? 
    colorize('🎉 ALL TESTS PASSED', 'green') :
    colorize('⚠️  SOME TESTS FAILED', 'red');
  
  console.log(colorize('OVERALL RESULTS:', 'bold'));
  console.log(`Total Test Suites: ${testResults.length}`);
  console.log(`Test Suites Passed: ${testResults.filter(r => r.exitCode === 0).length}`);
  console.log(`Test Suites Failed: ${testResults.filter(r => r.exitCode !== 0).length}`);
  console.log(`Total Individual Tests: ${totalTests}`);
  console.log(`Individual Tests Passed: ${passedTests}`);
  console.log(`Individual Tests Failed: ${failedTests}`);
  console.log(`Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
  console.log();
  console.log(overallStatus);
  console.log('='.repeat(80));
}

function printExecutionPathValidation() {
  console.log('\n' + colorize('🔍 EXECUTION PATH VALIDATION', 'bold'));
  console.log('-'.repeat(50));
  
  const validations = [
    {
      check: 'AI-first execution paths',
      description: 'prefer="ai" executes via AI path first',
      tested: testResults.some(r => r.name.includes('ai-first')),
      status: testResults.find(r => r.name.includes('ai-first'))?.exitCode === 0
    },
    {
      check: 'Snippet-first execution paths', 
      description: 'prefer="snippet" executes via snippet path first',
      tested: testResults.some(r => r.name.includes('snippet-first')),
      status: testResults.find(r => r.name.includes('snippet-first'))?.exitCode === 0
    },
    {
      check: 'Mixed execution paths',
      description: 'Steps with different preferences execute correctly',
      tested: testResults.some(r => r.name.includes('mixed')),
      status: testResults.find(r => r.name.includes('mixed'))?.exitCode === 0
    },
    {
      check: 'Execution reporting accuracy',
      description: 'aiUsageCount, snippetUsageCount, pathUsed are accurate',
      tested: testResults.some(r => r.name.includes('reporting')),
      status: testResults.find(r => r.name.includes('reporting'))?.exitCode === 0
    },
    {
      check: 'SDK Decider logic',
      description: 'Decision logic works correctly',
      tested: testResults.some(r => r.name.includes('decider')),
      status: testResults.find(r => r.name.includes('decider'))?.exitCode === 0
    }
  ];
  
  validations.forEach((validation, index) => {
    const statusIcon = validation.tested ? 
      (validation.status ? colorize('✅', 'green') : colorize('❌', 'red')) :
      colorize('⏭️', 'yellow');
    
    console.log(`${index + 1}. ${statusIcon} ${validation.check}`);
    console.log(`   ${validation.description}`);
    if (!validation.tested) {
      console.log(colorize('   ⚠️  Test not executed', 'yellow'));
    }
  });
  
  console.log();
}

function saveResults() {
  const resultsFile = path.join(__dirname, 'test-results', 'execution-paths-results.json');
  const resultsDir = path.dirname(resultsFile);
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalSuites: testResults.length,
      suitesPassed: testResults.filter(r => r.exitCode === 0).length,
      suitesFailed: testResults.filter(r => r.exitCode !== 0).length,
      totalTests,
      testsPassed: passedTests,
      testsFailed: failedTests,
      successRate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0
    },
    results: testResults.map(r => ({
      name: r.name,
      file: r.file,
      status: r.exitCode === 0 ? 'PASSED' : 'FAILED',
      duration: r.duration,
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped
    }))
  };
  
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(colorize(`📄 Results saved to: ${resultsFile}`, 'cyan'));
}

async function runAllTests() {
  printHeader();
  
  console.log(colorize('🚀 Starting execution path tests...', 'blue'));
  console.log(`Tests to run: ${testFiles.length}`);
  console.log();
  
  for (const testFile of testFiles) {
    await runTest(testFile);
  }
  
  printSummary();
  printExecutionPathValidation();
  saveResults();
  
  // Exit with error code if any tests failed
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch((error) => {
  console.error(colorize('❌ Test runner failed:', 'red'), error);
  process.exit(1);
});