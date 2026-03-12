import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensenav.js'
import { properties } from '../../properties/properties.js'

const CONFIGS_ENDPOINT = `${properties.backend}expense/save_report_config`
const REORDER_ENDPOINT = `${properties.backend}expense/save_report_config/reorder`
const PREVIEW_ENDPOINT = `${properties.backend}expense/get_report_preview/`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseReportPreview extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            configs: [],
            loadingConfigs: true,
            selectedConfigId: "",
            previewData: null,
            loadingPreview: false,
            filters: {},
            result: null,
            deleting: false,
            confirmDeleteId: null,
            reordering: false
        };
    }

    componentDidMount() {
        this.fetchConfigs();
    }

    fetchConfigs() {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        fetch(CONFIGS_ENDPOINT, {
            method: "GET",
            headers: headers
        })
        .then(response => response.json())
        .then(response => {
            this.setState({ configs: Array.isArray(response) ? response : (response.configs || []), loadingConfigs: false });
        })
        .catch(err => {
            console.log("Failed to load configs:", err);
            this.setState({ configs: [], loadingConfigs: false });
        });
    }

    fetchPreview(configId) {
        this.setState({ loadingPreview: true, previewData: null, result: null, confirmDeleteId: null, filters: {} });

        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        fetch(PREVIEW_ENDPOINT + configId, {
            method: "GET",
            headers: headers
        })
        .then(response => response.json())
        .then(response => {
            this.setState({ previewData: response, loadingPreview: false });
        })
        .catch(err => {
            console.log("Failed to load preview:", err);
            this.setState({ previewData: null, loadingPreview: false, result: { type: "error", message: "Failed to load preview." } });
        });
    }

    handleConfigSelect(configId) {
        this.setState({ selectedConfigId: configId, confirmDeleteId: null, result: null, filters: {} });
        if (configId) {
            this.fetchPreview(configId);
        } else {
            this.setState({ previewData: null });
        }
    }

    handleDelete(configId) {
        if (this.state.confirmDeleteId !== configId) {
            this.setState({ confirmDeleteId: configId });
            return;
        }

        this.setState({ deleting: true, result: null });

        fetch(CONFIGS_ENDPOINT + '/' + configId, {
            method: "DELETE",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => {
            return response.json().then(data => {
                if (!response.ok) {
                    throw new Error(data.error || data.message || "Delete failed");
                }
                return data;
            });
        })
        .then(data => {
            this.setState({
                deleting: false,
                selectedConfigId: "",
                previewData: null,
                confirmDeleteId: null,
                filters: {},
                result: { type: "success", message: data.message || "Configuration deleted." }
            }, () => {
                this.fetchConfigs();
            });
        })
        .catch(err => {
            this.setState({ deleting: false, confirmDeleteId: null, result: { type: "error", message: err.message || "Something went wrong." } });
        });
    }

    handleFilterChange(columnName, value) {
        var filters = Object.assign({}, this.state.filters);
        if (value) {
            filters[columnName] = value;
        } else {
            delete filters[columnName];
        }

        // Auto-clear other filters whose selected value is no longer valid
        var changed = true;
        while (changed) {
            changed = false;
            var filterKeys = Object.keys(filters);
            for (var f = 0; f < filterKeys.length; f++) {
                var col = filterKeys[f];
                var selectedVal = filters[col];

                // Get valid options for this filter based on all other active filters
                var rows = this.state.previewData ? this.state.previewData.rows || [] : [];
                var validValues = {};
                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var match = true;
                    for (var k = 0; k < filterKeys.length; k++) {
                        var otherCol = filterKeys[k];
                        if (otherCol === col) continue;
                        if (filters[otherCol] && row[otherCol] !== filters[otherCol]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        var val = row[col] || "";
                        if (val) validValues[val] = true;
                    }
                }

                if (selectedVal && !validValues[selectedVal]) {
                    delete filters[col];
                    changed = true;
                    break; // restart loop since filters changed
                }
            }
        }

        this.setState({ filters: filters });
    }

    clearAllFilters() {
        this.setState({ filters: {} });
    }

    handleBackToConfig() {
        if (this.props.onNavigateToConfig) {
            this.props.onNavigateToConfig();
        } else {
            window.location.href = '/expense-report-config';
        }
    }

    handleGoToUpload() {
        window.location.href = '/expense-upload';
    }

    moveConfig(configId, direction) {
        var configs = this.state.configs.slice();
        var idx = -1;
        for (var i = 0; i < configs.length; i++) {
            if (configs[i].id === configId) { idx = i; break; }
        }
        if (idx === -1) return;

        var newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= configs.length) return;

        // Swap
        var temp = configs[idx];
        configs[idx] = configs[newIdx];
        configs[newIdx] = temp;

        // Build order payload
        var order = [];
        for (var i = 0; i < configs.length; i++) {
            order.push({ id: configs[i].id, display_order: i + 1 });
        }

        this.setState({ configs: configs, reordering: true });

        fetch(REORDER_ENDPOINT, {
            method: "PUT",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ order: order })
        })
        .then(response => response.json())
        .then(() => {
            this.setState({ reordering: false });
        })
        .catch(err => {
            console.log("Reorder failed:", err);
            this.setState({ reordering: false });
        });
    }

    getFilterColumns() {
        if (!this.state.previewData || !this.state.previewData.columns) return [];
        var filterCols = [];
        for (var i = 0; i < this.state.previewData.columns.length; i++) {
            var col = this.state.previewData.columns[i];
            if (col.is_filter || col.require_column_index) {
                filterCols.push(col);
            }
        }
        return filterCols;
    }

    getFilterOptions(columnName) {
        if (!this.state.previewData || !this.state.previewData.rows) return [];

        // Get rows filtered by all OTHER active filters (exclude current column)
        var activeFilters = this.state.filters;
        var filterKeys = Object.keys(activeFilters);
        var rows = this.state.previewData.rows;

        var filteredRows = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var match = true;
            for (var f = 0; f < filterKeys.length; f++) {
                var colName = filterKeys[f];
                if (colName === columnName) continue; // skip self
                if (row[colName] !== activeFilters[colName]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                filteredRows.push(row);
            }
        }

        var seen = {};
        var options = [];
        for (var i = 0; i < filteredRows.length; i++) {
            var val = filteredRows[i][columnName] || "";
            if (val && !seen[val]) {
                seen[val] = true;
                options.push(val);
            }
        }
        options.sort();
        return options;
    }

    getFilteredRows() {
        if (!this.state.previewData || !this.state.previewData.rows) return [];

        var activeFilters = this.state.filters;
        var filterKeys = Object.keys(activeFilters);
        if (filterKeys.length === 0) return this.state.previewData.rows;

        var filtered = [];
        for (var i = 0; i < this.state.previewData.rows.length; i++) {
            var row = this.state.previewData.rows[i];
            var match = true;
            for (var f = 0; f < filterKeys.length; f++) {
                var colName = filterKeys[f];
                if (row[colName] !== activeFilters[colName]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                filtered.push(row);
            }
        }
        return filtered;
    }

    formatDate(dateStr) {
        if (!dateStr) return "\u2014";
        var d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    renderConfigList() {
        if (this.state.loadingConfigs) {
            return (
                <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    Loading saved configurations...
                </div>
            );
        }

        if (this.state.configs.length === 0) {
            return (
                <div style={{ padding: "30px 20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center" }}>
                    <p style={{ fontSize: "14px", color: "#7c8ba1", margin: "0 0 14px 0" }}>No saved configurations found.</p>
                    <button
                        style={{ padding: "10px 24px", fontSize: "14px", fontWeight: "600", background: "#052049", color: "#ffffff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                        onClick={() => this.handleBackToConfig()}
                    >
                        Create New Configuration
                    </button>
                </div>
            );
        }

        return (
            <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>1</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select a Saved Configuration</span>
                    <span style={{ fontSize: "12px", color: "#7c8ba1", fontWeight: "400", marginLeft: "8px" }}>Use &#9650;&#9660; to set tab order on Reports page</span>
                </div>

                <div style={{ border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden" }}>
                    {this.state.configs.map((cfg, idx) => {
                        var isSelected = String(this.state.selectedConfigId) === String(cfg.id);
                        var isConfirmDelete = this.state.confirmDeleteId === cfg.id;
                        var isFirst = idx === 0;
                        var isLast = idx === this.state.configs.length - 1;
                        return (
                            <div key={cfg.id}
                                style={{
                                    display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px",
                                    borderBottom: !isLast ? "1px solid #e2e6ed" : "none",
                                    background: isSelected ? "#e8f0fe" : (idx % 2 === 0 ? "#fafbfc" : "#ffffff"),
                                    cursor: "pointer", transition: "all 0.15s"
                                }}
                                onClick={() => this.handleConfigSelect(cfg.id)}
                            >
                                {/* Order arrows */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                    <span style={{ cursor: isFirst ? "not-allowed" : "pointer", fontSize: "11px", color: isFirst ? "#ccc" : "#052049", lineHeight: "1", userSelect: "none" }}
                                        onClick={() => { if (!isFirst) this.moveConfig(cfg.id, -1); }}>&#9650;</span>
                                    <span style={{ cursor: isLast ? "not-allowed" : "pointer", fontSize: "11px", color: isLast ? "#ccc" : "#052049", lineHeight: "1", userSelect: "none" }}
                                        onClick={() => { if (!isLast) this.moveConfig(cfg.id, 1); }}>&#9660;</span>
                                </div>

                                {/* Order number */}
                                <span style={{ fontSize: "12px", fontWeight: "700", color: "#052049", width: "20px", textAlign: "center", flexShrink: 0 }}>{idx + 1}</span>

                                {/* Radio */}
                                <div style={{
                                    width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                                    border: isSelected ? "2px solid #052049" : "2px solid #ccc",
                                    display: "flex", alignItems: "center", justifyContent: "center"
                                }}>
                                    {isSelected && <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#052049" }}></div>}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#2c3345" }}>{cfg.config_name}</div>
                                    <div style={{ fontSize: "12px", color: "#7c8ba1", marginTop: "2px" }}>
                                        Expense: {cfg.expense_name || "Unknown"} &middot; {cfg.column_count} columns &middot; {this.formatDate(cfg.created_date)}
                                    </div>
                                    {cfg.actions && cfg.actions.length > 0 && (
                                        <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "3px" }}>
                                            {cfg.actions.map((act, ai) => {
                                                var mapping = act.action_column_mapping || {};
                                                if (typeof mapping === 'string') { try { mapping = JSON.parse(mapping); } catch(e) { mapping = {}; } }
                                                var icon = act.action_type === "send_email" ? "\u2709" : act.action_type === "approve" ? "\u2713" : act.action_type === "export" ? "\u21E9" : act.action_type === "notify" ? "\uD83D\uDD14" : "\u2699";
                                                return (
                                                    <div key={ai} style={{ fontSize: "11px", color: "#052049", padding: "3px 8px", background: "#f0f5ff", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                                        <span>{icon}</span>
                                                        <span><strong>{act.action_button_label || act.action_name || "Action " + (ai + 1)}</strong></span>
                                                        <span style={{ color: "#7c8ba1" }}>({act.action_type})</span>
                                                        {act.prompt_mode && <span style={{ padding: "1px 6px", background: "#fff3cd", color: "#856404", borderRadius: "3px", fontSize: "10px", fontWeight: "600" }}>PROMPT</span>}
                                                        {mapping.email_to && !act.prompt_mode && <span>&middot; To: {mapping.email_to}</span>}
                                                        {mapping.subject_template && !act.prompt_mode && <span>&middot; Subject: "{mapping.subject_template}"</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {isSelected && (
                                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                        <a
                                            href={"/expense-report-config?edit=" + cfg.id}
                                            style={{
                                                padding: "6px 14px", fontSize: "12px", fontWeight: "600", border: "none", borderRadius: "4px", cursor: "pointer",
                                                background: "#f0f5ff", color: "#052049", textDecoration: "none", display: "inline-block"
                                            }}
                                        >Edit</a>
                                        <button
                                            style={{
                                                padding: "6px 14px", fontSize: "12px", fontWeight: "600", border: "none", borderRadius: "4px", cursor: "pointer",
                                                background: isConfirmDelete ? "#d64545" : "#fdf0f0",
                                                color: isConfirmDelete ? "#ffffff" : "#d64545"
                                            }}
                                            onClick={() => this.handleDelete(cfg.id)}
                                            disabled={this.state.deleting}
                                        >
                                            {this.state.deleting ? "Deleting..." : (isConfirmDelete ? "Confirm Delete" : "Delete")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ marginTop: "14px", textAlign: "right" }}>
                    <span
                        style={{ fontSize: "13px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => this.handleBackToConfig()}
                    >
                        + Create New Configuration
                    </span>
                </div>
            </div>
        );
    }

    renderPreview() {
        if (!this.state.selectedConfigId) return null;

        if (this.state.loadingPreview) {
            return (
                <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    Loading report preview...
                </div>
            );
        }

        if (!this.state.previewData || !this.state.previewData.columns || this.state.previewData.columns.length === 0) {
            return (
                <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    No data available for this configuration.
                </div>
            );
        }

        var data = this.state.previewData;
        var config = data.config || {};
        var filterColumns = this.getFilterColumns();
        var filteredRows = this.getFilteredRows();
        var activeFilterCount = Object.keys(this.state.filters).length;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={stepNumStyle}>2</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Report Preview</span>
                </div>

                {/* Config info bar */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "13px", color: "#052049" }}>
                    <span><strong>Configuration:</strong> {config.config_name}</span>
                    <span>&middot;</span>
                    <span><strong>Expense:</strong> {config.expense_name || "Unknown"}</span>
                    <span>&middot;</span>
                    <span><strong>Columns:</strong> {data.columns.length}</span>
                    <span>&middot;</span>
                    <span><strong>Showing:</strong> {filteredRows.length} of {data.total_rows} rows</span>
                </div>

                {/* Filter bar */}
                {filterColumns.length > 0 && (
                    <div style={{ marginBottom: "14px", padding: "14px 16px", borderRadius: "6px", background: "#fafbfc", border: "1px solid #e2e6ed" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: filterColumns.length > 0 ? "10px" : "0" }}>
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "#2c3345" }}>
                                Filters ({activeFilterCount} active)
                            </span>
                            {activeFilterCount > 0 && (
                                <span
                                    style={{ fontSize: "13px", color: "#d64545", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                    onClick={() => this.clearAllFilters()}
                                >
                                    Clear All Filters
                                </span>
                            )}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {filterColumns.map((col) => {
                                var options = this.getFilterOptions(col.column_name);
                                var isActive = this.state.filters[col.column_name] ? true : false;
                                return (
                                    <div key={col.column_name} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px", flex: "1 1 180px", maxWidth: "300px" }}>
                                        <label style={{ fontSize: "12px", fontWeight: "600", color: "#052049", display: "flex", alignItems: "center", gap: "4px" }}>
                                            {col.column_name}
                                            {col.require_column_index && <span style={{ fontSize: "9px", background: "#d0dff5", color: "#1a3a6b", padding: "1px 5px", borderRadius: "3px" }}>required</span>}
                                        </label>
                                        <select
                                            style={{
                                                padding: "7px 10px", fontSize: "13px", borderRadius: "5px",
                                                border: isActive ? "2px solid #052049" : "1px solid #e2e6ed",
                                                background: isActive ? "#f0f5ff" : "#ffffff",
                                                color: "#2c3345"
                                            }}
                                            value={this.state.filters[col.column_name] || ""}
                                            onChange={(e) => this.handleFilterChange(col.column_name, e.target.value)}
                                        >
                                            <option value="">Show All ({options.length})</option>
                                            {options.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Report table */}
                <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "400px" }}>
                        <thead>
                            <tr>
                                {data.columns.map((col, i) => {
                                    var isFilterCol = col.is_filter || col.require_column_index;
                                    return (
                                        <th key={i}
                                            style={{
                                                textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e6ed",
                                                fontWeight: "600", whiteSpace: "nowrap",
                                                background: isFilterCol ? "#1a3a6b" : "#052049",
                                                color: "#ffffff"
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span>{col.column_name}</span>
                                                {isFilterCol && <span style={{ fontSize: "10px", background: "#ffffff", color: "#1a3a6b", padding: "1px 6px", borderRadius: "3px", fontWeight: "700" }}>FILTER</span>}
                                            </div>
                                            <div style={{ fontSize: "10px", color: "#aac4f0", marginTop: "1px" }}>
                                                {col.data_type}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={data.columns.length} style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>
                                        No rows match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, ri) => (
                                    <tr key={ri}>
                                        {data.columns.map((col, ci) => {
                                            var isFilterCol = col.is_filter || col.require_column_index;
                                            var isActiveFilter = this.state.filters[col.column_name] ? true : false;
                                            return (
                                                <td key={ci}
                                                    style={{
                                                        padding: "8px 12px", borderBottom: "1px solid #e2e6ed",
                                                        color: "#2c3345", whiteSpace: "nowrap", maxWidth: "220px",
                                                        overflow: "hidden", textOverflow: "ellipsis",
                                                        background: isActiveFilter ? "#e8f0fe" : (isFilterCol ? "#f0f5ff" : (ri % 2 === 0 ? "#fafbfc" : "#ffffff")),
                                                        fontWeight: isFilterCol ? "600" : "normal"
                                                    }}
                                                >
                                                    {row[col.column_name] || "\u2014"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    renderResult() {
        if (!this.state.result) return null;
        var isSuccess = this.state.result.type === "success";
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderRadius: "6px", fontSize: "14px", fontWeight: "500", marginTop: "20px", background: isSuccess ? "#eaf7f0" : "#fdf0f0", color: isSuccess ? "#2a6e4a" : "#d64545", border: isSuccess ? "1px solid #c2e3d3" : "1px solid #f0c2c2" }}>
                <span style={{ fontSize: "18px" }}>{isSuccess ? "\u2713" : "\u2717"}</span>
                <span>{this.state.result.message}</span>
            </div>
        );
    }

    render() {
        var content = [];

        content.push(
            <div key="topbar" style={desktopTopStyle}>
                <span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span>
            </div>
        );
        content.push(
            <div key="header" style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                <div style={{ marginLeft: "4%" }}>
                    <div style={{ float: "left", display: "grid", height: "100px" }}>
                        <img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" />
                    </div>
                    <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}>
                        <span style={{ margin: "auto" }}>- Expense Report Preview</span>
                    </div>
                </div>
            </div>
        );

        content.push(
            <ExpenseNav key="nav" activeKey="preview" />
        );

        content.push(
            <div key="main" style={{ maxWidth: "1100px", margin: "40px auto", padding: "0 20px" }}>
                {this.renderConfigList()}
                {this.renderPreview()}
                {this.renderResult()}
            </div>
        );

        return (
            <div style={{ minHeight: "500px", marginLeft: "0px", marginRight: "0px" }}>
                {content}
            </div>
        );
    }
}

var stepNumStyle = {
    width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff",
    fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center"
};

export default ExpenseReportPreview