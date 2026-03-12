import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensenav.js'
import { properties } from '../../properties/properties.js'

const EXPENSES_ENDPOINT = `${properties.backend}expense/get_expense_table`
const COMBINED_DATA_ENDPOINT = `${properties.backend}expense/get_combined_data/`
const SAVE_ENDPOINT = `${properties.backend}expense/save_report_config`
const DELETE_EXPENSE_ENDPOINT = `${properties.backend}expense/delete_expense/`
const ACTIONS_ENDPOINT = `${properties.backend}expense/save_action`
const DB_CONN_ENDPOINT = `${properties.backend}expense/db_connection`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseReportConfig extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            expenses: [],
            loadingExpenses: true,
            selectedExpense: "",
            columns: [],
            rows: [],
            versions: [],
            totalRows: 0,
            loadingData: false,
            selectedColumns: {},
            filterColumns: {},
            configName: "",
            result: null,
            submitting: false,
            confirmDeleteExpense: false,
            deletingExpense: false,
            actions: [],
            loadingActions: true,
            configActions: [],
            editingConfigId: null,
            loadingEdit: false,
            // Source type
            sourceType: 'expense',
            // DB source state
            dbConnections: [],
            loadingConnections: false,
            selectedConnectionId: "",
            selectedConnection: null,
            dbDatabases: [],
            loadingDatabases: false,
            selectedDatabase: "",
            dbTables: [],
            loadingTables: false,
            selectedSchema: "",
            selectedTable: "",
            dbPreview: null,
            loadingPreview: false,
            dbAllColumns: [],
            dbFilterConditions: []
        };
    }

    componentDidMount() {
        this.fetchExpenses();
        this.fetchActions();

        // Check for ?edit=ID in URL
        var params = new URLSearchParams(window.location.search);
        var editId = params.get('edit');
        if (editId) {
            this.setState({ editingConfigId: parseInt(editId), loadingEdit: true });
            this.loadConfigForEdit(parseInt(editId));
        }
    }

    loadConfigForEdit(configId) {
        fetch(SAVE_ENDPOINT + '/' + configId, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(config => {
            if (config.error) {
                this.setState({ loadingEdit: false, result: { type: "error", message: config.error } });
                return;
            }

            // Rebuild configActions from saved actions
            var configActions = [];
            var savedActions = config.actions || [];
            for (var a = 0; a < savedActions.length; a++) {
                var sa = savedActions[a];
                var mapping = sa.action_column_mapping || {};
                if (typeof mapping === 'string') { try { mapping = JSON.parse(mapping); } catch(e) { mapping = {}; } }
                configActions.push({
                    action_id: sa.action_id ? String(sa.action_id) : "",
                    action_type: sa.action_type || "",
                    action_button_label: sa.action_button_label || "",
                    prompt_mode: sa.prompt_mode || false,
                    email_to: mapping.email_to || "",
                    subject_template: mapping.subject_template || "",
                    body_template: mapping.body_template || ""
                });
            }

            var sourceType = config.source_type || 'expense';

            if (sourceType === 'database') {
                // DB source: load connection, set DB state, then fetch columns from external DB
                var filterConds = config.db_filter_conditions || [];
                if (typeof filterConds === 'string') { try { filterConds = JSON.parse(filterConds); } catch(e) { filterConds = []; } }

                this.setState({
                    sourceType: 'database',
                    selectedConnectionId: String(config.db_connection_id || ''),
                    selectedDatabase: config.db_database || '',
                    selectedSchema: config.db_schema || '',
                    selectedTable: config.db_table || '',
                    dbFilterConditions: filterConds,
                    configName: config.config_name || '',
                    configActions: configActions
                });

                // Fetch connection details, then fetch table preview to get columns
                if (config.db_connection_id) {
                    this.fetchDbConnections();
                    fetch(DB_CONN_ENDPOINT + '/' + config.db_connection_id, { method: "GET", headers: { 'Content-Type': 'application/json' } })
                    .then(r => r.json())
                    .then(conn => {
                        this.setState({ selectedConnection: conn });
                        // Fetch table preview to get columns
                        fetch(DB_CONN_ENDPOINT + '/preview', {
                            method: "POST", headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(Object.assign({}, conn, { database: config.db_database, schema: config.db_schema, table: config.db_table }))
                        })
                        .then(r => r.json())
                        .then(preview => {
                            var allCols = preview.columns || [];
                            var columns = allCols.map(function(c) { return { column_name: c, data_type: 'string' }; });

                            // Rebuild selectedColumns and filterColumns
                            var selectedColumns = {};
                            var filterColumns = {};
                            var savedCols = config.columns || [];
                            for (var i = 0; i < savedCols.length; i++) {
                                selectedColumns[savedCols[i].column_name] = savedCols[i].display_order;
                                if (savedCols[i].is_filter) filterColumns[savedCols[i].column_name] = true;
                            }

                            this.setState({
                                dbAllColumns: allCols,
                                columns: columns,
                                selectedColumns: selectedColumns,
                                filterColumns: filterColumns,
                                dbPreview: preview,
                                loadingEdit: false
                            });
                        });
                    });
                } else {
                    this.setState({ loadingEdit: false });
                }
            } else {
                // Expense source: original logic
                var parentId = config.expense_table_parent_id;
                this.setState({ sourceType: 'expense', selectedExpense: String(parentId), configName: config.config_name || '' });

                fetch(COMBINED_DATA_ENDPOINT + parentId, {
                    method: "GET",
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
                })
                .then(r => r.json())
                .then(data => {
                    var columns = data.columns || [];
                    var selectedColumns = {};
                    var filterColumns = {};
                    var savedCols = config.columns || [];
                    for (var i = 0; i < savedCols.length; i++) {
                        selectedColumns[savedCols[i].column_name] = savedCols[i].display_order;
                        if (savedCols[i].is_filter) filterColumns[savedCols[i].column_name] = true;
                    }

                    this.setState({
                        columns: columns,
                        rows: data.rows || [],
                        versions: data.versions || [],
                        totalRows: data.total_rows || 0,
                        selectedColumns: selectedColumns,
                        filterColumns: filterColumns,
                        configActions: configActions,
                        loadingEdit: false,
                        loadingData: false
                    });
                })
                .catch(err => {
                    console.log("Failed to load expense data for edit:", err);
                    this.setState({ loadingEdit: false });
                });
            }
        })
        .catch(err => {
            console.log("Failed to load config for edit:", err);
            this.setState({ loadingEdit: false, result: { type: "error", message: "Failed to load configuration." } });
        });
    }

    fetchExpenses() {
        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        fetch(EXPENSES_ENDPOINT, {
            method: "GET",
            headers: headers
        })
        .then(response => response.json())
        .then(response => {
            this.setState({ expenses: response, loadingExpenses: false });
        })
        .catch(err => {
            console.log("Failed to load expenses:", err);
            this.setState({ expenses: [], loadingExpenses: false });
        });
    }

    fetchActions() {
        fetch(ACTIONS_ENDPOINT, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(response => {
            this.setState({ actions: Array.isArray(response) ? response : [], loadingActions: false });
        })
        .catch(err => {
            console.log("Failed to load actions:", err);
            this.setState({ actions: [], loadingActions: false });
        });
    }

    fetchCombinedData(parentId) {
        this.setState({ loadingData: true, columns: [], rows: [], versions: [], selectedColumns: {}, filterColumns: {}, result: null });

        let headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');

        fetch(COMBINED_DATA_ENDPOINT + parentId, {
            method: "GET",
            headers: headers
        })
        .then(response => response.json())
        .then(response => {
            var columns = response.columns || [];

            this.setState({
                columns: columns,
                rows: response.rows || [],
                versions: response.versions || [],
                totalRows: response.total_rows || 0,
                loadingData: false,
                selectedColumns: {},
                filterColumns: {}
            });
        })
        .catch(err => {
            console.log("Failed to load combined data:", err);
            this.setState({ columns: [], rows: [], versions: [], loadingData: false });
        });
    }

    handleExpenseChange(expenseId) {
        this.setState({ selectedExpense: expenseId, selectedColumns: {}, filterColumns: {}, configName: "", result: null, confirmDeleteExpense: false });
        if (expenseId) {
            this.fetchCombinedData(expenseId);
        } else {
            this.setState({ columns: [], rows: [], versions: [], loadingData: false });
        }
    }

    handleDeleteExpense() {
        if (!this.state.selectedExpense) return;

        if (!this.state.confirmDeleteExpense) {
            this.setState({ confirmDeleteExpense: true });
            return;
        }

        this.setState({ deletingExpense: true, result: null });

        fetch(DELETE_EXPENSE_ENDPOINT + this.state.selectedExpense, {
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
            var msg = data.message || "Expense type deleted.";
            if (data.configs_deleted > 0) {
                msg += " Also removed " + data.configs_deleted + " related report config(s).";
            }
            this.setState({
                deletingExpense: false,
                confirmDeleteExpense: false,
                selectedExpense: "",
                columns: [],
                rows: [],
                versions: [],
                selectedColumns: {},
                filterColumns: {},
                configName: "",
                result: { type: "success", message: msg }
            }, () => {
                this.fetchExpenses();
            });
        })
        .catch(err => {
            this.setState({ deletingExpense: false, confirmDeleteExpense: false, result: { type: "error", message: err.message || "Something went wrong." } });
        });
    }

    handleColumnToggle(columnName) {
        var selected = Object.assign({}, this.state.selectedColumns);
        var filters = Object.assign({}, this.state.filterColumns);

        if (selected[columnName]) {
            delete selected[columnName];
            delete filters[columnName];
            var ordered = Object.keys(selected).sort(function(a, b) { return selected[a] - selected[b]; });
            var resequenced = {};
            for (var i = 0; i < ordered.length; i++) {
                resequenced[ordered[i]] = i + 1;
            }
            this.setState({ selectedColumns: resequenced, filterColumns: filters });
        } else {
            var nextOrder = Object.keys(selected).length + 1;
            selected[columnName] = nextOrder;
            this.setState({ selectedColumns: selected });
        }
    }

    handleFilterToggle(columnName, e) {
        e.stopPropagation();

        var filters = Object.assign({}, this.state.filterColumns);
        if (filters[columnName]) {
            delete filters[columnName];
        } else {
            filters[columnName] = true;
        }
        this.setState({ filterColumns: filters });
    }

    moveColumn(columnName, direction) {
        var selected = Object.assign({}, this.state.selectedColumns);
        var currentOrder = selected[columnName];
        var maxOrder = Object.keys(selected).length;
        var newOrder = currentOrder + direction;
        if (newOrder < 1 || newOrder > maxOrder) return;

        var keys = Object.keys(selected);
        for (var i = 0; i < keys.length; i++) {
            if (selected[keys[i]] === newOrder) {
                selected[keys[i]] = currentOrder;
                break;
            }
        }
        selected[columnName] = newOrder;
        this.setState({ selectedColumns: selected });
    }

    handleSelectAll() {
        var selected = {};
        var filters = Object.assign({}, this.state.filterColumns);
        var order = 1;
        for (var i = 0; i < this.state.columns.length; i++) {
            var colName = this.state.columns[i].column_name;
            selected[colName] = order;
            order++;
        }
        this.setState({ selectedColumns: selected, filterColumns: filters });
    }

    handleDeselectAll() {
        this.setState({ selectedColumns: {}, filterColumns: {} });
    }

    handleSubmit() {
        var selectedCount = Object.keys(this.state.selectedColumns).length;
        if (!this.state.configName.trim()) {
            this.setState({ result: { type: "error", message: "Please enter a configuration name." } });
            return;
        }
        if (this.state.sourceType === 'expense' && !this.state.selectedExpense) {
            this.setState({ result: { type: "error", message: "Please select an expense type." } });
            return;
        }
        if (this.state.sourceType === 'database' && !this.state.selectedConnectionId) {
            this.setState({ result: { type: "error", message: "Please select a database connection." } });
            return;
        }
        if (selectedCount === 0) {
            this.setState({ result: { type: "error", message: "Please select at least one column." } });
            return;
        }

        this.setState({ submitting: true, result: null });

        var selected = this.state.selectedColumns;
        var filters = this.state.filterColumns;
        var columns = this.state.columns;
        var configColumns = [];

        var columnMap = {};
        for (var i = 0; i < columns.length; i++) {
            columnMap[columns[i].column_name] = columns[i];
        }

        var keys = Object.keys(selected);
        for (var i = 0; i < keys.length; i++) {
            var colName = keys[i];
            var col = columnMap[colName];
            if (col) {
                configColumns.push({
                    column_name: colName,
                    data_type: col.data_type,
                    require_column_index: col.require_column_index,
                    is_filter: filters[colName] ? true : false,
                    display_order: selected[colName]
                });
            }
        }

        configColumns.sort(function(a, b) { return a.display_order - b.display_order; });

        var payload = {
            config_name: this.state.configName.trim(),
            source_type: this.state.sourceType,
            expense_table_id: this.state.sourceType === 'expense' ? parseInt(this.state.selectedExpense) : 0,
            db_connection_id: this.state.sourceType === 'database' ? parseInt(this.state.selectedConnectionId) : null,
            db_database: this.state.selectedDatabase || '',
            db_schema: this.state.selectedSchema || '',
            db_table: this.state.selectedTable || '',
            db_filter_conditions: this.state.dbFilterConditions || [],
            columns: configColumns,
            actions: this.state.configActions.map(function(a) {
                return {
                    action_id: a.action_id || null,
                    action_type: a.action_type || '',
                    action_button_label: a.action_button_label || '',
                    prompt_mode: a.prompt_mode || false,
                    action_column_mapping: {
                        email_to: a.email_to || '',
                        subject_template: a.subject_template || '',
                        body_template: a.body_template || ''
                    }
                };
            })
        };

        var isEditing = this.state.editingConfigId ? true : false;
        var method = isEditing ? "PUT" : "POST";
        var url = isEditing ? SAVE_ENDPOINT + '/' + this.state.editingConfigId : SAVE_ENDPOINT;

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => {
            return response.json().then(data => {
                if (!response.ok) {
                    throw new Error(data.error || data.message || "Save failed");
                }
                return data;
            });
        })
        .then(data => {
            this.setState({ submitting: false, result: { type: "success", message: data.message || "Configuration saved successfully!" } });
        })
        .catch(err => {
            this.setState({ submitting: false, result: { type: "error", message: err.message || "Something went wrong." } });
        });
    }

    getSelectedColumnsSorted() {
        var selected = this.state.selectedColumns;
        var columns = this.state.columns;
        var result = [];

        var columnMap = {};
        for (var i = 0; i < columns.length; i++) {
            columnMap[columns[i].column_name] = columns[i];
        }

        var keys = Object.keys(selected);
        for (var i = 0; i < keys.length; i++) {
            var col = columnMap[keys[i]];
            if (col) {
                result.push({
                    column_name: keys[i],
                    data_type: col.data_type,
                    require_column_index: col.require_column_index,
                    is_filter: this.state.filterColumns[keys[i]] ? true : false,
                    order: selected[keys[i]]
                });
            }
        }
        result.sort(function(a, b) { return a.order - b.order; });
        return result;
    }

    // ===================== DB SOURCE METHODS =====================

    fetchDbConnections() {
        this.setState({ loadingConnections: true });
        fetch(DB_CONN_ENDPOINT, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => this.setState({ dbConnections: Array.isArray(data) ? data : [], loadingConnections: false }))
        .catch(() => this.setState({ dbConnections: [], loadingConnections: false }));
    }

    selectDbConnection(connId) {
        if (!connId) { this.setState({ selectedConnectionId: "", selectedConnection: null, dbDatabases: [], dbTables: [], selectedDatabase: "", selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [] }); return; }
        this.setState({ selectedConnectionId: connId, selectedConnection: null, dbDatabases: [], dbTables: [], selectedDatabase: "", selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [], loadingDatabases: true });

        fetch(DB_CONN_ENDPOINT + '/' + connId, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(conn => {
            this.setState({ selectedConnection: conn });
            fetch(DB_CONN_ENDPOINT + '/databases', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn) })
            .then(r => r.json())
            .then(dbs => this.setState({ dbDatabases: Array.isArray(dbs) ? dbs : [], loadingDatabases: false }))
            .catch(() => this.setState({ dbDatabases: [], loadingDatabases: false }));
        })
        .catch(() => this.setState({ loadingDatabases: false }));
    }

    selectDbDatabase(dbName) {
        if (!dbName) { this.setState({ selectedDatabase: "", dbTables: [], selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [] }); return; }
        this.setState({ selectedDatabase: dbName, dbTables: [], selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [], loadingTables: true });

        fetch(DB_CONN_ENDPOINT + '/tables', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, this.state.selectedConnection, { database: dbName })) })
        .then(r => r.json())
        .then(tables => this.setState({ dbTables: Array.isArray(tables) ? tables : [], loadingTables: false }))
        .catch(() => this.setState({ dbTables: [], loadingTables: false }));
    }

    selectDbTable(schemaTable) {
        if (!schemaTable) { this.setState({ selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [] }); return; }
        var parts = schemaTable.split('.'); var schema = parts[0]; var table = parts[1];
        this.setState({ selectedSchema: schema, selectedTable: table, dbPreview: null, dbAllColumns: [], columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, dbFilterConditions: [], loadingPreview: true });

        fetch(DB_CONN_ENDPOINT + '/preview', { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, this.state.selectedConnection, { database: this.state.selectedDatabase, schema: schema, table: table })) })
        .then(r => r.json())
        .then(data => {
            if (data.error) { this.setState({ loadingPreview: false, result: { type: "error", message: data.error } }); return; }
            var allCols = data.columns || [];
            // Create column objects and auto-select all, auto-assign display_order
            var columns = allCols.map(function(c, i) { return { column_name: c, data_type: 'string' }; });
            var selectedColumns = {};
            for (var i = 0; i < allCols.length; i++) { selectedColumns[allCols[i]] = i + 1; }
            // Convert preview rows to objects keyed by column name (for the data preview table)
            var previewRows = (data.rows || []).map(function(row) {
                var mapped = {};
                for (var k = 0; k < allCols.length; k++) {
                    mapped[allCols[k]] = row[allCols[k]] !== null && row[allCols[k]] !== undefined ? String(row[allCols[k]]) : '';
                }
                return mapped;
            });
            this.setState({ dbPreview: data, dbAllColumns: allCols, columns: columns, rows: previewRows, totalRows: data.total_rows || 0, selectedColumns: selectedColumns, filterColumns: {}, loadingPreview: false });
        })
        .catch(err => this.setState({ loadingPreview: false, result: { type: "error", message: err.message } }));
    }

    addDbFilterCondition() {
        var conditions = this.state.dbFilterConditions.slice();
        conditions.push({ column: this.state.dbAllColumns[0] || '', operator: '=', value: '' });
        this.setState({ dbFilterConditions: conditions });
    }

    updateDbFilterCondition(index, field, value) {
        var conditions = this.state.dbFilterConditions.slice();
        conditions[index] = Object.assign({}, conditions[index]);
        conditions[index][field] = value;
        this.setState({ dbFilterConditions: conditions });
    }

    removeDbFilterCondition(index) {
        var conditions = this.state.dbFilterConditions.slice();
        conditions.splice(index, 1);
        this.setState({ dbFilterConditions: conditions });
    }

    renderExpenseSelection() {
        var isEditing = !!this.state.editingConfigId;
        return (
            <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>1</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select Data Source</span>
                </div>

                {/* Source toggle */}
                <div style={{ display: "flex", marginBottom: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
                    <button style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: isEditing ? "default" : "pointer", background: this.state.sourceType === 'expense' ? "#052049" : "#ffffff", color: this.state.sourceType === 'expense' ? "#ffffff" : "#7c8ba1" }}
                        onClick={() => { if (!isEditing) this.setState({ sourceType: 'expense', columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, configName: "", configActions: [], selectedConnectionId: "", selectedConnection: null, dbDatabases: [], dbTables: [], selectedDatabase: "", selectedTable: "", selectedSchema: "", dbPreview: null, dbAllColumns: [], dbFilterConditions: [], result: null }); }}>Expense Data</button>
                    <button style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: isEditing ? "default" : "pointer", background: this.state.sourceType === 'database' ? "#052049" : "#ffffff", color: this.state.sourceType === 'database' ? "#ffffff" : "#7c8ba1" }}
                        onClick={() => { if (!isEditing) { this.setState({ sourceType: 'database', columns: [], rows: [], totalRows: 0, selectedColumns: {}, filterColumns: {}, configName: "", configActions: [], selectedExpense: "", result: null }); if (this.state.dbConnections.length === 0) this.fetchDbConnections(); } }}>External Database</button>
                </div>

                {/* Expense source */}
                {this.state.sourceType === 'expense' && (
                    <div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            <select style={Object.assign({}, selectStyle, { flex: 1 })} value={this.state.selectedExpense}
                                onChange={(e) => this.handleExpenseChange(e.target.value)}
                                disabled={this.state.loadingExpenses || this.state.deletingExpense || isEditing}>
                                <option value="">{this.state.loadingExpenses ? "Loading expenses..." : "\u2014 Select an expense type \u2014"}</option>
                                {this.state.expenses.map((exp) => (<option key={exp.id} value={exp.id}>{exp.name}</option>))}
                            </select>
                            {this.state.selectedExpense && !isEditing && (
                                <button style={{ padding: "11px 18px", fontSize: "13px", fontWeight: "600", border: "none", borderRadius: "6px", cursor: this.state.deletingExpense ? "not-allowed" : "pointer",
                                    background: this.state.confirmDeleteExpense ? "#d64545" : "#fdf0f0", color: this.state.confirmDeleteExpense ? "#ffffff" : "#d64545", whiteSpace: "nowrap" }}
                                    onClick={() => this.handleDeleteExpense()} disabled={this.state.deletingExpense}>
                                    {this.state.deletingExpense ? "Deleting..." : (this.state.confirmDeleteExpense ? "Confirm Delete" : "Delete Expense")}
                                </button>
                            )}
                        </div>
                        {this.state.confirmDeleteExpense && (
                            <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "6px", background: "#fdf0f0", border: "1px solid #f0c2c2", fontSize: "12px", color: "#d64545" }}>
                                <strong>&#9888;</strong> This will permanently delete this expense type and all related data.
                            </div>
                        )}
                    </div>
                )}

                {/* Database source */}
                {this.state.sourceType === 'database' && (
                    <div>
                        {/* Connection */}
                        <div style={{ marginBottom: "10px" }}>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Database Connection</label>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <select style={Object.assign({}, selectStyle, { flex: 1 })} value={this.state.selectedConnectionId}
                                    onChange={(e) => this.selectDbConnection(e.target.value)} disabled={this.state.loadingConnections || isEditing}>
                                    <option value="">{this.state.loadingConnections ? "Loading..." : "\u2014 Select a connection \u2014"}</option>
                                    {this.state.dbConnections.map((c) => (<option key={c.id} value={c.id}>{c.connection_name} ({c.db_type === 'mssql' ? 'MSSQL' : 'PostgreSQL'})</option>))}
                                </select>
                                <a href="/db-connection-config" style={{ fontSize: "12px", color: "#052049", fontWeight: "600", whiteSpace: "nowrap" }}>Manage</a>
                            </div>
                        </div>

                        {/* Database */}
                        {this.state.selectedConnectionId && (
                            <div style={{ marginBottom: "10px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Database</label>
                                <select style={selectStyle} value={this.state.selectedDatabase}
                                    onChange={(e) => this.selectDbDatabase(e.target.value)} disabled={this.state.loadingDatabases || isEditing}>
                                    <option value="">{this.state.loadingDatabases ? "Loading databases..." : "\u2014 Select a database \u2014"}</option>
                                    {this.state.dbDatabases.map((db) => (<option key={db} value={db}>{db}</option>))}
                                </select>
                            </div>
                        )}

                        {/* Table */}
                        {this.state.selectedDatabase && (
                            <div style={{ marginBottom: "10px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Table</label>
                                <select style={selectStyle}
                                    value={this.state.selectedSchema && this.state.selectedTable ? this.state.selectedSchema + '.' + this.state.selectedTable : ""}
                                    onChange={(e) => this.selectDbTable(e.target.value)} disabled={this.state.loadingTables || isEditing}>
                                    <option value="">{this.state.loadingTables ? "Loading tables..." : "\u2014 Select a table \u2014"}</option>
                                    {this.state.dbTables.map((t, i) => (<option key={i} value={t.schema + '.' + t.table}>{t.schema}.{t.table}</option>))}
                                </select>
                            </div>
                        )}

                        {/* Preview */}
                        {this.state.loadingPreview && <div style={{ padding: "10px", color: "#7c8ba1", fontSize: "13px" }}>Loading preview...</div>}
                        {this.state.dbPreview && !this.state.loadingPreview && (
                            <div style={{ marginTop: "8px", fontSize: "12px", color: "#7c8ba1" }}>
                                {this.state.dbPreview.columns.length} columns &middot; {this.state.dbPreview.total_rows} total rows in table
                            </div>
                        )}

                        {/* Filter conditions - stored in config, applied at query time */}
                        {this.state.dbAllColumns.length > 0 && (
                            <div style={{ marginTop: "14px", padding: "12px", background: "#f8f9fb", borderRadius: "6px", border: "1px solid #e2e6ed" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#052049" }}>
                                        Row Filters {this.state.dbFilterConditions.length > 0 ? '(' + this.state.dbFilterConditions.length + ')' : ''}
                                    </span>
                                    <div style={{ display: "flex", gap: "10px" }}>
                                        {this.state.dbFilterConditions.length > 0 && (
                                            <span style={{ fontSize: "12px", color: "#d64545", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                                onClick={() => this.setState({ dbFilterConditions: [] })}>Clear All</span>
                                        )}
                                        <span style={{ fontSize: "12px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                            onClick={() => this.addDbFilterCondition()}>+ Add Condition</span>
                                    </div>
                                </div>

                                {this.state.dbFilterConditions.length === 0 && (
                                    <div style={{ fontSize: "12px", color: "#7c8ba1" }}>No filters. All rows will be included in reports.</div>
                                )}

                                {this.state.dbFilterConditions.map((cond, fi) => {
                                    var noVal = cond.operator === 'is_empty' || cond.operator === 'is_not_empty';
                                    return (
                                        <div key={fi} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                                            {fi > 0 && <span style={{ fontSize: "11px", fontWeight: "700", color: "#7c8ba1", width: "32px", textAlign: "center", flexShrink: 0 }}>AND</span>}
                                            {fi === 0 && <span style={{ width: "32px", flexShrink: 0 }}></span>}
                                            <select style={{ padding: "7px 8px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", color: "#052049", fontWeight: "600", minWidth: "120px" }}
                                                value={cond.column} onChange={(e) => this.updateDbFilterCondition(fi, 'column', e.target.value)}>
                                                {this.state.dbAllColumns.map((h, hi) => (<option key={hi} value={h}>{h}</option>))}
                                            </select>
                                            <select style={{ padding: "7px 8px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", color: "#2c3345", minWidth: "120px" }}
                                                value={cond.operator} onChange={(e) => this.updateDbFilterCondition(fi, 'operator', e.target.value)}>
                                                <option value="=">equals (=)</option>
                                                <option value="!=">not equals</option>
                                                <option value=">">greater than</option>
                                                <option value=">=">greater or equal</option>
                                                <option value="<">less than</option>
                                                <option value="<=">less or equal</option>
                                                <option value="contains">contains</option>
                                                <option value="not_contains">not contains</option>
                                                <option value="starts_with">starts with</option>
                                                <option value="ends_with">ends with</option>
                                                <option value="is_empty">is empty</option>
                                                <option value="is_not_empty">is not empty</option>
                                            </select>
                                            {!noVal && (
                                                <input type="text" placeholder="value..." style={{ padding: "7px 10px", fontSize: "12px", border: "1px solid #d0dff5", borderRadius: "5px", flex: "1 1 100px", minWidth: "80px", boxSizing: "border-box" }}
                                                    value={cond.value} onChange={(e) => this.updateDbFilterCondition(fi, 'value', e.target.value)} />
                                            )}
                                            <span style={{ fontSize: "16px", color: "#d64545", cursor: "pointer", fontWeight: "700", width: "20px", textAlign: "center" }}
                                                onClick={() => this.removeDbFilterCondition(fi)}>&times;</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    renderDataPreview() {
        // Show for expense source or database source when columns are loaded
        var hasSource = (this.state.sourceType === 'expense' && this.state.selectedExpense) ||
                        (this.state.sourceType === 'database' && this.state.dbAllColumns.length > 0);
        if (!hasSource) return null;

        if (this.state.loadingData) {
            return (
                <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    Loading data...
                </div>
            );
        }

        if (this.state.columns.length === 0) {
            return (
                <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>
                    No data found for this expense type.
                </div>
            );
        }

        var selectedCount = Object.keys(this.state.selectedColumns).length;
        var totalCount = this.state.columns.length;
        var previewRows = this.state.rows;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={stepNumStyle}>2</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select Columns from Data Preview</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <p style={{ fontSize: "13px", color: "#7c8ba1", margin: 0 }}>
                        Click column headers to select. ({selectedCount} of {totalCount} selected)
                        {this.state.totalRows > 0 && <span> &middot; Showing {this.state.totalRows} sample rows</span>}
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <span style={{ fontSize: "13px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.handleSelectAll()}>Select All</span>
                        {selectedCount > 1 && (
                            <span style={{ fontSize: "13px", color: "#d64545", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.handleDeselectAll()}>Clear</span>
                        )}
                    </div>
                </div>

                {this.state.versions.length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", padding: "8px 12px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "12px", color: "#052049" }}>
                        <span style={{ fontWeight: "600" }}>Combined from {this.state.versions.length} uploads:</span>
                        {this.state.versions.map((v) => (
                            <span key={v.id} style={{ background: "#052049", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }}>
                                v{v.version}
                            </span>
                        ))}
                    </div>
                )}

                <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "600px" }}>
                        <thead>
                            <tr>
                                {this.state.columns.map((col, i) => {
                                    var isSelected = this.state.selectedColumns[col.column_name] !== undefined;
                                    var order = this.state.selectedColumns[col.column_name];
                                    return (
                                        <th key={i}
                                            style={{
                                                textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e6ed",
                                                fontWeight: "600", cursor: "pointer",
                                                whiteSpace: "nowrap", userSelect: "none", transition: "all 0.15s",
                                                background: isSelected ? "#052049" : "#fafbfc",
                                                color: isSelected ? "#ffffff" : "#2c3345"
                                            }}
                                            onClick={() => this.handleColumnToggle(col.column_name)}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <div style={{
                                                    width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0,
                                                    border: isSelected ? "2px solid #ffffff" : "2px solid #ccc",
                                                    background: isSelected ? "transparent" : "#ffffff",
                                                    display: "flex", alignItems: "center", justifyContent: "center"
                                                }}>
                                                    {isSelected && <span style={{ color: "#ffffff", fontSize: "11px", fontWeight: "bold" }}>&#10003;</span>}
                                                </div>
                                                <span>{col.column_name}</span>
                                                {isSelected && (
                                                    <span style={{
                                                        fontSize: "10px", fontWeight: "700", color: "#052049", background: "#ffffff",
                                                        borderRadius: "50%", width: "18px", height: "18px",
                                                        display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "2px"
                                                    }}>
                                                        {order}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: "10px", color: isSelected ? "#aac4f0" : "#7c8ba1", marginTop: "2px" }}>
                                                {col.data_type}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {previewRows.map((row, ri) => (
                                <tr key={ri}>
                                    {this.state.columns.map((col, ci) => {
                                        var isSelected = this.state.selectedColumns[col.column_name] !== undefined;
                                        return (
                                            <td key={ci}
                                                style={{
                                                    padding: "8px 12px", borderBottom: "1px solid #e2e6ed",
                                                    color: isSelected ? "#2c3345" : "#7c8ba1",
                                                    background: isSelected ? "#f0f5ff" : "transparent",
                                                    fontWeight: isSelected ? "500" : "normal",
                                                    whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis"
                                                }}
                                            >
                                                {row[col.column_name] || "\u2014"}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    renderOrderConfig() {
        var sortedSelected = this.getSelectedColumnsSorted();
        if (sortedSelected.length === 0) return null;

        var filterCount = Object.keys(this.state.filterColumns).length;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={stepNumStyle}>3</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Arrange Column Order & Set Filters</span>
                </div>
                <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "14px" }}>
                    Use arrows to reorder. Toggle the <span style={{ background: "#e8f0fe", color: "#052049", padding: "1px 6px", borderRadius: "3px", fontSize: "12px", fontWeight: "600" }}>Filter</span> button to make a column filterable in the report preview. ({filterCount} filter{filterCount !== 1 ? "s" : ""} set)
                </p>

                <div style={{ border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden" }}>
                    {sortedSelected.map((col, idx) => {
                        var isFilter = col.is_filter;
                        return (
                            <div key={col.column_name}
                                style={{
                                    display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px",
                                    borderBottom: idx < sortedSelected.length - 1 ? "1px solid #e2e6ed" : "none",
                                    background: isFilter ? "#f0f5ff" : (idx % 2 === 0 ? "#fafbfc" : "#ffffff")
                                }}
                            >
                                <span style={{ fontSize: "14px", fontWeight: "700", color: "#052049", width: "24px", textAlign: "center" }}>
                                    {col.order}
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ cursor: col.order > 1 ? "pointer" : "not-allowed", fontSize: "12px", color: col.order > 1 ? "#052049" : "#ccc", lineHeight: "1", userSelect: "none" }}
                                        onClick={() => this.moveColumn(col.column_name, -1)}>&#9650;</span>
                                    <span style={{ cursor: col.order < sortedSelected.length ? "pointer" : "not-allowed", fontSize: "12px", color: col.order < sortedSelected.length ? "#052049" : "#ccc", lineHeight: "1", userSelect: "none" }}
                                        onClick={() => this.moveColumn(col.column_name, 1)}>&#9660;</span>
                                </div>
                                <span style={{ fontSize: "14px", fontWeight: "500", color: "#2c3345", flex: 1 }}>
                                    {col.column_name}
                                </span>
                                <span style={{ fontSize: "11px", color: "#7c8ba1", background: "#f0f2f5", padding: "2px 8px", borderRadius: "4px" }}>{col.data_type}</span>

                                {/* Filter toggle */}
                                <span
                                    style={{
                                        fontSize: "11px", fontWeight: "600", padding: "4px 10px", borderRadius: "4px", cursor: "pointer",
                                        border: isFilter ? "1px solid #052049" : "1px solid #ccc",
                                        background: isFilter ? "#052049" : "#ffffff",
                                        color: isFilter ? "#ffffff" : "#7c8ba1",
                                        transition: "all 0.15s"
                                    }}
                                    onClick={(e) => this.handleFilterToggle(col.column_name, e)}
                                >
                                    {isFilter ? "\u2713 Filter" : "Filter"}
                                </span>

                                {/* Remove */}
                                <span style={{ fontSize: "13px", color: "#d64545", cursor: "pointer", fontWeight: "600" }}
                                    onClick={() => this.handleColumnToggle(col.column_name)}>&#10005;</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    renderConfigName() {
        var selectedCount = Object.keys(this.state.selectedColumns).length;
        if (selectedCount === 0) return null;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>4</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Name This Configuration</span>
                </div>
                <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "10px" }}>Give this report configuration a name so you can find it later.</p>
                <input
                    style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                    type="text"
                    placeholder="e.g. Monthly Cost Center Report, Q4 Expense Summary..."
                    value={this.state.configName}
                    onChange={(e) => this.setState({ configName: e.target.value })}
                />
            </div>
        );
    }

    updateConfigAction(index, field, value) {
        var configActions = this.state.configActions.slice();
        configActions[index] = Object.assign({}, configActions[index]);
        configActions[index][field] = value;
        this.setState({ configActions: configActions });
    }

    addConfigAction() {
        var configActions = this.state.configActions.slice();
        configActions.push({
            action_id: "",
            action_type: "",
            action_button_label: "",
            prompt_mode: false,
            email_to: "clinicalcommunications@ucsf.edu",
            subject_template: "",
            body_template: ""
        });
        this.setState({ configActions: configActions });
    }

    removeConfigAction(index) {
        var configActions = this.state.configActions.slice();
        configActions.splice(index, 1);
        this.setState({ configActions: configActions });
    }

    renderActionSelection() {
        var selectedCount = Object.keys(this.state.selectedColumns).length;
        if (selectedCount === 0) return null;

        var inputStyle = { width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" };
        var labelStyle = { display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" };

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>5</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Assign Actions (Optional)</span>
                </div>
                <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "14px" }}>Add one or more action buttons that users can trigger on selected rows. <a href="/action-config" style={{ color: "#052049", fontWeight: "600" }}>Manage action modules here</a>.</p>

                {this.state.configActions.map((act, idx) => {
                    var selectedModule = null;
                    for (var i = 0; i < this.state.actions.length; i++) {
                        if (String(this.state.actions[i].id) === String(act.action_id)) {
                            selectedModule = this.state.actions[i];
                            break;
                        }
                    }

                    return (
                        <div key={idx} style={{ padding: "14px", marginBottom: "12px", background: "#f9fafb", border: "1px solid #e2e6ed", borderRadius: "6px", position: "relative" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                <span style={{ fontSize: "13px", fontWeight: "700", color: "#052049" }}>Action {idx + 1}</span>
                                <button
                                    style={{ fontSize: "11px", color: "#d64545", background: "none", border: "1px solid #d64545", borderRadius: "4px", padding: "3px 10px", cursor: "pointer" }}
                                    onClick={() => this.removeConfigAction(idx)}
                                >&times; Remove</button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                                <div>
                                    <label style={labelStyle}>Action Module (Credentials)</label>
                                    <select style={inputStyle} value={act.action_id} onChange={(e) => this.updateConfigAction(idx, 'action_id', e.target.value)} disabled={this.state.loadingActions}>
                                        <option value="">{this.state.loadingActions ? "Loading..." : "\u2014 Select module \u2014"}</option>
                                        {Array.isArray(this.state.actions) && this.state.actions.map((a) => (
                                            <option key={a.id} value={a.id}>{a.action_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Action Type</label>
                                    <input style={inputStyle} type="text" placeholder="e.g. send_email, approve, export, notify..." value={act.action_type} onChange={(e) => this.updateConfigAction(idx, 'action_type', e.target.value)} />
                                </div>
                            </div>

                            <div style={{ marginBottom: "10px" }}>
                                <label style={labelStyle}>Button Label</label>
                                <input style={inputStyle} type="text" placeholder='e.g. Send Email, Approve Selected...' value={act.action_button_label} onChange={(e) => this.updateConfigAction(idx, 'action_button_label', e.target.value)} />
                            </div>

                            {act.action_id && (
                                <div style={{ marginBottom: "10px" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#2c3345", cursor: "pointer" }}>
                                        <input type="checkbox" checked={act.prompt_mode || false} onChange={(e) => this.updateConfigAction(idx, 'prompt_mode', e.target.checked)} style={{ width: "16px", height: "16px" }} />
                                        <span style={{ fontWeight: "600" }}>Prompt mode</span>
                                        <span style={{ color: "#7c8ba1", fontWeight: "400" }}> — user provides email details at send time; recipient gets a shared view link</span>
                                    </label>
                                </div>
                            )}

                            {act.action_id && !act.prompt_mode && (
                                <div>
                                    <div style={{ marginBottom: "10px" }}>
                                        <label style={labelStyle}>Send To Email Address</label>
                                        <input style={inputStyle} type="email" placeholder="e.g. clinicalcommunications@ucsf.edu" value={act.email_to} onChange={(e) => this.updateConfigAction(idx, 'email_to', e.target.value)} />
                                    </div>

                                    <div style={{ padding: "12px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "8px" }}>Email Template</div>
                                        <p style={{ fontSize: "11px", color: "#7c8ba1", marginBottom: "8px" }}>Use <code style={{ background: "#f0f2f5", padding: "1px 4px", borderRadius: "3px" }}>{"{column_name}"}</code> for dynamic values. Leave blank for default.</p>

                                        <div style={{ marginBottom: "8px" }}>
                                            <label style={labelStyle}>Subject Template</label>
                                            <input style={inputStyle} type="text" placeholder="e.g. Expense Notification for {Employee Name}" value={act.subject_template} onChange={(e) => this.updateConfigAction(idx, 'subject_template', e.target.value)} />
                                        </div>

                                        <div>
                                            <label style={labelStyle}>Body Template (HTML)</label>
                                            <textarea
                                                style={Object.assign({}, inputStyle, { minHeight: "100px", fontFamily: "monospace", fontSize: "13px" })}
                                                placeholder={'<p>Hello,</p>\n<p>Please see the attached expense report data.</p>'}
                                                value={act.body_template}
                                                onChange={(e) => this.updateConfigAction(idx, 'body_template', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    style={{ padding: "10px 18px", fontSize: "13px", fontWeight: "600", background: "#ffffff", color: "#052049", border: "1px dashed #052049", borderRadius: "6px", cursor: "pointer", width: "100%" }}
                    onClick={() => this.addConfigAction()}
                >+ Add Action Button</button>

                {this.state.configActions.length === 0 && (
                    <div style={{ fontSize: "12px", color: "#7c8ba1", padding: "8px 12px", background: "#f0f2f5", borderRadius: "4px", marginTop: "10px" }}>
                        No actions added. Users will only be able to view data.
                    </div>
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
        var content = [];
        var selectedCount = Object.keys(this.state.selectedColumns).length;

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
                        <span style={{ margin: "auto" }}>- {this.state.editingConfigId ? "Edit Report Configuration" : "Expense Report Configuration"}</span>
                    </div>
                </div>
            </div>
        );

        content.push(
            <ExpenseNav key="nav" activeKey="configuration" />
        );

        content.push(
            <div key="main" style={{ maxWidth: "1100px", margin: "40px auto", padding: "0 20px" }}>
                {this.state.loadingEdit && (
                    <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>Loading configuration for editing...</div>
                )}
                {this.state.editingConfigId && !this.state.loadingEdit && (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px", padding: "12px 16px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "13px", color: "#052049" }}>
                        <span style={{ fontSize: "16px" }}>&#9998;</span>
                        <span><strong>Editing:</strong> {this.state.configName}</span>
                        <a href="/expense-report-config" style={{ marginLeft: "auto", fontSize: "12px", color: "#d64545", fontWeight: "600", textDecoration: "none" }}>Cancel Edit &amp; Create New</a>
                    </div>
                )}
                {this.renderExpenseSelection()}
                {this.renderDataPreview()}
                {this.renderOrderConfig()}
                {this.renderConfigName()}
                {this.renderActionSelection()}
                {this.renderResult()}

                {selectedCount > 0 && this.state.configName.trim() && (
                    <button
                        style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: "700", background: "#052049", color: "#ffffff", border: "none", borderRadius: "6px", cursor: this.state.submitting ? "not-allowed" : "pointer", marginTop: "20px", opacity: this.state.submitting ? 0.6 : 1 }}
                        onClick={() => this.handleSubmit()}
                        disabled={this.state.submitting}
                    >
                        {this.state.submitting ? "Saving..." : (this.state.editingConfigId ? "Update Configuration (" + selectedCount + " columns)" : "Save Configuration (" + selectedCount + " columns)")}
                    </button>
                )}
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

var selectStyle = {
    width: "100%", padding: "11px 14px", fontSize: "14px",
    border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345"
};

export default ExpenseReportConfig