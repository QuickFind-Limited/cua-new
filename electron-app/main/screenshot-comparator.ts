import { ScreenshotComparison } from '../flows/types';
import { executeMagnitudeQuery } from './llm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ScreenshotComparator handles comparison of screenshots and provides
 * suggestions for Intent Spec updates based on visual differences.
 */
export class ScreenshotComparator {
  private comparisonCache: Map<string, ScreenshotComparison> = new Map();

  /**
   * Compare two screenshots and provide similarity analysis
   */
  async compareScreenshots(
    actualPath: string,
    expectedPath: string
  ): Promise<ScreenshotComparison> {
    try {
      // Create cache key
      const cacheKey = `${actualPath}:${expectedPath}`;
      if (this.comparisonCache.has(cacheKey)) {
        return this.comparisonCache.get(cacheKey)!;
      }

      // Verify files exist
      if (!fs.existsSync(actualPath)) {
        throw new Error(`Actual screenshot not found: ${actualPath}`);
      }

      if (!fs.existsSync(expectedPath)) {
        throw new Error(`Expected screenshot not found: ${expectedPath}`);
      }

      // Perform AI-based visual comparison
      const comparison = await this.performAIComparison(actualPath, expectedPath);

      // Cache the result
      this.comparisonCache.set(cacheKey, comparison);

      return comparison;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown comparison error';
      
      return {
        match: false,
        similarity: 0,
        suggestions: [`Comparison failed: ${errorMessage}`],
        differences: [{ type: 'error', message: errorMessage }]
      };
    }
  }

  /**
   * Perform AI-based visual comparison using Opus 4.1
   */
  private async performAIComparison(
    actualPath: string,
    expectedPath: string
  ): Promise<ScreenshotComparison> {
    try {
      // Read screenshot files as base64
      const actualImage = fs.readFileSync(actualPath, 'base64');
      const expectedImage = fs.readFileSync(expectedPath, 'base64');

      // Create comparison prompt
      const comparisonPrompt = `
Compare these two screenshots and analyze their visual similarity:

1. Actual Screenshot: [Current execution result]
2. Expected Screenshot: [Success state reference]

Please analyze:
- Overall visual similarity (0-100%)
- Key differences in layout, content, or UI elements
- Whether the current state matches the expected success criteria
- Specific suggestions for Intent Spec updates if needed

Return your analysis in this JSON format:
{
  "match": boolean,
  "similarity": number,
  "differences": [
    {
      "type": "layout|content|element|color|text",
      "description": "Description of the difference",
      "severity": "low|medium|high",
      "location": "Where the difference occurs"
    }
  ],
  "suggestions": [
    "Specific suggestions for improving the Intent Spec"
  ]
}
      `;

      // Use Opus 4.1 for visual analysis
      const analysisResult = await executeMagnitudeQuery(
        `Actual Image: data:image/png;base64,${actualImage}\n\nExpected Image: data:image/png;base64,${expectedImage}`,
        comparisonPrompt
      );

      // Parse the AI response
      const parsed = this.parseAIResponse(analysisResult);
      
      return {
        match: parsed.match,
        similarity: parsed.similarity,
        suggestions: parsed.suggestions || [],
        differences: parsed.differences || []
      };

    } catch (error) {
      console.warn('AI comparison failed, falling back to basic analysis:', error);
      return this.performBasicComparison(actualPath, expectedPath);
    }
  }

