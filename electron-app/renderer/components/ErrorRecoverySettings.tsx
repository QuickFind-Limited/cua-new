import React, { useState, useEffect, useCallback } from 'react';
import './ErrorRecoverySettings.css';

// TypeScript interfaces for settings
interface ErrorRecoverySettings {
  enabled: boolean;
  complexityThreshold: number;
  retryLimit: number;
  timeout: number;
  enableAuditLog: boolean;
  autoExportSettings: boolean;
}

interface RecoveryStatistics {
  totalAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageResponseTime: number;
  lastRecoveryTime?: string;
}

interface AuditLogEntry {
  timestamp: string;
  action: string;
  details: string;
  success: boolean;
}

const ErrorRecoverySettings: React.FC = () => {
  // State management
  const [settings, setSettings] = useState<ErrorRecoverySettings>({
    enabled: true,
    complexityThreshold: 5,
    retryLimit: 3,
    timeout: 30000,
    enableAuditLog: true,
    autoExportSettings: false
  });

  const [statistics, setStatistics] = useState<RecoveryStatistics>({
    totalAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageResponseTime: 0
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
    loadStatistics();
    loadAuditLogs();
  }, []);

  // Load settings from backend
  const loadSettings = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.get();
        if (result.success) {
          setSettings(result.data);
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to load settings');
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load recovery statistics
  const loadStatistics = async () => {
    try {
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.getStatistics();
        if (result.success) {
          setStatistics(result.data);
        }
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  // Load audit logs
  const loadAuditLogs = async () => {
    try {
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.getAuditLogs();
        if (result.success) {
          setAuditLogs(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);
    }
  };

  // Save settings to backend
  const saveSettings = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.save(settings);
        if (result.success) {
          showMessage('success', 'Settings saved successfully');
        } else {
          showMessage('error', result.error || 'Failed to save settings');
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to save settings');
      console.error('Error saving settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Clear solution cache
  const clearCache = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.clearCache();
        if (result.success) {
          showMessage('success', 'Solution cache cleared successfully');
        } else {
          showMessage('error', result.error || 'Failed to clear cache');
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to clear cache');
      console.error('Error clearing cache:', error);
    } finally {
      setLoading(false);
    }
  };

  // Export settings
  const exportSettings = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.export();
        if (result.success) {
          showMessage('success', `Settings exported to ${result.filePath}`);
        } else {
          showMessage('error', result.error || 'Failed to export settings');
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to export settings');
      console.error('Error exporting settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Import settings
  const importSettings = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.import();
        if (result.success) {
          setSettings(result.data);
          showMessage('success', 'Settings imported successfully');
        } else {
          showMessage('error', result.error || 'Failed to import settings');
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to import settings');
      console.error('Error importing settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Clear audit logs
  const clearAuditLogs = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.clearAuditLogs();
        if (result.success) {
          setAuditLogs([]);
          showMessage('success', 'Audit logs cleared successfully');
        } else {
          showMessage('error', result.error || 'Failed to clear audit logs');
        }
      }
    } catch (error) {
      showMessage('error', 'Failed to clear audit logs');
      console.error('Error clearing audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Show message helper
  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Handle setting changes
  const handleSettingChange = (key: keyof ErrorRecoverySettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Calculate success rate
  const successRate = statistics.totalAttempts > 0 
    ? ((statistics.successfulRecoveries / statistics.totalAttempts) * 100).toFixed(1)
    : '0';

  return (
    <div className="error-recovery-settings">
      <div className="settings-header">
        <h2>AI Error Recovery Settings</h2>
        <p className="settings-description">
          Configure how the system handles errors and attempts automatic recovery using AI.
        </p>
      </div>

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-content">
        {/* Main Settings */}
        <div className="settings-section">
          <h3>General Settings</h3>
          
          <div className="setting-group">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleSettingChange('enabled', e.target.checked)}
                disabled={loading}
              />
              <span className="checkmark"></span>
              Enable AI-powered error recovery
            </label>
            <p className="setting-description">
              When enabled, the system will automatically attempt to recover from errors using AI analysis.
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              Complexity Threshold for AI Usage
            </label>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max="10"
                value={settings.complexityThreshold}
                onChange={(e) => handleSettingChange('complexityThreshold', parseInt(e.target.value))}
                disabled={loading || !settings.enabled}
                className="slider"
              />
              <span className="slider-value">{settings.complexityThreshold}</span>
            </div>
            <p className="setting-description">
              AI will only be used for errors with complexity level {settings.complexityThreshold} or higher (1 = simple, 10 = very complex).
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              Retry Limit
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.retryLimit}
              onChange={(e) => handleSettingChange('retryLimit', parseInt(e.target.value))}
              disabled={loading || !settings.enabled}
              className="number-input"
            />
            <p className="setting-description">
              Maximum number of recovery attempts for each error.
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              Timeout (milliseconds)
            </label>
            <input
              type="number"
              min="5000"
              max="300000"
              step="1000"
              value={settings.timeout}
              onChange={(e) => handleSettingChange('timeout', parseInt(e.target.value))}
              disabled={loading || !settings.enabled}
              className="number-input"
            />
            <p className="setting-description">
              Maximum time to wait for AI recovery response.
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="settings-section">
          <h3>Recovery Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{statistics.totalAttempts}</div>
              <div className="stat-label">Total Attempts</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{statistics.successfulRecoveries}</div>
              <div className="stat-label">Successful</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{statistics.failedRecoveries}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{successRate}%</div>
              <div className="stat-label">Success Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{statistics.averageResponseTime}ms</div>
              <div className="stat-label">Avg Response Time</div>
            </div>
            {statistics.lastRecoveryTime && (
              <div className="stat-card">
                <div className="stat-value">
                  {new Date(statistics.lastRecoveryTime).toLocaleDateString()}
                </div>
                <div className="stat-label">Last Recovery</div>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="settings-section">
          <div className="section-header" onClick={() => setShowAdvanced(!showAdvanced)}>
            <h3>Advanced Settings</h3>
            <span className={`chevron ${showAdvanced ? 'expanded' : ''}`}>▶</span>
          </div>
          
          {showAdvanced && (
            <div className="advanced-settings">
              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={settings.enableAuditLog}
                    onChange={(e) => handleSettingChange('enableAuditLog', e.target.checked)}
                    disabled={loading}
                  />
                  <span className="checkmark"></span>
                  Enable audit logging
                </label>
                <p className="setting-description">
                  Log all error recovery attempts for analysis and debugging.
                </p>
              </div>

              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={settings.autoExportSettings}
                    onChange={(e) => handleSettingChange('autoExportSettings', e.target.checked)}
                    disabled={loading}
                  />
                  <span className="checkmark"></span>
                  Auto-export settings daily
                </label>
                <p className="setting-description">
                  Automatically backup settings configuration daily.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="settings-section">
          <h3>Actions</h3>
          <div className="action-buttons">
            <button 
              onClick={saveSettings} 
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
            
            <button 
              onClick={clearCache} 
              disabled={loading}
              className="btn btn-secondary"
            >
              Clear Solution Cache
            </button>
            
            <button 
              onClick={exportSettings} 
              disabled={loading}
              className="btn btn-secondary"
            >
              Export Settings
            </button>
            
            <button 
              onClick={importSettings} 
              disabled={loading}
              className="btn btn-secondary"
            >
              Import Settings
            </button>
          </div>
        </div>

        {/* Audit Logs */}
        {settings.enableAuditLog && (
          <div className="settings-section">
            <div className="section-header">
              <h3>Audit Logs</h3>
              <button 
                onClick={clearAuditLogs} 
                disabled={loading}
                className="btn btn-small btn-danger"
              >
                Clear Logs
              </button>
            </div>
            
            <div className="audit-logs">
              {auditLogs.length === 0 ? (
                <p className="no-logs">No audit logs available.</p>
              ) : (
                <div className="logs-container">
                  {auditLogs.slice(-50).reverse().map((log, index) => (
                    <div key={index} className={`log-entry ${log.success ? 'success' : 'error'}`}>
                      <div className="log-timestamp">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      <div className="log-action">{log.action}</div>
                      <div className="log-details">{log.details}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorRecoverySettings;