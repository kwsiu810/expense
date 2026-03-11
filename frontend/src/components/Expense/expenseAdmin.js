import React from "react"
import ucsfLogo from './images/ucsfHealth.jpg'
import { properties } from '../../properties/properties.js'

const EXPENSES_ENDPOINT = `${properties.backend}expense/get_expense_table`
const UPLOAD_ENDPOINT = `${properties.backend}expense/upload_expense`

const desktopTopStyle = {
    width: "100%", backgroundColor: "#052049", color: "#ffffff", height: "40px", fontSize: "14px"
}

class ExpenseUpload extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            file: null,
            csvHeaders: [],
            csvPreview: [],
            csvAllRows: [],
            expenses: [],
            selectedExpense: "",
            isNewExpense: false,
            newExpenseName: "",
            loading: false,
            loadingExpenses: true,
            result: null,
            dragOver: false
        };
        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        this.fetchExpenses();
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
            var hasExpenses = Array.isArray(response) && response.length > 0;
            this.setState({
                expenses: response,
                loadingExpenses: false,
                isNewExpense: !hasExpenses
            });
        })
        .catch(err => {
            console.log("Failed to load expenses:", err);
            this.setState({
                expenses: [],
                loadingExpenses: false,
                isNewExpense: true
            });
        });
    }

    parseLine(line) {
        var result = [];
        var current = "";
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    parseCSV(text) {
        var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
        if (lines.length === 0) return;

        var headers = this.parseLine(lines[0]);
        var allRows = lines.slice(1).map((line) => this.parseLine(line));
        var previewRows = allRows.slice(0, 5);
        this.setState({ csvHeaders: headers, csvPreview: previewRows, csvAllRows: allRows });
    }

    handleFile(f) {
        if (!f) return;
        if (!f.name.toLowerCase().endsWith(".csv")) {
            this.setState({ result: { type: "error", message: "Please upload a .csv file" } });
            return;
        }
        this.setState({ file: f, result: null });
        var reader = new FileReader();
        reader.onload = (e) => {
            this.parseCSV(e.target.result);
        };
        reader.readAsText(f);
    }

    handleDrop(e) {
        e.preventDefault();
        this.setState({ dragOver: false });
        var f = e.dataTransfer.files ? e.dataTransfer.files[0] : null;
        this.handleFile(f);
    }

    handleReset() {
        this.setState({
            file: null,
            csvHeaders: [],
            csvPreview: [],
            csvAllRows: [],
            selectedExpense: "",
            newExpenseName: "",
            result: null,
            loadingExpenses: true
        }, () => {
            this.fetchExpenses();
        });
    }

    handleSubmit() {
        if (!this.state.file) {
            this.setState({ result: { type: "error", message: "Please upload a CSV file." } });
            return;
        }
        if (!this.state.isNewExpense && !this.state.selectedExpense) {
            this.setState({ result: { type: "error", message: "Please select an expense type." } });
            return;
        }
        if (this.state.isNewExpense && !this.state.newExpenseName.trim()) {
            this.setState({ result: { type: "error", message: "Please enter the new expense name." } });
            return;
        }

        this.setState({ loading: true, result: null });

        var formData = new FormData();
        formData.append("file", this.state.file);
        if (this.state.isNewExpense) {
            formData.append("new_expense_name", this.state.newExpenseName.trim());
        } else {
            formData.append("expense_id", this.state.selectedExpense);
        }

        fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            body: formData
        })
        .then(response => {
            return response.json().then(data => {
                if (!response.ok) {
                    throw new Error(data.error || data.message || "Upload failed");
                }
                return data;
            });
        })
        .then(data => {
            this.setState({ loading: false, result: { type: "success", message: data.message || "Upload successful!" } });
        })
        .catch(err => {
            this.setState({ loading: false, result: { type: "error", message: err.message || "Something went wrong." } });
        });
    }

    renderDropzone() {
        if (this.state.file) {
            return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#eaf7f0", border: "1px solid #c2e3d3", borderRadius: "6px", padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#4ea87a", fontWeight: "bold" }}>&#10003;</span>
                        <span style={{ fontWeight: "600", fontSize: "14px" }}>{this.state.file.name}</span>
                        <span style={{ fontSize: "13px", color: "#7c8ba1" }}>({(this.state.file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <span style={{ color: "#d64545", fontWeight: "600", fontSize: "13px", cursor: "pointer" }} onClick={() => this.handleReset()}>Remove</span>
                </div>
            )
        }

        return (
            <div
                style={{ border: this.state.dragOver ? "2px dashed #052049" : "2px dashed #ccc", borderRadius: "6px", padding: "40px 24px", textAlign: "center", cursor: "pointer", background: this.state.dragOver ? "#eaf0fb" : "#fafbfc" }}
                onDragOver={(e) => { e.preventDefault(); this.setState({ dragOver: true }); }}
                onDragLeave={() => this.setState({ dragOver: false })}
                onDrop={(e) => this.handleDrop(e)}
                onClick={() => this.fileInputRef.current.click()}
            >
                <input ref={this.fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => this.handleFile(e.target.files ? e.target.files[0] : null)} />
                <p style={{ fontSize: "14px", color: "#7c8ba1", margin: 0 }}>Drag & drop your CSV here, or <span style={{ color: "#052049", fontWeight: "600", textDecoration: "underline" }}>browse</span></p>
            </div>
        )
    }

    renderDataPreview() {
        if (this.state.csvHeaders.length === 0) return null;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#2c3345" }}>Data Preview</span>
                    <span style={{ fontSize: "12px", color: "#7c8ba1" }}>{this.state.csvHeaders.length} columns &middot; {this.state.csvAllRows.length} rows &middot; Showing first 5</span>
                </div>

                <div style={{ overflowX: "auto", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "400px" }}>
                        <thead>
                            <tr>
                                {this.state.csvHeaders.map((h, i) => (
                                    <th key={i}
                                        style={{ textAlign: "left", padding: "10px 14px", borderBottom: "2px solid #e2e6ed", fontWeight: "600", background: "#052049", color: "#ffffff", whiteSpace: "nowrap" }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {this.state.csvPreview.map((row, ri) => (
                                <tr key={ri}>
                                    {this.state.csvHeaders.map((h, ci) => (
                                        <td key={ci} style={{ padding: "8px 14px", borderBottom: "1px solid #e2e6ed", color: "#2c3345", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", background: ri % 2 === 0 ? "#fafbfc" : "#ffffff" }}>
                                            {row[ci] || "\u2014"}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {this.state.csvHeaders.length > 61 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", padding: "10px 14px", borderRadius: "6px", background: "#fff8e1", border: "1px solid #ffe082", fontSize: "13px", color: "#8a6d00" }}>
                        <span style={{ fontSize: "16px", flexShrink: 0 }}>&#9888;</span>
                        <span>This CSV has {this.state.csvHeaders.length} columns. Only the first 61 columns will be imported to the database. Columns beyond column 61 will be ignored.</span>
                    </div>
                )}
            </div>
        )
    }


    renderExpenseSelection() {
        if (this.state.csvHeaders.length === 0) return null;

        var hasExpenses = this.state.expenses.length > 0;

        return (
            <div style={{ marginTop: "20px", padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
                    <span style={{ fontSize: "16px", fontWeight: "600" }}>Select Expense Type</span>
                </div>

                {hasExpenses && (
                    <div style={{ display: "flex", marginBottom: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
                        <button
                            style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: !this.state.isNewExpense ? "#052049" : "#ffffff", color: !this.state.isNewExpense ? "#ffffff" : "#7c8ba1" }}
                            onClick={() => this.setState({ isNewExpense: false, newExpenseName: "" })}
                        >Choose Existing</button>
                        <button
                            style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: this.state.isNewExpense ? "#052049" : "#ffffff", color: this.state.isNewExpense ? "#ffffff" : "#7c8ba1" }}
                            onClick={() => this.setState({ isNewExpense: true, selectedExpense: "" })}
                        >Add New</button>
                    </div>
                )}

                {!hasExpenses && (
                    <p style={{ fontSize: "13px", color: "#7c8ba1", marginBottom: "14px" }}>No existing expenses found. Enter a new expense name below.</p>
                )}

                {!this.state.isNewExpense && hasExpenses ? (
                    <select
                        style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345" }}
                        value={this.state.selectedExpense}
                        onChange={(e) => this.setState({ selectedExpense: e.target.value })}
                        disabled={this.state.loadingExpenses}
                    >
                        <option value="">{this.state.loadingExpenses ? "Loading expenses..." : "\u2014 Select an expense \u2014"}</option>
                        {this.state.expenses.map((exp) => (
                            <option key={exp.id} value={exp.id}>{exp.name}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #e2e6ed", borderRadius: "6px", background: "#ffffff", color: "#2c3345", boxSizing: "border-box" }}
                        type="text"
                        placeholder="Enter new expense name..."
                        value={this.state.newExpenseName}
                        onChange={(e) => this.setState({ newExpenseName: e.target.value })}
                    />
                )}
            </div>
        )
    }

    renderResult() {
        if (!this.state.result) return null;
        var isSuccess = this.state.result.type === "success";
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderRadius: "6px", fontSize: "14px", fontWeight: "500", marginTop: "20px", background: isSuccess ? "#eaf7f0" : "#fdf0f0", color: isSuccess ? "#2a6e4a" : "#d64545", border: isSuccess ? "1px solid #c2e3d3" : "1px solid #f0c2c2" }}>
                <span style={{ fontSize: "18px" }}>{isSuccess ? "\u2713" : "\u2717"}</span>
                <span>{this.state.result.message}</span>
            </div>
        )
    }

    render() {
        var content = [];

        // UCSF Header
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
                        <span style={{ margin: "auto" }}>- Expense Upload</span>
                    </div>
                </div>
            </div>
        );

        content.push(
            <div key="nav" style={{ display: "flex", gap: "0px", background: "#f0f2f5", borderBottom: "2px solid #e2e6ed", padding: "0 4%" }}>
                <span style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "700", color: "#ffffff", background: "#052049", cursor: "default", borderBottom: "2px solid #052049" }}>Upload</span>
                <a href="/expense-report-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Configuration</a>
                <a href="/action-config" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Actions</a>
                <a href="/expense-report-preview" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Preview</a>
                <a href="/expense-reports" target="_blank" rel="noopener noreferrer" style={{ padding: "12px 20px", fontSize: "13px", fontWeight: "600", color: "#052049", textDecoration: "none", cursor: "pointer", borderBottom: "2px solid transparent" }}>Reports</a>
            </div>
        );
        content.push(
            <div key="main" style={{ maxWidth: "760px", margin: "40px auto", padding: "0 20px" }}>

                {/* Step 1 - File Upload */}
                <div style={{ padding: "20px", background: "#ffffff", border: "1px solid #e2e6ed", borderRadius: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                        <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#052049", color: "#fff", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
                        <span style={{ fontSize: "16px", fontWeight: "600" }}>Upload CSV File</span>
                    </div>
                    {this.renderDropzone()}
                </div>

                {/* Data Preview */}
                {this.renderDataPreview()}

                {/* Step 2 - Expense Selection */}
                {this.renderExpenseSelection()}

                {/* Result Banner */}
                {this.renderResult()}

                {/* Submit Button */}
                {this.state.csvHeaders.length > 0 && (
                    <button
                        style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: "700", background: "#052049", color: "#ffffff", border: "none", borderRadius: "6px", cursor: this.state.loading ? "not-allowed" : "pointer", marginTop: "20px", opacity: this.state.loading ? 0.6 : 1 }}
                        onClick={() => this.handleSubmit()}
                        disabled={this.state.loading}
                    >
                        {this.state.loading ? "Uploading..." : "Upload Expense"}
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

export default ExpenseUpload