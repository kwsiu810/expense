import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const FORM_ENDPOINT = `${properties.backend}expense/form_entry/form/`
const SUBMIT_ENDPOINT = `${properties.backend}expense/form_entry/submit/`
const DROPDOWN_ENDPOINT = `${properties.backend}expense/form_entry/dropdown_values/`

const desktopTopStyle = { width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px" }

class FormEntry extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            config: null,
            fields: [],
            formData: {},
            dropdownValues: {},
            submitting: false,
            result: null,
            submissions: []
        };
    }

    getConfigId() {
        // Support /form-entry/:id route
        if (this.props.match && this.props.match.params && this.props.match.params.id) {
            return this.props.match.params.id;
        }
        var parts = window.location.pathname.split('/');
        return parts[parts.length - 1];
    }

    componentDidMount() {
        var configId = this.getConfigId();
        if (!configId) { this.setState({ loading: false }); return; }

        fetch(FORM_ENDPOINT + configId, { method: "GET", headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => {
            if (data.error) { this.setState({ loading: false, result: { type: "error", message: data.error } }); return; }

            var fields = data.fields || [];
            // Initialize form data with empty values
            var formData = {};
            for (var i = 0; i < fields.length; i++) {
                formData[fields[i].field_name] = '';
            }

            this.setState({ loading: false, config: data.config, fields: fields, formData: formData }, () => {
                // Load dropdown values for dropdown fields
                for (var i = 0; i < fields.length; i++) {
                    if (fields[i].field_type === 'dropdown') {
                        this.loadDropdownValues(fields[i], i);
                    }
                }
            });
        })
        .catch(err => this.setState({ loading: false, result: { type: "error", message: err.message } }));
    }

    loadDropdownValues(field, fieldIndex) {
        var choices = field.dropdown_choices || [];
        if (typeof choices === 'string') { try { choices = JSON.parse(choices); } catch(e) { choices = []; } }

        var source = field.dropdown_source || 'manual';
        if (source === 'data' || source === 'both') {
            // Load from data and merge with manual choices
            var configId = this.getConfigId();
            fetch(DROPDOWN_ENDPOINT + configId + '/' + encodeURIComponent(field.field_name), {
                method: "GET", headers: { 'Content-Type': 'application/json' }
            })
            .then(r => r.json())
            .then(dataValues => {
                var merged = choices.slice();
                for (var i = 0; i < dataValues.length; i++) {
                    if (merged.indexOf(dataValues[i]) === -1) merged.push(dataValues[i]);
                }
                merged.sort();
                var dv = Object.assign({}, this.state.dropdownValues);
                dv[field.field_name] = merged;
                this.setState({ dropdownValues: dv });
            });
        } else {
            // Manual only
            var dv = Object.assign({}, this.state.dropdownValues);
            dv[field.field_name] = choices;
            this.setState({ dropdownValues: dv });
        }
    }

    updateFormData(fieldName, value) {
        var formData = Object.assign({}, this.state.formData);
        formData[fieldName] = value;
        this.setState({ formData: formData });
    }

    handleSubmit() {
        // Validate required fields
        for (var i = 0; i < this.state.fields.length; i++) {
            var f = this.state.fields[i];
            if (f.is_required && !(this.state.formData[f.field_name] || '').trim()) {
                this.setState({ result: { type: "error", message: '"' + f.field_label + '" is required.' } });
                return;
            }
        }

        this.setState({ submitting: true, result: null });

        fetch(SUBMIT_ENDPOINT + this.getConfigId(), {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: this.state.formData })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                this.setState({ submitting: false, result: { type: "error", message: data.error } });
            } else {
                // Save submission locally and reset form
                var submissions = this.state.submissions.slice();
                submissions.unshift({ data: Object.assign({}, this.state.formData), time: new Date().toLocaleTimeString() });

                var formData = {};
                for (var i = 0; i < this.state.fields.length; i++) {
                    formData[this.state.fields[i].field_name] = '';
                }

                this.setState({
                    submitting: false,
                    formData: formData,
                    submissions: submissions,
                    result: { type: "success", message: data.message }
                });
            }
        })
        .catch(err => this.setState({ submitting: false, result: { type: "error", message: err.message } }));
    }

    renderField(field, index) {
        var value = this.state.formData[field.field_name] || '';

        if (field.field_type === 'textarea') {
            return (
                <div key={index} style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#052049", marginBottom: "5px" }}>
                        {field.field_label}{field.is_required && <span style={{ color: "#d64545" }}> *</span>}
                    </label>
                    <textarea
                        style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box", minHeight: "100px", fontFamily: "inherit", resize: "vertical", color: "#2c3345" }}
                        placeholder={field.placeholder || ''}
                        value={value}
                        onChange={(e) => this.updateFormData(field.field_name, e.target.value)}
                    />
                </div>
            );
        }

        if (field.field_type === 'dropdown') {
            var options = this.state.dropdownValues[field.field_name] || [];
            return (
                <div key={index} style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#052049", marginBottom: "5px" }}>
                        {field.field_label}{field.is_required && <span style={{ color: "#d64545" }}> *</span>}
                    </label>
                    <select
                        style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#fff", color: "#2c3345" }}
                        value={value}
                        onChange={(e) => this.updateFormData(field.field_name, e.target.value)}
                    >
                        <option value="">{field.placeholder || '\u2014 Select \u2014'}</option>
                        {options.map((opt, oi) => (
                            <option key={oi} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            );
        }

        // Default: text input
        return (
            <div key={index} style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#052049", marginBottom: "5px" }}>
                    {field.field_label}{field.is_required && <span style={{ color: "#d64545" }}> *</span>}
                </label>
                <input
                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", boxSizing: "border-box", color: "#2c3345" }}
                    type="text"
                    placeholder={field.placeholder || ''}
                    value={value}
                    onChange={(e) => this.updateFormData(field.field_name, e.target.value)}
                />
            </div>
        );
    }

    render() {
        if (this.state.loading) {
            return (
                <div style={{ minHeight: "500px" }}>
                    <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#7c8ba1", fontSize: "15px" }}>Loading form...</div>
                </div>
            );
        }

        if (!this.state.config || this.state.fields.length === 0) {
            return (
                <div style={{ minHeight: "500px" }}>
                    <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#7c8ba1", fontSize: "15px" }}>
                        {this.state.result ? this.state.result.message : "No form configured for this report."}
                    </div>
                </div>
            );
        }

        return (
            <div style={{ minHeight: "500px" }}>
                <div style={desktopTopStyle}><span style={{ left: "30px", top: "10px", position: "relative" }}>University of California San Francisco</span></div>
                <div style={{ width: "100%", height: "100px", boxShadow: "0px 0px 8px 2px #CCCCCC" }}>
                    <div style={{ marginLeft: "4%" }}>
                        <div style={{ float: "left", display: "grid", height: "100px" }}><img src={ucsfLogo} style={{ height: "30px", margin: "auto" }} alt="UCSF Logo" /></div>
                        <div style={{ float: "left", marginLeft: "30px", fontFamily: "Arial", fontSize: "18px", height: "100px", display: "grid" }}><span style={{ margin: "auto" }}>- {this.state.config.config_name}</span></div>
                    </div>
                </div>

                <div style={{ maxWidth: "640px", margin: "40px auto", padding: "0 20px" }}>
                    {/* Form */}
                    <div style={{ padding: "24px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "8px" }}>
                        <div style={{ fontSize: "18px", fontWeight: "700", color: "#052049", marginBottom: "4px" }}>
                            {this.state.config.config_name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#7c8ba1", marginBottom: "24px" }}>
                            Fill out the form below. Fields marked with <span style={{ color: "#d64545" }}>*</span> are required.
                        </div>

                        {this.state.fields.map((field, fi) => this.renderField(field, fi))}

                        {/* Result */}
                        {this.state.result && (
                            <div style={{ padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginBottom: "14px",
                                background: this.state.result.type === "success" ? "#eaf7f0" : "#fdf0f0",
                                color: this.state.result.type === "success" ? "#2a6e4a" : "#d64545",
                                border: this.state.result.type === "success" ? "1px solid #c2e3d3" : "1px solid #f0c2c2"
                            }}>{this.state.result.message}</div>
                        )}

                        <button
                            style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: "700", border: "none", borderRadius: "6px", background: "#052049", color: "#fff", cursor: this.state.submitting ? "not-allowed" : "pointer", opacity: this.state.submitting ? 0.6 : 1 }}
                            onClick={() => this.handleSubmit()}
                            disabled={this.state.submitting}
                        >
                            {this.state.submitting ? "Submitting..." : "Submit"}
                        </button>
                    </div>

                    {/* Recent submissions */}
                    {this.state.submissions.length > 0 && (
                        <div style={{ marginTop: "24px", padding: "16px", background: "#f8f9fb", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: "#052049", marginBottom: "10px" }}>Recent Submissions ({this.state.submissions.length})</div>
                            {this.state.submissions.map((sub, si) => (
                                <div key={si} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #e2e6ed", borderRadius: "5px", marginBottom: "6px", fontSize: "12px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                        <span style={{ fontWeight: "600", color: "#0e7c3a" }}>&#10003; Submitted</span>
                                        <span style={{ color: "#7c8ba1" }}>{sub.time}</span>
                                    </div>
                                    <div style={{ color: "#2c3345" }}>
                                        {Object.keys(sub.data).map((k) => (
                                            sub.data[k] ? <span key={k} style={{ marginRight: "12px" }}><strong>{k}:</strong> {sub.data[k]}</span> : null
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default FormEntry