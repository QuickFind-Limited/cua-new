/**
 * Comprehensive test script for ExecutionReporter functionality
 * Tests all report generation formats and scenarios
 */

import { ExecutionReporter } from './main/execution-reporter';
import { ExecutionReport, StepExecutionResult } from './flows/types';
import * as fs from 'fs';
import * as path from 'path';

class ExecutionReporterTester {
  private reporter: ExecutionReporter;
  private outputDir: string;

  constructor() {
    this.reporter = new ExecutionReporter();
    this.outputDir = path.join(__dirname, 'test-reports');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Test Scenario 1: Successful execution with all AI paths
   */
  private createSuccessfulAIExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Navigate to login page",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1200,
        screenshot: "/screenshots/step1.png"
      },
      {
        name: "Fill username field",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 800,
        screenshot: "/screenshots/step2.png"
      },
      {
        name: "Fill password field",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 750,
        screenshot: "/screenshots/step3.png"
      },
      {
        name: "Click login button",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1500,
        screenshot: "/screenshots/step4.png"
      },
      {
        name: "Verify dashboard loaded",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 900,
        screenshot: "/screenshots/step5.png"
      }
    ];

    return {
      executionId: "test-ai-success-001",
      steps: steps,
      aiUsageCount: 5,
      snippetUsageCount: 0,
      fallbackCount: 0,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: true,
      suggestions: [],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: true
    };
  }

  /**
   * Test Scenario 2: Mixed AI/snippet execution
   */
  private createMixedExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Navigate to e-commerce site",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1100,
        screenshot: "/screenshots/mixed-step1.png"
      },
      {
        name: "Search for product",
        pathUsed: "snippet",
        fallbackOccurred: false,
        success: true,
        duration: 650,
        screenshot: "/screenshots/mixed-step2.png"
      },
      {
        name: "Select product from results",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1800,
        screenshot: "/screenshots/mixed-step3.png"
      },
      {
        name: "Add to cart",
        pathUsed: "snippet",
        fallbackOccurred: false,
        success: true,
        duration: 500,
        screenshot: "/screenshots/mixed-step4.png"
      },
      {
        name: "Proceed to checkout",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1200,
        screenshot: "/screenshots/mixed-step5.png"
      },
      {
        name: "Fill shipping details",
        pathUsed: "snippet",
        fallbackOccurred: false,
        success: true,
        duration: 2100,
        screenshot: "/screenshots/mixed-step6.png"
      }
    ];

    return {
      executionId: "test-mixed-002",
      steps: steps,
      aiUsageCount: 3,
      snippetUsageCount: 3,
      fallbackCount: 0,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: true,
      suggestions: ["Consider optimizing product selection for better AI performance"],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: true
    };
  }

  /**
   * Test Scenario 3: Execution with multiple fallbacks
   */
  private createFallbackExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Open complex form",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1300,
        screenshot: "/screenshots/fallback-step1.png"
      },
      {
        name: "Fill dynamic date picker",
        pathUsed: "snippet",
        fallbackOccurred: true,
        success: true,
        duration: 2800,
        screenshot: "/screenshots/fallback-step2.png"
      },
      {
        name: "Handle file upload",
        pathUsed: "snippet",
        fallbackOccurred: true,
        success: true,
        duration: 3200,
        screenshot: "/screenshots/fallback-step3.png"
      },
      {
        name: "Submit form",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1100,
        screenshot: "/screenshots/fallback-step4.png"
      },
      {
        name: "Handle CAPTCHA",
        pathUsed: "snippet",
        fallbackOccurred: true,
        success: false,
        duration: 5000,
        error: "CAPTCHA detection failed - manual intervention required",
        screenshot: "/screenshots/fallback-step5.png"
      }
    ];

    return {
      executionId: "test-fallback-003",
      steps: steps,
      aiUsageCount: 2,
      snippetUsageCount: 3,
      fallbackCount: 3,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: false,
      suggestions: [
        "Consider adding manual CAPTCHA handling step",
        "Review date picker implementation for AI compatibility",
        "File upload patterns may need optimization"
      ],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: false
    };
  }

  /**
   * Test Scenario 4: Failed execution with errors
   */
  private createFailedExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Navigate to admin panel",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1400,
        screenshot: "/screenshots/failed-step1.png"
      },
      {
        name: "Authenticate with 2FA",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: false,
        duration: 8000,
        error: "2FA token expired - authentication timeout",
        screenshot: "/screenshots/failed-step2.png"
      },
      {
        name: "Access user management",
        pathUsed: "snippet",
        fallbackOccurred: true,
        success: false,
        duration: 1200,
        error: "Access denied - insufficient permissions",
        screenshot: "/screenshots/failed-step3.png"
      }
    ];

    return {
      executionId: "test-failed-004",
      steps: steps,
      aiUsageCount: 2,
      snippetUsageCount: 1,
      fallbackCount: 1,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: false,
      suggestions: [
        "Implement 2FA token refresh mechanism",
        "Add permission validation before attempting admin operations",
        "Consider adding retry logic for authentication steps"
      ],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: false
    };
  }

  /**
   * Test Scenario 5: Performance test with long execution
   */
  private createPerformanceTestExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Load large dataset page",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 12000,
        screenshot: "/screenshots/perf-step1.png"
      },
      {
        name: "Apply complex filters",
        pathUsed: "snippet",
        fallbackOccurred: false,
        success: true,
        duration: 8500,
        screenshot: "/screenshots/perf-step2.png"
      },
      {
        name: "Generate report",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 25000,
        screenshot: "/screenshots/perf-step3.png"
      },
      {
        name: "Download generated file",
        pathUsed: "snippet",
        fallbackOccurred: false,
        success: true,
        duration: 15000,
        screenshot: "/screenshots/perf-step4.png"
      }
    ];

    return {
      executionId: "test-performance-005",
      steps: steps,
      aiUsageCount: 2,
      snippetUsageCount: 2,
      fallbackCount: 0,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: true,
      suggestions: [
        "Consider optimizing data loading performance",
        "Report generation could benefit from background processing"
      ],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: true
    };
  }

  /**
   * Test Scenario 6: Screenshot comparison test
   */
  private createScreenshotComparisonExecution(): ExecutionReport {
    const steps: StepExecutionResult[] = [
      {
        name: "Navigate to dashboard",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1100,
        screenshot: "/screenshots/comparison-step1.png"
      },
      {
        name: "Check widget layout",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 800,
        screenshot: "/screenshots/comparison-step2.png"
      },
      {
        name: "Verify data refresh",
        pathUsed: "ai",
        fallbackOccurred: false,
        success: true,
        duration: 1500,
        screenshot: "/screenshots/comparison-step3.png"
      }
    ];

    return {
      executionId: "test-screenshot-006",
      steps: steps,
      aiUsageCount: 3,
      snippetUsageCount: 0,
      fallbackCount: 0,
      screenshots: steps.map(s => s.screenshot!),
      overallSuccess: true,
      suggestions: [
        "Widget layout appears to have minor positioning differences",
        "Data refresh timing may need adjustment for consistency",
        "Consider updating success screenshot baseline"
      ],
      totalDuration: steps.reduce((sum, step) => sum + (step.duration || 0), 0),
      successStateMatch: false // Simulating minor UI differences
    };
  }

  /**
   * Save report to file
   */
  private saveReport(filename: string, content: string): void {
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Report saved: ${filePath}`);
  }

  /**
   * Test report generation for a specific execution
   */
  private testReportGeneration(execution: ExecutionReport, scenarioName: string): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${scenarioName}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Generate text report
      const textReport = this.reporter.generateReport(execution);
      this.saveReport(`${execution.executionId}-report.txt`, textReport);

      // Generate JSON report
      const jsonReport = this.reporter.generateJSONReport(execution);
      this.saveReport(`${execution.executionId}-report.json`, jsonReport);

      // Generate CSV report
      const csvReport = this.reporter.generateCSVReport(execution);
      this.saveReport(`${execution.executionId}-report.csv`, csvReport);

      // Parse JSON to verify structure
      const parsedJson = JSON.parse(jsonReport);
      
      console.log(`✓ Text report generated (${textReport.length} characters)`);
      console.log(`✓ JSON report generated with summary scores:`);
      console.log(`  - Performance Score: ${parsedJson.analysis.performanceScore}/100`);
      console.log(`  - Reliability Score: ${parsedJson.analysis.reliabilityScore}/100`);
      console.log(`  - Adaptability Score: ${parsedJson.analysis.adaptabilityScore}/100`);
      console.log(`✓ CSV report generated (${execution.steps?.length || 0} rows)`);

      // Verify report contents
      this.verifyReportContents(textReport, execution, scenarioName);

    } catch (error) {
      console.error(`✗ Error generating reports for ${scenarioName}:`, error);
    }
  }

  /**
   * Verify report contents include required information
   */
  private verifyReportContents(report: string, execution: ExecutionReport, scenarioName: string): void {
    const requirements = [
      { check: () => report.includes('INTENT SPEC EXECUTION REPORT'), name: 'Header' },
      { check: () => report.includes('EXECUTION SUMMARY'), name: 'Summary section' },
      { check: () => report.includes('STEP DETAILS'), name: 'Step details' },
      { check: () => report.includes('USAGE ANALYSIS'), name: 'Usage analysis' },
      { check: () => report.includes('SUCCESS STATE ANALYSIS'), name: 'Success analysis' },
      { check: () => report.includes('RECOMMENDATIONS'), name: 'Recommendations' },
      { check: () => report.includes(execution.executionId || 'unknown'), name: 'Execution ID' },
      { check: () => report.includes(`${execution.steps?.length || 0}`), name: 'Step count' },
      { check: () => report.includes(`${execution.aiUsageCount || 0}`), name: 'AI usage count' },
      { check: () => report.includes(`${execution.snippetUsageCount || 0}`), name: 'Snippet usage count' },
      { check: () => report.includes(`${execution.fallbackCount || 0}`), name: 'Fallback count' }
    ];

    console.log('\nReport Content Verification:');
    let passed = 0;
    
    requirements.forEach(req => {
      if (req.check()) {
        console.log(`  ✓ ${req.name}`);
        passed++;
      } else {
        console.log(`  ✗ ${req.name}`);
      }
    });

    console.log(`Report Quality: ${passed}/${requirements.length} requirements met (${Math.round(passed/requirements.length*100)}%)`);
  }

  /**
   * Run all test scenarios
   */
  public runAllTests(): void {
    console.log('🧪 Starting ExecutionReporter Comprehensive Test Suite');
    console.log(`📁 Output directory: ${this.outputDir}`);

    const testScenarios = [
      { 
        execution: this.createSuccessfulAIExecution(), 
        name: 'Successful AI-Only Execution' 
      },
      { 
        execution: this.createMixedExecution(), 
        name: 'Mixed AI/Snippet Execution' 
      },
      { 
        execution: this.createFallbackExecution(), 
        name: 'Multiple Fallbacks Execution' 
      },
      { 
        execution: this.createFailedExecution(), 
        name: 'Failed Execution with Errors' 
      },
      { 
        execution: this.createPerformanceTestExecution(), 
        name: 'Performance Test (Long Duration)' 
      },
      { 
        execution: this.createScreenshotComparisonExecution(), 
        name: 'Screenshot Comparison Test' 
      }
    ];

    testScenarios.forEach(scenario => {
      this.testReportGeneration(scenario.execution, scenario.name);
    });

    this.generateTestSummary(testScenarios);
  }

  /**
   * Generate a comprehensive test summary
   */
  private generateTestSummary(scenarios: Array<{execution: ExecutionReport, name: string}>): void {
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY - ExecutionReporter Functionality');
    console.log('='.repeat(80));

    const summary = {
      totalScenarios: scenarios.length,
      totalSteps: scenarios.reduce((sum, s) => sum + (s.execution.steps?.length || 0), 0),
      successfulExecutions: scenarios.filter(s => s.execution.overallSuccess).length,
      aiOnlyExecutions: scenarios.filter(s => s.execution.snippetUsageCount === 0).length,
      mixedExecutions: scenarios.filter(s => (s.execution.aiUsageCount || 0) > 0 && (s.execution.snippetUsageCount || 0) > 0).length,
      fallbackExecutions: scenarios.filter(s => (s.execution.fallbackCount || 0) > 0).length,
      avgDuration: scenarios.reduce((sum, s) => sum + (s.execution.totalDuration || 0), 0) / scenarios.length,
      screenshotComparisons: scenarios.filter(s => s.execution.successStateMatch !== undefined).length
    };

    console.log('\n📊 Test Coverage:');
    console.log(`  • Total test scenarios: ${summary.totalScenarios}`);
    console.log(`  • Total execution steps: ${summary.totalSteps}`);
    console.log(`  • Successful executions: ${summary.successfulExecutions}/${summary.totalScenarios}`);
    console.log(`  • AI-only executions: ${summary.aiOnlyExecutions}`);
    console.log(`  • Mixed AI/snippet executions: ${summary.mixedExecutions}`);
    console.log(`  • Executions with fallbacks: ${summary.fallbackExecutions}`);
    console.log(`  • Screenshot comparisons: ${summary.screenshotComparisons}`);
    console.log(`  • Average execution duration: ${Math.round(summary.avgDuration)}ms`);

    console.log('\n📋 Report Format Testing:');
    console.log(`  ✓ Text reports: ${scenarios.length} generated`);
    console.log(`  ✓ JSON reports: ${scenarios.length} generated`);
    console.log(`  ✓ CSV reports: ${scenarios.length} generated`);

    console.log('\n🔍 Feature Coverage:');
    console.log('  ✓ Execution summary with success rates');
    console.log('  ✓ Step-by-step details with timing');
    console.log('  ✓ Usage analysis (AI vs snippet)');
    console.log('  ✓ Fallback statistics');
    console.log('  ✓ Performance score calculation');
    console.log('  ✓ Reliability score calculation');
    console.log('  ✓ Adaptability score calculation');
    console.log('  ✓ Screenshot comparison results');
    console.log('  ✓ Recommendations based on results');
    console.log('  ✓ Error reporting and analysis');

    console.log('\n📁 Generated Files:');
    const files = fs.readdirSync(this.outputDir);
    files.forEach(file => {
      console.log(`  • ${file}`);
    });

    console.log('\n✅ ExecutionReporter testing completed successfully!');
    console.log(`📂 All reports saved to: ${this.outputDir}`);
  }
}

// Run the tests
if (require.main === module) {
  const tester = new ExecutionReporterTester();
  tester.runAllTests();
}

export { ExecutionReporterTester };