  /**
   * Fallback basic comparison when AI analysis fails
   */
  private async performBasicComparison(
    actualPath: string,
    expectedPath: string
  ): Promise<ScreenshotComparison> {
    try {
      // Get file stats for basic comparison
      const actualStats = fs.statSync(actualPath);
      const expectedStats = fs.statSync(expectedPath);

      // Basic file size comparison
      const sizeDifference = Math.abs(actualStats.size - expectedStats.size);
      const sizeSimilarity = Math.max(0, 100 - (sizeDifference / expectedStats.size) * 100);

      // Read files to compare basic properties
      const actualBuffer = fs.readFileSync(actualPath);
      const expectedBuffer = fs.readFileSync(expectedPath);

      // Simple buffer comparison for exact match
      const exactMatch = actualBuffer.equals(expectedBuffer);
      
      if (exactMatch) {
        return {
          match: true,
          similarity: 100,
          suggestions: [],
          differences: []
        };
      }

      // Provide basic analysis
      const suggestions = [];
      if (sizeDifference > expectedStats.size * 0.1) {
        suggestions.push('Significant size difference detected - content may have changed substantially');
      }

      if (sizeSimilarity < 50) {
        suggestions.push('Consider reviewing the success criteria - the current state differs significantly from expected');
      } else {
        suggestions.push('Minor differences detected - may need fine-tuning of element selectors or timing');
      }

      return {
        match: sizeSimilarity > 90,
        similarity: sizeSimilarity,
        suggestions,
        differences: [
          {
            type: 'content',
            description: `File size difference: ${sizeDifference} bytes`,
            severity: sizeDifference > expectedStats.size * 0.1 ? 'high' : 'low',
            location: 'Overall image'
          }
        ]
      };

    } catch (error) {
      return {
        match: false,
        similarity: 0,
        suggestions: ['Basic comparison failed - manual review required'],
        differences: [
          {
            type: 'error',
            description: error instanceof Error ? error.message : 'Unknown error',
            severity: 'high',
            location: 'Comparison process'
          }
        ]
      };
    }
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(response: any): any {
    try {
      // If response is already parsed
      if (typeof response === 'object' && response.match !== undefined) {
        return response;
      }

      // If response is a string, try to parse as JSON
      if (typeof response === 'string') {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : response;
        
        return JSON.parse(jsonString);
      }

      throw new Error('Invalid response format');

    } catch (error) {
      console.warn('Failed to parse AI response:', error);
      
      // Return default structure
      return {
        match: false,
        similarity: 50,
        suggestions: ['Unable to parse comparison results - manual review recommended'],
        differences: [
          {
            type: 'error',
            description: 'Failed to parse AI analysis',
            severity: 'medium',
            location: 'Analysis process'
          }
        ]
      };
    }
  }

  /**
   * Suggest updates based on differences analysis
   */
  async suggestUpdates(differences: any[]): Promise<string[]> {
    const suggestions: string[] = [];

    for (const diff of differences) {
      switch (diff.type) {
        case 'layout':
          suggestions.push(`Consider updating selectors for layout changes in ${diff.location}`);
          break;
          
        case 'content':
          suggestions.push(`Content differences detected in ${diff.location} - verify expected text or values`);
          break;
          
        case 'element':
          suggestions.push(`UI element changes in ${diff.location} - update target selectors`);
          break;
          
        case 'timing':
          suggestions.push(`Timing issues detected - consider adding wait conditions or increasing timeouts`);
          break;
          
        case 'text':
          suggestions.push(`Text content differences in ${diff.location} - update expected values`);
          break;
          
        case 'color':
          suggestions.push(`Visual styling changes detected - verify UI state or update success criteria`);
          break;
          
        default:
          if (diff.severity === 'high') {
            suggestions.push(`Critical difference in ${diff.location}: ${diff.description}`);
          } else {
            suggestions.push(`Consider reviewing ${diff.location} for: ${diff.description}`);
          }
      }
    }

    // Add general suggestions based on patterns
    if (differences.length > 3) {
      suggestions.push('Multiple differences detected - consider comprehensive review of Intent Spec');
    }

    if (differences.some(d => d.severity === 'high')) {
      suggestions.push('High-severity differences found - manual verification recommended');
    }

    // Remove duplicates and sort by priority
    const uniqueSuggestions = Array.from(new Set(suggestions));
    
    return uniqueSuggestions.sort((a, b) => {
      // Prioritize critical suggestions
      if (a.includes('Critical') && !b.includes('Critical')) return -1;
      if (!a.includes('Critical') && b.includes('Critical')) return 1;
      return 0;
    });
  }

  /**
   * Clear comparison cache
   */
  clearCache(): void {
    this.comparisonCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.comparisonCache.size,
      keys: Array.from(this.comparisonCache.keys())
    };
  }

  /**
   * Validate screenshot file
   */
  private validateScreenshot(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        return false;
      }

      // Basic image file validation
      const ext = path.extname(filePath).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.bmp', '.gif'].includes(ext);

    } catch {
      return false;
    }
  }
}