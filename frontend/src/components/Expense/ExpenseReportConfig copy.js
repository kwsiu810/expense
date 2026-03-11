import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const EXPENSES_ENDPOINT = `${properties.backend}expense/get_expense_table`
const COMBINED_DATA_ENDPOINT = `${properties.backend}expense/get_combined_data/`
const SAVE_ENDPOINT = `${properties.backend}expense/save_report_config`
const DELETE_EXPENSE_ENDPOINT = `${properties.backend}expense/delete_expense/`
const ACTIONS_ENDPOINT = `${properties.backend}expense/save_action`

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
            selectedActionId: "",
            actionButtonLabel: "",
            actionEmailTo: "clinicalcommunications@ucsf.edu",
            actionSubjectTemplate: "",
            actionBodyTemplate: ""
        };
    }

    componentDidMount() {
        this.fetchExpenses();
        this.fetchActions();
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
        if (!this.state.selectedExpense) {
            this.setState({ result: { type: "error", message: "Please select an expense type." } });
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
            expense_table_id: parseInt(this.state.selectedExpense),
            columns: configColumns,
            action_id: this.state.selectedActionId ? parseInt(this.state.selectedActionId) : null,
            action_button_label: this.state.actionButtonLabel.trim(),
            action_column_mapping: this.state.selectedActionId ? {
                email_to: this.state.actionEmailTo.trim() || "",
                subject_template: this.state.actionSubjectTemplate || "",
                body_template: this.state.actionBodyTemplate || ""
            } : {}
        };

        fetch(SAVE_ENDPOINT, {
            method: "POST",
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

    renderExpenseSelection() {
        var hasSelection = this.state.selectedExpense !== "";
        return (
            <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>1</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select Expense Type</span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <select
                        style={Object.assign({}, selectStyle, { flex: 1 })}
                        value={this.state.selectedExpense}
                        onChange={(e) => this.handleExpenseChange(e.target.value)}
                        disabled={this.state.loadingExpenses || this.state.deletingExpense}
                    >
                        <option value="">{this.state.loadingExpenses ? "Loading expenses..." : "\u2014 Select an expense type \u2014"}</option>
                        {this.state.expenses.map((exp) => (
                            <option key={exp.id} value={exp.id}>{exp.name}</option>
                        ))}
                    </select>
                    {hasSelection && (
                        <button
                            style={{
                                padding: "11px 18px", fontSize: "13px", fontWeight: "600", border: "none", borderRadius: "6px", cursor: this.state.deletingExpense ? "not-allowed" : "pointer",
                                background: this.state.confirmDeleteExpense ? "#d64545" : "#fdf0f0",
                                color: this.state.confirmDeleteExpense ? "#ffffff" : "#d64545",
                                whiteSpace: "nowrap", transition: "all 0.15s"
                            }}
                            onClick={() => this.handleDeleteExpense()}
                            disabled={this.state.deletingExpense}
                        >
                            {this.state.deletingExpense ? "Deleting..." : (this.state.confirmDeleteExpense ? "Confirm Delete" : "Delete Expense")}
                        </button>
                    )}
                </div>
                {this.state.confirmDeleteExpense && (
                    <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "6px", background: "#fdf0f0", border: "1px solid #f0c2c2", fontSize: "12px", color: "#d64545", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: "700" }}>&#9888;</span>
                        <span>This will permanently delete this expense type, all uploaded data, column definitions, and any related report configurations. Click <strong>Confirm Delete</strong> to proceed or select a different expense to cancel.</span>
                    </div>
                )}
            </div>
        );
    }

    renderDataPreview() {
        if (!this.state.selectedExpense) return null;

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

    renderActionSelection() {
        var selectedCount = Object.keys(this.state.selectedColumns).length;
        if (selectedCount === 0) return null;

        var selectedAction = null;
        for (var i = 0; i < this.state.actions.length; i++) {
            if (String(this.state.actions[i].id) === String(this.state.selectedActionId)) {
                selectedAction = this.state.actions[i];
                break;
            }
        }

        var sortedColumns = this.getSelectedColumnsSorted();

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={stepNumStyle}>5</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Assign Action (Optional)</span>
                </div>
                <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "10px" }}>Assign an action that users can trigger on selected rows in the report.</p>

                <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Action</label>
                    <select
                        style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345" }}
                        value={this.state.selectedActionId}
                        onChange={(e) => this.setState({ selectedActionId: e.target.value, actionEmailTo: "clinicalcommunications@ucsf.edu", actionSubjectTemplate: "", actionBodyTemplate: "" })}
                        disabled={this.state.loadingActions}
                    >
                        <option value="">{this.state.loadingActions ? "Loading actions..." : "\u2014 No action \u2014"}</option>
                        {this.state.actions.map((a) => (
                            <option key={a.id} value={a.id}>{a.action_name} ({a.action_type === "send_email" ? "Send Email" : a.action_type})</option>
                        ))}
                    </select>
                </div>

                {this.state.selectedActionId && (
                    <div>
                        <div style={{ marginBottom: "14px" }}>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Button Label</label>
                            <input
                                style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                                type="text"
                                placeholder='e.g. Send Email, Notify, Process Selected...'
                                value={this.state.actionButtonLabel}
                                onChange={(e) => this.setState({ actionButtonLabel: e.target.value })}
                            />
                        </div>

                        {selectedAction && selectedAction.action_type === "send_email" && (
                            <div style={{ marginBottom: "14px" }}>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Send To Email Address</label>
                                <p style={{ fontSize: "12px", color: "#7c8ba1", marginBottom: "6px" }}>The email address that will receive the report data.</p>
                                <input
                                    style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                                    type="email"
                                    placeholder="e.g. clinicalcommunications@ucsf.edu"
                                    value={this.state.actionEmailTo}
                                    onChange={(e) => this.setState({ actionEmailTo: e.target.value })}
                                />
                            </div>
                        )}

                        {selectedAction && selectedAction.action_type === "send_email" && (
                            <div style={{ padding: "14px", background: "#f9fafb", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "14px" }}>
                                <div style={{ fontSize: "13px", fontWeight: "600", color: "#052049", marginBottom: "10px" }}>Email Template</div>
                                <p style={{ fontSize: "12px", color: "#7c8ba1", marginBottom: "10px" }}>Use <code style={{ background: "#f0f2f5", padding: "1px 4px", borderRadius: "3px" }}>{"{column_name}"}</code> to insert values from the report columns. Leave blank for default.</p>

                                <div style={{ marginBottom: "10px" }}>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Subject Template</label>
                                    <input
                                        style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                                        type="text"
                                        placeholder="e.g. Expense Notification for {Employee Name}"
                                        value={this.state.actionSubjectTemplate}
                                        onChange={(e) => this.setState({ actionSubjectTemplate: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Body Template (HTML)</label>
                                    <textarea
                                        style={{ width: "100%", padding: "11px 14px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box", minHeight: "120px", fontFamily: "monospace" }}
                                        placeholder={'<p>Hello,</p>\n<p>Please see the attached expense report data.</p>'}
                                        value={this.state.actionBodyTemplate}
                                        onChange={(e) => this.setState({ actionBodyTemplate: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!this.state.selectedActionId && (
                    <div style={{ fontSize: "12px", color: "#7c8ba1", padding: "8px 12px", background: "#f0f2f5", borderRadius: "4px" }}>
                        No action selected. Users will only be able to view data. <a href="/action-config" style={{ color: "#052049", fontWeight: "600" }}>Configure actions here</a>.
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
                        <span style={{ margin: "auto" }}>- Expense Report Configuration</span>
                    </div>
                </div>
            </div>
        );

        content.push(
            <div key="nav" style={{ display: "flex", gap: "0px", background: "#f0f2f5", borderBottom: "2px solid #e2e6ed", padding: "0 4%" }}>
                <a href="/expense-upload" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Upload</a>
                <span style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "700", color: "#ffffff", background: "#052049", cursor: "default", borderBottom: "2px solid #052049" }}>Configuration</span>
                <a href="/action-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Actions</a>
                <a href="/expense-report-preview" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Preview</a>
                <a href="/expense-reports" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Reports</a>
            </div>
        );

        content.push(
            <div key="main" style={{ maxWidth: "1100px", margin: "40px auto", padding: "0 20px" }}>
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
                        {this.state.submitting ? "Saving..." : "Save Configuration (" + selectedCount + " columns)"}
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