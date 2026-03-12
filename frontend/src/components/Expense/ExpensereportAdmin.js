import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensenav.js'
import { properties } from '../../properties/properties.js'

const CONFIGS_ENDPOINT = `${properties.backend}expense/save_report_config`
const PREVIEW_ENDPOINT = `${properties.backend}expense/get_report_preview/`
const ACTION_LOG_ENDPOINT = `${properties.backend}expense/send_email/logs/`

const ACTION_COLORS = [
    { bg: "#052049", light: "#e8edf5", text: "#052049", check: "#052049" },
    { bg: "#0e7c3a", light: "#e6f5ec", text: "#0e7c3a", check: "#0e7c3a" },
    { bg: "#b45309", light: "#fef3e2", text: "#b45309", check: "#b45309" },
    { bg: "#7c3aed", light: "#f0ebff", text: "#7c3aed", check: "#7c3aed" },
    { bg: "#be185d", light: "#fce8f0", text: "#be185d", check: "#be185d" },
    { bg: "#0369a1", light: "#e6f3fb", text: "#0369a1", check: "#0369a1" },
    { bg: "#9f1239", light: "#fde8ec", text: "#9f1239", check: "#9f1239" },
    { bg: "#4338ca", light: "#eae8ff", text: "#4338ca", check: "#4338ca" }
];

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseReportAdmin extends React.Component {

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
            // Action logs: { rowHash: [ { employee_name, action_type, created_date, ... }, ... ] }
            actionLogsByHash: {},
            // Expanded rows
            expandedRows: {}
        };
        this.tableRef = React.createRef();
    }

    // djb2 hash matching backend
    hashRow(row) {
        var keys = Object.keys(row).sort();
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] === '_full_data' || keys[i] === '_content_id') continue;
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
            var configs = Array.isArray(response) ? response : (response.configs || []);
            this.setState({ configs: configs, loadingConfigs: false }, () => {
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

    fetchActionLogs(configId) {
        // Fetch ALL logs (no employee filter) for admin view
        fetch(ACTION_LOG_ENDPOINT + configId, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(response => {
            var logs = Array.isArray(response) ? response : [];
            // Group by row_hash - each hash gets an array of log entries
            var byHash = {};
            for (var i = 0; i < logs.length; i++) {
                var h = logs[i].row_hash;
                if (!byHash[h]) byHash[h] = [];
                byHash[h].push({
                    employee_name: logs[i].employee_name || '—',
                    employee_id: logs[i].employee_id || '',
                    employee_title: logs[i].employee_title || '',
                    employee_department: logs[i].employee_department || '',
                    action_type: logs[i].action_type || '',
                    created_date: logs[i].created_date || ''
                });
            }
            this.setState({ actionLogsByHash: byHash });
        })
        .catch(function(err) {
            console.log("Failed to load action logs:", err);
        });
    }

    switchReport(configId) {
        var currentFilters = Object.assign({}, this.state.filters);

        this.fetchReport(configId, (data) => {
            var newFilterColumns = this.getFilterColumnsFromData(data);
            var newFilters = {};

            for (var i = 0; i < newFilterColumns.length; i++) {
                var colName = newFilterColumns[i].column_name;
                if (currentFilters[colName]) {
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

            newFilters = this.validateFilters(newFilters, data);

            this.setState({ activeConfigId: configId, reportData: data, filters: newFilters, expandedRows: {} }, () => {
                setTimeout(() => this.checkScrollButtons(), 100);
                this.fetchActionLogs(configId);
            });
        });
    }

    validateFilters(filters, data) {
        if (!data || !data.rows) return filters;
        var filterKeys = Object.keys(filters);
        var validated = {};

        for (var f = 0; f < filterKeys.length; f++) {
            var colName = filterKeys[f];
            var value = filters[colName];
            var found = false;
            var prevKeys = Object.keys(validated);
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var match = true;
                for (var p = 0; p < prevKeys.length; p++) {
                    if (row[prevKeys[p]] !== validated[prevKeys[p]]) { match = false; break; }
                }
                if (match && row[colName] === value) { found = true; break; }
            }
            if (found) validated[colName] = value;
        }
        return validated;
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
        this.setState({ filters: filters });
    }

    clearAllFilters() {
        this.setState({ filters: {} });
    }

    getActionColorIndex(actionType) {
        var data = this.state.reportData;
        var config = data && data.config ? data.config : {};
        var actions = config.actions || [];
        for (var i = 0; i < actions.length; i++) {
            if (actions[i].action_type === actionType) return i % ACTION_COLORS.length;
        }
        return 0;
    }

    getRowLogs(row) {
        var hash = this.hashRow(row);
        return this.state.actionLogsByHash[hash] || [];
    }

    hasRowLogs(row) {
        return this.getRowLogs(row).length > 0;
    }

    toggleExpand(ri) {
        var expanded = Object.assign({}, this.state.expandedRows);
        if (expanded[ri]) {
            delete expanded[ri];
        } else {
            expanded[ri] = true;
        }
        this.setState({ expandedRows: expanded });
    }

    checkScrollButtons() {
        var el = this.tableRef.current;
        if (!el) return;
        this.setState({
            canScrollLeft: el.scrollLeft > 0,
            canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 2
        });
    }

    scrollTable(direction) {
        var el = this.tableRef.current;
        if (!el) return;
        var amount = 300;
        el.scrollBy({ left: direction * amount, behavior: "smooth" });
        setTimeout(() => this.checkScrollButtons(), 350);
    }

    formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        var colSpan = data.columns.length + 1; // +1 for expand column

        // Count rows with actions
        var actionedCount = 0;
        for (var ac = 0; ac < filteredRows.length; ac++) {
            if (this.hasRowLogs(filteredRows[ac])) actionedCount++;
        }

        return (
            <div>
                {/* Info bar */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "13px", color: "#052049", alignItems: "center" }}>
                    <span><strong>Report:</strong> {config.config_name}</span>
                    <span>&middot;</span>
                    <span><strong>Total rows:</strong> {filteredRows.length}</span>
                    <span>&middot;</span>
                    <span><strong>Actioned:</strong> {actionedCount}</span>
                    <span>&middot;</span>
                    <span><strong>Pending:</strong> {filteredRows.length - actionedCount}</span>
                </div>

                {this.renderFilters()}

                {/* Data table */}
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
                            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#052049", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>&larr;</span>
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
                            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#052049", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>&rarr;</span>
                        </div>
                    )}
                <div ref={this.tableRef} style={{ overflowX: "auto", borderRadius: "6px", border: "1px solid #e2e6ed" }} onScroll={() => this.checkScrollButtons()}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "#052049" }}>
                                <th style={{ padding: "10px 8px", color: "#ffffff", fontWeight: "600", textAlign: "center", whiteSpace: "nowrap", width: "40px", position: "sticky", left: 0, background: "#052049", zIndex: 1 }}>
                                    {/* expand column */}
                                </th>
                                {data.columns.map((col, ci) => (
                                    <th key={ci} style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", textAlign: "left", whiteSpace: "nowrap" }}>
                                        {col.column_name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={colSpan} style={{ padding: "30px 12px", textAlign: "center", color: "#7c8ba1" }}>
                                        No rows match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, ri) => {
                                    var rowLogs = this.getRowLogs(row);
                                    var hasLogs = rowLogs.length > 0;
                                    var isExpanded = this.state.expandedRows[ri] ? true : false;

                                    // Determine row background based on action status
                                    var actionColor = null;
                                    var rowBg = ri % 2 === 0 ? "#fafbfc" : "#ffffff";
                                    if (hasLogs) {
                                        // Use color of first (most recent) action
                                        var firstActionType = rowLogs[0].action_type;
                                        var colorIdx = this.getActionColorIndex(firstActionType);
                                        actionColor = ACTION_COLORS[colorIdx];
                                        rowBg = actionColor.light;
                                    }

                                    var result = [];

                                    // Main row
                                    result.push(
                                        <tr key={'row-' + ri} style={{ cursor: hasLogs ? "pointer" : "default" }} onClick={() => { if (hasLogs) this.toggleExpand(ri); }}>
                                            <td style={{ padding: "8px 8px", borderBottom: "1px solid #e2e6ed", textAlign: "center", background: rowBg, position: "sticky", left: 0, zIndex: 1 }}>
                                                {hasLogs ? (
                                                    <span style={{
                                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                                        width: "22px", height: "22px", borderRadius: "4px", fontSize: "14px", fontWeight: "700",
                                                        background: isExpanded ? "#052049" : "#e2e6ed",
                                                        color: isExpanded ? "#fff" : "#052049",
                                                        transition: "all 0.15s"
                                                    }}>
                                                        {isExpanded ? "\u2212" : "+"}
                                                    </span>
                                                ) : (
                                                    <span style={{ display: "inline-block", width: "22px", height: "22px" }}></span>
                                                )}
                                            </td>
                                            {data.columns.map((col, ci) => (
                                                <td key={ci} style={{
                                                    padding: "8px 12px", borderBottom: "1px solid #e2e6ed",
                                                    color: hasLogs ? actionColor.text : "#2c3345",
                                                    fontWeight: hasLogs ? "500" : "400",
                                                    whiteSpace: "nowrap", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis",
                                                    background: rowBg
                                                }}>
                                                    {row[col.column_name] || "\u2014"}
                                                </td>
                                            ))}
                                        </tr>
                                    );

                                    // Expanded action log rows
                                    if (isExpanded && hasLogs) {
                                        result.push(
                                            <tr key={'detail-' + ri}>
                                                <td colSpan={colSpan} style={{ padding: 0, borderBottom: "2px solid #052049" }}>
                                                    <div style={{ margin: "0", padding: "12px 16px 12px 50px", background: "#f8f9fb" }}>
                                                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#7c8ba1", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                                            Action History ({rowLogs.length})
                                                        </div>
                                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: "1px solid #e2e6ed" }}>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>Action</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>Employee</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>ID</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>Title</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>Department</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600" }}>Date</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rowLogs.map((log, li) => {
                                                                    var logColorIdx = this.getActionColorIndex(log.action_type);
                                                                    var logColor = ACTION_COLORS[logColorIdx];
                                                                    return (
                                                                        <tr key={li} style={{ borderBottom: "1px solid #eef0f4" }}>
                                                                            <td style={{ padding: "7px 10px" }}>
                                                                                <span style={{
                                                                                    display: "inline-block", padding: "2px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "700",
                                                                                    background: logColor.light, color: logColor.text, border: "1px solid " + logColor.text + "33"
                                                                                }}>
                                                                                    {log.action_type}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: "7px 10px", color: "#2c3345", fontWeight: "500" }}>{log.employee_name || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1" }}>{log.employee_id || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1" }}>{log.employee_title || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1" }}>{log.employee_department || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1" }}>{this.formatDate(log.created_date)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return result;
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
                            <span style={{ margin: "auto" }}>- Expense Reports Admin</span>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <ExpenseNav activeKey="admin" />

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

export default ExpenseReportAdmin