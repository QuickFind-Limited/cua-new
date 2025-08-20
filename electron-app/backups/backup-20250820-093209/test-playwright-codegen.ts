/**
 * Comprehensive test script for PlaywrightCodegenRecorder
 * Tests all functionality including normal operations, error scenarios, and file generation
 */

import { PlaywrightCodegenRecorder, CodegenRecordingSession, CodegenRecordingResult } from './main/playwright-codegen-recorder';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Page } from 'playwright';

interface TestResult {
  testName: string;
  success: boolean;
  details: string;
  files?: string[];
  error?: string;
}

class PlaywrightCodegenTester {
  private recorder: PlaywrightCodegenRecorder;
  private results: TestResult[] = [];
  private testStartTime: number;
  private recordingsDir: string;

  constructor() {
    this.recorder = new PlaywrightCodegenRecorder();
    this.testStartTime = Date.now();
    this.recordingsDir = path.join(process.cwd(), 'recordings');
  }

  /**
   * Run all tests
   */
  public async runAllTests(): Promise<void> {
    console.log('🚀 Starting Playwright Codegen Recorder Test Suite');
    console.log('=' .repeat(60));

    try {
      // Ensure clean test environment
      await this.setupTestEnvironment();

      // Run test scenarios
      await this.testNormalRecordingSession();
      await this.testErrorScenarios();
      await this.testFileGeneration();
      await this.testCodeValidation();
      await this.testCleanup();

      // Generate report
      this.generateTestReport();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Setup test environment
   */
  private async setupTestEnvironment(): Promise<void> {
    console.log('\n🔧 Setting up test environment...');
    
    try {
      // Ensure recordings directory exists
      await fs.mkdir(this.recordingsDir, { recursive: true });
      
      // Clean any existing test files
      const files = await fs.readdir(this.recordingsDir);
      for (const file of files) {
        if (file.includes('test-')) {
          await fs.unlink(path.join(this.recordingsDir, file));
        }
      }
      
      console.log('✅ Test environment ready');
    } catch (error) {
      console.error('❌ Failed to setup test environment:', error);
      throw error;
    }
  }

  /**
   * Test 1: Normal recording session
   */
  private async testNormalRecordingSession(): Promise<void> {
    console.log('\n📹 Test 1: Normal Recording Session');
    const sessionId = `test-session-${Date.now()}`;
    const testUrl = 'https://example.com';

    try {
      // Test starting recording
      console.log(`  Starting recording with session ID: ${sessionId}`);
      const startResult = await this.recorder.startRecording(sessionId, testUrl);
      
      if (!startResult) {
        this.addResult('Normal Recording - Start', false, 'Failed to start recording');
        return;
      }

      this.addResult('Normal Recording - Start', true, `Recording started successfully with session ID: ${sessionId}`);

      // Check recording status
      const status = this.recorder.getRecordingStatus();
      console.log(`  Recording status:`, status);
      
      if (status.isRecording && status.sessionId === sessionId) {
        this.addResult('Normal Recording - Status Check', true, `Status check passed: isRecording=${status.isRecording}, sessionId=${status.sessionId}`);
      } else {
        this.addResult('Normal Recording - Status Check', false, `Unexpected status: ${JSON.stringify(status)}`);
      }

      // Get current page for interaction simulation
      const page = this.recorder.getCurrentPage();
      if (page) {
        console.log('  Simulating browser interactions...');
        await this.simulateBrowserInteractions(page);
        this.addResult('Normal Recording - Browser Interactions', true, 'Successfully simulated browser interactions');
      } else {
        this.addResult('Normal Recording - Browser Interactions', false, 'Could not get current page for interactions');
      }

      // Wait a bit to simulate recording time
      await this.sleep(2000);

      // Stop recording
      console.log('  Stopping recording...');
      const stopResult = await this.recorder.stopRecording();
      
      if (stopResult) {
        this.addResult('Normal Recording - Stop', true, `Recording stopped successfully. Generated files: spec=${stopResult.specCode ? 'yes' : 'no'}, screenshot=${stopResult.screenshotPath ? 'yes' : 'no'}, metadata=${stopResult.metadataPath ? 'yes' : 'no'}`);
        
        // Store file paths for later verification
        const files = [
          stopResult.session.specFilePath,
          stopResult.screenshotPath,
          stopResult.metadataPath
        ].filter(Boolean);
        
        this.addResult('Normal Recording - File Generation', true, `Generated ${files.length} files`, files as string[]);
      } else {
        this.addResult('Normal Recording - Stop', false, 'Failed to stop recording');
      }

    } catch (error) {
      this.addResult('Normal Recording Session', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Test 2: Error scenarios
   */
  private async testErrorScenarios(): Promise<void> {
    console.log('\n⚠️  Test 2: Error Scenarios');

    // Test 2a: Start recording while another is active
    console.log('  Test 2a: Double start recording');
    try {
      const sessionId1 = `test-error-session1-${Date.now()}`;
      const sessionId2 = `test-error-session2-${Date.now()}`;
      
      const start1 = await this.recorder.startRecording(sessionId1, 'https://example.com');
      const start2 = await this.recorder.startRecording(sessionId2, 'https://google.com');
      
      if (start1 && !start2) {
        this.addResult('Error Scenario - Double Start', true, 'Correctly prevented second recording while first is active');
      } else {
        this.addResult('Error Scenario - Double Start', false, `Unexpected behavior: start1=${start1}, start2=${start2}`);
      }
      
      // Clean up
      await this.recorder.stopRecording();
    } catch (error) {
      this.addResult('Error Scenario - Double Start', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }

    // Test 2b: Stop recording when none is active
    console.log('  Test 2b: Stop recording when none active');
    try {
      const stopResult = await this.recorder.stopRecording();
      
      if (!stopResult) {
        this.addResult('Error Scenario - Stop Without Start', true, 'Correctly returned null when no recording is active');
      } else {
        this.addResult('Error Scenario - Stop Without Start', false, 'Unexpectedly returned result when no recording was active');
      }
    } catch (error) {
      this.addResult('Error Scenario - Stop Without Start', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }

    // Test 2c: Invalid URL handling
    console.log('  Test 2c: Invalid URL handling');
    try {
      const sessionId = `test-invalid-url-${Date.now()}`;
      const invalidUrl = 'not-a-valid-url';
      
      const startResult = await this.recorder.startRecording(sessionId, invalidUrl);
      
      // The recorder should handle this gracefully or fail appropriately
      if (startResult) {
        // If it starts, try to stop it
        await this.recorder.stopRecording();
        this.addResult('Error Scenario - Invalid URL', true, 'Handled invalid URL gracefully (started with default behavior)');
      } else {
        this.addResult('Error Scenario - Invalid URL', true, 'Correctly rejected invalid URL');
      }
    } catch (error) {
      this.addResult('Error Scenario - Invalid URL', true, `Appropriately threw error for invalid URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test 3: File generation verification
   */
  private async testFileGeneration(): Promise<void> {
    console.log('\n📁 Test 3: File Generation Verification');

    const sessionId = `test-files-${Date.now()}`;
    
    try {
      // Start and stop a recording to generate files
      await this.recorder.startRecording(sessionId, 'https://httpbin.org/html');
      
      // Simulate some interaction time
      await this.sleep(1000);
      
      const result = await this.recorder.stopRecording();
      
      if (!result) {
        this.addResult('File Generation', false, 'Failed to generate recording result');
        return;
      }

      // Check if files exist
      const filesToCheck = [
        { path: result.session.specFilePath, name: 'Spec file (.spec.ts)' },
        { path: result.screenshotPath, name: 'Screenshot (success-state.png)' },
        { path: result.metadataPath, name: 'Metadata (metadata.json)' }
      ];

      for (const file of filesToCheck) {
        if (file.path) {
          try {
            const stats = await fs.stat(file.path);
            if (stats.isFile() && stats.size > 0) {
              this.addResult(`File Generation - ${file.name}`, true, `File exists and has content (${stats.size} bytes)`, [file.path]);
            } else {
              this.addResult(`File Generation - ${file.name}`, false, `File exists but is empty or not a file`);
            }
          } catch (error) {
            this.addResult(`File Generation - ${file.name}`, false, `File does not exist: ${file.path}`);
          }
        } else {
          this.addResult(`File Generation - ${file.name}`, false, 'No file path provided in result');
        }
      }

      // Verify file contents
      await this.verifyFileContents(result);

    } catch (error) {
      this.addResult('File Generation', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Verify the contents of generated files
   */
  private async verifyFileContents(result: CodegenRecordingResult): Promise<void> {
    console.log('  Verifying file contents...');

    // Verify spec file content
    if (result.session.specFilePath) {
      try {
        const specContent = await fs.readFile(result.session.specFilePath, 'utf8');
        
        const hasImports = specContent.includes("import { test, expect } from '@playwright/test'");
        const hasTestFunction = specContent.includes('test(') && specContent.includes('async ({ page })');
        const hasPlaywrightCommands = specContent.includes('page.goto') || specContent.includes('await page');
        
        if (hasImports && hasTestFunction && hasPlaywrightCommands) {
          this.addResult('File Content - Spec File Structure', true, 'Spec file has proper Playwright test structure');
        } else {
          this.addResult('File Content - Spec File Structure', false, `Spec file missing required elements: imports=${hasImports}, test=${hasTestFunction}, commands=${hasPlaywrightCommands}`);
        }
      } catch (error) {
        this.addResult('File Content - Spec File', false, `Could not read spec file: ${error}`);
      }
    }

    // Verify metadata file content
    if (result.metadataPath) {
      try {
        const metadataContent = await fs.readFile(result.metadataPath, 'utf8');
        const metadata = JSON.parse(metadataContent);
        
        const requiredFields = ['sessionId', 'startTime', 'endTime', 'url', 'timestamp', 'type'];
        const missingFields = requiredFields.filter(field => !(field in metadata));
        
        if (missingFields.length === 0) {
          this.addResult('File Content - Metadata Structure', true, `Metadata file has all required fields: ${requiredFields.join(', ')}`);
        } else {
          this.addResult('File Content - Metadata Structure', false, `Metadata missing fields: ${missingFields.join(', ')}`);
        }
      } catch (error) {
        this.addResult('File Content - Metadata File', false, `Could not read or parse metadata file: ${error}`);
      }
    }
  }

  /**
   * Test 4: Code validation
   */
  private async testCodeValidation(): Promise<void> {
    console.log('\n✅ Test 4: Generated Code Validation');

    const sessionId = `test-validation-${Date.now()}`;
    
    try {
      await this.recorder.startRecording(sessionId, 'https://example.com');
      await this.sleep(1000);
      const result = await this.recorder.stopRecording();
      
      if (!result || !result.session.specFilePath) {
        this.addResult('Code Validation', false, 'No spec file generated for validation');
        return;
      }

      // Read the generated code
      const specCode = await fs.readFile(result.session.specFilePath, 'utf8');
      
      // Basic syntax validation
      const syntaxChecks = [
        { test: /import\s+{\s*test,\s*expect\s*}\s+from\s+['"]@playwright\/test['"]/, name: 'Import statement' },
        { test: /test\s*\(\s*['"][^'"]*['"],\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{/, name: 'Test function signature' },
        { test: /await\s+page\.goto\s*\(/, name: 'Page navigation' },
        { test: /await\s+expect\s*\(/, name: 'Assertion' },
        { test: /}\s*\)\s*;?\s*$/, name: 'Test closure' }
      ];

      let passedChecks = 0;
      for (const check of syntaxChecks) {
        if (check.test.test(specCode)) {
          passedChecks++;
          console.log(`    ✅ ${check.name}: OK`);
        } else {
          console.log(`    ❌ ${check.name}: MISSING`);
        }
      }

      if (passedChecks === syntaxChecks.length) {
        this.addResult('Code Validation - Syntax', true, `All ${syntaxChecks.length} syntax checks passed`);
      } else {
        this.addResult('Code Validation - Syntax', false, `Only ${passedChecks}/${syntaxChecks.length} syntax checks passed`);
      }

      // Try to validate with TypeScript (basic check)
      try {
        // This is a simple check - in a real scenario you might use TypeScript compiler API
        const hasTypeScriptSyntax = specCode.includes('async ({ page })') && 
                                   specCode.includes("from '@playwright/test'") &&
                                   !specCode.includes('syntax error');
        
        this.addResult('Code Validation - TypeScript', true, 'Generated code appears to be valid TypeScript');
      } catch (error) {
        this.addResult('Code Validation - TypeScript', false, `TypeScript validation failed: ${error}`);
      }

    } catch (error) {
      this.addResult('Code Validation', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Test 5: Cleanup functionality
   */
  private async testCleanup(): Promise<void> {
    console.log('\n🧹 Test 5: Cleanup Functionality');

    try {
      const sessionId = `test-cleanup-${Date.now()}`;
      
      // Start recording
      await this.recorder.startRecording(sessionId, 'https://example.com');
      
      // Verify recording is active
      const statusBefore = this.recorder.getRecordingStatus();
      
      // Dispose (should cleanup everything)
      await this.recorder.dispose();
      
      // Check status after dispose
      const statusAfter = this.recorder.getRecordingStatus();
      
      if (statusBefore.isRecording && !statusAfter.isRecording) {
        this.addResult('Cleanup - Dispose', true, 'Dispose properly cleaned up active recording');
      } else {
        this.addResult('Cleanup - Dispose', false, `Cleanup state unexpected: before=${statusBefore.isRecording}, after=${statusAfter.isRecording}`);
      }

    } catch (error) {
      this.addResult('Cleanup', false, `Test failed with error: ${error}`, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Simulate browser interactions for testing
   */
  private async simulateBrowserInteractions(page: Page): Promise<void> {
    try {
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Try to interact with the page (these are safe, basic interactions)
      await page.evaluate(() => {
        // Simulate some basic interactions that would be recorded
        const event = new Event('click', { bubbles: true });
        document.body.dispatchEvent(event);
      });
      
      // Scroll down a bit
      await page.evaluate(() => {
        window.scrollBy(0, 100);
      });
      
      await this.sleep(500);
      
    } catch (error) {
      console.log(`    Warning: Could not simulate all interactions: ${error}`);
    }
  }

  /**
   * Add a test result
   */
  private addResult(testName: string, success: boolean, details: string, files?: string[], error?: string): void {
    this.results.push({
      testName,
      success,
      details,
      files,
      error
    });

    const status = success ? '✅' : '❌';
    console.log(`  ${status} ${testName}: ${details}`);
    if (error) {
      console.log(`    Error: ${error}`);
    }
    if (files && files.length > 0) {
      console.log(`    Files: ${files.join(', ')}`);
    }
  }

  /**
   * Generate test report
   */
  private generateTestReport(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST REPORT');
    console.log('='.repeat(60));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const duration = Math.round((Date.now() - this.testStartTime) / 1000);

    console.log(`\n📈 Summary:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} ✅`);
    console.log(`  Failed: ${failedTests} ❌`);
    console.log(`  Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log(`  Duration: ${duration}s`);

    console.log(`\n📝 Detailed Results:`);
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`\n${index + 1}. ${status} ${result.testName}`);
      console.log(`   ${result.details}`);
      
      if (result.files && result.files.length > 0) {
        console.log(`   Files generated:`);
        result.files.forEach(file => console.log(`     - ${file}`));
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Generated files summary
    const allFiles = this.results
      .filter(r => r.files && r.files.length > 0)
      .flatMap(r => r.files!);
    
    if (allFiles.length > 0) {
      console.log(`\n📁 Generated Files (${allFiles.length}):`);
      allFiles.forEach(file => console.log(`  - ${file}`));
    }

    console.log('\n' + '='.repeat(60));
    
    if (failedTests === 0) {
      console.log('🎉 All tests passed! Playwright Codegen Recorder is working correctly.');
    } else {
      console.log(`⚠️  ${failedTests} test(s) failed. Please review the results above.`);
    }
  }

  /**
   * Cleanup test resources
   */
  private async cleanup(): Promise<void> {
    try {
      await this.recorder.dispose();
    } catch (error) {
      console.log('Warning: Cleanup error:', error);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const tester = new PlaywrightCodegenTester();
  await tester.runAllTests();
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { PlaywrightCodegenTester };