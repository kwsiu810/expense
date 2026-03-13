import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import ExpenseNav from './Expensesupernav.js'
import { properties } from '../../properties/properties.js'

const CONFIGS_ENDPOINT = `${properties.backend}expense/save_report_config`
const FIELDS_ENDPOINT = `${properties.backend}expense/form_entry/fields/`
const DROPDOWN_ENDPOINT = `${properties.backend}expense/form_entry/dropdown_values/`

const desktopTopStyle = { width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px" }
const inputStyle = { width: "100%", padding: "9px 10px", fontSize: "13px", border: "1px solid #e2e6ed", borderRadius: "5px", boxSizing: "border-box", color: "#2c3345" }

class FormBuilder extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            configs: [],
            loadingConfigs: true,
            selectedConfigId: "",
            selectedConfig: null,
            configColumns: [],
            fields: [],
            saving: false,
            result: null,
            // For adding new dropdown choice inline
            newChoiceField: null,
            newChoiceValue: ""
        };
    }

    componentDidMount() { this.fetchConfigs(); }

    fetchConfigs() {
        fetch(CONFIGS_ENDPOINT, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(response => {
            var configs = Array.isArray(response) ? response : (response.configs || []);
            this.setState({ configs: configs, loadingConfigs: false });
        })
        .catch(() => this.setState({ configs: [], loadingConfigs: false }));
    }

    selectConfig(configId) {
        if (!configId) { this.setState({ selectedConfigId: "", selectedConfig: null, configColumns: [], fields: [], result: null }); return; }
        this.setState({ selectedConfigId: configId, result: null });

        // Load config details for columns
        fetch(CONFIGS_ENDPOINT + '/' + configId, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(config => {
            var columns = (config.columns || []).map(function(c) { return c.column_name; });
            this.setState({ selectedConfig: config, configColumns: columns });

            // Load existing form fields
            fetch(FIELDS_ENDPOINT + configId, { method: "GET", headers: { 'Content-Type': 'application/json' } })
            .then(r => r.json())
            .then(fields => {
                var parsed = (Array.isArray(fields) ? fields : []).map(function(f) {
                    var choices = f.dropdown_choices || [];
                    if (typeof choices === 'string') { try { choices = JSON.parse(choices); } catch(e) { choices = []; } }
                    return {
                        field_name: f.field_name,
                        field_label: f.field_label || f.field_name,
                        field_type: f.field_type || 'text',
                        is_required: f.is_required || false,
                        placeholder: f.placeholder || '',
                        dropdown_source: f.dropdown_source || 'manual',
                        dropdown_choices: choices
                    };
                });
                this.setState({ fields: parsed });
            });
        });
    }

    addField() {
        var fields = this.state.fields.slice();
        fields.push({
            field_name: this.state.configColumns[0] || '',
            field_label: '',
            field_type: 'text',
            is_required: false,
            placeholder: '',
            dropdown_source: 'manual',
            dropdown_choices: []
        });
        this.setState({ fields: fields });
    }

    updateField(index, key, value) {
        var fields = this.state.fields.slice();
        fields[index] = Object.assign({}, fields[index]);
        fields[index][key] = value;
        // Auto-set label from column name if empty
        if (key === 'field_name' && !fields[index].field_label) {
            fields[index].field_label = value;
        }
        this.setState({ fields: fields });
    }

    removeField(index) {
        var fields = this.state.fields.slice();
        fields.splice(index, 1);
        this.setState({ fields: fields });
    }

    moveField(index, dir) {
        var fields = this.state.fields.slice();
        var newIdx = index + dir;
        if (newIdx < 0 || newIdx >= fields.length) return;
        var temp = fields[index];
        fields[index] = fields[newIdx];
        fields[newIdx] = temp;
        this.setState({ fields: fields });
    }

    addChoice(fieldIndex) {
        var val = this.state.newChoiceValue.trim();
        if (!val) return;
        var fields = this.state.fields.slice();
        fields[fieldIndex] = Object.assign({}, fields[fieldIndex]);
        var choices = (fields[fieldIndex].dropdown_choices || []).slice();
        if (choices.indexOf(val) === -1) choices.push(val);
        fields[fieldIndex].dropdown_choices = choices;
        this.setState({ fields: fields, newChoiceValue: "", newChoiceField: null });
    }

    removeChoice(fieldIndex, choiceIndex) {
        var fields = this.state.fields.slice();
        fields[fieldIndex] = Object.assign({}, fields[fieldIndex]);
        var choices = (fields[fieldIndex].dropdown_choices || []).slice();
        choices.splice(choiceIndex, 1);
        fields[fieldIndex].dropdown_choices = choices;
        this.setState({ fields: fields });
    }

    loadDataChoices(fieldIndex) {
        var f = this.state.fields[fieldIndex];
        fetch(DROPDOWN_ENDPOINT + this.state.selectedConfigId + '/' + encodeURIComponent(f.field_name), {
            method: "GET", headers: { 'Content-Type': 'application/json' }
        })
        .then(r => r.json())
        .then(values => {
            var fields = this.state.fields.slice();
            fields[fieldIndex] = Object.assign({}, fields[fieldIndex]);
            // Merge with existing manual choices
            var existing = fields[fieldIndex].dropdown_choices || [];
            var merged = existing.slice();
            for (var i = 0; i < values.length; i++) {
                if (merged.indexOf(values[i]) === -1) merged.push(values[i]);
            }
            merged.sort();
            fields[fieldIndex].dropdown_choices = merged;
            this.setState({ fields: fields, result: { type: "success", message: "Loaded " + values.length + " values from data for " + f.field_name } });
        });
    }

    handleSave() {
        if (!this.state.selectedConfigId) return;
        this.setState({ saving: true, result: null });

        fetch(FIELDS_ENDPOINT + this.state.selectedConfigId, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: this.state.fields })
        })
        .then(r => r.json())
        .then(data => {
            this.setState({ saving: false, result: { type: data.error ? "error" : "success", message: data.message || data.error } });
        })
        .catch(err => this.setState({ saving: false, result: { type: "error", message: err.message } }));
    }

    render() {
        return (
            <div style={{ minHeight: "500px" }}>
                <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                <div style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                    <div style={{ marginLeft: "4%" }}>
                        <div style={{ float: "left", display: "grid", height: "100px" }}><img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" /></div>
                        <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}><span style={{ margin: "auto" }}>- Form Builder</span></div>
                    </div>
                </div>
                <ExpenseNav activeKey="form-builder" />

                <div style={{ maxWidth: "900px", margin: "30px auto", padding: "0 20px" }}>
                    {/* Select report config */}
                    <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "20px" }}>
                        <div style={{ fontSize: "15px", fontWeight: "700", color: "#052049", marginBottom: "12px" }}>Select Report Configuration</div>
                        <select style={inputStyle} value={this.state.selectedConfigId} onChange={(e) => this.selectConfig(e.target.value)} disabled={this.state.loadingConfigs}>
                            <option value="">{this.state.loadingConfigs ? "Loading..." : "\u2014 Select a report configuration \u2014"}</option>
                            {this.state.configs.map((cfg) => (
                                <option key={cfg.id} value={cfg.id}>{cfg.config_name} ({cfg.source_type === 'database' ? 'DB' : 'Expense'})</option>
                            ))}
                        </select>
                        {this.state.selectedConfigId && (
                            <div style={{ marginTop: "8px", fontSize: "12px", color: "#7c8ba1" }}>
                                Columns: {this.state.configColumns.join(', ')}
                                <span style={{ marginLeft: "12px" }}>
                                    Form URL: <a href={"/form-entry/" + this.state.selectedConfigId} target="_blank" rel="noopener noreferrer" style={{ color: "#052049", fontWeight: "600" }}>/form-entry/{this.state.selectedConfigId}</a>
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Form fields builder */}
                    {this.state.selectedConfigId && (
                        <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "20px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                                <div style={{ fontSize: "15px", fontWeight: "700", color: "#052049" }}>Form Fields ({this.state.fields.length})</div>
                                <button style={{ padding: "8px 16px", fontSize: "12px", fontWeight: "700", border: "none", borderRadius: "5px", background: "#052049", color: "#fff", cursor: "pointer" }}
                                    onClick={() => this.addField()}>+ Add Field</button>
                            </div>

                            {this.state.fields.length === 0 && (
                                <div style={{ padding: "20px", textAlign: "center", color: "#7c8ba1", fontSize: "13px" }}>No fields. Click "+ Add Field" to start building the form.</div>
                            )}

                            {this.state.fields.map((field, fi) => (
                                <div key={fi} style={{ padding: "14px", background: "#f8f9fb", border: "1px solid #e2e6ed", borderRadius: "6px", marginBottom: "10px" }}>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                                        <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{fi + 1}</span>
                                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                                            {/* Column */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "10px", fontWeight: "600", color: "#7c8ba1", marginBottom: "2px" }}>Column</label>
                                                <select style={inputStyle} value={field.field_name} onChange={(e) => this.updateField(fi, 'field_name', e.target.value)}>
                                                    {this.state.configColumns.map((c) => (<option key={c} value={c}>{c}</option>))}
                                                </select>
                                            </div>
                                            {/* Label */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "10px", fontWeight: "600", color: "#7c8ba1", marginBottom: "2px" }}>Label</label>
                                                <input style={inputStyle} type="text" placeholder="Display label" value={field.field_label} onChange={(e) => this.updateField(fi, 'field_label', e.target.value)} />
                                            </div>
                                            {/* Type */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "10px", fontWeight: "600", color: "#7c8ba1", marginBottom: "2px" }}>Type</label>
                                                <select style={inputStyle} value={field.field_type} onChange={(e) => this.updateField(fi, 'field_type', e.target.value)}>
                                                    <option value="text">Text Input</option>
                                                    <option value="textarea">Text Area</option>
                                                    <option value="dropdown">Dropdown</option>
                                                </select>
                                            </div>
                                        </div>
                                        {/* Move / Remove */}
                                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}>
                                            <span style={{ cursor: fi > 0 ? "pointer" : "default", color: fi > 0 ? "#052049" : "#ddd", fontSize: "14px", fontWeight: "700" }} onClick={() => this.moveField(fi, -1)}>&#9650;</span>
                                            <span style={{ cursor: fi < this.state.fields.length - 1 ? "pointer" : "default", color: fi < this.state.fields.length - 1 ? "#052049" : "#ddd", fontSize: "14px", fontWeight: "700" }} onClick={() => this.moveField(fi, 1)}>&#9660;</span>
                                        </div>
                                        <span style={{ fontSize: "16px", color: "#d64545", cursor: "pointer", fontWeight: "700", flexShrink: 0 }} onClick={() => this.removeField(fi)}>&times;</span>
                                    </div>

                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "32px" }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#052049", cursor: "pointer" }}>
                                            <input type="checkbox" checked={field.is_required} onChange={(e) => this.updateField(fi, 'is_required', e.target.checked)} style={{ width: "13px", height: "13px" }} /> Required
                                        </label>
                                        <input style={Object.assign({}, inputStyle, { flex: 1 })} type="text" placeholder="Placeholder text..." value={field.placeholder} onChange={(e) => this.updateField(fi, 'placeholder', e.target.value)} />
                                    </div>

                                    {/* Dropdown options */}
                                    {field.field_type === 'dropdown' && (
                                        <div style={{ marginTop: "8px", marginLeft: "32px", padding: "10px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "5px" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                                <span style={{ fontSize: "11px", fontWeight: "700", color: "#052049" }}>Dropdown Choices ({(field.dropdown_choices || []).length})</span>
                                                <div style={{ display: "flex", gap: "8px" }}>
                                                    <span style={{ fontSize: "11px", color: "#052049", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                                                        onClick={() => this.loadDataChoices(fi)}>Load from Data</span>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                                                {(field.dropdown_choices || []).map((choice, ci) => (
                                                    <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "#e8f0fe", border: "1px solid #052049", borderRadius: "4px", fontSize: "11px", color: "#052049" }}>
                                                        {choice}
                                                        <span style={{ cursor: "pointer", fontWeight: "700", color: "#d64545" }} onClick={() => this.removeChoice(fi, ci)}>&times;</span>
                                                    </span>
                                                ))}
                                            </div>

                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <input style={Object.assign({}, inputStyle, { flex: 1 })} type="text" placeholder="Add new choice..."
                                                    value={this.state.newChoiceField === fi ? this.state.newChoiceValue : ""}
                                                    onFocus={() => this.setState({ newChoiceField: fi, newChoiceValue: "" })}
                                                    onChange={(e) => this.setState({ newChoiceValue: e.target.value })}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); this.addChoice(fi); } }}
                                                />
                                                <button style={{ padding: "8px 14px", fontSize: "11px", fontWeight: "700", border: "none", borderRadius: "5px", background: "#052049", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
                                                    onClick={() => { this.setState({ newChoiceField: fi }, () => this.addChoice(fi)); }}>Add</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Result */}
                            {this.state.result && (
                                <div style={{ padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginTop: "10px",
                                    background: this.state.result.type === "success" ? "#eaf7f0" : "#fdf0f0",
                                    color: this.state.result.type === "success" ? "#2a6e4a" : "#d64545",
                                    border: this.state.result.type === "success" ? "1px solid #c2e3d3" : "1px solid #f0c2c2"
                                }}>{this.state.result.message}</div>
                            )}

                            {/* Save */}
                            {this.state.fields.length > 0 && (
                                <button style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "700", border: "none", borderRadius: "6px", background: "#052049", color: "#fff", cursor: this.state.saving ? "not-allowed" : "pointer", marginTop: "14px", opacity: this.state.saving ? 0.6 : 1 }}
                                    onClick={() => this.handleSave()} disabled={this.state.saving}>
                                    {this.state.saving ? "Saving..." : "Save Form (" + this.state.fields.length + " fields)"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default FormBuilder