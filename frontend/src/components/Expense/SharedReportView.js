import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const SHARED_ENDPOINT = `${properties.backend}expense/send_email/shared/`
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

class SharedReportView extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            viewData: null,
            selectedRows: {},
            executingAction: false,
            actionResult: null,
            actionedHashes: {},
            promptModal: null
        };
        this.tableRef = React.createRef();
    }

    componentDidMount() {
        this.loadSharedView();
    }

    getToken() {
        var path = window.location.pathname;
        var parts = path.split('/');
        return parts[parts.length - 1] || '';
    }

    loadSharedView() {
        var token = this.getToken();
        if (!token) {
            this.setState({ loading: false, error: 'Invalid shared view link.' });
            return;
        }

        fetch(SHARED_ENDPOINT + token, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => { throw new Error(data.error || 'Not found'); });
            }
            return response.json();
        })
        .then(data => {
            // Build actionedHashes from action_logs returned by the endpoint
            var hashes = {};
            var logs = data.action_logs || [];
            for (var i = 0; i < logs.length; i++) {
                hashes[logs[i].row_hash] = {
                    employee_name: logs[i].employee_name || '',
                    employee_id: logs[i].employee_id || '',
                    created_date: logs[i].created_date || '',
                    action_type: logs[i].action_type || ''
                };
            }
            this.setState({ loading: false, viewData: data, actionedHashes: hashes });
        })
        .catch(err => {
            this.setState({ loading: false, error: err.message || 'Failed to load shared view.' });
        });
    }

    refreshActionLogs() {
        var token = this.getToken();
        if (!token) return;

        fetch(SHARED_ENDPOINT + token, {
            method: "GET",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            var hashes = {};
            var logs = data.action_logs || [];
            for (var i = 0; i < logs.length; i++) {
                hashes[logs[i].row_hash] = {
                    employee_name: logs[i].employee_name || '',
                    employee_id: logs[i].employee_id || '',
                    created_date: logs[i].created_date || '',
                    action_type: logs[i].action_type || ''
                };
            }
            this.setState({ actionedHashes: hashes });
        })
        .catch(function(err) {
            console.log("Failed to refresh action logs:", err);
        });
    }

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

    isRowActioned(row) {
        var hash = this.hashRow(row);
        return this.state.actionedHashes[hash] ? true : false;
    }

    getRowActionInfo(row) {
        var hash = this.hashRow(row);
        return this.state.actionedHashes[hash] || null;
    }

    getActionColorIndex(actionType) {
        var data = this.state.viewData;
        // Use full actions list (including prompt_mode) for consistent color mapping
        var actions = data ? data.actions || [] : [];
        for (var i = 0; i < actions.length; i++) {
            if (actions[i].action_type === actionType) return i % ACTION_COLORS.length;
        }
        return 0;
    }

    getRowActionColor(row) {
        var info = this.getRowActionInfo(row);
        if (!info || !info.action_type) return ACTION_COLORS[0];
        return ACTION_COLORS[this.getActionColorIndex(info.action_type)];
    }

    toggleRowSelect(idx) {
        var rows = this.state.viewData ? this.state.viewData.rows || [] : [];
        if (this.isRowActioned(rows[idx])) return;
        var selected = Object.assign({}, this.state.selectedRows);
        if (selected[idx]) { delete selected[idx]; } else { selected[idx] = true; }
        this.setState({ selectedRows: selected });
    }

    toggleSelectAll() {
        var rows = this.state.viewData ? this.state.viewData.rows || [] : [];
        var selected = Object.assign({}, this.state.selectedRows);
        var selectableCount = 0;
        var selectedCount = Object.keys(selected).length;
        for (var i = 0; i < rows.length; i++) {
            if (!this.isRowActioned(rows[i])) selectableCount++;
        }
        if (selectedCount === selectableCount) {
            this.setState({ selectedRows: {} });
        } else {
            var newSelected = {};
            for (var i = 0; i < rows.length; i++) {
                if (!this.isRowActioned(rows[i])) newSelected[i] = true;
            }
            this.setState({ selectedRows: newSelected });
        }
    }

    executeAction(configActionId) {
        var rows = this.state.viewData ? this.state.viewData.rows || [] : [];
        var selectedIndices = Object.keys(this.state.selectedRows);
        if (selectedIndices.length === 0) {
            this.setState({ actionResult: { type: "error", message: "Please select at least one row." } });
            return;
        }

        var selectedData = [];
        for (var i = 0; i < selectedIndices.length; i++) {
            var idx = parseInt(selectedIndices[i]);
            if (rows[idx]) selectedData.push(rows[idx]);
        }

        // Default button (id=0) always opens prompt
        if (!configActionId || configActionId === 0) {
            this.setState({
                promptModal: { configActionId: 0, selectedData: selectedData, email_to: '', cc: '', subject: '', body: '' }
            });
            return;
        }

        // Find the action to check prompt_mode
        var actions = this.state.viewData ? this.state.viewData.actions || [] : [];
        var targetAction = null;
        for (var a = 0; a < actions.length; a++) {
            if (String(actions[a].id) === String(configActionId)) { targetAction = actions[a]; break; }
        }

        var isPrompt = !targetAction ||
            targetAction.prompt_mode === true || targetAction.prompt_mode === 't' ||
            targetAction.prompt_mode === 'true' || targetAction.prompt_mode === 1;

        if (isPrompt) {
            this.setState({
                promptModal: { configActionId: configActionId, selectedData: selectedData, email_to: '', cc: '', subject: '', body: '' }
            });
            return;
        }

        // Non-prompt action with action module — send directly
        this.doSendAction(configActionId, selectedData, {});
    }

    doSendAction(configActionId, selectedData, promptFields) {
        var data = this.state.viewData;
        this.setState({ executingAction: true, actionResult: null, promptModal: null });

        var payload = {
            config_id: data.config_id,
            config_action_id: configActionId || 0,
            selected_rows: selectedData,
            employee_id: '',
            employee_name: data.created_by_email || '',
            employee_title: '',
            employee_department: '',
            base_url: window.location.origin,
            skip_shared_view: true,
            shared_view_token: data.token || ''
        };

        if (promptFields && promptFields.email_to) {
            payload.prompt_mode = true;
            payload.prompt_email_to = promptFields.email_to;
            payload.prompt_cc = promptFields.cc || '';
            payload.prompt_subject = promptFields.subject || '';
            payload.prompt_body = promptFields.body || '';
        }

        fetch(EXECUTE_ENDPOINT, {
            method: "POST",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json().then(d => {
            if (!response.ok) throw new Error(d.error || "Action failed");
            return d;
        }))
        .then(d => {
            var resultType = d.failed > 0 ? "warning" : "success";
            // Mark actioned rows locally
            var hashes = Object.assign({}, this.state.actionedHashes);
            for (var i = 0; i < selectedData.length; i++) {
                var h = this.hashRow(selectedData[i]);
                var action = data.actions.find(function(a) { return String(a.id) === String(configActionId); });
                hashes[h] = { employee_name: '', employee_id: '', created_date: new Date().toISOString(), action_type: action ? action.action_type : '' };
            }
            this.setState({ executingAction: false, selectedRows: {}, actionedHashes: hashes, actionResult: { type: resultType, message: d.message, shared_link: d.shared_link } }, () => {
                // Re-fetch action logs filtered by this token
                this.refreshActionLogs();
            });
        })
        .catch(err => {
            this.setState({ executingAction: false, actionResult: { type: "error", message: err.message || "Action failed." } });
        });
    }

    render() {
        if (this.state.loading) {
            return (
                <div style={{ minHeight: "500px" }}>
                    <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#7c8ba1", fontSize: "15px" }}>Loading shared view...</div>
                </div>
            );
        }

        if (this.state.error) {
            return (
                <div style={{ minHeight: "500px" }}>
                    <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                    <div style={{ textAlign: "center", padding: "80px 20px" }}>
                        <div style={{ fontSize: "48px", marginBottom: "16px" }}>&#128274;</div>
                        <div style={{ fontSize: "16px", fontWeight: "600", color: "#d64545", marginBottom: "8px" }}>Shared View Not Found</div>
                        <div style={{ fontSize: "13px", color: "#7c8ba1" }}>{this.state.error}</div>
                    </div>
                </div>
            );
        }

        var data = this.state.viewData;
        var rows = data.rows || [];
        var columns = data.columns || [];
        var actions = data.actions || [];
        var hasAction = actions.length > 0;
        var selectedCount = Object.keys(this.state.selectedRows).length;
        var selectableCount = 0;
        for (var sc = 0; sc < rows.length; sc++) {
            if (!this.isRowActioned(rows[sc])) selectableCount++;
        }
        var allSelected = selectableCount > 0 && selectedCount === selectableCount;

        return (
            <div style={{ minHeight: "500px" }}>
                <div style={desktopTopStyle}>
                    <span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span>
                </div>
                <div style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                    <div style={{ marginLeft: "4%" }}>
                        <div style={{ float: "left", display: "grid", height: "100px" }}>
                            <img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" />
                        </div>
                        <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}>
                            <span style={{ margin: "auto" }}>- Shared Report View</span>
                        </div>
                    </div>
                </div>

                <div style={{ maxWidth: "1200px", margin: "30px auto", padding: "0 20px" }}>
                    {/* Header info */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "14px", padding: "12px 16px", borderRadius: "6px", background: "#f0f5ff", border: "1px solid #d0dff5", fontSize: "13px", color: "#052049", alignItems: "center" }}>
                        <span><strong>Report:</strong> {data.config_name}</span>
                        <span>&middot;</span>
                        <span><strong>Rows:</strong> {rows.length}</span>
                        {data.created_by_name && <span>&middot; <strong>Sent by:</strong> {data.created_by_name}</span>}
                        {data.created_date && <span>&middot; {new Date(data.created_date).toLocaleDateString()}</span>}
                        {selectedCount > 0 && <span>&middot; <strong>{selectedCount} selected</strong></span>}
                    </div>

                    {/* Action bar - always show Send Email, plus any configured action buttons */}
                    {selectedCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", padding: "10px 14px", borderRadius: "6px", background: "#fafbfc", border: "1px solid #e2e6ed", flexWrap: "wrap" }}>
                            {actions.length > 0 ? (
                                actions.map((act, ai) => {
                                    var label = act.action_button_label || act.action_type || "Action " + (ai + 1);
                                    var colorIdx = this.getActionColorIndex(act.action_type);
                                    var color = ACTION_COLORS[colorIdx];
                                    return (
                                        <button
                                            key={act.id}
                                            style={{
                                                padding: "9px 18px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px",
                                                background: color.bg, color: "#fff",
                                                cursor: this.state.executingAction ? "not-allowed" : "pointer",
                                                opacity: this.state.executingAction ? 0.6 : 1
                                            }}
                                            onClick={() => this.executeAction(act.id)}
                                            disabled={this.state.executingAction}
                                        >
                                            {this.state.executingAction ? "Processing..." : label + " (" + selectedCount + ")"}
                                        </button>
                                    );
                                })
                            ) : (
                                <button
                                    style={{
                                        padding: "9px 18px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px",
                                        background: "#052049", color: "#fff",
                                        cursor: this.state.executingAction ? "not-allowed" : "pointer",
                                        opacity: this.state.executingAction ? 0.6 : 1
                                    }}
                                    onClick={() => this.executeAction(0)}
                                    disabled={this.state.executingAction}
                                >
                                    {this.state.executingAction ? "Processing..." : "\u2709 Send Email (" + selectedCount + ")"}
                                </button>
                            )}
                            <span style={{ fontSize: "12px", color: "#7c8ba1", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.setState({ selectedRows: {} })}>Clear</span>
                        </div>
                    )}

                    {/* Action result */}
                    {this.state.actionResult && (
                        <div style={{
                            display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px", borderRadius: "6px", fontSize: "13px", marginBottom: "14px",
                            background: this.state.actionResult.type === "success" ? "#eaf7f0" : "#fdf0f0",
                            color: this.state.actionResult.type === "success" ? "#2a6e4a" : "#d64545",
                            border: this.state.actionResult.type === "success" ? "1px solid #c2e3d3" : "1px solid #f0c2c2"
                        }}>
                            <span style={{ fontWeight: "600" }}>{this.state.actionResult.message}</span>
                            {this.state.actionResult.shared_link && (
                                <span style={{ fontSize: "12px" }}>Shared view: <a href={this.state.actionResult.shared_link} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", fontWeight: "600" }}>{this.state.actionResult.shared_link}</a></span>
                            )}
                        </div>
                    )}

                    {/* Prompt modal */}
                    {this.state.promptModal && (
                        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={() => this.setState({ promptModal: null })}
                        >
                            <div style={{ background: "#fff", borderRadius: "10px", padding: "28px", maxWidth: "520px", width: "90%", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div style={{ fontSize: "16px", fontWeight: "700", color: "#052049", marginBottom: "4px" }}>&#9993; Send Email</div>
                                <div style={{ fontSize: "12px", color: "#7c8ba1", marginBottom: "18px" }}>{this.state.promptModal.selectedData.length} row(s) selected &middot; CSV will be attached</div>
                                <div style={{ marginBottom: "12px" }}>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Send To Email *</label>
                                    <input style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }} type="email" placeholder="recipient@ucsf.edu" autoFocus value={this.state.promptModal.email_to} onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { email_to: e.target.value }) })} />
                                </div>
                                <div style={{ marginBottom: "12px" }}>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>CC</label>
                                    <input style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }} type="text" placeholder="cc1@ucsf.edu, cc2@ucsf.edu" value={this.state.promptModal.cc} onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { cc: e.target.value }) })} />
                                </div>
                                <div style={{ marginBottom: "12px" }}>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Subject</label>
                                    <input style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box" }} type="text" placeholder="Expense Report Data" value={this.state.promptModal.subject} onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { subject: e.target.value }) })} />
                                </div>
                                <div style={{ marginBottom: "18px" }}>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Body (optional)</label>
                                    <textarea style={{ width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box", minHeight: "80px", fontFamily: "inherit", resize: "vertical" }} placeholder="Optional message..." value={this.state.promptModal.body} onChange={(e) => this.setState({ promptModal: Object.assign({}, this.state.promptModal, { body: e.target.value }) })} />
                                </div>
                                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                    <button style={{ padding: "10px 20px", fontSize: "13px", fontWeight: "600", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#fff", color: "#2c3345", cursor: "pointer" }} onClick={() => this.setState({ promptModal: null })}>Cancel</button>
                                    <button style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px", background: this.state.promptModal.email_to ? "#052049" : "#ccc", color: "#fff", cursor: this.state.promptModal.email_to ? "pointer" : "not-allowed" }}
                                        disabled={!this.state.promptModal.email_to || this.state.executingAction}
                                        onClick={() => { var pm = this.state.promptModal; this.doSendAction(pm.configActionId, pm.selectedData, { email_to: pm.email_to, cc: pm.cc, subject: pm.subject, body: pm.body }); }}
                                    >{this.state.executingAction ? "Sending..." : "Send Email"}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    <div ref={this.tableRef} style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "400px" }}>
                            <thead>
                                <tr>
                                    {(
                                        <th style={{ padding: "10px 8px", borderBottom: "2px solid #e2e6ed", background: "#052049", textAlign: "center", width: "36px" }}>
                                            <input type="checkbox" checked={allSelected} onChange={() => this.toggleSelectAll()} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                        </th>
                                    )}
                                    {columns.map((col, i) => (
                                        <th key={i} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e6ed", fontWeight: "600", whiteSpace: "nowrap", background: "#052049", color: "#ffffff" }}>
                                            {col.column_name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length + (1)} style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>No rows.</td>
                                    </tr>
                                ) : (
                                    rows.map((row, ri) => {
                                        var isRowSelected = this.state.selectedRows[ri] ? true : false;
                                        var isActioned = this.isRowActioned(row);
                                        var actionColor = isActioned ? this.getRowActionColor(row) : null;
                                        var rowBg = isActioned ? actionColor.light : (isRowSelected ? "#e8f0fe" : (ri % 2 === 0 ? "#fafbfc" : "#ffffff"));
                                        return (
                                            <tr key={ri}>
                                                {(
                                                    <td style={{ padding: "8px 8px", borderBottom: "1px solid #e2e6ed", textAlign: "center", background: rowBg }}>
                                                        {isActioned ? (
                                                            <span style={{ fontSize: "14px", color: actionColor.check }}>&#10003;</span>
                                                        ) : (
                                                            <input type="checkbox" checked={isRowSelected} onChange={() => this.toggleRowSelect(ri)} style={{ cursor: "pointer", width: "15px", height: "15px" }} />
                                                        )}
                                                    </td>
                                                )}
                                                {columns.map((col, ci) => (
                                                    <td key={ci} style={{ padding: "8px 12px", borderBottom: "1px solid #e2e6ed", color: isActioned ? actionColor.text : "#2c3345", whiteSpace: "nowrap", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", background: rowBg }}>
                                                        {row[col.column_name] || "\u2014"}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: "16px", fontSize: "12px", color: "#7c8ba1", textAlign: "center" }}>
                        This is a shared view from UCSF Expense Report System
                    </div>
                </div>
            </div>
        );
    }
}

export default SharedReportView