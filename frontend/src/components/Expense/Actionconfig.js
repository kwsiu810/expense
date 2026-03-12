import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensesupernav.js'
import { properties } from '../../properties/properties.js'

const ACTIONS_ENDPOINT = `${properties.backend}expense/save_action`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ActionConfig extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            actions: [],
            loadingActions: true,
            editingAction: null,
            actionName: "",
            actionType: "send_email",
            clientId: "",
            clientSecret: "",
            tenantId: "",
            senderEmail: "",
            saving: false,
            result: null,
            confirmDeleteId: null,
            deleting: false
        };
    }

    componentDidMount() {
        this.fetchActions();
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

    handleEdit(action) {
        var config = action.action_config || {};
        this.setState({
            editingAction: action.id,
            actionName: action.action_name,
            actionType: action.action_type || "send_email",
            clientId: config.client_id || "",
            clientSecret: config.client_secret || "",
            tenantId: config.tenant_id || "",
            senderEmail: config.sender_email || "",
            result: null
        });
    }

    handleNew() {
        this.setState({
            editingAction: "new",
            actionName: "",
            actionType: "send_email",
            clientId: "0947537a-5dd5-4c3e-990f-58eedb96e327",
            clientSecret: "6gd8Q~sI-ccfIwwODrGLcgxnndRqsXi7myCMCbBM",
            tenantId: "a52fd37d-7666-49ce-b534-c4505c2f5226",
            senderEmail: "clinicalcommunications@ucsf.edu",
            result: null
        });
    }

    handleCancel() {
        this.setState({ editingAction: null, result: null });
    }

    handleSave() {
        if (!this.state.actionName.trim()) {
            this.setState({ result: { type: "error", message: "Action name is required." } });
            return;
        }

        this.setState({ saving: true, result: null });

        var actionConfig = {};
        if (this.state.actionType === "send_email") {
            actionConfig = {
                client_id: this.state.clientId.trim(),
                client_secret: this.state.clientSecret.trim(),
                tenant_id: this.state.tenantId.trim(),
                sender_email: this.state.senderEmail.trim()
            };
        }

        var payload = {
            action_name: this.state.actionName.trim(),
            action_type: this.state.actionType,
            action_config: actionConfig
        };

        var isNew = this.state.editingAction === "new";
        var url = isNew ? ACTIONS_ENDPOINT : ACTIONS_ENDPOINT + "/" + this.state.editingAction;
        var method = isNew ? "POST" : "PUT";

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || "Save failed");
            return data;
        }))
        .then(data => {
            this.setState({ saving: false, editingAction: null, result: { type: "success", message: data.message || "Action saved." } }, () => {
                this.fetchActions();
            });
        })
        .catch(err => {
            this.setState({ saving: false, result: { type: "error", message: err.message || "Something went wrong." } });
        });
    }

    handleDelete(actionId) {
        if (this.state.confirmDeleteId !== actionId) {
            this.setState({ confirmDeleteId: actionId });
            return;
        }

        this.setState({ deleting: true });

        fetch(ACTIONS_ENDPOINT + "/" + actionId, {
            method: "DELETE",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || "Delete failed");
            return data;
        }))
        .then(data => {
            this.setState({ deleting: false, confirmDeleteId: null, editingAction: null, result: { type: "success", message: data.message } }, () => {
                this.fetchActions();
            });
        })
        .catch(err => {
            this.setState({ deleting: false, confirmDeleteId: null, result: { type: "error", message: err.message } });
        });
    }

    renderForm() {
        if (!this.state.editingAction) return null;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>
                        {this.state.editingAction === "new" ? "New Action" : "Edit Action"}
                    </span>
                    <span style={{ fontSize: "13px", color: "#7c8ba1", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.handleCancel()}>Cancel</span>
                </div>

                <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Action Name</label>
                    <input style={inputStyle} type="text" placeholder="e.g. UCSF Email Notification" value={this.state.actionName} onChange={(e) => this.setState({ actionName: e.target.value })} />
                </div>

                <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Action Type</label>
                    <select style={inputStyle} value={this.state.actionType} onChange={(e) => this.setState({ actionType: e.target.value })}>
                        <option value="send_email">Send Email (Microsoft Graph API)</option>
                    </select>
                </div>

                {this.state.actionType === "send_email" && (
                    <div>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "#052049", marginBottom: "12px", paddingTop: "8px", borderTop: "1px solid #e2e6ed" }}>Microsoft Graph API Credentials</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                            <div>
                                <label style={labelStyle}>Tenant ID</label>
                                <input style={inputStyle} type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={this.state.tenantId} onChange={(e) => this.setState({ tenantId: e.target.value })} />
                            </div>
                            <div>
                                <label style={labelStyle}>Client ID</label>
                                <input style={inputStyle} type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={this.state.clientId} onChange={(e) => this.setState({ clientId: e.target.value })} />
                            </div>
                        </div>

                        <div style={{ marginBottom: "14px" }}>
                            <label style={labelStyle}>Client Secret</label>
                            <input style={inputStyle} type="password" placeholder="Client secret value" value={this.state.clientSecret} onChange={(e) => this.setState({ clientSecret: e.target.value })} />
                        </div>

                        <div style={{ marginBottom: "14px" }}>
                            <label style={labelStyle}>Sender Email Address</label>
                            <input style={inputStyle} type="text" placeholder="noreply@ucsf.edu" value={this.state.senderEmail} onChange={(e) => this.setState({ senderEmail: e.target.value })} />
                            <p style={{ fontSize: "11px", color: "#7c8ba1", marginTop: "4px" }}>The email account used to send emails via Microsoft Graph API.</p>
                        </div>
                    </div>
                )}

                <button
                    style={{ padding: "12px 24px", fontSize: "14px", fontWeight: "700", background: "#052049", color: "#fff", border: "none", borderRadius: "6px", cursor: this.state.saving ? "not-allowed" : "pointer", opacity: this.state.saving ? 0.6 : 1 }}
                    onClick={() => this.handleSave()}
                    disabled={this.state.saving}
                >
                    {this.state.saving ? "Saving..." : "Save Action"}
                </button>
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
                            <span style={{ margin: "auto" }}>- Action Configuration</span>
                        </div>
                    </div>
                </div>

                <ExpenseNav activeKey="actions" />

                <div style={{ maxWidth: "800px", margin: "30px auto", padding: "0 20px" }}>
                    {/* Action list */}
                    <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                            <span style={{ fontSize: "16px", fontWeight: "600" }}>Configured Actions</span>
                            <span style={{ fontSize: "13px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.handleNew()}>+ New Action</span>
                        </div>

                        {this.state.loadingActions ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>Loading...</div>
                        ) : this.state.actions.length === 0 ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "14px" }}>No actions configured yet. Click "+ New Action" to create one.</div>
                        ) : (
                            <div style={{ border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden" }}>
                                {this.state.actions.map((action, idx) => {
                                    var isEditing = this.state.editingAction === action.id;
                                    var isConfirmDelete = this.state.confirmDeleteId === action.id;
                                    var config = action.action_config || {};
                                    return (
                                        <div key={action.id}
                                            style={{
                                                display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px",
                                                borderBottom: idx < this.state.actions.length - 1 ? "1px solid #e2e6ed" : "none",
                                                background: isEditing ? "#e8f0fe" : (idx % 2 === 0 ? "#fafbfc" : "#ffffff")
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: "14px", fontWeight: "600", color: "#2c3345" }}>{action.action_name}</div>
                                                <div style={{ fontSize: "12px", color: "#7c8ba1", marginTop: "2px" }}>
                                                    Type: {action.action_type === "send_email" ? "Send Email" : action.action_type}
                                                    {config.sender_email && <span> &middot; From: {config.sender_email}</span>}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: "13px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }} onClick={() => this.handleEdit(action)}>Edit</span>
                                            <button
                                                style={{
                                                    padding: "5px 12px", fontSize: "12px", fontWeight: "600", border: "none", borderRadius: "4px", cursor: "pointer",
                                                    background: isConfirmDelete ? "#d64545" : "#fdf0f0",
                                                    color: isConfirmDelete ? "#ffffff" : "#d64545"
                                                }}
                                                onClick={() => this.handleDelete(action.id)}
                                                disabled={this.state.deleting}
                                            >
                                                {this.state.deleting && isConfirmDelete ? "Deleting..." : (isConfirmDelete ? "Confirm" : "Delete")}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {this.renderForm()}
                    {this.renderResult()}
                </div>
            </div>
        );
    }
}

var labelStyle = { display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" };
var inputStyle = { width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" };

export default ActionConfig