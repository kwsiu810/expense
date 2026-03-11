var express = require('express');
var router = express.Router();
var { Pool } = require('pg');
const PropertiesReader = require("properties-reader");
const prop = PropertiesReader("./properties/app.properties");

var pool = new Pool({
    host: prop.get("dbHost"),
    user: prop.get("dbUser"),
    password: prop.get("dbPassword"),
    database: 'Expense',
    port: 5432
});

// GET /expense/get_report_preview/:config_id
// Returns report data filtered and ordered by saved config
router.get('/:config_id', async function(req, res, next) {

    var configId = parseInt(req.params.config_id);

    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    try {
        // 1. Get the report config header (try with action columns, fallback without)
        var configResult;
        try {
            configResult = await pool.query(
                'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.action_id, rc.action_button_label, rc.action_column_mapping, et.name AS expense_name, ra.action_name, ra.action_type FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id LEFT JOIN report_action ra ON ra.id = rc.action_id WHERE rc.id = $1',
                [configId]
            );
        } catch (queryErr) {
            // Fallback if action columns don't exist yet
            configResult = await pool.query(
                'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, et.name AS expense_name FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id WHERE rc.id = $1',
                [configId]
            );
        }

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }

        var config = configResult.rows[0];
        var parentId = config.expense_table_parent_id;

        // 2. Get the config columns in display order
        var configColResult = await pool.query(
            'SELECT column_name, data_type, require_column_index, is_filter, display_order FROM report_config_column WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );

        if (configColResult.rows.length === 0) {
            return res.json({ config: config, columns: [], rows: [], total_rows: 0 });
        }

        var configColumns = configColResult.rows;

        // 3. Get all version IDs for this parent
        var expenseResult = await pool.query(
            'SELECT id, version FROM expense_table WHERE parent_id = $1 ORDER BY version',
            [parentId]
        );

        if (expenseResult.rows.length === 0) {
            return res.json({ config: config, columns: configColumns, rows: [], total_rows: 0 });
        }

        var versionIds = expenseResult.rows.map(function(v) { return v.id; });

        // 4. Get column definitions per version
        var colResult = await pool.query(
            'SELECT expense_table_id, column_number, column_name FROM expense_table_column_name WHERE expense_table_id = ANY($1)',
            [versionIds]
        );

        var versionColumnMap = {};
        for (var i = 0; i < colResult.rows.length; i++) {
            var col = colResult.rows[i];
            if (!versionColumnMap[col.expense_table_id]) {
                versionColumnMap[col.expense_table_id] = [];
            }
            versionColumnMap[col.expense_table_id].push(col);
        }

        // 5. Get all content rows
        var contentResult = await pool.query(
            'SELECT * FROM content WHERE expense_table_id = ANY($1) ORDER BY expense_table_id, id',
            [versionIds]
        );

        // 6. Map content rows using only the config columns in display order
        var configColumnNames = {};
        for (var i = 0; i < configColumns.length; i++) {
            configColumnNames[configColumns[i].column_name] = true;
        }

        var reportRows = [];

        for (var r = 0; r < contentResult.rows.length; r++) {
            var contentRow = contentResult.rows[r];
            var vid = contentRow.expense_table_id;
            var versionCols = versionColumnMap[vid] || [];

            // Build column_name -> value mapping for this version
            var fullRowData = {};
            for (var c = 0; c < versionCols.length; c++) {
                var colDef = versionCols[c];
                var colKey = 'column' + colDef.column_number;
                fullRowData[colDef.column_name] = contentRow[colKey] || "";
            }

            // Extract only the config columns in order
            var rowData = {};
            for (var i = 0; i < configColumns.length; i++) {
                var colName = configColumns[i].column_name;
                rowData[colName] = fullRowData[colName] || "";
            }

            reportRows.push(rowData);
        }

        res.json({
            config: config,
            columns: configColumns,
            rows: reportRows,
            total_rows: reportRows.length
        });

    } catch (err) {
        console.log('Get report preview error:', err);
        res.status(500).json({ error: err.message || 'Failed to generate report preview' });
    }
});

module.exports = router;