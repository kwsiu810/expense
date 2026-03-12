var express = require('express');
var router = express.Router();
var { Pool, Client } = require('pg');
const PropertiesReader = require("properties-reader");
const prop = PropertiesReader("./properties/app.properties");

var pool = new Pool({
    host: prop.get("dbHost"),
    user: prop.get("dbUser"),
    password: prop.get("dbPassword"),
    database: 'Expense',
    port: 5432
});

// Helper: connect to external database
async function connectExternal(conn, databaseOverride) {
    var dbType = (conn.db_type || 'postgres').toLowerCase();
    var dbName = databaseOverride || conn.db_name || '';

    if (dbType === 'mssql') {
        var sql = require('mssql');
        var config = {
            server: conn.db_host,
            port: parseInt(conn.db_port) || 1433,
            user: conn.db_user,
            password: conn.db_password,
            database: dbName || 'master',
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 }
        };
        var mssqlPool = await sql.connect(config);
        return { type: 'mssql', pool: mssqlPool };
    } else {
        var pgClient = new Client({
            host: conn.db_host,
            port: parseInt(conn.db_port) || 5432,
            user: conn.db_user,
            password: conn.db_password,
            database: dbName || 'postgres',
            connectionTimeoutMillis: 10000
        });
        await pgClient.connect();
        return { type: 'postgres', client: pgClient };
    }
}

async function closeExternal(ext) {
    try {
        if (ext.type === 'mssql') { await ext.pool.close(); }
        else { await ext.client.end(); }
    } catch (e) {}
}

// Build WHERE clause from filter conditions
function buildWhereClause(conditions, dbType) {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return { sql: '', params: [] };

    var clauses = [];
    var params = [];
    var idx = 1;

    for (var i = 0; i < conditions.length; i++) {
        var c = conditions[i];
        if (!c.column) continue;

        var col = dbType === 'mssql' ? '[' + c.column + ']' : '"' + c.column + '"';
        var castCol = dbType === 'mssql' ? 'CAST(' + col + ' AS NVARCHAR(MAX))' : col + '::text';

        if (c.operator === 'is_empty') {
            clauses.push('(' + castCol + " IS NULL OR LTRIM(RTRIM(" + castCol + ")) = '')");
        } else if (c.operator === 'is_not_empty') {
            clauses.push('(' + castCol + " IS NOT NULL AND LTRIM(RTRIM(" + castCol + ")) != '')");
        } else if (c.value !== undefined && c.value !== '') {
            var ph = dbType === 'mssql' ? '@p' + idx : '$' + idx;
            switch (c.operator) {
                case '=': clauses.push(castCol + ' = ' + ph); params.push(c.value); idx++; break;
                case '!=': clauses.push(castCol + ' != ' + ph); params.push(c.value); idx++; break;
                case '>': clauses.push(castCol + ' > ' + ph); params.push(c.value); idx++; break;
                case '>=': clauses.push(castCol + ' >= ' + ph); params.push(c.value); idx++; break;
                case '<': clauses.push(castCol + ' < ' + ph); params.push(c.value); idx++; break;
                case '<=': clauses.push(castCol + ' <= ' + ph); params.push(c.value); idx++; break;
                case 'contains': clauses.push(castCol + ' LIKE ' + ph); params.push('%' + c.value + '%'); idx++; break;
                case 'not_contains': clauses.push(castCol + ' NOT LIKE ' + ph); params.push('%' + c.value + '%'); idx++; break;
                case 'starts_with': clauses.push(castCol + ' LIKE ' + ph); params.push(c.value + '%'); idx++; break;
                case 'ends_with': clauses.push(castCol + ' LIKE ' + ph); params.push('%' + c.value); idx++; break;
                default: break;
            }
        }
    }

    if (clauses.length === 0) return { sql: '', params: [] };
    return { sql: ' WHERE ' + clauses.join(' AND '), params: params };
}

