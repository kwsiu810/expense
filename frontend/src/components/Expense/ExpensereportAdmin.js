import React from "react"
import Modal from "react-modal"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensenav.js'
import { properties } from '../../properties/properties.js'

const CONFIGS_ENDPOINT = `${properties.backend}expense/save_report_config`
const PREVIEW_ENDPOINT = `${properties.backend}expense/get_report_preview/`
const ACTION_LOG_ENDPOINT = `${properties.backend}expense/send_email/logs/`
const DELETE_LOG_ENDPOINT = `${properties.backend}expense/send_email/logs/`
const EXECUTE_ENDPOINT = `${properties.backend}expense/send_email`

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
            expandedRows: {},
            // Row selection
            selectedRows: {},
            // Email
            executingAction: false,
            actionResult: null,
            promptModal: null,
            filterOpen: null,
            filterSearch: {},
            deleteConfirmLogId: null
        };
        this.tableRef = React.createRef();
        this._closeFilter = (e) => { if (this.state.filterOpen && !e.target.closest('.searchable-filter')) this.setState({ filterOpen: null }); };
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
        document.addEventListener('mousedown', this._closeFilter);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this._closeFilter);
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
                    id: logs[i].id,
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

            this.setState({ activeConfigId: configId, reportData: data, filters: newFilters, expandedRows: {}, selectedRows: {}, actionResult: null, filterOpen: null, filterSearch: {} }, () => {
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
        this.setState({ filters: {}, filterOpen: null, filterSearch: {} });
    }

    getActionColorIndex(actionType) {
        // "Done" always gets green (index 1)
        if (actionType === 'Done') return 1;
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

    isRowDone(row) {
        var logs = this.getRowLogs(row);
        for (var i = 0; i < logs.length; i++) {
            if (logs[i].action_type === 'Done') return true;
        }
        return false;
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

    toggleRowSelect(ri) {
        var filteredRows = this.getFilteredRows();
        var row = filteredRows[ri];
        if (row && this.isRowDone(row)) return; // only skip Done rows

        var selected = Object.assign({}, this.state.selectedRows);
        if (selected[ri]) {
            delete selected[ri];
        } else {
            selected[ri] = true;
        }
        this.setState({ selectedRows: selected });
    }

    toggleSelectAll(filteredRows) {
        var selectedCount = Object.keys(this.state.selectedRows).length;
        var selectableCount = 0;
        for (var i = 0; i < filteredRows.length; i++) {
            if (!this.isRowDone(filteredRows[i])) selectableCount++;
        }
        if (selectedCount === selectableCount && selectableCount > 0) {
            this.setState({ selectedRows: {} });
        } else {
            var selected = {};
            for (var i = 0; i < filteredRows.length; i++) {
                if (!this.isRowDone(filteredRows[i])) {
                    selected[i] = true;
                }
            }
            this.setState({ selectedRows: selected });
        }
    }

    openSendEmail() {
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

        // Find first available config action ID (for credentials)
        var firstActionId = null;
        var activeId = this.state.activeConfigId;
        var configs = this.state.configs || [];
        for (var c = 0; c < configs.length; c++) {
            if (String(configs[c].id) === String(activeId)) {
                var actions = configs[c].actions || [];
                if (actions.length > 0) firstActionId = actions[0].id;
                break;
            }
        }
        if (!firstActionId) {
            var data = this.state.reportData;
            var config = data && data.config ? data.config : {};
            var rActions = config.actions || [];
            if (rActions.length > 0) firstActionId = rActions[0].id;
        }

        // Get available columns — open modal regardless, backend finds credentials
        var data = this.state.reportData;
        var columns = data && data.columns ? data.columns.map(function(c) { return c.column_name; }) : [];
        var csvCols = {};
        for (var ci = 0; ci < columns.length; ci++) { csvCols[columns[ci]] = true; }

        this.setState({
            promptModal: {
                configActionId: firstActionId,
                selectedData: selectedData,
                allColumns: columns,
                csvColumns: csvCols,
                email_to: '',
                cc: '',
                subject: '',
                body: ''
            }
        });
    }

    doSendAction(promptFields) {
        var pm = this.state.promptModal;
        if (!pm) return;

        // Build csv_columns array from selected columns
        var csvColumns = [];
        var allCols = pm.allColumns || [];
        var csvColMap = pm.csvColumns || {};
        for (var i = 0; i < allCols.length; i++) {
            if (csvColMap[allCols[i]]) csvColumns.push(allCols[i]);
        }

        this.setState({ executingAction: true, actionResult: null, promptModal: null });

        var payload = {
            config_id: this.state.activeConfigId,
            config_action_id: pm.configActionId || 0,
            selected_rows: pm.selectedData,
            csv_columns: csvColumns,
            employee_id: '',
            employee_name: 'Admin',
            employee_title: '',
            employee_department: '',
            base_url: window.location.origin,
            skip_shared_view: true,
            prompt_mode: true,
            prompt_action_type: 'Done',
            prompt_email_to: promptFields.email_to,
            prompt_cc: promptFields.cc || '',
            prompt_subject: promptFields.subject || '',
            prompt_body: promptFields.body || ''
        };

        fetch(EXECUTE_ENDPOINT, {
            method: "POST",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || "Action failed");
            return data;
        }))
        .then(data => {
            var resultType = data.failed > 0 ? "warning" : "success";
            this.setState({ executingAction: false, selectedRows: {}, actionResult: { type: resultType, message: data.message, shared_link: data.shared_link } }, () => {
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

    deleteActionLog(logId) {
        fetch(DELETE_LOG_ENDPOINT + logId, { method: "DELETE", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => {
            if (data.error) { this.setState({ actionResult: { type: "error", message: data.error }, deleteConfirmLogId: null }); return; }
            this.setState({ deleteConfirmLogId: null }, () => {
                this.fetchActionLogs(this.state.activeConfigId);
            });
        })
        .catch(err => this.setState({ actionResult: { type: "error", message: err.message }, deleteConfirmLogId: null }));
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
                        var isOpen = this.state.filterOpen === col.column_name;
                        var searchText = this.state.filterSearch[col.column_name] || '';
                        var filteredOpts = options;
                        if (searchText) {
                            var lower = searchText.toLowerCase();
                            filteredOpts = options.filter(function(o) { return o.toLowerCase().indexOf(lower) !== -1; });
                        }
                        var displayVal = isActive ? this.state.filters[col.column_name] : '';
                        return (
                            <div key={col.column_name} className="searchable-filter" style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px", flex: "1 1 180px", maxWidth: "300px", position: "relative" }}>
                                <label style={{ fontSize: "12px", fontWeight: "600", color: "#052049" }}>
                                    {col.column_name}
                                </label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        type="text"
                                        style={{
                                            width: "100%", padding: "7px 28px 7px 10px", fontSize: "13px", borderRadius: "5px", boxSizing: "border-box",
                                            border: isActive ? "2px solid #052049" : "1px solid #e2e6ed",
                                            background: isActive ? "#f0f5ff" : "#ffffff",
                                            color: "#2c3345"
                                        }}
                                        placeholder={"Show All (" + options.length + ")"}
                                        value={isOpen ? searchText : displayVal}
                                        onFocus={() => { var fs = Object.assign({}, this.state.filterSearch); fs[col.column_name] = ''; this.setState({ filterOpen: col.column_name, filterSearch: fs }); }}
                                        onChange={(e) => { var fs = Object.assign({}, this.state.filterSearch); fs[col.column_name] = e.target.value; this.setState({ filterSearch: fs }); }}
                                    />
                                    {isActive && (
                                        <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#d64545", cursor: "pointer", fontWeight: "700", lineHeight: "1" }}
                                            onClick={(e) => { e.stopPropagation(); this.handleFilterChange(col.column_name, ''); this.setState({ filterOpen: null }); }}>&times;</span>
                                    )}
                                </div>
                                {isOpen && (
                                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e6ed", borderRadius: "5px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: "220px", overflowY: "auto", marginTop: "2px" }}>
                                        <div style={{ padding: "6px 10px", fontSize: "12px", color: "#7c8ba1", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                                            onClick={() => { this.handleFilterChange(col.column_name, ''); this.setState({ filterOpen: null }); }}>
                                            Show All ({options.length})
                                        </div>
                                        {filteredOpts.length === 0 ? (
                                            <div style={{ padding: "10px", fontSize: "12px", color: "#7c8ba1", textAlign: "center" }}>No matches</div>
                                        ) : (
                                            filteredOpts.map((opt) => {
                                                var isSelected = this.state.filters[col.column_name] === opt;
                                                return (
                                                    <div key={opt}
                                                        style={{ padding: "6px 10px", fontSize: "12px", cursor: "pointer", color: isSelected ? "#052049" : "#2c3345", fontWeight: isSelected ? "600" : "400", background: isSelected ? "#f0f5ff" : "transparent" }}
                                                        onMouseEnter={(e) => { e.target.style.background = "#f0f5ff"; }}
                                                        onMouseLeave={(e) => { e.target.style.background = isSelected ? "#f0f5ff" : "transparent"; }}
                                                        onClick={() => { this.handleFilterChange(col.column_name, opt); this.setState({ filterOpen: null }); }}>
                                                        {opt}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
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
        var colSpan = data.columns.length + 2; // +1 expand +1 checkbox
        var selectedCount = Object.keys(this.state.selectedRows).length;

        // Count rows with actions
        var actionedCount = 0;
        for (var ac = 0; ac < filteredRows.length; ac++) {
            if (this.hasRowLogs(filteredRows[ac])) actionedCount++;
        }

        var allSelected = false;
        var doneCount = 0;
        for (var dc = 0; dc < filteredRows.length; dc++) {
            if (this.isRowDone(filteredRows[dc])) doneCount++;
        }
        var selectableCount = filteredRows.length - doneCount;
        if (selectableCount > 0 && selectedCount === selectableCount) allSelected = true;

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
                    {selectedCount > 0 && (
                        <span>&middot; <strong>{selectedCount} selected</strong></span>
                    )}
                </div>

                {this.renderFilters()}

                {/* Send Email button */}
                {selectedCount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#fafbfc", border: "1px solid #e2e6ed", flexWrap: "wrap" }}>
                        <button
                            style={{
                                padding: "9px 18px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px",
                                background: "#052049", color: "#fff",
                                cursor: this.state.executingAction ? "not-allowed" : "pointer",
                                opacity: this.state.executingAction ? 0.6 : 1
                            }}
                            onClick={() => this.openSendEmail()}
                            disabled={this.state.executingAction}
                        >
                            {this.state.executingAction ? "Processing..." : "\u2709 Send Email (" + selectedCount + ")"}
                        </button>
                        <span style={{ fontSize: "12px", color: "#7c8ba1", cursor: "pointer", textDecoration: "underline", marginLeft: "4px" }} onClick={() => this.setState({ selectedRows: {} })}>Clear Selection</span>
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
                        {this.state.actionResult.shared_link && (
                            <span style={{ fontSize: "12px" }}>Shared view: <a href={this.state.actionResult.shared_link} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: "600" }}>{this.state.actionResult.shared_link}</a></span>
                        )}
                    </div>
                )}

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
                                <th style={{ padding: "10px 8px", color: "#ffffff", fontWeight: "600", textAlign: "center", whiteSpace: "nowrap", width: "36px" }}>
                                    <input type="checkbox" checked={allSelected} onChange={() => this.toggleSelectAll(filteredRows)} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                </th>
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
                                    var isRowSelected = this.state.selectedRows[ri] ? true : false;
                                    var isDone = this.isRowDone(row);

                                    // Determine row background based on action status
                                    var actionColor = null;
                                    var rowBg = ri % 2 === 0 ? "#fafbfc" : "#ffffff";
                                    if (isDone) {
                                        actionColor = ACTION_COLORS[1]; // green
                                        rowBg = actionColor.light;
                                    } else if (hasLogs) {
                                        var firstActionType = rowLogs[0].action_type;
                                        var colorIdx = this.getActionColorIndex(firstActionType);
                                        actionColor = ACTION_COLORS[colorIdx];
                                        rowBg = actionColor.light;
                                    }
                                    if (!isDone && isRowSelected) {
                                        rowBg = "#e8f0fe";
                                    }

                                    var result = [];

                                    // Main row
                                    result.push(
                                        <tr key={'row-' + ri} style={{ cursor: hasLogs ? "pointer" : "default" }}>
                                            <td style={{ padding: "8px 8px", borderBottom: "1px solid #e2e6ed", textAlign: "center", background: rowBg }}
                                                onClick={(e) => { e.stopPropagation(); if (!isDone) this.toggleRowSelect(ri); }}>
                                                {isDone ? (
                                                    <span style={{ fontSize: "14px", color: "#0e7c3a", fontWeight: "700" }}>&#10003;</span>
                                                ) : (
                                                    <input type="checkbox" checked={isRowSelected} onChange={() => {}} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                                )}
                                            </td>
                                            <td style={{ padding: "8px 8px", borderBottom: "1px solid #e2e6ed", textAlign: "center", background: rowBg, position: "sticky", left: 0, zIndex: 1 }}
                                                onClick={() => { if (hasLogs) this.toggleExpand(ri); }}>
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
                                                <td colSpan={colSpan} style={{ padding: 0, borderBottom: "2px solid #052049", position: "relative" }}>
                                                    <div style={{ position: "sticky", left: 0, width: "calc(100vw - 120px)", maxWidth: "900px", padding: "12px 16px 12px 50px", background: "#f8f9fb", boxSizing: "border-box" }}>
                                                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#7c8ba1", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                                            Action History ({rowLogs.length})
                                                        </div>
                                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: "1px solid #e2e6ed" }}>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>Action</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>Employee</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>ID</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>Title</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>Department</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "left", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap" }}>Date</th>
                                                                    <th style={{ padding: "6px 10px", textAlign: "center", color: "#7c8ba1", fontWeight: "600", whiteSpace: "nowrap", width: "40px" }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rowLogs.map((log, li) => {
                                                                    var logColorIdx = this.getActionColorIndex(log.action_type);
                                                                    var logColor = ACTION_COLORS[logColorIdx];
                                                                    return (
                                                                        <tr key={li} style={{ borderBottom: "1px solid #eef0f4" }}>
                                                                            <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                                                                                <span style={{
                                                                                    display: "inline-block", padding: "2px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "700",
                                                                                    background: logColor.light, color: logColor.text, border: "1px solid " + logColor.text + "33"
                                                                                }}>
                                                                                    {log.action_type}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: "7px 10px", color: "#2c3345", fontWeight: "500", whiteSpace: "nowrap" }}>{log.employee_name || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1", whiteSpace: "nowrap" }}>{log.employee_id || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1", whiteSpace: "nowrap" }}>{log.employee_title || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1", whiteSpace: "nowrap" }}>{log.employee_department || "\u2014"}</td>
                                                                            <td style={{ padding: "7px 10px", color: "#7c8ba1", whiteSpace: "nowrap" }}>{this.formatDate(log.created_date)}</td>
                                                                            <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                                                                                {this.state.deleteConfirmLogId === log.id ? (
                                                                                    <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                                                                        <span style={{ fontSize: "10px", color: "#d64545", fontWeight: "600" }}>Delete?</span>
                                                                                        <span style={{ fontSize: "11px", color: "#fff", background: "#d64545", padding: "1px 8px", borderRadius: "3px", cursor: "pointer", fontWeight: "700" }}
                                                                                            onClick={(e) => { e.stopPropagation(); this.deleteActionLog(log.id); }}>Yes</span>
                                                                                        <span style={{ fontSize: "11px", color: "#7c8ba1", cursor: "pointer", fontWeight: "600" }}
                                                                                            onClick={(e) => { e.stopPropagation(); this.setState({ deleteConfirmLogId: null }); }}>No</span>
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ fontSize: "14px", color: "#d64545", cursor: "pointer", fontWeight: "700", opacity: 0.5 }}
                                                                                        onMouseEnter={(e) => { e.target.style.opacity = 1; }}
                                                                                        onMouseLeave={(e) => { e.target.style.opacity = 0.5; }}
                                                                                        onClick={(e) => { e.stopPropagation(); this.setState({ deleteConfirmLogId: log.id }); }}
                                                                                        title="Delete this action log">&times;</span>
                                                                                )}
                                                                            </td>
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

                {/* Send Email Modal */}
                <Modal
                    isOpen={this.state.promptModal !== null}
                    onRequestClose={() => this.setState({ promptModal: null })}
                    ariaHideApp={false}
                    style={{
                        overlay: { backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999 },
                        content: {
                            top: "50%", left: "50%", right: "auto", bottom: "auto",
                            transform: "translate(-50%, -50%)",
                            maxWidth: "520px", width: "90%", borderRadius: "10px",
                            padding: "28px", border: "none",
                            boxShadow: "0 8px 30px rgba(0,0,0,0.2)"
                        }
                    }}
                >
                    {this.state.promptModal && (
                        <div>
                            <div style={{ fontSize: "16px", fontWeight: "700", color: "#052049", marginBottom: "4px" }}>&#9993; Send Email</div>
                            <div style={{ fontSize: "12px", color: "#7c8ba1", marginBottom: "14px" }}>{this.state.promptModal.selectedData.length} row(s) selected &middot; CSV will be attached</div>

                            {/* CSV Column Selection */}
                            <div style={{ marginBottom: "14px", padding: "12px", background: "#f8f9fb", borderRadius: "6px", border: "1px solid #e2e6ed" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#052049" }}>CSV Columns ({(() => { var c = 0; var m = this.state.promptModal.csvColumns || {}; for (var k in m) { if (m[k]) c++; } return c; })()} of {(this.state.promptModal.allColumns || []).length})</label>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <span style={{ fontSize: "11px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                            onClick={() => { var cols = {}; var all = this.state.promptModal.allColumns || []; for (var i = 0; i < all.length; i++) cols[all[i]] = true; this.setState({ promptModal: Object.assign({}, this.state.promptModal, { csvColumns: cols }) }); }}>All</span>
                                        <span style={{ fontSize: "11px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                            onClick={() => { this.setState({ promptModal: Object.assign({}, this.state.promptModal, { csvColumns: {} }) }); }}>None</span>
                                    </div>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxHeight: "120px", overflowY: "auto" }}>
                                    {(this.state.promptModal.allColumns || []).map((col, ci) => {
                                        var isOn = this.state.promptModal.csvColumns[col] || false;
                                        return (
                                            <label key={ci} style={{
                                                display: "inline-flex", alignItems: "center", gap: "3px", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer",
                                                background: isOn ? "#e8f0fe" : "#f0f0f0", border: isOn ? "1px solid #052049" : "1px solid #e2e6ed",
                                                color: isOn ? "#052049" : "#999", fontWeight: isOn ? "600" : "400"
                                            }}>
                                                <input type="checkbox" checked={isOn}
                                                    onChange={() => { var cols = Object.assign({}, this.state.promptModal.csvColumns); cols[col] = !cols[col]; this.setState({ promptModal: Object.assign({}, this.state.promptModal, { csvColumns: cols }) }); }}
                                                    style={{ width: "11px", height: "11px", cursor: "pointer" }} />
                                                {col}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ marginBottom: "12px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Send To Email *</label>
                                <input
                                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }}
                                    type="email" placeholder="recipient@ucsf.edu" autoFocus
                                    value={this.state.promptModal.email_to}
                                    onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { email_to: e.target.value }) })}
                                />
                            </div>
                            <div style={{ marginBottom: "12px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>CC</label>
                                <input
                                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }}
                                    type="text" placeholder="cc1@ucsf.edu, cc2@ucsf.edu"
                                    value={this.state.promptModal.cc}
                                    onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { cc: e.target.value }) })}
                                />
                            </div>
                            <div style={{ marginBottom: "12px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Subject</label>
                                <input
                                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }}
                                    type="text" placeholder="Expense Report Data"
                                    value={this.state.promptModal.subject}
                                    onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { subject: e.target.value }) })}
                                />
                            </div>
                            <div style={{ marginBottom: "18px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Body (optional)</label>
                                <textarea
                                    style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box", minHeight: "80px", fontFamily: "inherit", resize: "vertical" }}
                                    placeholder="Optional message to include in the email..."
                                    value={this.state.promptModal.body}
                                    onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { body: e.target.value }) })}
                                />
                            </div>

                            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                <button
                                    style={{ padding: "10px 20px", fontSize: "13px", fontWeight: "600", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#fff", color: "#2c3345", cursor: "pointer" }}
                                    onClick={() => this.setState({ promptModal: null })}
                                >Cancel</button>
                                <button
                                    style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px", background: this.state.promptModal.email_to ? "#052049" : "#ccc", color: "#fff", cursor: this.state.promptModal.email_to ? "pointer" : "not-allowed" }}
                                    disabled={!this.state.promptModal.email_to || this.state.executingAction}
                                    onClick={() => {
                                        var pm = this.state.promptModal;
                                        this.doSendAction({ email_to: pm.email_to, cc: pm.cc, subject: pm.subject, body: pm.body });
                                    }}
                                >{this.state.executingAction ? "Sending..." : "Send Email"}</button>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>
        );
    }
}

export default ExpenseReportAdmin