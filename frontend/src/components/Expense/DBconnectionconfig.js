import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const ENDPOINT = `${properties.backend}expense/db_connection`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box", color: "#2c3345"
}

class DbConnectionConfig extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            connections: [],
            loading: true,
            // Form
            editId: null,
            connection_name: "",
            db_type: "postgres",
            db_host: "",
            db_port: "",
            db_user: "",
            db_password: "",
            db_name: "",
            saving: false,
            result: null,
            testResult: null,
            testing: false,
            // Delete confirm
            deleteConfirm: null
        };
    }

    componentDidMount() {
        this.fetchConnections();
    }

    fetchConnections() {
        fetch(ENDPOINT, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => this.setState({ connections: Array.isArray(data) ? data : [], loading: false }))
        .catch(() => this.setState({ connections: [], loading: false }));
    }

    resetForm() {
        this.setState({
            editId: null, connection_name: "", db_type: "postgres", db_host: "", db_port: "", db_user: "", db_password: "", db_name: "",
            result: null, testResult: null
        });
    }

    loadForEdit(conn) {
        // Fetch full details including password
        fetch(ENDPOINT + '/' + conn.id, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => {
            this.setState({
                editId: data.id,
                connection_name: data.connection_name || '',
                db_type: data.db_type || 'postgres',
                db_host: data.db_host || '',
                db_port: data.db_port || '',
                db_user: data.db_user || '',
                db_password: data.db_password || '',
                db_name: data.db_name || '',
                result: null, testResult: null
            });
        });
    }

    handleSave() {
        if (!this.state.connection_name.trim() || !this.state.db_host.trim() || !this.state.db_user.trim()) {
            this.setState({ result: { type: "error", message: "Name, Host, and User are required." } });
            return;
        }

        this.setState({ saving: true, result: null });

        var payload = {
            connection_name: this.state.connection_name.trim(),
            db_type: this.state.db_type,
            db_host: this.state.db_host.trim(),
            db_port: this.state.db_port || (this.state.db_type === 'mssql' ? '1433' : '5432'),
            db_user: this.state.db_user.trim(),
            db_password: this.state.db_password,
            db_name: this.state.db_name.trim()
        };

        var method = this.state.editId ? "PUT" : "POST";
        var url = this.state.editId ? ENDPOINT + '/' + this.state.editId : ENDPOINT;

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                this.setState({ saving: false, result: { type: "error", message: data.error } });
            } else {
                this.setState({ saving: false, result: { type: "success", message: data.message } });
                this.resetForm();
                this.fetchConnections();
            }
        })
        .catch(err => {
            this.setState({ saving: false, result: { type: "error", message: err.message } });
        });
    }

    handleTest() {
        this.setState({ testing: true, testResult: null });

        var payload = {
            db_type: this.state.db_type,
            db_host: this.state.db_host.trim(),
            db_port: this.state.db_port || (this.state.db_type === 'mssql' ? '1433' : '5432'),
            db_user: this.state.db_user.trim(),
            db_password: this.state.db_password,
            db_name: this.state.db_name.trim()
        };

        fetch(ENDPOINT + '/test', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            this.setState({ testing: false, testResult: data });
        })
        .catch(err => {
            this.setState({ testing: false, testResult: { success: false, message: err.message } });
        });
    }

    handleDelete(id) {
        fetch(ENDPOINT + '/' + id, { method: "DELETE" })
        .then(r => r.json())
        .then(() => {
            this.setState({ deleteConfirm: null });
            this.fetchConnections();
        });
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
                            <span style={{ margin: "auto" }}>- Database Connections</span>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <div style={{ display: "flex", gap: "0px", background: "#f0f2f5", borderBottom: "2px solid #e2e6ed", padding: "0 4%" }}>
                    <a href="/expense-upload" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Upload</a>
                    <a href="/expense-report-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Configuration</a>
                    <a href="/action-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Actions</a>
                    <span style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "700", color: "#ffffff", background: "#052049", borderBottom: "2px solid #052049" }}>DB Connections</span>
                    <a href="/expense-report-preview" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Preview</a>
                    <a href="/expense-reports" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", borderBottom: "2px solid transparent" }}>Reports</a>
                </div>

                <div style={{ maxWidth: "900px", margin: "30px auto", padding: "0 20px" }}>

                    {/* Form */}
                    <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "24px" }}>
                        <div style={{ fontSize: "15px", fontWeight: "700", color: "#052049", marginBottom: "16px" }}>
                            {this.state.editId ? "Edit Connection" : "New Database Connection"}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Connection Name *</label>
                                <input style={inputStyle} type="text" placeholder="e.g. UCSF Prod SQL" value={this.state.connection_name} onChange={(e) => this.setState({ connection_name: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Database Type *</label>
                                <select style={inputStyle} value={this.state.db_type} onChange={(e) => this.setState({ db_type: e.target.value, db_port: e.target.value === 'mssql' ? '1433' : '5432' })}>
                                    <option value="postgres">PostgreSQL</option>
                                    <option value="mssql">Microsoft SQL Server</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Host *</label>
                                <input style={inputStyle} type="text" placeholder="e.g. db.ucsf.edu" value={this.state.db_host} onChange={(e) => this.setState({ db_host: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Port</label>
                                <input style={inputStyle} type="text" placeholder={this.state.db_type === 'mssql' ? '1433' : '5432'} value={this.state.db_port} onChange={(e) => this.setState({ db_port: e.target.value })} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Username *</label>
                                <input style={inputStyle} type="text" placeholder="db_user" value={this.state.db_user} onChange={(e) => this.setState({ db_user: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Password</label>
                                <input style={inputStyle} type="password" placeholder="********" value={this.state.db_password} onChange={(e) => this.setState({ db_password: e.target.value })} />
                            </div>
                        </div>

                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#052049", marginBottom: "4px" }}>Default Database (optional)</label>
                            <input style={inputStyle} type="text" placeholder="e.g. my_database" value={this.state.db_name} onChange={(e) => this.setState({ db_name: e.target.value })} />
                        </div>

                        {/* Test result */}
                        {this.state.testResult && (
                            <div style={{ padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginBottom: "12px", background: this.state.testResult.success ? "#eaf7f0" : "#fdf0f0", color: this.state.testResult.success ? "#2a6e4a" : "#d64545", border: this.state.testResult.success ? "1px solid #c2e3d3" : "1px solid #f0c2c2" }}>
                                {this.state.testResult.message}
                            </div>
                        )}

                        {/* Save result */}
                        {this.state.result && (
                            <div style={{ padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginBottom: "12px", background: this.state.result.type === "success" ? "#eaf7f0" : "#fdf0f0", color: this.state.result.type === "success" ? "#2a6e4a" : "#d64545", border: this.state.result.type === "success" ? "1px solid #c2e3d3" : "1px solid #f0c2c2" }}>
                                {this.state.result.message}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: "10px" }}>
                            <button
                                style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "700", border: "none", borderRadius: "6px", background: "#052049", color: "#fff", cursor: this.state.saving ? "not-allowed" : "pointer", opacity: this.state.saving ? 0.6 : 1 }}
                                onClick={() => this.handleSave()}
                                disabled={this.state.saving}
                            >{this.state.saving ? "Saving..." : (this.state.editId ? "Update Connection" : "Save Connection")}</button>
                            <button
                                style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "600", border: "1px solid #052049", borderRadius: "6px", background: "#fff", color: "#052049", cursor: this.state.testing ? "not-allowed" : "pointer" }}
                                onClick={() => this.handleTest()}
                                disabled={this.state.testing}
                            >{this.state.testing ? "Testing..." : "Test Connection"}</button>
                            {this.state.editId && (
                                <button
                                    style={{ padding: "10px 20px", fontSize: "13px", fontWeight: "600", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#fff", color: "#7c8ba1", cursor: "pointer" }}
                                    onClick={() => this.resetForm()}
                                >Cancel Edit</button>
                            )}
                        </div>
                    </div>

                    {/* Existing connections list */}
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#052049", marginBottom: "12px" }}>
                        Saved Connections ({this.state.connections.length})
                    </div>

                    {this.state.loading ? (
                        <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>Loading...</div>
                    ) : this.state.connections.length === 0 ? (
                        <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>No database connections configured yet.</div>
                    ) : (
                        this.state.connections.map((conn) => (
                            <div key={conn.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "8px" }}>
                                <div>
                                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#052049" }}>{conn.connection_name}</div>
                                    <div style={{ fontSize: "12px", color: "#7c8ba1", marginTop: "2px" }}>
                                        <span style={{
                                            display: "inline-block", padding: "1px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", marginRight: "8px",
                                            background: conn.db_type === 'mssql' ? "#fff3e0" : "#e8f5e9",
                                            color: conn.db_type === 'mssql' ? "#e65100" : "#2e7d32"
                                        }}>{conn.db_type === 'mssql' ? 'MSSQL' : 'PostgreSQL'}</span>
                                        {conn.db_host}:{conn.db_port} &middot; {conn.db_user}{conn.db_name ? ' · ' + conn.db_name : ''}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button
                                        style={{ padding: "7px 16px", fontSize: "12px", fontWeight: "600", border: "1px solid #052049", borderRadius: "5px", background: "#fff", color: "#052049", cursor: "pointer" }}
                                        onClick={() => this.loadForEdit(conn)}
                                    >Edit</button>
                                    {this.state.deleteConfirm === conn.id ? (
                                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ fontSize: "12px", color: "#d64545" }}>Delete?</span>
                                            <button style={{ padding: "5px 12px", fontSize: "11px", fontWeight: "700", border: "none", borderRadius: "4px", background: "#d64545", color: "#fff", cursor: "pointer" }} onClick={() => this.handleDelete(conn.id)}>Yes</button>
                                            <button style={{ padding: "5px 12px", fontSize: "11px", fontWeight: "600", border: "1px solid #e2e6ed", borderRadius: "4px", background: "#fff", color: "#7c8ba1", cursor: "pointer" }} onClick={() => this.setState({ deleteConfirm: null })}>No</button>
                                        </span>
                                    ) : (
                                        <button
                                            style={{ padding: "7px 16px", fontSize: "12px", fontWeight: "600", border: "1px solid #d64545", borderRadius: "5px", background: "#fff", color: "#d64545", cursor: "pointer" }}
                                            onClick={() => this.setState({ deleteConfirm: conn.id })}
                                        >Delete</button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }
}

export default DbConnectionConfig