// GET /expense/get_report_preview/:config_id
router.get('/:config_id', async function(req, res, next) {

    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    try {
        // 1. Get the report config header
        var configResult = await pool.query(
            'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.source_type, rc.db_connection_id, rc.db_database, rc.db_schema, rc.db_table, rc.db_filter_conditions, et.name AS expense_name FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id WHERE rc.id = $1',
            [configId]
        );

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }

        var config = configResult.rows[0];

        // 1b. Get actions for this config
        try {
            var actionsResult = await pool.query(
                'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, rca.display_order, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order',
                [configId]
            );
            config.actions = actionsResult.rows;
        } catch (e) {
            console.log('Actions query failed, trying fallback:', e.message);
            try {
                var fallbackResult = await pool.query(
                    'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.display_order, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order',
                    [configId]
                );
                config.actions = fallbackResult.rows.map(function(r) { r.prompt_mode = false; return r; });
            } catch (e2) { config.actions = []; }
        }

        // 2. Get the config columns
        var configColResult = await pool.query(
            'SELECT column_name, data_type, require_column_index, is_filter, display_order FROM report_config_column WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );

        if (configColResult.rows.length === 0) {
            return res.json({ config: config, columns: [], rows: [], total_rows: 0 });
        }

        var configColumns = configColResult.rows;
        var sourceType = config.source_type || 'expense';

        // ============ DATABASE SOURCE ============
        if (sourceType === 'database') {
            // Get db connection credentials
            var connResult = await pool.query(
                'SELECT * FROM db_connection WHERE id = $1',
                [config.db_connection_id]
            );
            if (connResult.rows.length === 0) {
                return res.status(400).json({ error: 'Database connection not found (ID: ' + config.db_connection_id + ')' });
            }
            var conn = connResult.rows[0];
            var dbType = (conn.db_type || 'postgres').toLowerCase();
            var schema = config.db_schema || 'public';
            var table = config.db_table || '';

            // Build column list
            var selectCols = configColumns.map(function(c) {
                return dbType === 'mssql' ? '[' + c.column_name + ']' : '"' + c.column_name + '"';
            }).join(', ');

            var fullTable = dbType === 'mssql' ? '[' + schema + '].[' + table + ']' : '"' + schema + '"."' + table + '"';

            // Build WHERE from saved filter conditions
            var filterConditions = config.db_filter_conditions || [];
            if (typeof filterConditions === 'string') {
                try { filterConditions = JSON.parse(filterConditions); } catch (e) { filterConditions = []; }
            }
            var where = buildWhereClause(filterConditions, dbType);

            var ext = null;
            try {
                ext = await connectExternal(conn, config.db_database);

                var reportRows = [];
                if (dbType === 'mssql') {
                    var request = ext.pool.request();
                    for (var p = 0; p < where.params.length; p++) {
                        request.input('p' + (p + 1), where.params[p]);
                    }
                    var result = await request.query('SELECT ' + selectCols + ' FROM ' + fullTable + where.sql);
                    reportRows = result.recordset.map(function(row) {
                        var mapped = {};
                        for (var ci = 0; ci < configColumns.length; ci++) {
                            var cn = configColumns[ci].column_name;
                            mapped[cn] = row[cn] !== null && row[cn] !== undefined ? String(row[cn]) : '';
                        }
                        return mapped;
                    });
                } else {
                    var result = await ext.client.query('SELECT ' + selectCols + ' FROM ' + fullTable + where.sql, where.params);
                    reportRows = result.rows.map(function(row) {
                        var mapped = {};
                        for (var ci = 0; ci < configColumns.length; ci++) {
                            var cn = configColumns[ci].column_name;
                            mapped[cn] = row[cn] !== null && row[cn] !== undefined ? String(row[cn]) : '';
                        }
                        return mapped;
                    });
                }

                await closeExternal(ext);

                return res.json({
                    config: config,
                    columns: configColumns,
                    rows: reportRows,
                    total_rows: reportRows.length
                });
            } catch (dbErr) {
                if (ext) await closeExternal(ext);
                console.log('External DB query error:', dbErr.message);
                return res.status(500).json({ error: 'Failed to query external database: ' + dbErr.message });
            }
        }

        // ============ EXPENSE SOURCE (original logic) ============
        var parentId = config.expense_table_parent_id;

        var expenseResult = await pool.query(
            'SELECT id, version FROM expense_table WHERE parent_id = $1 ORDER BY version',
            [parentId]
        );

        if (expenseResult.rows.length === 0) {
            return res.json({ config: config, columns: configColumns, rows: [], total_rows: 0 });
        }

        var versionIds = expenseResult.rows.map(function(v) { return v.id; });

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

        var contentResult = await pool.query(
            'SELECT * FROM content WHERE expense_table_id = ANY($1) ORDER BY expense_table_id, id',
            [versionIds]
        );

        var configColumnNames = {};
        for (var i = 0; i < configColumns.length; i++) {
            configColumnNames[configColumns[i].column_name] = true;
        }

        var reportRows = [];

        for (var r = 0; r < contentResult.rows.length; r++) {
            var contentRow = contentResult.rows[r];
            var vid = contentRow.expense_table_id;
            var versionCols = versionColumnMap[vid] || [];

            var fullRowData = {};
            for (var c = 0; c < versionCols.length; c++) {
                var colDef = versionCols[c];
                var colKey = 'column' + colDef.column_number;
                fullRowData[colDef.column_name] = contentRow[colKey] || "";
            }

            var rowData = {};
            for (var i = 0; i < configColumns.length; i++) {
                var colName = configColumns[i].column_name;
                rowData[colName] = fullRowData[colName] || "";
            }

            rowData._content_id = contentRow.id;
            rowData._full_data = fullRowData;

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