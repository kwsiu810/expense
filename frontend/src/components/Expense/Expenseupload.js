import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const EXPENSES_ENDPOINT = `${properties.backend}expense/get_expense_table`
const UPLOAD_ENDPOINT = `${properties.backend}expense/upload_expense`
const DB_CONN_ENDPOINT = `${properties.backend}expense/db_connection`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseUpload extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            sourceMode: 'csv',
            file: null, csvHeaders: [], csvPreview: [], csvAllRows: [],
            dbConnections: [], loadingConnections: false,
            selectedConnectionId: "", selectedConnection: null,
            databases: [], loadingDatabases: false, selectedDatabase: "",
            tables: [], loadingTables: false, selectedSchema: "", selectedTable: "",
            dbPreview: null, loadingPreview: false, fetchingData: false,
            dbHeaders: [], dbAllRows: [],
            // Column selection: { colName: true/false }
            dbSelectedColumns: {},
            // Filter conditions: [{ column, operator, value }, ...]
            dbFilters: [],
            expenses: [], selectedExpense: "", isNewExpense: false, newExpenseName: "",
            loading: false, loadingExpenses: true, result: null, dragOver: false
        };
        this.fileInputRef = React.createRef();
    }

    componentDidMount() { this.fetchExpenses(); }

    fetchExpenses() {
        fetch(EXPENSES_ENDPOINT, { method: "GET", headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } })
        .then(r => r.json())
        .then(response => {
            var hasExpenses = Array.isArray(response) && response.length > 0;
            this.setState({ expenses: response, loadingExpenses: false, isNewExpense: !hasExpenses });
        })
        .catch(() => this.setState({ expenses: [], loadingExpenses: false, isNewExpense: true }));
    }

    parseLine(line) {
        var result = []; var current = ""; var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
            else { current += ch; }
        }
        result.push(current.trim()); return result;
    }

    parseCSV(text) {
        var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
        if (lines.length === 0) return;
        var headers = this.parseLine(lines[0]);
        var allRows = lines.slice(1).map((line) => this.parseLine(line));
        this.setState({ csvHeaders: headers, csvPreview: allRows.slice(0, 5), csvAllRows: allRows });
    }

    handleFile(f) {
        if (!f) return;
        if (!f.name.toLowerCase().endsWith(".csv")) { this.setState({ result: { type: "error", message: "Please upload a .csv file" } }); return; }
        this.setState({ file: f, result: null });
        var reader = new FileReader();
        reader.onload = (e) => this.parseCSV(e.target.result);
        reader.readAsText(f);
    }

    handleDrop(e) {
        e.preventDefault(); this.setState({ dragOver: false });
        this.handleFile(e.dataTransfer.files ? e.dataTransfer.files[0] : null);
    }

    // ===================== DATABASE METHODS =====================

    fetchDbConnections() {
        this.setState({ loadingConnections: true });
        fetch(DB_CONN_ENDPOINT, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => this.setState({ dbConnections: Array.isArray(data) ? data : [], loadingConnections: false }))
        .catch(() => this.setState({ dbConnections: [], loadingConnections: false }));
    }

    selectConnection(connId) {
        if (!connId) { this.setState({ selectedConnectionId: "", selectedConnection: null, databases: [], tables: [], selectedDatabase: "", selectedTable: "", selectedSchema: "", dbPreview: null, dbHeaders: [], dbAllRows: [], dbSelectedColumns: {}, dbFilters: [] }); return; }
        this.setState({ selectedConnectionId: connId, selectedConnection: null, databases: [], tables: [], selectedDatabase: "", selectedTable: "", selectedSchema: "", dbPreview: null, dbHeaders: [], dbAllRows: [], dbSelectedColumns: {}, dbFilters: [], loadingDatabases: true });

        fetch(DB_CONN_ENDPOINT + '/' + connId, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(conn => {
            this.setState({ selectedConnection: conn });
            fetch(DB_CONN_ENDPOINT + '/databases', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn) })
            .then(r => r.json())
            .then(dbs => this.setState({ databases: Array.isArray(dbs) ? dbs : [], loadingDatabases: false }))
            .catch(() => this.setState({ databases: [], loadingDatabases: false }));
        })
        .catch(() => this.setState({ loadingDatabases: false }));
    }

    selectDatabase(dbName) {
        if (!dbName) { this.setState({ selectedDatabase: "", tables: [], selectedTable: "", selectedSchema: "", dbPreview: null, dbHeaders: [], dbAllRows: [], dbSelectedColumns: {}, dbFilters: [] }); return; }
        this.setState({ selectedDatabase: dbName, tables: [], selectedTable: "", selectedSchema: "", dbPreview: null, dbHeaders: [], dbAllRows: [], dbSelectedColumns: {}, dbFilters: [], loadingTables: true });

        fetch(DB_CONN_ENDPOINT + '/tables', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, this.state.selectedConnection, { database: dbName })) })
        .then(r => r.json())
        .then(tables => this.setState({ tables: Array.isArray(tables) ? tables : [], loadingTables: false }))
        .catch(() => this.setState({ tables: [], loadingTables: false }));
    }

    selectTable(schemaTable) {
        if (!schemaTable) { this.setState({ selectedTable: "", selectedSchema: "", dbPreview: null, dbHeaders: [], dbAllRows: [], dbSelectedColumns: {}, dbFilters: [] }); return; }
        var parts = schemaTable.split('.'); var schema = parts[0]; var table = parts[1];
        this.setState({ selectedSchema: schema, selectedTable: table, dbPreview: null, dbHeaders: [], dbAllRows: [], loadingPreview: true });

        fetch(DB_CONN_ENDPOINT + '/preview', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, this.state.selectedConnection, { database: this.state.selectedDatabase, schema: schema, table: table })) })
        .then(r => r.json())
        .then(data => { if (data.error) { this.setState({ loadingPreview: false, result: { type: "error", message: data.error } }); } else { this.setState({ dbPreview: data, loadingPreview: false }); } })
        .catch(err => this.setState({ loadingPreview: false, result: { type: "error", message: err.message } }));
    }

    fetchTableData() {
        this.setState({ fetchingData: true, result: null });
        fetch(DB_CONN_ENDPOINT + '/fetch', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, this.state.selectedConnection, { database: this.state.selectedDatabase, schema: this.state.selectedSchema, table: this.state.selectedTable })) })
        .then(r => r.json())
        .then(data => {
            if (data.error) { this.setState({ fetchingData: false, result: { type: "error", message: data.error } }); return; }
            var headers = data.columns || [];
            var rows = (data.rows || []).map(function(row) { return headers.map(function(h) { return row[h] || ''; }); });
            // Initialize all columns as selected
            var selectedCols = {};
            for (var i = 0; i < headers.length; i++) { selectedCols[headers[i]] = true; }
            this.setState({ fetchingData: false, dbHeaders: headers, dbAllRows: rows, dbSelectedColumns: selectedCols, dbFilters: [],
                result: { type: "success", message: "Fetched " + rows.length + " rows with " + headers.length + " columns from " + this.state.selectedSchema + "." + this.state.selectedTable } });
        })
        .catch(err => this.setState({ fetchingData: false, result: { type: "error", message: err.message } }));
    }

    // ===================== DB COLUMN & FILTER =====================

    toggleDbColumn(colName) {
        var sel = Object.assign({}, this.state.dbSelectedColumns);
        sel[colName] = !sel[colName];
        this.setState({ dbSelectedColumns: sel });
    }

    toggleAllDbColumns(selectAll) {
        var sel = {};
        for (var i = 0; i < this.state.dbHeaders.length; i++) {
            sel[this.state.dbHeaders[i]] = selectAll;
        }
        this.setState({ dbSelectedColumns: sel });
    }

    addFilterCondition() {
        var conditions = this.state.dbFilters.slice();
        conditions.push({ column: this.state.dbHeaders[0] || '', operator: '=', value: '' });
        this.setState({ dbFilters: conditions });
    }

    updateFilterCondition(index, field, value) {
        var conditions = this.state.dbFilters.slice();
        conditions[index] = Object.assign({}, conditions[index]);
        conditions[index][field] = value;
        this.setState({ dbFilters: conditions });
    }

    removeFilterCondition(index) {
        var conditions = this.state.dbFilters.slice();
        conditions.splice(index, 1);
        this.setState({ dbFilters: conditions });
    }

    clearAllDbFilters() {
        this.setState({ dbFilters: [] });
    }

    evaluateCondition(cellValue, operator, filterValue) {
        var cv = (cellValue || '').toString();

        // These operators don't need a value
        if (operator === 'is_empty') return cv.trim() === '';
        if (operator === 'is_not_empty') return cv.trim() !== '';

        // Skip conditions with no value set
        if (!filterValue && filterValue !== '0') return true;

        var fv = filterValue.toString();

        // Try numeric comparison for > < >= <=
        var cvNum = parseFloat(cv);
        var fvNum = parseFloat(fv);
        var bothNumeric = !isNaN(cvNum) && !isNaN(fvNum) && cv.trim() !== '';

        switch (operator) {
            case '=':
                return cv === fv;
            case '!=':
                return cv !== fv;
            case '>':
                if (bothNumeric) return cvNum > fvNum;
                return cv > fv;
            case '>=':
                if (bothNumeric) return cvNum >= fvNum;
                return cv >= fv;
            case '<':
                if (bothNumeric) return cvNum < fvNum;
                return cv < fv;
            case '<=':
                if (bothNumeric) return cvNum <= fvNum;
                return cv <= fv;
            case 'contains':
                return cv.toLowerCase().indexOf(fv.toLowerCase()) >= 0;
            case 'not_contains':
                return cv.toLowerCase().indexOf(fv.toLowerCase()) < 0;
            case 'starts_with':
                return cv.toLowerCase().indexOf(fv.toLowerCase()) === 0;
            case 'ends_with':
                return cv.toLowerCase().slice(-fv.length) === fv.toLowerCase();
            case 'is_empty':
                return cv.trim() === '';
            case 'is_not_empty':
                return cv.trim() !== '';
            default:
                return true;
        }
    }

    getFilteredDbRows() {
        var headers = this.state.dbHeaders;
        var rows = this.state.dbAllRows;
        var conditions = this.state.dbFilters;

        if (!conditions || conditions.length === 0) return rows;

        // Only apply conditions that have a value (or is_empty/is_not_empty which don't need one)
        var activeConditions = [];
        for (var c = 0; c < conditions.length; c++) {
            var cond = conditions[c];
            if (cond.operator === 'is_empty' || cond.operator === 'is_not_empty' || (cond.value !== '' && cond.value !== undefined)) {
                activeConditions.push(cond);
            }
        }
        if (activeConditions.length === 0) return rows;

        var filtered = [];
        for (var r = 0; r < rows.length; r++) {
            var match = true;
            for (var f = 0; f < activeConditions.length; f++) {
                var ac = activeConditions[f];
                var colIdx = headers.indexOf(ac.column);
                if (colIdx < 0) continue;
                if (!this.evaluateCondition(rows[r][colIdx], ac.operator, ac.value)) {
                    match = false;
                    break;
                }
            }
            if (match) filtered.push(rows[r]);
        }
        return filtered;
    }

    getSelectedDbHeaders() {
        var result = [];
        for (var i = 0; i < this.state.dbHeaders.length; i++) {
            var col = this.state.dbHeaders[i];
            if (this.state.dbSelectedColumns[col]) result.push(col);
        }
        return result;
    }

    getSelectedDbHeaderIndices() {
        var indices = [];
        for (var i = 0; i < this.state.dbHeaders.length; i++) {
            if (this.state.dbSelectedColumns[this.state.dbHeaders[i]]) indices.push(i);
        }
        return indices;
    }

    // ===================== COMMON =====================

    getActiveHeaders() {
        if (this.state.sourceMode === 'csv') return this.state.csvHeaders;
        return this.getSelectedDbHeaders();
    }
    getActiveRows() {
        if (this.state.sourceMode === 'csv') return this.state.csvAllRows;
        var filteredRows = this.getFilteredDbRows();
        var indices = this.getSelectedDbHeaderIndices();
        return filteredRows.map(function(row) {
            return indices.map(function(i) { return row[i]; });
        });
    }
    hasData() { return this.getActiveHeaders().length > 0 && this.getActiveRows().length > 0; }

    handleReset() {
        this.setState({
            file: null, csvHeaders: [], csvPreview: [], csvAllRows: [],
            dbHeaders: [], dbAllRows: [], dbPreview: null,
            dbSelectedColumns: {}, dbFilters: [],
            selectedConnectionId: "", selectedConnection: null, databases: [], tables: [],
            selectedDatabase: "", selectedTable: "", selectedSchema: "",
            selectedExpense: "", newExpenseName: "", result: null, loadingExpenses: true
        }, () => this.fetchExpenses());
    }

    handleSubmit() {
        var headers = this.getActiveHeaders(); var rows = this.getActiveRows();
        if (headers.length === 0 || rows.length === 0) { this.setState({ result: { type: "error", message: "No data to upload." } }); return; }
        if (!this.state.isNewExpense && !this.state.selectedExpense) { this.setState({ result: { type: "error", message: "Please select an expense type." } }); return; }
        if (this.state.isNewExpense && !this.state.newExpenseName.trim()) { this.setState({ result: { type: "error", message: "Please enter the new expense name." } }); return; }

        this.setState({ loading: true, result: null });

        if (this.state.sourceMode === 'csv') {
            var formData = new FormData();
            formData.append("file", this.state.file);
            if (this.state.isNewExpense) { formData.append("new_expense_name", this.state.newExpenseName.trim()); }
            else { formData.append("expense_id", this.state.selectedExpense); }

            fetch(UPLOAD_ENDPOINT, { method: "POST", body: formData })
            .then(response => response.json().then(data => { if (!response.ok) throw new Error(data.error || "Upload failed"); return data; }))
            .then(data => this.setState({ loading: false, result: { type: "success", message: data.message } }))
            .catch(err => this.setState({ loading: false, result: { type: "error", message: err.message } }));
        } else {
            var payload = { source: 'database', headers: headers, rows: rows };
            if (this.state.isNewExpense) { payload.new_expense_name = this.state.newExpenseName.trim(); }
            else { payload.expense_id = this.state.selectedExpense; }

            fetch(UPLOAD_ENDPOINT, { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(response => response.json().then(data => { if (!response.ok) throw new Error(data.error || "Upload failed"); return data; }))
            .then(data => this.setState({ loading: false, result: { type: "success", message: data.message } }))
            .catch(err => this.setState({ loading: false, result: { type: "error", message: err.message } }));
        }
    }

    // ===================== RENDER =====================

    renderSourceToggle() {
        var modes = [{ key: 'csv', label: 'Upload CSV' }, { key: 'database', label: 'Import from Database' }];
        return (
            <div style={{ display: "flex", marginBottom: "20px", border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
                {modes.map((m) => (
                    <button key={m.key} style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: this.state.sourceMode === m.key ? "#052049" : "#ffffff", color: this.state.sourceMode === m.key ? "#ffffff" : "#7c8ba1" }}
                        onClick={() => { this.setState({ sourceMode: m.key, result: null }); if (m.key === 'database' && this.state.dbConnections.length === 0) this.fetchDbConnections(); }}
                    >{m.label}</button>
                ))}
            </div>
        );
    }

    renderCsvUpload() {
        if (this.state.sourceMode !== 'csv') return null;
        return (
            <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Upload CSV File</span>
                </div>
                {this.state.file ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#eaf7f0", border: "1px solid #c2e3d3", borderRadius: "6px", padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#4ea87a", fontWeight: "bold" }}>&#10003;</span>
                            <span style={{ fontWeight: "600", fontSize: "14px" }}>{this.state.file.name}</span>
                            <span style={{ fontSize: "13px", color: "#7c8ba1" }}>({(this.state.file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <span style={{ color: "#d64545", fontWeight: "600", fontSize: "13px", cursor: "pointer" }} onClick={() => this.handleReset()}>Remove</span>
                    </div>
                ) : (
                    <div style={{ border: this.state.dragOver ? "2px dashed #052049" : "2px dashed #ccc", borderRadius: "6px", padding: "40px 24px", textAlign: "center", cursor: "pointer", background: this.state.dragOver ? "#eaf0fb" : "#fafbfc" }}
                        onDragOver={(e) => { e.preventDefault(); this.setState({ dragOver: true }); }}
                        onDragLeave={() => this.setState({ dragOver: false })}
                        onDrop={(e) => this.handleDrop(e)}
                        onClick={() => this.fileInputRef.current.click()}>
                        <input ref={this.fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => this.handleFile(e.target.files ? e.target.files[0] : null)} />
                        <p style={{ fontSize: "14px", color: "#7c8ba1", margin: 0 }}>Drag & drop your CSV here, or <span style={{ color: "#052049", fontWeight: "600", textDecoration: "underline" }}>browse</span></p>
                    </div>
                )}
            </div>
        );
    }

    renderDbImport() {
        if (this.state.sourceMode !== 'database') return null;
        return (
            <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Import from Database</span>
                </div>

                {/* Connection */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Database Connection</label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <select style={{ flex: 1, padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", color: "#2c3345" }}
                            value={this.state.selectedConnectionId} onChange={(e) => this.selectConnection(e.target.value)} disabled={this.state.loadingConnections}>
                            <option value="">{this.state.loadingConnections ? "Loading..." : "\u2014 Select a connection \u2014"}</option>
                            {this.state.dbConnections.map((c) => (<option key={c.id} value={c.id}>{c.connection_name} ({c.db_type === 'mssql' ? 'MSSQL' : 'PostgreSQL'})</option>))}
                        </select>
                        <a href="/db-connection-config" style={{ fontSize: "12px", color: "#052049", fontWeight: "600", whiteSpace: "nowrap" }}>Manage</a>
                    </div>
                </div>

                {/* Database */}
                {this.state.selectedConnectionId && (
                    <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Database</label>
                        <select style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", color: "#2c3345" }}
                            value={this.state.selectedDatabase} onChange={(e) => this.selectDatabase(e.target.value)} disabled={this.state.loadingDatabases}>
                            <option value="">{this.state.loadingDatabases ? "Loading databases..." : "\u2014 Select a database \u2014"}</option>
                            {this.state.databases.map((db) => (<option key={db} value={db}>{db}</option>))}
                        </select>
                    </div>
                )}

                {/* Table */}
                {this.state.selectedDatabase && (
                    <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Table</label>
                        <select style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", color: "#2c3345" }}
                            value={this.state.selectedSchema && this.state.selectedTable ? this.state.selectedSchema + '.' + this.state.selectedTable : ""}
                            onChange={(e) => this.selectTable(e.target.value)} disabled={this.state.loadingTables}>
                            <option value="">{this.state.loadingTables ? "Loading tables..." : "\u2014 Select a table \u2014"}</option>
                            {this.state.tables.map((t, i) => (<option key={i} value={t.schema + '.' + t.table}>{t.schema}.{t.table}</option>))}
                        </select>
                    </div>
                )}

                {/* Preview */}
                {this.state.loadingPreview && <div style={{ padding: "14px", color: "#7c8ba1", fontSize: "13px" }}>Loading preview...</div>}
                {this.state.dbPreview && !this.state.loadingPreview && (
                    <div style={{ marginTop: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "13px", color: "#7c8ba1" }}>{this.state.dbPreview.columns.length} columns &middot; {this.state.dbPreview.total_rows} total rows &middot; Preview (first 5)</span>
                            <button style={{ padding: "8px 20px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px", background: "#0e7c3a", color: "#fff", cursor: this.state.fetchingData ? "not-allowed" : "pointer", opacity: this.state.fetchingData ? 0.6 : 1 }}
                                onClick={() => this.fetchTableData()} disabled={this.state.fetchingData}>
                                {this.state.fetchingData ? "Fetching..." : "Fetch All " + this.state.dbPreview.total_rows + " Rows"}
                            </button>
                        </div>
                        <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "400px" }}>
                                <thead><tr>{this.state.dbPreview.columns.map((col, i) => (
                                    <th key={i} style={{ padding: "8px 12px", borderBottom: "2px solid #e2e6ed", fontWeight: "600", background: "#052049", color: "#fff", whiteSpace: "nowrap", textAlign: "left" }}>{col}</th>
                                ))}</tr></thead>
                                <tbody>{this.state.dbPreview.rows.map((row, ri) => (
                                    <tr key={ri}>{this.state.dbPreview.columns.map((col, ci) => (
                                        <td key={ci} style={{ padding: "6px 12px", borderBottom: "1px solid #e2e6ed", color: "#2c3345", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", background: ri % 2 === 0 ? "#fafbfc" : "#fff" }}>
                                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : "\u2014"}
                                        </td>
                                    ))}</tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Column selection and filters - shown after data fetch */}
                {this.state.dbHeaders.length > 0 && (
                    <div style={{ marginTop: "16px", padding: "16px", background: "#f8f9fb", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                        {/* Column Selection */}
                        <div style={{ marginBottom: "16px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                <span style={{ fontSize: "13px", fontWeight: "700", color: "#052049" }}>Select Columns ({this.getActiveHeaders().length} of {this.state.dbHeaders.length})</span>
                                <div style={{ display: "flex", gap: "10px" }}>
                                    <span style={{ fontSize: "12px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                        onClick={() => this.toggleAllDbColumns(true)}>Select All</span>
                                    <span style={{ fontSize: "12px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                        onClick={() => this.toggleAllDbColumns(false)}>Deselect All</span>
                                </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                {this.state.dbHeaders.map((col, ci) => {
                                    var isSelected = this.state.dbSelectedColumns[col] || false;
                                    return (
                                        <label key={ci} style={{
                                            display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer",
                                            background: isSelected ? "#e8f0fe" : "#f0f0f0", border: isSelected ? "1px solid #052049" : "1px solid #e2e6ed",
                                            color: isSelected ? "#052049" : "#999", fontWeight: isSelected ? "600" : "400"
                                        }}>
                                            <input type="checkbox" checked={isSelected} onChange={() => this.toggleDbColumn(col)}
                                                style={{ width: "12px", height: "12px", cursor: "pointer" }} />
                                            {col}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Filter Conditions */}
                        <div style={{ borderTop: "1px solid #e2e6ed", paddingTop: "14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                <span style={{ fontSize: "13px", fontWeight: "700", color: "#052049" }}>
                                    Filter Rows {this.state.dbFilters.length > 0 ? '(' + this.state.dbFilters.length + ' condition' + (this.state.dbFilters.length > 1 ? 's' : '') + ')' : ''}
                                </span>
                                <div style={{ display: "flex", gap: "10px" }}>
                                    {this.state.dbFilters.length > 0 && (
                                        <span style={{ fontSize: "12px", color: "#d64545", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                            onClick={() => this.clearAllDbFilters()}>Clear All</span>
                                    )}
                                    <span style={{ fontSize: "12px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                        onClick={() => this.addFilterCondition()}>+ Add Condition</span>
                                </div>
                            </div>

                            {this.state.dbFilters.length === 0 && (
                                <div style={{ fontSize: "12px", color: "#7c8ba1", padding: "6px 0" }}>No filter conditions. All {this.state.dbAllRows.length} rows will be imported.</div>
                            )}

                            {this.state.dbFilters.map((cond, fi) => {
                                var noValueNeeded = cond.operator === 'is_empty' || cond.operator === 'is_not_empty';
                                return (
                                    <div key={fi} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                                        {fi > 0 && <span style={{ fontSize: "11px", fontWeight: "700", color: "#7c8ba1", width: "32px", textAlign: "center", flexShrink: 0 }}>AND</span>}
                                        {fi === 0 && <span style={{ width: "32px", flexShrink: 0 }}></span>}

                                        <select style={{ padding: "7px 8px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", color: "#052049", fontWeight: "600", minWidth: "140px" }}
                                            value={cond.column} onChange={(e) => this.updateFilterCondition(fi, 'column', e.target.value)}>
                                            {this.state.dbHeaders.map((h, hi) => (<option key={hi} value={h}>{h}</option>))}
                                        </select>

                                        <select style={{ padding: "7px 8px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", color: "#2c3345", minWidth: "130px" }}
                                            value={cond.operator} onChange={(e) => this.updateFilterCondition(fi, 'operator', e.target.value)}>
                                            <option value="=">equals (=)</option>
                                            <option value="!=">not equals (&#8800;)</option>
                                            <option value=">">greater than (&gt;)</option>
                                            <option value=">=">greater or equal (&#8805;)</option>
                                            <option value="<">less than (&lt;)</option>
                                            <option value="<=">less or equal (&#8804;)</option>
                                            <option value="contains">contains</option>
                                            <option value="not_contains">not contains</option>
                                            <option value="starts_with">starts with</option>
                                            <option value="ends_with">ends with</option>
                                            <option value="is_empty">is empty</option>
                                            <option value="is_not_empty">is not empty</option>
                                        </select>

                                        {!noValueNeeded && (
                                            <input type="text" placeholder="value..."
                                                style={{ padding: "7px 10px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", color: "#2c3345", flex: "1 1 120px", minWidth: "100px", boxSizing: "border-box" }}
                                                value={cond.value} onChange={(e) => this.updateFilterCondition(fi, 'value', e.target.value)} />
                                        )}

                                        <span style={{ fontSize: "16px", color: "#d64545", cursor: "pointer", fontWeight: "700", flexShrink: 0, width: "20px", textAlign: "center" }}
                                            onClick={() => this.removeFilterCondition(fi)}>&times;</span>
                                    </div>
                                );
                            })}

                            {this.state.dbFilters.length > 0 && (
                                <div style={{ marginTop: "8px", fontSize: "12px", color: this.getFilteredDbRows().length > 0 ? "#0e7c3a" : "#d64545", fontWeight: "600" }}>
                                    {this.getFilteredDbRows().length} of {this.state.dbAllRows.length} rows match
                                </div>
                            )}
                        </div>

                        {/* Live filtered data preview */}
                        {(() => {
                            var previewHeaders = this.getActiveHeaders();
                            var previewRows = this.getActiveRows();
                            var showMax = 10;
                            var previewSlice = previewRows.slice(0, showMax);
                            if (previewHeaders.length === 0) return null;
                            return (
                                <div style={{ borderTop: "1px solid #e2e6ed", paddingTop: "14px", marginTop: "14px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                        <span style={{ fontSize: "13px", fontWeight: "700", color: "#052049" }}>Data Preview</span>
                                        <span style={{ fontSize: "12px", color: "#7c8ba1" }}>
                                            {previewHeaders.length} columns &middot; {previewRows.length} rows{previewRows.length > showMax ? ' (showing first ' + showMax + ')' : ''}
                                        </span>
                                    </div>
                                    <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px", maxHeight: "320px", overflowY: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "400px" }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ padding: "7px 10px", borderBottom: "2px solid #e2e6ed", background: "#052049", color: "#fff", fontSize: "11px", fontWeight: "600", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 }}>#</th>
                                                    {previewHeaders.map((h, hi) => (
                                                        <th key={hi} style={{ padding: "7px 10px", borderBottom: "2px solid #e2e6ed", background: "#052049", color: "#fff", fontSize: "11px", fontWeight: "600", textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewSlice.length === 0 ? (
                                                    <tr><td colSpan={previewHeaders.length + 1} style={{ padding: "20px", textAlign: "center", color: "#d64545", fontSize: "12px" }}>No rows match the current filters.</td></tr>
                                                ) : previewSlice.map((row, ri) => (
                                                    <tr key={ri}>
                                                        <td style={{ padding: "5px 10px", borderBottom: "1px solid #e2e6ed", color: "#7c8ba1", textAlign: "center", fontSize: "11px", background: ri % 2 === 0 ? "#fafbfc" : "#fff" }}>{ri + 1}</td>
                                                        {row.map((cell, ci) => (
                                                            <td key={ci} style={{ padding: "5px 10px", borderBottom: "1px solid #e2e6ed", color: "#2c3345", whiteSpace: "nowrap", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", background: ri % 2 === 0 ? "#fafbfc" : "#fff" }}>
                                                                {cell || "\u2014"}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {previewRows.length > showMax && (
                                        <div style={{ marginTop: "6px", fontSize: "11px", color: "#7c8ba1", textAlign: "center" }}>
                                            ...and {previewRows.length - showMax} more rows
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Summary */}
                        {this.getActiveHeaders().length > 61 && (
                            <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "6px", background: "#fff8e1", border: "1px solid #ffe082", fontSize: "12px", color: "#8a6d00" }}>
                                <span style={{ fontSize: "14px", flexShrink: 0 }}>&#9888;</span>
                                <span>{this.getActiveHeaders().length} columns selected. Only the first 61 will be imported.</span>
                            </div>
                        )}
                        <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "6px", background: "#eaf7f0", border: "1px solid #c2e3d3", fontSize: "13px", color: "#2a6e4a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>&#10003; {this.getActiveRows().length} rows with {this.getActiveHeaders().length} columns ready for import</span>
                            <span style={{ color: "#d64545", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
                                onClick={() => this.setState({ dbHeaders: [], dbAllRows: [], dbPreview: null, dbSelectedColumns: {}, dbFilters: [], selectedTable: "", selectedSchema: "" })}>Clear Data</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    renderDataPreview() {
        if (this.state.sourceMode !== 'csv' || this.state.csvHeaders.length === 0) return null;
        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#2c3345" }}>Data Preview</span>
                    <span style={{ fontSize: "12px", color: "#7c8ba1" }}>{this.state.csvHeaders.length} columns &middot; {this.state.csvAllRows.length} rows &middot; Showing first 5</span>
                </div>
                <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "400px" }}>
                        <thead><tr>{this.state.csvHeaders.map((h, i) => (
                            <th key={i} style={{ textAlign: "left", padding: "10px 14px", borderBottom: "2px solid #e2e6ed", fontWeight: "600", background: "#052049", color: "#ffffff", whiteSpace: "nowrap" }}>{h}</th>
                        ))}</tr></thead>
                        <tbody>{this.state.csvPreview.map((row, ri) => (
                            <tr key={ri}>{this.state.csvHeaders.map((h, ci) => (
                                <td key={ci} style={{ padding: "8px 14px", borderBottom: "1px solid #e2e6ed", color: "#2c3345", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", background: ri % 2 === 0 ? "#fafbfc" : "#ffffff" }}>{row[ci] || "\u2014"}</td>
                            ))}</tr>
                        ))}</tbody>
                    </table>
                </div>
                {this.state.csvHeaders.length > 61 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", padding: "10px 14px", borderRadius: "6px", background: "#fff8e1", border: "1px solid #ffe082", fontSize: "13px", color: "#8a6d00" }}>
                        <span style={{ fontSize: "16px", flexShrink: 0 }}>&#9888;</span>
                        <span>This CSV has {this.state.csvHeaders.length} columns. Only the first 61 will be imported.</span>
                    </div>
                )}
            </div>
        );
    }

    renderExpenseSelection() {
        if (!this.hasData()) return null;
        var hasExpenses = this.state.expenses.length > 0;
        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select Expense Type</span>
                </div>
                {hasExpenses && (
                    <div style={{ display: "flex", marginBottom: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
                        <button style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: !this.state.isNewExpense ? "#052049" : "#ffffff", color: !this.state.isNewExpense ? "#ffffff" : "#7c8ba1" }}
                            onClick={() => this.setState({ isNewExpense: false, newExpenseName: "" })}>Choose Existing</button>
                        <button style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: this.state.isNewExpense ? "#052049" : "#ffffff", color: this.state.isNewExpense ? "#ffffff" : "#7c8ba1" }}
                            onClick={() => this.setState({ isNewExpense: true, selectedExpense: "" })}>Add New</button>
                    </div>
                )}
                {!hasExpenses && <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "14px" }}>No existing expenses found. Enter a new expense name below.</p>}
                {!this.state.isNewExpense && hasExpenses ? (
                    <select style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345" }}
                        value={this.state.selectedExpense} onChange={(e) => this.setState({ selectedExpense: e.target.value })}>
                        <option value="">{this.state.loadingExpenses ? "Loading..." : "\u2014 Select an expense \u2014"}</option>
                        {this.state.expenses.map((exp) => (<option key={exp.id} value={exp.id}>{exp.name}</option>))}
                    </select>
                ) : (
                    <input style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                        type="text" placeholder="Enter new expense name..." value={this.state.newExpenseName} onChange={(e) => this.setState({ newExpenseName: e.target.value })} />
                )}
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
        return (
            <div style={{ minHeight: "500px", marginLeft: "0px", marginRight: "0px" }}>
                <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                <div style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                    <div style={{ marginLeft: "4%" }}>
                        <div style={{ float: "left", display: "grid", height: "100px" }}><img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" /></div>
                        <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}><span style={{ margin: "auto" }}>- Expense Upload</span></div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "0px", background: "#f0f2f5", borderBottom: "2px solid #e2e6ed", padding: "0 4%" }}>
                    <span style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "700", color: "#ffffff", background: "#052049", cursor: "default", borderBottom: "2px solid #052049" }}>Upload</span>
                    <a href="/expense-report-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Configuration</a>
                    <a href="/action-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Actions</a>
                    <a href="/db-connection-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>DB Connections</a>
                    <a href="/expense-report-preview" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Preview</a>
                    <a href="/expense-reports" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Reports</a>
                </div>
                <div style={{ maxWidth: "760px", margin: "40px auto", padding: "0 20px" }}>
                    {this.renderSourceToggle()}
                    {this.renderCsvUpload()}
                    {this.renderDbImport()}
                    {this.renderDataPreview()}
                    {this.renderExpenseSelection()}
                    {this.renderResult()}
                    {this.hasData() && (
                        <button style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: "700", background: "#052049", color: "#ffffff", border: "none", borderRadius: "6px", cursor: this.state.loading ? "not-allowed" : "pointer", marginTop: "20px", opacity: this.state.loading ? 0.6 : 1 }}
                            onClick={() => this.handleSubmit()} disabled={this.state.loading}>
                            {this.state.loading ? "Uploading..." : "Upload Expense"}
                        </button>
                    )}
                </div>
            </div>
        );
    }
}

export default ExpenseUpload