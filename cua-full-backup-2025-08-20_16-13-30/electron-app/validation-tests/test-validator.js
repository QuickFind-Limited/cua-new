"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var intent_spec_validator_1 = require("../main/intent-spec-validator");
var testCases = [
    {
        name: "Valid Dual Path Spec",
        fileName: "valid-dual-path.json",
        expectedValid: true,
        description: "Should pass validation with all required fields and proper dual-path structure"
    },
    {
        name: "Missing Name Field",
        fileName: "missing-name.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: name"],
        description: "Should fail when name field is missing"
    },
    {
        name: "Missing Description Field",
        fileName: "missing-description.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: description"],
        description: "Should fail when description field is missing"
    },
    {
        name: "Missing URL Field",
        fileName: "missing-url.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: url"],
        description: "Should fail when url field is missing"
    },
    {
        name: "Missing Params Field",
        fileName: "missing-params.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: params"],
        description: "Should fail when params field is missing"
    },
    {
        name: "Missing Steps Field",
        fileName: "missing-steps.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: steps"],
        description: "Should fail when steps field is missing"
    },
    {
        name: "Missing Preferences Field",
        fileName: "missing-preferences.json",
        expectedValid: false,
        expectedErrors: ["Missing required field: preferences"],
        description: "Should fail when preferences field is missing"
    },
    {
        name: "Invalid Step Missing Name",
        fileName: "invalid-step-missing-name.json",
        expectedValid: false,
        expectedErrors: ["Step 0: Missing required field: name"],
        description: "Should fail when step is missing name field"
    },
    {
        name: "Invalid Step Missing AI Instruction",
        fileName: "invalid-step-missing-ai-instruction.json",
        expectedValid: false,
        expectedErrors: ["Step 0: Missing required field: ai_instruction"],
        description: "Should fail when step is missing ai_instruction field"
    },
    {
        name: "Invalid Step Missing Snippet",
        fileName: "invalid-step-missing-snippet.json",
        expectedValid: false,
        expectedErrors: ["Step 0: Missing required field: snippet"],
        description: "Should fail when step is missing snippet field"
    },
    {
        name: "Invalid Step Bad Prefer Value",
        fileName: "invalid-step-bad-prefer.json",
        expectedValid: false,
        expectedErrors: ["Step 0: Field \"prefer\" must be either \"ai\" or \"snippet\""],
        description: "Should fail when step has invalid prefer value"
    },
    {
        name: "Invalid Step Bad Fallback Value",
        fileName: "invalid-step-bad-fallback.json",
        expectedValid: false,
        expectedErrors: ["Step 0: Field \"fallback\" must be \"ai\", \"snippet\", or \"none\""],
        description: "Should fail when step has invalid fallback value"
    },
    {
        name: "Empty Steps Array",
        fileName: "invalid-step-empty-arrays.json",
        expectedValid: false,
        expectedErrors: ["Field \"steps\" cannot be empty"],
        description: "Should fail when steps array is empty"
    },
    {
        name: "Undeclared Parameters",
        fileName: "mismatched-params-undeclared.json",
        expectedValid: false,
        expectedErrors: ["Parameter \"userName\" is used in steps but not declared in params array"],
        description: "Should fail when steps use parameters not declared in params array"
    },
    {
        name: "Unused Parameters",
        fileName: "mismatched-params-unused.json",
        expectedValid: true,
        expectedWarnings: ["Parameter \"userName\" is declared but never used in steps", "Parameter \"unusedParam\" is declared but never used in steps", "Parameter \"anotherUnused\" is declared but never used in steps"],
        description: "Should pass but warn about unused parameters"
    },
    {
        name: "Duplicate Parameters",
        fileName: "mismatched-params-duplicates.json",
        expectedValid: false,
        expectedErrors: ["Duplicate parameters found"],
        description: "Should fail when params array contains duplicates"
    },
    {
        name: "Invalid Preferences Missing Dynamic Elements",
        fileName: "invalid-preferences-missing-dynamic.json",
        expectedValid: false,
        expectedErrors: ["Missing required preference: dynamic_elements"],
        description: "Should fail when preferences is missing dynamic_elements"
    },
    {
        name: "Invalid Preferences Missing Simple Steps",
        fileName: "invalid-preferences-missing-simple.json",
        expectedValid: false,
        expectedErrors: ["Missing required preference: simple_steps"],
        description: "Should fail when preferences is missing simple_steps"
    },
    {
        name: "Invalid Preferences Bad Values",
        fileName: "invalid-preferences-bad-values.json",
        expectedValid: false,
        expectedErrors: [
            "Preference \"dynamic_elements\" must be \"snippet\" or \"ai\"",
            "Preference \"simple_steps\" must be \"snippet\" or \"ai\"",
            "Preference \"custom_preference\" must be \"snippet\" or \"ai\""
        ],
        description: "Should fail when preferences have invalid values"
    },
    {
        name: "Invalid Preferences Not Object",
        fileName: "invalid-preferences-not-object.json",
        expectedValid: false,
        expectedErrors: ["Field \"preferences\" must be an object"],
        description: "Should fail when preferences is not an object"
    },
    {
        name: "Invalid URL Format",
        fileName: "invalid-url.json",
        expectedValid: false,
        expectedErrors: ["Field \"url\" must be a valid URL"],
        description: "Should fail when URL is not a valid format"
    },
    {
        name: "Null Spec",
        fileName: "null-spec.json",
        expectedValid: false,
        expectedErrors: ["Intent Spec is null or undefined"],
        description: "Should fail when spec is null"
    }
];
function loadTestFile(fileName) {
    var filePath = path.join(__dirname, fileName);
    var content = fs.readFileSync(filePath, 'utf-8');
    if (fileName === 'null-spec.json') {
        return null;
    }
    try {
        return JSON.parse(content);
    }
    catch (error) {
        console.error("Error loading ".concat(fileName, ":"), error);
        if (fileName === 'malformed-json.json') {
            // Return the raw content for malformed JSON test
            return { malformed: true, content: content };
        }
        throw error;
    }
}
function runValidationTests() {
    console.log('🧪 Running Intent Spec Validation Tests\\n');
    console.log('='.repeat(80));
    var passCount = 0;
    var failCount = 0;
    var results = [];
    for (var _i = 0, testCases_1 = testCases; _i < testCases_1.length; _i++) {
        var testCase = testCases_1[_i];
        console.log("\\n\uD83D\uDCCB Test: ".concat(testCase.name));
        console.log("\uD83D\uDCC4 File: ".concat(testCase.fileName));
        console.log("\uD83D\uDCDD Description: ".concat(testCase.description));
        try {
            var spec = loadTestFile(testCase.fileName);
            var result = (0, intent_spec_validator_1.validateIntentSpec)(spec);
            var passed = true;
            var message = '';
            // Check if validation result matches expected validity
            if (result.valid !== testCase.expectedValid) {
                passed = false;
                message = "Expected valid: ".concat(testCase.expectedValid, ", got: ").concat(result.valid);
            }
            // Check expected errors
            if (testCase.expectedErrors) {
                var _loop_1 = function (expectedError) {
                    if (!result.errors.some(function (error) { return error.includes(expectedError); })) {
                        passed = false;
                        message += " | Missing expected error: \"".concat(expectedError, "\"");
                    }
                };
                for (var _a = 0, _b = testCase.expectedErrors; _a < _b.length; _a++) {
                    var expectedError = _b[_a];
                    _loop_1(expectedError);
                }
            }
            // Check expected warnings  
            if (testCase.expectedWarnings) {
                var _loop_2 = function (expectedWarning) {
                    if (!result.warnings.some(function (warning) { return warning.includes(expectedWarning); })) {
                        passed = false;
                        message += " | Missing expected warning: \"".concat(expectedWarning, "\"");
                    }
                };
                for (var _c = 0, _d = testCase.expectedWarnings; _c < _d.length; _c++) {
                    var expectedWarning = _d[_c];
                    _loop_2(expectedWarning);
                }
            }
            if (passed) {
                console.log('✅ PASSED');
                passCount++;
            }
            else {
                console.log('❌ FAILED');
                console.log("   Reason: ".concat(message));
                failCount++;
            }
            // Display validation result details
            console.log("   Valid: ".concat(result.valid));
            if (result.errors.length > 0) {
                console.log("   Errors (".concat(result.errors.length, "):"));
                result.errors.forEach(function (error) { return console.log("     \u2022 ".concat(error)); });
            }
            if (result.warnings.length > 0) {
                console.log("   Warnings (".concat(result.warnings.length, "):"));
                result.warnings.forEach(function (warning) { return console.log("     \u2022 ".concat(warning)); });
            }
            results.push({
                test: testCase,
                passed: passed,
                actualResult: result,
                message: message || 'Test passed as expected'
            });
        }
        catch (error) {
            console.log('❌ FAILED (Exception)');
            console.log("   Error: ".concat(error));
            failCount++;
            results.push({
                test: testCase,
                passed: false,
                actualResult: null,
                message: "Exception: ".concat(error)
            });
        }
    }
    // Summary
    console.log('\\n' + '='.repeat(80));
    console.log("\uD83D\uDCCA Test Summary: ".concat(passCount, " passed, ").concat(failCount, " failed out of ").concat(testCases.length, " tests"));
    if (failCount > 0) {
        console.log('\\n❌ Failed Tests:');
        results.filter(function (r) { return !r.passed; }).forEach(function (result) {
            console.log("   \u2022 ".concat(result.test.name, ": ").concat(result.message));
        });
    }
    console.log("\\n\uD83C\uDFAF Success Rate: ".concat(((passCount / testCases.length) * 100).toFixed(1), "%"));
}
function testSanitizeFunction() {
    console.log('\\n🧼 Testing sanitizeIntentSpec Function\\n');
    console.log('='.repeat(80));
    var malformedTestCases = [
        {
            name: "Completely malformed object",
            input: { random: "data", invalid: true, number: 123 },
            description: "Should return minimal valid structure with defaults"
        },
        {
            name: "Partial valid data",
            input: {
                name: "  Test Name  ",
                url: "  https://example.com  ",
                params: ["param1", "", "param2", "param1"], // duplicates and empty
                steps: [
                    {
                        name: "Valid Step",
                        ai_instruction: "Do something",
                        snippet: "code here",
                        prefer: "ai",
                        fallback: "snippet"
                    },
                    {
                        name: "", // invalid step
                        ai_instruction: "Invalid",
                        prefer: "invalid"
                    }
                ]
            },
            description: "Should clean up and normalize valid data, remove invalid elements"
        },
        {
            name: "Null input",
            input: null,
            description: "Should return empty object"
        },
        {
            name: "Non-object input",
            input: "not an object",
            description: "Should return empty object"
        },
        {
            name: "Legacy format with startUrl",
            input: {
                name: "Legacy Test",
                startUrl: "https://legacy.com",
                description: "Legacy description",
                params: ["legacyParam"],
                steps: [
                    {
                        name: "Legacy Step",
                        ai_instruction: "Legacy instruction",
                        snippet: "legacy code",
                        prefer: "snippet",
                        fallback: "ai",
                        action: "click", // legacy field
                        target: "#button" // legacy field
                    }
                ],
                preferences: {
                    dynamic_elements: "ai",
                    simple_steps: "snippet"
                }
            },
            description: "Should handle legacy format and preserve legacy fields"
        }
    ];
    malformedTestCases.forEach(function (testCase) {
        console.log("\\n\uD83D\uDCCB Sanitize Test: ".concat(testCase.name));
        console.log("\uD83D\uDCDD Description: ".concat(testCase.description));
        try {
            var sanitized = (0, intent_spec_validator_1.sanitizeIntentSpec)(testCase.input);
            console.log('✅ Sanitization completed');
            console.log('📤 Input:', JSON.stringify(testCase.input, null, 2));
            console.log('📥 Output:', JSON.stringify(sanitized, null, 2));
            // Test if sanitized result passes validation
            var validationResult = (0, intent_spec_validator_1.validateIntentSpec)(sanitized);
            console.log("\uD83D\uDCCA Validation after sanitization: ".concat(validationResult.valid ? '✅ Valid' : '❌ Invalid'));
            if (!validationResult.valid) {
                console.log('   Remaining errors:');
                validationResult.errors.forEach(function (error) { return console.log("     \u2022 ".concat(error)); });
            }
        }
        catch (error) {
            console.log('❌ Sanitization failed');
            console.log("   Error: ".concat(error));
        }
    });
}
function testParameterExtraction() {
    console.log('\\n🔍 Testing Parameter Extraction\\n');
    console.log('='.repeat(80));
    var parameterTestCases = [
        {
            name: "Simple parameter extraction",
            steps: [
                {
                    name: "Test Step",
                    ai_instruction: "Use {{param1}} and {{param2}}",
                    snippet: "await page.fill('#input', '{{param1}}');",
                    prefer: "ai",
                    fallback: "snippet",
                    value: "{{param1}} - {{param2}}"
                }
            ],
            expectedParams: ["param1", "param2"]
        },
        {
            name: "No parameters",
            steps: [
                {
                    name: "Test Step",
                    ai_instruction: "No parameters here",
                    snippet: "await page.click('#button');",
                    prefer: "ai",
                    fallback: "snippet"
                }
            ],
            expectedParams: []
        },
        {
            name: "Complex parameter patterns",
            steps: [
                {
                    name: "Test Step",
                    ai_instruction: "Use {{user.name}} and {{user_email}} plus {{CONSTANT_VALUE}}",
                    snippet: "await page.fill('#name', '{{user.name}}'); await page.fill('#email', '{{user_email}}');",
                    prefer: "ai",
                    fallback: "snippet",
                    selector: "#form-{{formId}}",
                    target: "{{legacy_target}}"
                }
            ],
            expectedParams: ["user.name", "user_email", "CONSTANT_VALUE", "formId", "legacy_target"]
        }
    ];
    parameterTestCases.forEach(function (testCase) {
        console.log("\\n\uD83D\uDCCB Parameter Test: ".concat(testCase.name));
        try {
            var extractedParams = (0, intent_spec_validator_1.extractParametersFromSteps)(testCase.steps);
            var extractedArray = Array.from(extractedParams).sort();
            var expectedArray = testCase.expectedParams.sort();
            var matches = JSON.stringify(extractedArray) === JSON.stringify(expectedArray);
            console.log("".concat(matches ? '✅' : '❌', " Parameter extraction ").concat(matches ? 'passed' : 'failed'));
            console.log("   Expected: [".concat(expectedArray.join(', '), "]"));
            console.log("   Extracted: [".concat(extractedArray.join(', '), "]"));
        }
        catch (error) {
            console.log('❌ Parameter extraction failed');
            console.log("   Error: ".concat(error));
        }
    });
}
// Run all tests
console.log('🚀 Starting Intent Spec Validation Test Suite\\n');
runValidationTests();
testSanitizeFunction();
testParameterExtraction();
console.log('\\n🏁 All tests completed!');
