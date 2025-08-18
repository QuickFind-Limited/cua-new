// Variables Panel Logic for CUA Electron App

class VarsPanelManager {
    constructor() {
        this.currentFlow = null;
        this.currentIntentSpec = null;
        this.variables = {};
        this.isExecuting = false;
        this.isVisible = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupIPCListeners();
    }

    initializeElements() {
        // Update to use the new sidebar integrated flow variables section
        this.panel = document.getElementById('flow-variables-section');
        this.flowInfoContainer = document.getElementById('flow-info');
        this.variablesContainer = document.getElementById('variables-form');
        this.actionsContainer = document.getElementById('actionsContainer');
        this.statusContainer = document.getElementById('statusContainer');
        this.runFlowBtn = document.getElementById('run-flow-btn');
        this.saveFlowBtn = document.getElementById('save-flow-btn');
        this.closePanelBtn = document.getElementById('close-panel-btn');
        this.flowFileInput = document.getElementById('flowFileInput');
        this.flowDetailsModal = document.getElementById('flowDetailsModal');
        this.flowDetailsBody = document.getElementById('flowDetailsBody');
    }

    setupEventListeners() {
        // Close panel button
        if (this.closePanelBtn) {
            this.closePanelBtn.addEventListener('click', () => {
                this.hideVarsPanel();
            });
        }
        
        // Run flow button
        if (this.runFlowBtn) {
            this.runFlowBtn.addEventListener('click', () => {
                this.executeFlow();
            });
        }
        
        // Save flow button
        if (this.saveFlowBtn) {
            this.saveFlowBtn.addEventListener('click', () => {
                this.saveFlow();
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                switch(e.key) {
                    case 'o':
                        e.preventDefault();
                        this.loadFlowFile();
                        break;
                    case 'Enter':
                        if (e.ctrlKey && this.runFlowBtn && !this.runFlowBtn.disabled) {
                            e.preventDefault();
                            this.executeFlow();
                        }
                        break;
                }
            }
            
            if (e.key === 'Escape') {
                this.closeFlowDetails();
            }
        });

        // Form validation on input change
        if (this.variablesContainer) {
            this.variablesContainer.addEventListener('input', () => {
                this.validateForm();
            });
        }
    }

    setupIPCListeners() {
        // Setup IPC communication with main process
        if (window.electronAPI) {
            // Listen for flow execution results
            window.electronAPI.onFlowComplete && window.electronAPI.onFlowComplete((result) => {
                this.handleFlowExecutionResult(result);
            });

            // Listen for flow execution progress
            window.electronAPI.onFlowProgress && window.electronAPI.onFlowProgress((progress) => {
                this.handleFlowExecutionProgress(progress);
            });
        }
    }

    loadFlowFile() {
        this.flowFileInput.click();
    }

    handleFlowFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const flowData = JSON.parse(e.target.result);
                this.loadFlow(flowData);
                this.showStatus('Flow loaded successfully', 'success');
            } catch (error) {
                console.error('Error parsing flow file:', error);
                this.showStatus('Error loading flow file. Please check the JSON format.', 'error');
            }
        };
        reader.readAsText(file);
        
        // Reset the input to allow loading the same file again
        event.target.value = '';
    }

    loadFlow(flowData) {
        this.currentFlow = flowData;
        this.variables = {};
        
        this.renderFlowInfo(flowData);
        this.renderVariablesForm(flowData);
        this.validateForm();
        
        // Clear any previous status
        this.clearStatus();
    }

    renderFlowInfo(flowData) {
        const flowInfo = document.createElement('div');
        flowInfo.className = 'flow-info fade-in';
        
        // Build steps summary
        let stepsSummary = '';
        if (flowData.steps && flowData.steps.length > 0) {
            stepsSummary = `
                <div class="steps-summary" style="margin-top: 12px; padding: 8px; background: var(--bg-primary); border-radius: 4px; border: 1px solid var(--border-light);">
                    <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary);">Automation Steps:</div>
                    <ol style="margin: 0; padding-left: 20px; font-size: 11px; color: var(--text-primary);">
                        ${flowData.steps.slice(0, 5).map(step => {
                            const stepName = step.name || step.action || 'Unknown step';
                            const stepDesc = step.ai_instruction || step.description || '';
                            return `<li style="margin-bottom: 4px;">
                                <strong>${this.escapeHtml(stepName)}</strong>
                                ${stepDesc ? `<div style="color: var(--text-tertiary); font-size: 10px;">${this.escapeHtml(stepDesc).substring(0, 60)}${stepDesc.length > 60 ? '...' : ''}</div>` : ''}
                            </li>`;
                        }).join('')}
                        ${flowData.steps.length > 5 ? `<li style="color: var(--text-tertiary); font-style: italic;">... and ${flowData.steps.length - 5} more steps</li>` : ''}
                    </ol>
                </div>
            `;
        }
        
        flowInfo.innerHTML = `
            <div class="flow-name">${this.escapeHtml(flowData.name || 'Unnamed Flow')}</div>
            <div class="flow-steps mb-8">${flowData.steps ? flowData.steps.length : 0} automation steps</div>
            ${flowData.startUrl ? `<div class="text-muted" style="font-size: 11px;">Start URL: ${this.escapeHtml(flowData.startUrl)}</div>` : ''}
            ${stepsSummary}
            <button class="btn btn-stop" onclick="varsPanelManager.showFlowDetails()" style="
                margin-top: 8px; 
                padding: 4px 8px; 
                font-size: 11px;
                background: var(--bg-primary);
            ">
                📋 View Full Details
            </button>
        `;
        
        this.flowInfoContainer.innerHTML = '';
        this.flowInfoContainer.appendChild(flowInfo);
    }

    renderVariablesForm(flowData) {
        this.variablesContainer.innerHTML = '';
        
        if (!flowData.params || flowData.params.length === 0) {
            const noVarsMessage = document.createElement('div');
            noVarsMessage.className = 'text-center text-muted mb-16';
            noVarsMessage.innerHTML = `
                <div style="margin-bottom: 8px;">✓ This flow requires no configuration</div>
                <div style="font-size: 11px;">Ready to run immediately</div>
            `;
            this.variablesContainer.appendChild(noVarsMessage);
            return;
        }
        
        // Create variables section header
        const variablesHeader = document.createElement('div');
        variablesHeader.className = 'mb-16';
        variablesHeader.innerHTML = `
            <h4 style="margin-bottom: 8px; font-size: 14px; color: var(--text-primary);">
                Required Variables (${flowData.params.length})
            </h4>
            <div style="font-size: 11px; color: var(--text-muted);">
                Fill in the following values to personalize the automation
            </div>
        `;
        this.variablesContainer.appendChild(variablesHeader);
        
        // Create input for each parameter
        flowData.params.forEach((param, index) => {
            const inputGroup = this.createVariableInput(param, index);
            this.variablesContainer.appendChild(inputGroup);
        });
    }

    createVariableInput(param, index) {
        const inputGroup = document.createElement('div');
        inputGroup.className = 'variable-input-group fade-in';
        inputGroup.style.animationDelay = `${index * 0.1}s`;
        
        // Determine input type and placeholder based on parameter name
        const inputType = this.getInputTypeForParam(param);
        const placeholder = this.getPlaceholderForParam(param);
        const description = this.getDescriptionForParam(param);
        
        inputGroup.innerHTML = `
            <label class="variable-label" for="var-${param}">
                ${param}
                ${this.isRequiredParam(param) ? '<span style="color: var(--accent-red);">*</span>' : ''}
            </label>
            ${description ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${description}</div>` : ''}
            <input 
                type="${inputType}" 
                class="variable-input" 
                id="var-${param}" 
                name="${param}"
                placeholder="${placeholder}"
                ${this.isRequiredParam(param) ? 'required' : ''}
                data-param="${param}"
            >
        `;
        
        // Add input event listener
        const input = inputGroup.querySelector('input');
        input.addEventListener('input', (e) => {
            this.variables[param] = e.target.value;
            this.validateForm();
        });
        
        return inputGroup;
    }

    getInputTypeForParam(param) {
        const paramLower = param.toLowerCase();
        if (paramLower.includes('password') || paramLower.includes('pass')) {
            return 'password';
        }
        if (paramLower.includes('email') || paramLower.includes('mail')) {
            return 'email';
        }
        if (paramLower.includes('url') || paramLower.includes('link')) {
            return 'url';
        }
        if (paramLower.includes('phone') || paramLower.includes('tel')) {
            return 'tel';
        }
        if (paramLower.includes('number') || paramLower.includes('count') || paramLower.includes('amount')) {
            return 'number';
        }
        return 'text';
    }

    getPlaceholderForParam(param) {
        const paramLower = param.toLowerCase();
        const placeholders = {
            'username': 'Enter your username',
            'user': 'Enter your username',
            'password': 'Enter your password',
            'pass': 'Enter your password',
            'email': 'Enter your email address',
            'mail': 'Enter your email address',
            'name': 'Enter your name',
            'firstname': 'Enter your first name',
            'lastname': 'Enter your last name',
            'phone': 'Enter your phone number',
            'url': 'Enter URL (https://...)',
            'search': 'Enter search term',
            'query': 'Enter search query'
        };
        
        for (const [key, placeholder] of Object.entries(placeholders)) {
            if (paramLower.includes(key)) {
                return placeholder;
            }
        }
        
        return `Enter ${param.toLowerCase()}`;
    }

    getDescriptionForParam(param) {
        const paramLower = param.toLowerCase();
        const descriptions = {
            'password': 'Your account password (securely handled)',
            'email': 'Your email address for account access',
            'username': 'Your account username or login ID',
            'phone': 'Phone number in your local format',
            'url': 'Full URL starting with http:// or https://',
            'search': 'Keywords or phrase to search for'
        };
        
        for (const [key, description] of Object.entries(descriptions)) {
            if (paramLower.includes(key)) {
                return description;
            }
        }
        
        return null;
    }

    isRequiredParam(param) {
        // All parameters are required by default
        // This could be extended to check a flow configuration
        return true;
    }

    validateForm() {
        if (!this.currentFlow || !this.currentFlow.params) {
            this.runFlowBtn.disabled = false;
            return;
        }
        
        const requiredParams = this.currentFlow.params.filter(param => this.isRequiredParam(param));
        const allRequiredFilled = requiredParams.every(param => {
            const input = document.getElementById(`var-${param}`);
            return input && input.value.trim() !== '';
        });
        
        this.runFlowBtn.disabled = !allRequiredFilled || this.isExecuting;
        
        // Update button text based on validation
        if (this.isExecuting) {
            this.runFlowBtn.innerHTML = '<div class="loading-spinner"></div> Running...';
        } else if (allRequiredFilled) {
            this.runFlowBtn.textContent = 'Run Flow';
        } else {
            this.runFlowBtn.textContent = 'Fill Required Fields';
        }
    }

    executeFlow() {
        if (!this.currentFlow || this.isExecuting) return;
        
        // Collect all variable values
        const variables = {};
        if (this.currentFlow.params) {
            this.currentFlow.params.forEach(param => {
                const input = document.getElementById(`var-${param}`);
                if (input) {
                    variables[param] = input.value.trim();
                }
            });
        }
        
        // Validate required fields
        const missingVars = this.currentFlow.params?.filter(param => 
            this.isRequiredParam(param) && !variables[param]
        ) || [];
        
        if (missingVars.length > 0) {
            this.showStatus(`Please fill in required fields: ${missingVars.join(', ')}`, 'error');
            
            // Focus first missing field
            const firstMissingInput = document.getElementById(`var-${missingVars[0]}`);
            if (firstMissingInput) {
                firstMissingInput.focus();
            }
            return;
        }
        
        this.isExecuting = true;
        this.validateForm();
        this.clearStatus();
        
        // Show execution start status
        this.showStatus('Starting flow execution...', 'info');
        
        // Create flow with substituted variables
        const executableFlow = this.createExecutableFlow(this.currentFlow, variables);
        
        // Use FlowExecutor for execution
        if (window.flowExecutor) {
            window.flowExecutor.executeFlow(
                executableFlow,
                variables,
                (progress) => this.handleFlowExecutionProgress(progress),
                (result) => this.handleFlowExecutionResult(result)
            );
        } else {
            // Fallback direct API call
            if (window.electronAPI && window.electronAPI.executeFlow) {
                window.electronAPI.executeFlow(executableFlow, variables);
            } else {
                // Demo mode fallback
                setTimeout(() => {
                    this.handleFlowExecutionResult({
                        success: true,
                        message: 'Flow executed successfully (demo mode)'
                    });
                }, 2000);
            }
        }
    }

    saveFlow() {
        if (!this.currentFlow && !this.currentIntentSpec) {
            this.showStatus('No flow to save', 'error');
            return;
        }

        const specToSave = this.currentIntentSpec || this.currentFlow;
        
        if (window.electronAPI && window.electronAPI.saveFlow) {
            window.electronAPI.saveFlow(specToSave)
                .then((result) => {
                    if (result.success) {
                        this.showStatus('Flow saved successfully', 'success');
                    } else {
                        this.showStatus(result.error || 'Failed to save flow', 'error');
                    }
                })
                .catch((error) => {
                    this.showStatus('Error saving flow: ' + error.message, 'error');
                });
        } else {
            // Fallback for standalone usage
            this.showStatus('Save Flow (demo mode - not actually saved)', 'info');
        }
    }

    createExecutableFlow(flow, variables) {
        // Deep clone the flow and substitute variables
        const executableFlow = JSON.parse(JSON.stringify(flow));
        
        // Substitute variables in steps
        if (executableFlow.steps) {
            executableFlow.steps.forEach(step => {
                if (step.value) {
                    step.value = this.substituteVariables(step.value, variables);
                }
                if (step.target) {
                    step.target = this.substituteVariables(step.target, variables);
                }
            });
        }
        
        return executableFlow;
    }

    substituteVariables(text, variables) {
        if (typeof text !== 'string') return text;
        
        let result = text;
        for (const [key, value] of Object.entries(variables)) {
            const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(pattern, value);
        }
        return result;
    }

    handleFlowExecutionProgress(progress) {
        this.showStatus(`Step ${progress.currentStep}/${progress.totalSteps}: ${progress.description}`, 'info');
    }

    handleFlowExecutionResult(result) {
        this.isExecuting = false;
        this.validateForm();
        
        if (result.success) {
            this.showStatus(result.message || 'Flow completed successfully!', 'success');
        } else {
            this.showStatus(result.error || 'Flow execution failed', 'error');
        }
        
        // Auto-clear status after delay
        setTimeout(() => {
            this.clearStatus();
        }, result.success ? 3000 : 8000);
    }

    showFlowDetails() {
        if (!this.currentFlow) return;
        
        this.flowDetailsBody.innerHTML = this.createFlowDetailsHTML(this.currentFlow);
        this.flowDetailsModal.classList.remove('hidden');
    }

    createFlowDetailsHTML(flow) {
        let html = `
            <div class="flow-details">
                <div class="mb-16">
                    <strong>Flow Name:</strong> ${this.escapeHtml(flow.name || 'Unnamed Flow')}
                </div>
                ${flow.description ? `<div class="mb-16"><strong>Description:</strong> ${this.escapeHtml(flow.description)}</div>` : ''}
                ${flow.startUrl ? `<div class="mb-16"><strong>Start URL:</strong> ${this.escapeHtml(flow.startUrl)}</div>` : ''}
                ${flow.successCheck ? `<div class="mb-16"><strong>Success Check:</strong> ${this.escapeHtml(flow.successCheck)}</div>` : ''}
        `;
        
        if (flow.params && flow.params.length > 0) {
            html += `
                <div class="mb-16">
                    <strong>Variables:</strong>
                    <ul style="margin-left: 20px; margin-top: 4px;">
                        ${flow.params.map(param => `<li>{{${this.escapeHtml(param)}}}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (flow.steps && flow.steps.length > 0) {
            html += `
                <div>
                    <strong>Automation Steps (${flow.steps.length} total):</strong>
                    <ol style="margin-left: 20px; margin-top: 8px;">
                        ${flow.steps.map((step, index) => {
                            const stepName = step.name || step.action || `Step ${index + 1}`;
                            const instruction = step.ai_instruction || step.description || '';
                            const snippet = step.snippet || '';
                            const prefer = step.prefer || '';
                            const selector = step.selector || step.target || '';
                            const value = step.value || '';
                            
                            return `
                            <li style="margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
                                <strong style="color: #333;">${this.escapeHtml(stepName)}</strong>
                                ${instruction ? `<div style="color: #666; font-size: 12px; margin-top: 4px;">📝 ${this.escapeHtml(instruction)}</div>` : ''}
                                ${prefer ? `<div style="color: #888; font-size: 11px; margin-top: 2px;">⚙️ Strategy: ${this.escapeHtml(prefer)}</div>` : ''}
                                ${selector ? `<div style="color: #888; font-size: 11px; margin-top: 2px;">🎯 Selector: <code>${this.escapeHtml(selector)}</code></div>` : ''}
                                ${value ? `<div style="color: #888; font-size: 11px; margin-top: 2px;">📝 Value: ${this.escapeHtml(value)}</div>` : ''}
                                ${snippet ? `<div style="color: #888; font-size: 10px; margin-top: 4px; padding: 4px; background: #fff; border-radius: 2px; font-family: monospace; overflow-x: auto;"><code>${this.escapeHtml(snippet).substring(0, 200)}${snippet.length > 200 ? '...' : ''}</code></div>` : ''}
                            </li>
                        `}).join('')}
                    </ol>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    closeFlowDetails() {
        this.flowDetailsModal.classList.add('hidden');
    }

    showStatus(message, type = 'info') {
        // If statusContainer doesn't exist, create it or use an alternative
        if (!this.statusContainer) {
            // Try to find or create a status container
            this.statusContainer = document.getElementById('vars-panel-status');
            if (!this.statusContainer && this.variablesContainer) {
                // Create a status container if it doesn't exist
                this.statusContainer = document.createElement('div');
                this.statusContainer.id = 'vars-panel-status';
                this.statusContainer.className = 'vars-panel-status';
                // Insert it after the variables container
                this.variablesContainer.parentNode.insertBefore(this.statusContainer, this.variablesContainer.nextSibling);
            }
        }
        
        if (!this.statusContainer) {
            console.log('VarsPanel status:', message, type);
            return; // Can't show status without a container
        }
        
        this.clearStatus();
        
        const statusElement = document.createElement('div');
        statusElement.className = `status-indicator status-${type} fade-in`;
        statusElement.textContent = message;
        
        this.statusContainer.appendChild(statusElement);
    }

    clearStatus() {
        if (this.statusContainer) {
            this.statusContainer.innerHTML = '';
        }
    }

    showVarsPanel(intentSpec) {
        console.log('showVarsPanel called with:', intentSpec);
        this.currentIntentSpec = intentSpec;
        
        // Convert Intent Spec to flow format for compatibility
        const flowData = this.convertIntentSpecToFlow(intentSpec);
        this.loadFlow(flowData);
        
        // Show the flow variables section in the sidebar
        if (this.panel) {
            this.panel.style.display = 'block';
            
            // Expand the flow variables section
            const flowVarsContent = document.getElementById('flow-variables-content');
            const flowVarsChevron = document.getElementById('flow-variables-chevron');
            if (flowVarsContent && flowVarsContent.classList.contains('collapsed')) {
                flowVarsContent.classList.remove('collapsed');
            }
            if (flowVarsChevron) {
                flowVarsChevron.classList.remove('collapsed');
                flowVarsChevron.textContent = '▼';
            }
            
            this.isVisible = true;
            console.log('Flow variables section shown in sidebar');
        } else {
            console.error('Flow variables section element not found!');
        }
        
        this.showStatus('Intent Spec loaded successfully - ready to configure and execute', 'success');
    }

    hideVarsPanel() {
        if (this.panel) {
            // Hide the flow variables section
            this.panel.style.display = 'none';
            
            // Collapse the section content
            const flowVarsContent = document.getElementById('flow-variables-content');
            const flowVarsChevron = document.getElementById('flow-variables-chevron');
            if (flowVarsContent) {
                flowVarsContent.classList.add('collapsed');
            }
            if (flowVarsChevron) {
                flowVarsChevron.classList.add('collapsed');
                flowVarsChevron.textContent = '▶';
            }
            
            this.isVisible = false;
        }
        this.currentIntentSpec = null;
        this.currentFlow = null;
        this.variables = {};
        this.clearStatus();
    }

    convertIntentSpecToFlow(intentSpec) {
        // Convert Intent Spec format to flow format for compatibility
        return {
            name: intentSpec.name || 'Recorded Intent',
            description: intentSpec.description || 'Generated from recording',
            steps: intentSpec.steps || [],
            params: intentSpec.params || intentSpec.variables || [],  // Intent Spec uses 'params', not 'variables'
            startUrl: intentSpec.url || intentSpec.startUrl,  // Intent Spec uses 'url'
            successCheck: intentSpec.successCheck
        };
    }

    closePanel() {
        this.hideVarsPanel();
        
        if (window.electronAPI && window.electronAPI.closeVarsPanel) {
            window.electronAPI.closeVarsPanel();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Global functions for HTML onclick handlers
function loadFlowFile() {
    varsPanelManager.loadFlowFile();
}

function handleFlowFileLoad(event) {
    varsPanelManager.handleFlowFileLoad(event);
}

function executeFlow() {
    varsPanelManager.executeFlow();
}

function closePanel() {
    varsPanelManager.closePanel();
}

function saveFlow() {
    varsPanelManager.saveFlow();
}

// Initialize panel manager when DOM is loaded
let varsPanelManager;
document.addEventListener('DOMContentLoaded', () => {
    varsPanelManager = new VarsPanelManager();
    
    // Set global reference after initialization
    window.varsPanelManager = varsPanelManager;
    
    // Auto-load example flow for demonstration
    setTimeout(() => {
        if (window.location.search.includes('demo=true')) {
            const exampleFlow = {
                "name": "Login Flow with Variables",
                "startUrl": "https://example.com/login",
                "params": ["USERNAME", "PASSWORD"],
                "steps": [
                    {"action": "click", "target": "#username-field", "value": ""},
                    {"action": "type", "target": "#username-field", "value": "{{USERNAME}}"},
                    {"action": "click", "target": "#password-field", "value": ""},
                    {"action": "type", "target": "#password-field", "value": "{{PASSWORD}}"},
                    {"action": "click", "target": "#login-button", "value": ""},
                    {"action": "wait", "target": "2000", "value": ""}
                ],
                "successCheck": ".dashboard-welcome"
            };
            varsPanelManager.loadFlow(exampleFlow);
        }
    }, 500);
});