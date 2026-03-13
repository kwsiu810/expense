import React from "react"

const NAV_ITEMS = [
    { key: "actions", label: "Actions", path: "/action-config" },
    { key: "db-connections", label: "DB Connections", path: "/db-connection-config" },
    { key: "form-builder", label: "Form Builder", path: "/form-builder" }
];

function ExpenseNav(props) {
    var activeKey = props.activeKey || "";
    return (
        <div style={{ display: "flex", gap: "0px", background: "#f0f2f5", borderBottom: "2px solid #e2e6ed", padding: "0 4%", overflowX: "auto", whiteSpace: "nowrap" }}>
            {NAV_ITEMS.map(function(item) {
                var isActive = item.key === activeKey;
                if (isActive) {
                    return (
                        <span key={item.key} style={{
                            padding: "12px 20px", fontSize: "13px", fontWeight: "700",
                            color: "#ffffff", background: "#052049", cursor: "default",
                            borderBottom: "2px solid #052049"
                        }}>{item.label}</span>
                    );
                }
                var linkProps = { href: item.path };
                if (item.newTab) {
                    linkProps.target = "_blank";
                    linkProps.rel = "noopener noreferrer";
                }
                return (
                    <a key={item.key} {...linkProps} style={{
                        padding: "12px 20px", fontSize: "13px", fontWeight: "600",
                        color: "#052049", textDecoration: "none", cursor: "pointer",
                        borderBottom: "2px solid transparent"
                    }}>{item.label}</a>
                );
            })}
        </div>
    );
}

export default ExpenseNav