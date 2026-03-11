import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const CONFIGS_ENDPOINT = `${properties.backend}expense/save_report_config`
const PREVIEW_ENDPOINT = `${properties.backend}expense/get_report_preview/`
const EXECUTE_ENDPOINT = `${properties.backend}expense/send_email`
const ACTION_LOG_ENDPOINT = `${properties.backend}expense/send_email/logs/`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseReports extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            configs: [],
            loadingConfigs: true,
            activeConfigId: null,
            reportData: null,
            loadingReport: false,
            filters: {},
            reportCache: {},
            canScrollLeft: false,
            canScrollRight: false,
            selectedRows: {},
            executingAction: false,
            actionResult: null,
            actionedHashes: {},
            actionLogCache: {},
            employeeInfo: {}
        };
        this.tableRef = React.createRef();
    }

    // djb2 hash matching backend
    hashRow(row) {
        var keys = Object.keys(row).sort();
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            parts.push(keys[i] + ':' + (row[keys[i]] || ''));
        }
        var str = parts.join('|');
        var hash = 5381;
        for (var j = 0; j < str.length; j++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(j);
            hash = hash & hash;
        }
        return String(Math.abs(hash));
    }

    fetchActionLogs(configId) {
        var empId = this.state.employeeInfo.employee_id || '';
        var url = ACTION_LOG_ENDPOINT + configId;
        if (empId) url += '?employee_id=' + encodeURIComponent(empId);

        fetch(url, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(response => {
            var hashes = {};
            var logs = Array.isArray(response) ? response : [];
            for (var i = 0; i < logs.length; i++) {
                hashes[logs[i].row_hash] = {
                    employee_name: logs[i].employee_name || '',
                    employee_id: logs[i].employee_id || '',
                    created_date: logs[i].created_date || ''
                };
            }
            var cache = Object.assign({}, this.state.actionLogCache);
            cache[configId] = hashes;
            this.setState({ actionedHashes: hashes, actionLogCache: cache });
        })
        .catch(function(err) {
            console.log("Failed to load action logs:", err);
        });
    }

    componentDidMount() {
        this.fetchConfigs();
        this._handleResize = () => this.checkScrollButtons();
        window.addEventListener('resize', this._handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this._handleResize);
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
            var configs = Array.isArray(response) ? response : (response.configs || []);
            var employeeInfo = response.employee || {};
            this.setState({ configs: configs, loadingConfigs: false, employeeInfo: employeeInfo }, () => {
                if (configs.length > 0) {
                    this.switchReport(configs[0].id);
                }
            });
        })
        .catch(err => {
            console.log("Failed to load configs:", err);
            this.setState({ configs: [], loadingConfigs: false });
        });
    }

    fetchReport(configId, callback) {
        // Check cache first
        if (this.state.reportCache[configId]) {
            callback(this.state.reportCache[configId]);
            return;
        }

        this.setState({ loadingReport: true });

        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        fetch(PREVIEW_ENDPOINT + configId, {
            method: "GET",
            headers: headers
        })
        .then(response => response.json())
        .then(response => {
            var cache = Object.assign({}, this.state.reportCache);
            cache[configId] = response;
            this.setState({ reportCache: cache, loadingReport: false }, () => {
                callback(response);
            });
        })
        .catch(err => {
            console.log("Failed to load report:", err);
            this.setState({ loadingReport: false, reportData: null });
        });
    }

    switchReport(configId) {
        var currentFilters = Object.assign({}, this.state.filters);

        this.fetchReport(configId, (data) => {
            // Carry over filters: keep values for matching column names if value exists in new data
            var newFilterColumns = this.getFilterColumnsFromData(data);
            var newFilters = {};

            for (var i = 0; i < newFilterColumns.length; i++) {
                var colName = newFilterColumns[i].column_name;
                if (currentFilters[colName]) {
                    // Check if the value exists in the new report's data
                    var exists = false;
                    var rows = data.rows || [];
                    for (var r = 0; r < rows.length; r++) {
                        if (rows[r][colName] === currentFilters[colName]) {
                            exists = true;
                            break;
                        }
                    }
                    if (exists) {
                        newFilters[colName] = currentFilters[colName];
                    }
                }
            }

            // Validate carried-over filters (cascading: remove invalid combos)
            newFilters = this.validateFilters(newFilters, data);

            this.setState({ activeConfigId: configId, reportData: data, filters: newFilters, selectedRows: {}, actionResult: null }, () => {
                setTimeout(() => this.checkScrollButtons(), 100);
                // Load action logs (use cache if available)
                if (this.state.actionLogCache[configId]) {
                    this.setState({ actionedHashes: this.state.actionLogCache[configId] });
                } else {
                    this.fetchActionLogs(configId);
                }
            });
        });
    }

    validateFilters(filters, data) {
        var rows = data ? data.rows || [] : [];
        var changed = true;
        var result = Object.assign({}, filters);

        while (changed) {
            changed = false;
            var keys = Object.keys(result);
            for (var f = 0; f < keys.length; f++) {
                var col = keys[f];
                var val = result[col];

                var validValues = {};
                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var match = true;
                    for (var k = 0; k < keys.length; k++) {
                        if (keys[k] === col) continue;
                        if (result[keys[k]] && row[keys[k]] !== result[keys[k]]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        var v = row[col] || "";
                        if (v) validValues[v] = true;
                    }
                }

                if (val && !validValues[val]) {
                    delete result[col];
                    changed = true;
                    break;
                }
            }
        }
        return result;
    }

    getFilterColumnsFromData(data) {
        if (!data || !data.columns) return [];
        var filterCols = [];
        for (var i = 0; i < data.columns.length; i++) {
            var col = data.columns[i];
            if (col.is_filter || col.require_column_index) {
                filterCols.push(col);
            }
        }
        return filterCols;
    }

    getFilterColumns() {
        return this.getFilterColumnsFromData(this.state.reportData);
    }

    getFilterOptions(columnName) {
        if (!this.state.reportData || !this.state.reportData.rows) return [];

        var activeFilters = this.state.filters;
        var filterKeys = Object.keys(activeFilters);
        var rows = this.state.reportData.rows;

        var filteredRows = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var match = true;
            for (var f = 0; f < filterKeys.length; f++) {
                var colName = filterKeys[f];
                if (colName === columnName) continue;
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
        if (!this.state.reportData || !this.state.reportData.rows) return [];

        var activeFilters = this.state.filters;
        var filterKeys = Object.keys(activeFilters);
        if (filterKeys.length === 0) return this.state.reportData.rows;

        var filtered = [];
        for (var i = 0; i < this.state.reportData.rows.length; i++) {
            var row = this.state.reportData.rows[i];
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

    handleFilterChange(columnName, value) {
        var filters = Object.assign({}, this.state.filters);
        if (value) {
            filters[columnName] = value;
        } else {
            delete filters[columnName];
        }

        filters = this.validateFilters(filters, this.state.reportData);
        this.setState({ filters: filters, selectedRows: {} });
    }

    isRowActioned(row) {
        var hash = this.hashRow(row);
        return this.state.actionedHashes[hash] ? true : false;
    }

    getRowActionInfo(row) {
        var hash = this.hashRow(row);
        return this.state.actionedHashes[hash] || null;
    }

    toggleRowSelect(rowIndex) {
        var filteredRows = this.getFilteredRows();
        var row = filteredRows[rowIndex];
        if (row && this.isRowActioned(row)) return; // skip actioned rows

        var selected = Object.assign({}, this.state.selectedRows);
        if (selected[rowIndex]) {
            delete selected[rowIndex];
        } else {
            selected[rowIndex] = true;
        }
        this.setState({ selectedRows: selected });
    }

    toggleSelectAll(filteredRows) {
        var selectedCount = Object.keys(this.state.selectedRows).length;
        var selectableCount = 0;
        var selected = {};
        for (var i = 0; i < filteredRows.length; i++) {
            if (!this.isRowActioned(filteredRows[i])) {
                selectableCount++;
            }
        }
        if (selectedCount === selectableCount && selectableCount > 0) {
            this.setState({ selectedRows: {} });
        } else {
            for (var i = 0; i < filteredRows.length; i++) {
                if (!this.isRowActioned(filteredRows[i])) {
                    selected[i] = true;
                }
            }
            this.setState({ selectedRows: selected });
        }
    }

    executeAction() {
        var filteredRows = this.getFilteredRows();
        var selectedIndices = Object.keys(this.state.selectedRows);

        if (selectedIndices.length === 0) {
            this.setState({ actionResult: { type: "error", message: "Please select at least one row." } });
            return;
        }

        var selectedData = [];
        for (var i = 0; i < selectedIndices.length; i++) {
            var idx = parseInt(selectedIndices[i]);
            if (filteredRows[idx]) {
                selectedData.push(filteredRows[idx]);
            }
        }

        this.setState({ executingAction: true, actionResult: null });

        fetch(EXECUTE_ENDPOINT, {
            method: "POST",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                config_id: this.state.activeConfigId,
                selected_rows: selectedData
            })
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || "Action failed");
            return data;
        }))
        .then(data => {
            var resultType = data.failed > 0 ? "warning" : "success";
            // Clear cache and re-fetch logs to disable actioned rows
            var cache = Object.assign({}, this.state.actionLogCache);
            delete cache[this.state.activeConfigId];
            this.setState({ executingAction: false, selectedRows: {}, actionResult: { type: resultType, message: data.message, errors: data.errors }, actionLogCache: cache }, () => {
                this.fetchActionLogs(this.state.activeConfigId);
            });
        })
        .catch(err => {
            this.setState({ executingAction: false, actionResult: { type: "error", message: err.message || "Action failed." } });
        });
    }

    checkScrollButtons() {
        var el = this.tableRef.current;
        if (!el) return;
        this.setState({
            canScrollLeft: el.scrollLeft > 0,
            canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 1
        });
    }

    scrollTable(direction) {
        var el = this.tableRef.current;
        if (!el) return;
        var amount = 300;
        el.scrollBy({ left: direction * amount, behavior: "smooth" });
        setTimeout(() => this.checkScrollButtons(), 350);
    }

    clearAllFilters() {
        this.setState({ filters: {} });
    }

    renderTabs() {
        if (this.state.loadingConfigs) {
            return (
                <div style={{ padding: "14px 4%", background: "#f0f2f5", borderBottom: "1px solid #e2e6ed", fontSize: "13px", color: "#7c8ba1" }}>
                    Loading reports...
                </div>
            );
        }

        if (this.state.configs.length === 0) {
            return (
                <div style={{ padding: "14px 4%", background: "#f0f2f5", borderBottom: "1px solid #e2e6ed", fontSize: "13px", color: "#7c8ba1" }}>
                    No report configurations found.
                </div>
            );
        }

        return (
            <div style={{ background: "#f0f2f5", borderBottom: "1px solid #e2e6ed", padding: "0 4%", overflowX: "auto", whiteSpace: "nowrap" }}>
                {this.state.configs.map((cfg) => {
                    var isActive = this.state.activeConfigId === cfg.id;
                    return (
                        <span key={cfg.id}
                            style={{
                                display: "inline-block", padding: "12px 20px", fontSize: "13px", fontWeight: isActive ? "700" : "500",
                                color: isActive ? "#ffffff" : "#052049",
                                background: isActive ? "#052049" : "transparent",
                                cursor: isActive ? "default" : "pointer",
                                borderBottom: isActive ? "2px solid #052049" : "2px solid transparent",
                                transition: "all 0.15s", userSelect: "none"
                            }}
                            onClick={() => { if (!isActive) this.switchReport(cfg.id); }}
                        >
                            {cfg.config_name}
                        </span>
                    );
                })}
            </div>
        );
    }

    renderFilters() {
        var filterColumns = this.getFilterColumns();
        if (filterColumns.length === 0) return null;

        var activeFilterCount = Object.keys(this.state.filters).length;

        return (
            <div style={{ marginBottom: "20px", padding: "14px 16px", borderRadius: "6px", background: "#fafbfc", border: "1px solid #e2e6ed" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#2c3345" }}>
                        Filters ({activeFilterCount} active)
                    </span>
                    {activeFilterCount > 0 && (
                        <span
                            style={{ fontSize: "13px", color: "#d64545", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => this.clearAllFilters()}
                        >
                            Clear All
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {filterColumns.map((col) => {
                        var options = this.getFilterOptions(col.column_name);
                        var isActive = this.state.filters[col.column_name] ? true : false;
                        return (
                            <div key={col.column_name} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px", flex: "1 1 180px", maxWidth: "300px" }}>
                                <label style={{ fontSize: "12px", fontWeight: "600", color: "#052049" }}>
                                    {col.column_name}
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
        );
    }

    renderReport() {
        if (this.state.loadingReport) {
            return (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    Loading report...
                </div>
            );
        }

        if (!this.state.reportData || !this.state.reportData.columns || this.state.reportData.columns.length === 0) {
            return (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    {this.state.activeConfigId ? "No data available for this report." : "Select a report tab to view data."}
                </div>
            );
        }

        var data = this.state.reportData;
        var config = data.config || {};
        var filteredRows = this.getFilteredRows();
        var hasAction = config.action_id ? true : false;
        var buttonLabel = config.action_button_label || "Execute Action";
        var selectedCount = Object.keys(this.state.selectedRows).length;
        var selectableCount = 0;
        for (var sc = 0; sc < filteredRows.length; sc++) {
            if (!this.isRowActioned(filteredRows[sc])) selectableCount++;
        }
        var allSelected = selectableCount > 0 && selectedCount === selectableCount;

        return (
            <div>
                {/* Info bar */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "13px", color: "#052049", alignItems: "center" }}>
                    <span><strong>Report:</strong> {config.config_name}</span>
                    <span>&middot;</span>
                    <span><strong>Showing:</strong> {filteredRows.length} of {data.total_rows} rows</span>
                    {hasAction && selectedCount > 0 && (
                        <span>&middot; <strong>{selectedCount} selected</strong></span>
                    )}
                </div>

                {this.renderFilters()}

                {/* Action bar */}
                {hasAction && selectedCount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#fafbfc", border: "1px solid #e2e6ed" }}>
                        <button
                            style={{
                                padding: "9px 20px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px",
                                background: "#052049", color: "#fff", cursor: this.state.executingAction ? "not-allowed" : "pointer",
                                opacity: this.state.executingAction ? 0.6 : 1
                            }}
                            onClick={() => this.executeAction()}
                            disabled={this.state.executingAction}
                        >
                            {this.state.executingAction ? "Processing..." : buttonLabel + " (" + selectedCount + ")"}
                        </button>
                        <span style={{ fontSize: "12px", color: "#7c8ba1", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.setState({ selectedRows: {} })}>Clear Selection</span>
                    </div>
                )}

                {/* Action result */}
                {this.state.actionResult && (
                    <div style={{
                        display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px", borderRadius: "6px", fontSize: "13px", marginBottom: "14px",
                        background: this.state.actionResult.type === "success" ? "#eaf7f0" : (this.state.actionResult.type === "warning" ? "#fff8e1" : "#fdf0f0"),
                        color: this.state.actionResult.type === "success" ? "#2a6e4a" : (this.state.actionResult.type === "warning" ? "#8a6d00" : "#d64545"),
                        border: this.state.actionResult.type === "success" ? "1px solid #c2e3d3" : (this.state.actionResult.type === "warning" ? "1px solid #ffe082" : "1px solid #f0c2c2")
                    }}>
                        <span style={{ fontWeight: "600" }}>{this.state.actionResult.message}</span>
                        {this.state.actionResult.errors && this.state.actionResult.errors.length > 0 && (
                            <div style={{ fontSize: "12px", marginTop: "4px" }}>
                                {this.state.actionResult.errors.map((err, i) => (
                                    <div key={i}>&bull; {err}</div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Data table with scroll arrows */}
                <div style={{ position: "relative" }}>
                    {this.state.canScrollLeft && (
                        <div
                            style={{
                                position: "absolute", left: 0, top: 0, bottom: 0, width: "36px", zIndex: 2,
                                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))"
                            }}
                            onClick={() => this.scrollTable(-1)}
                        >
                            <span style={{
                                width: "28px", height: "28px", borderRadius: "50%", background: "#052049", color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                            }}>&#9664;</span>
                        </div>
                    )}
                    {this.state.canScrollRight && (
                        <div
                            style={{
                                position: "absolute", right: 0, top: 0, bottom: 0, width: "36px", zIndex: 2,
                                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                background: "linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))"
                            }}
                            onClick={() => this.scrollTable(1)}
                        >
                            <span style={{
                                width: "28px", height: "28px", borderRadius: "50%", background: "#052049", color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
                            }}>&#9654;</span>
                        </div>
                    )}
                    <div ref={this.tableRef} style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}
                        onScroll={() => this.checkScrollButtons()}
                    >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "400px" }}>
                        <thead>
                            <tr>
                                {hasAction && (
                                    <th style={{ padding: "10px 8px", borderBottom: "2px solid #e2e6ed", background: "#052049", textAlign: "center", width: "36px" }}>
                                        <input type="checkbox" checked={allSelected} onChange={() => this.toggleSelectAll(filteredRows)} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                    </th>
                                )}
                                {data.columns.map((col, i) => {
                                    return (
                                        <th key={i}
                                            style={{
                                                textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e6ed",
                                                fontWeight: "600", whiteSpace: "nowrap",
                                                background: "#052049",
                                                color: "#ffffff"
                                            }}
                                        >
                                            {col.column_name}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={data.columns.length + (hasAction ? 1 : 0)} style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>
                                        No rows match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, ri) => {
                                    var isRowSelected = this.state.selectedRows[ri] ? true : false;
                                    var isActioned = hasAction && this.isRowActioned(row);
                                    var actionInfo = isActioned ? this.getRowActionInfo(row) : null;
                                    var rowBg = isActioned ? "#f0f7f0" : (isRowSelected ? "#e8f0fe" : (ri % 2 === 0 ? "#fafbfc" : "#ffffff"));
                                    return (
                                    <tr key={ri} title={isActioned ? ("Completed by " + (actionInfo.employee_name || actionInfo.employee_id || "unknown")) : ""}>
                                        {hasAction && (
                                            <td style={{ padding: "8px 8px", borderBottom: "1px solid #e2e6ed", textAlign: "center", background: rowBg }}>
                                                {isActioned ? (
                                                    <span title={"Completed by " + (actionInfo.employee_name || "") + (actionInfo.created_date ? " on " + new Date(actionInfo.created_date).toLocaleDateString() : "")} style={{ fontSize: "14px", color: "#2a6e4a" }}>&#10003;</span>
                                                ) : (
                                                    <input type="checkbox" checked={isRowSelected} onChange={() => this.toggleRowSelect(ri)} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                                )}
                                            </td>
                                        )}
                                        {data.columns.map((col, ci) => {
                                            return (
                                                <td key={ci}
                                                    style={{
                                                        padding: "8px 12px", borderBottom: "1px solid #e2e6ed",
                                                        color: isActioned ? "#7c8ba1" : "#2c3345", whiteSpace: "nowrap", maxWidth: "220px",
                                                        overflow: "hidden", textOverflow: "ellipsis",
                                                        background: rowBg
                                                    }}
                                                >
                                                    {row[col.column_name] || "\u2014"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <div style={{ minHeight: "500px" }}>
                {/* Top bar */}
                <div style={desktopTopStyle}>
                    <span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span>
                </div>

                {/* Header */}
                <div style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                    <div style={{ marginLeft: "4%" }}>
                        <div style={{ float: "left", display: "grid", height: "100px" }}>
                            <img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" />
                        </div>
                        <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}>
                            <span style={{ margin: "auto" }}>- Expense Reports</span>
                        </div>
                    </div>
                </div>

                {/* Report tabs */}
                {this.renderTabs()}

                {/* Main content */}
                <div style={{ maxWidth: "1200px", margin: "30px auto", padding: "0 20px" }}>
                    {this.renderReport()}
                </div>
            </div>
        );
    }
}

export default ExpenseReports