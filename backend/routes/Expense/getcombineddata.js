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

// GET /expense/get_combined_data/:parent_id
// Returns merged column names and content rows across all versions
router.get('/:parent_id', async function(req, res, next) {

    var parentId = parseInt(req.params.parent_id);

    if (isNaN(parentId)) {
        return res.status(400).json({ error: 'Invalid parent ID' });
    }

    try {
        // 1. Get all expense_table records with this parent_id
        var expenseResult = await pool.query(
            'SELECT id, name, version, upload_date FROM expense_table WHERE parent_id = $1 ORDER BY version',
            [parentId]
        );

        if (expenseResult.rows.length === 0) {
            return res.json({ columns: [], rows: [], versions: [] });
        }

        var versions = expenseResult.rows;
        var versionIds = versions.map(function(v) { return v.id; });

        // 2. Get all column definitions for these versions
        var colResult = await pool.query(
            'SELECT expense_table_id, column_number, column_name, data_type, require_column_index FROM expense_table_column_name WHERE expense_table_id = ANY($1) ORDER BY expense_table_id, column_number',
            [versionIds]
        );

        // 3. Build column map per version: { expense_table_id: [{ column_number, column_name, ... }] }
        var versionColumnMap = {};
        for (var i = 0; i < colResult.rows.length; i++) {
            var col = colResult.rows[i];
            if (!versionColumnMap[col.expense_table_id]) {
                versionColumnMap[col.expense_table_id] = [];
            }
            versionColumnMap[col.expense_table_id].push(col);
        }

        // 4. Build unified column list - merge all unique column names preserving order
        var seenColumns = {};
        var unifiedColumns = [];

        for (var v = 0; v < versionIds.length; v++) {
            var vid = versionIds[v];
            var cols = versionColumnMap[vid] || [];
            for (var c = 0; c < cols.length; c++) {
                var colName = cols[c].column_name;
                if (!seenColumns[colName]) {
                    seenColumns[colName] = true;
                    unifiedColumns.push({
                        column_name: colName,
                        data_type: cols[c].data_type,
                        require_column_index: cols[c].require_column_index
                    });
                }
            }
        }

        // 5. Get content data - 5 sample rows from each version
        var rowsPerVersion = 5;
        var contentRows = [];

        for (var v = 0; v < versionIds.length; v++) {
            var vResult = await pool.query(
                'SELECT * FROM content WHERE expense_table_id = $1 ORDER BY id LIMIT $2',
                [versionIds[v], rowsPerVersion]
            );
            for (var r = 0; r < vResult.rows.length; r++) {
                contentRows.push(vResult.rows[r]);
            }
        }

        // 6. Map content rows to unified column names
        var unifiedRows = [];

        for (var r = 0; r < contentRows.length; r++) {
            var contentRow = contentRows[r];
            var vid = contentRow.expense_table_id;
            var versionCols = versionColumnMap[vid] || [];

            // Build a mapping: column_name -> value from this version's column layout
            var rowData = { _expense_table_id: vid, _require_column_data: contentRow.require_column_data };

            for (var c = 0; c < versionCols.length; c++) {
                var colDef = versionCols[c];
                var colKey = 'column' + colDef.column_number;
                rowData[colDef.column_name] = contentRow[colKey] || "";
            }

            // Fill in missing columns with empty string
            for (var u = 0; u < unifiedColumns.length; u++) {
                var uColName = unifiedColumns[u].column_name;
                if (rowData[uColName] === undefined) {
                    rowData[uColName] = "";
                }
            }

            unifiedRows.push(rowData);
        }

        res.json({
            columns: unifiedColumns,
            rows: unifiedRows,
            versions: versions,
            total_rows: contentRows.length
        });

    } catch (err) {
        console.log('Get combined data error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch combined data' });
    }
});

module.exports = router;