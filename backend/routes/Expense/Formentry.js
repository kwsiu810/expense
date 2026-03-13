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
        var config = { server: conn.db_host, port: parseInt(conn.db_port) || 1433, user: conn.db_user, password: conn.db_password, database: dbName || 'master', options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 } };
        var mssqlPool = await sql.connect(config);
        return { type: 'mssql', pool: mssqlPool };
    } else {
        var pgClient = new Client({ host: conn.db_host, port: parseInt(conn.db_port) || 5432, user: conn.db_user, password: conn.db_password, database: dbName || 'postgres', connectionTimeoutMillis: 10000 });
        await pgClient.connect();
        return { type: 'postgres', client: pgClient };
    }
}
async function closeExternal(ext) { try { if (ext.type === 'mssql') { await ext.pool.close(); } else { await ext.client.end(); } } catch(e) {} }

// GET /expense/form_entry/fields/:config_id - get form fields for a report config
router.get('/fields/:config_id', async function(req, res) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) return res.status(400).json({ error: 'Invalid config ID' });

    try {
        var result = await pool.query(
            'SELECT * FROM report_form_field WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );
        res.json(result.rows);
    } catch (err) {
        console.log('Get form fields error:', err.message);
        res.json([]);
    }
});

// POST /expense/form_entry/fields/:config_id - save form fields (replace all)
router.post('/fields/:config_id', express.json(), async function(req, res) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) return res.status(400).json({ error: 'Invalid config ID' });

    var fields = req.body.fields || [];
    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query('DELETE FROM report_form_field WHERE report_config_id = $1', [configId]);

        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            await client.query(
                'INSERT INTO report_form_field (report_config_id, field_name, field_label, field_type, is_required, placeholder, dropdown_source, dropdown_choices, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [configId, f.field_name || '', f.field_label || f.field_name || '', f.field_type || 'text', f.is_required || false, f.placeholder || '', f.dropdown_source || 'manual', JSON.stringify(f.dropdown_choices || []), i + 1]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Form fields saved (' + fields.length + ' fields).' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.log('Save form fields error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// GET /expense/form_entry/dropdown_values/:config_id/:column_name - get distinct values for a column from report data
router.get('/dropdown_values/:config_id/:column_name', async function(req, res) {
    var configId = parseInt(req.params.config_id);
    var columnName = req.params.column_name;

    try {
        // Get config to determine source type
        var configResult = await pool.query(
            'SELECT source_type, expense_table_parent_id, db_connection_id, db_database, db_schema, db_table FROM report_config WHERE id = $1',
            [configId]
        );
        if (configResult.rows.length === 0) return res.json([]);

        var config = configResult.rows[0];
        var sourceType = config.source_type || 'expense';

        if (sourceType === 'database') {
            // External database
            var connResult = await pool.query('SELECT * FROM db_connection WHERE id = $1', [config.db_connection_id]);
            if (connResult.rows.length === 0) return res.json([]);
            var conn = connResult.rows[0];
            var dbType = (conn.db_type || 'postgres').toLowerCase();
            var col = dbType === 'mssql' ? '[' + columnName + ']' : '"' + columnName + '"';
            var fullTable = dbType === 'mssql' ? '[' + config.db_schema + '].[' + config.db_table + ']' : '"' + config.db_schema + '"."' + config.db_table + '"';

            var ext = null;
            try {
                ext = await connectExternal(conn, config.db_database);
                var values = [];
                if (dbType === 'mssql') {
                    var result = await ext.pool.request().query('SELECT DISTINCT ' + col + ' AS val FROM ' + fullTable + ' WHERE ' + col + ' IS NOT NULL ORDER BY val');
                    values = result.recordset.map(function(r) { return String(r.val); });
                } else {
                    var result = await ext.client.query('SELECT DISTINCT ' + col + ' AS val FROM ' + fullTable + ' WHERE ' + col + ' IS NOT NULL ORDER BY val');
                    values = result.rows.map(function(r) { return String(r.val); });
                }
                await closeExternal(ext);
                res.json(values);
            } catch (e) {
                if (ext) await closeExternal(ext);
                console.log('Dropdown values DB error:', e.message);
                res.json([]);
            }
        } else {
            // Expense data
            var parentId = config.expense_table_parent_id;
            var versionResult = await pool.query('SELECT id FROM expense_table WHERE parent_id = $1', [parentId]);
            var versionIds = versionResult.rows.map(function(v) { return v.id; });
            if (versionIds.length === 0) return res.json([]);

            // Find the column number
            var colResult = await pool.query(
                'SELECT column_number FROM expense_table_column_name WHERE expense_table_id = ANY($1) AND column_name = $2 LIMIT 1',
                [versionIds, columnName]
            );
            if (colResult.rows.length === 0) return res.json([]);
            var colNum = colResult.rows[0].column_number;
            var colField = 'column' + colNum;

            var valResult = await pool.query(
                'SELECT DISTINCT ' + colField + ' AS val FROM content WHERE expense_table_id = ANY($1) AND ' + colField + ' IS NOT NULL AND ' + colField + " != '' ORDER BY val",
                [versionIds]
            );
            res.json(valResult.rows.map(function(r) { return r.val; }));
        }
    } catch (err) {
        console.log('Dropdown values error:', err.message);
        res.json([]);
    }
});

// GET /expense/form_entry/form/:config_id - get form definition + dropdown values for rendering
router.get('/form/:config_id', async function(req, res) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) return res.status(400).json({ error: 'Invalid config ID' });

    try {
        // Config info
        var configResult = await pool.query(
            'SELECT rc.id, rc.config_name, rc.source_type FROM report_config rc WHERE rc.id = $1',
            [configId]
        );
        if (configResult.rows.length === 0) return res.status(404).json({ error: 'Report config not found' });

        // Form fields
        var fieldsResult = await pool.query(
            'SELECT * FROM report_form_field WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );

        res.json({
            config: configResult.rows[0],
            fields: fieldsResult.rows
        });
    } catch (err) {
        console.log('Get form error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /expense/form_entry/submit/:config_id - submit form data (insert row)
router.post('/submit/:config_id', express.json(), async function(req, res) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) return res.status(400).json({ error: 'Invalid config ID' });

    var formData = req.body.data || {};

    try {
        // Get config
        var configResult = await pool.query(
            'SELECT rc.*, et.name AS expense_name FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id WHERE rc.id = $1',
            [configId]
        );
        if (configResult.rows.length === 0) return res.status(404).json({ error: 'Report config not found' });
        var config = configResult.rows[0];
        var sourceType = config.source_type || 'expense';

        if (sourceType === 'database') {
            // Insert into external database
            var connResult = await pool.query('SELECT * FROM db_connection WHERE id = $1', [config.db_connection_id]);
            if (connResult.rows.length === 0) return res.status(400).json({ error: 'Database connection not found' });
            var conn = connResult.rows[0];
            var dbType = (conn.db_type || 'postgres').toLowerCase();
            var schema = config.db_schema || 'public';
            var table = config.db_table || '';

            var columns = Object.keys(formData);
            if (columns.length === 0) return res.status(400).json({ error: 'No data to insert' });

            var ext = null;
            try {
                ext = await connectExternal(conn, config.db_database);

                if (dbType === 'mssql') {
                    var colList = columns.map(function(c) { return '[' + c + ']'; }).join(', ');
                    var valList = columns.map(function(c, i) { return '@p' + (i + 1); }).join(', ');
                    var request = ext.pool.request();
                    for (var i = 0; i < columns.length; i++) {
                        request.input('p' + (i + 1), formData[columns[i]] || '');
                    }
                    await request.query('INSERT INTO [' + schema + '].[' + table + '] (' + colList + ') VALUES (' + valList + ')');
                } else {
                    var colList = columns.map(function(c) { return '"' + c + '"'; }).join(', ');
                    var valList = columns.map(function(c, i) { return '$' + (i + 1); }).join(', ');
                    var values = columns.map(function(c) { return formData[c] || ''; });
                    await ext.client.query('INSERT INTO "' + schema + '"."' + table + '" (' + colList + ') VALUES (' + valList + ')', values);
                }

                await closeExternal(ext);
                res.json({ message: 'Record inserted successfully.' });
            } catch (dbErr) {
                if (ext) await closeExternal(ext);
                console.log('Form submit DB error:', dbErr.message);
                res.status(500).json({ error: 'Failed to insert: ' + dbErr.message });
            }
        } else {
            // Insert into content table (expense data)
            var parentId = config.expense_table_parent_id;

            // Get latest version
            var versionResult = await pool.query(
                'SELECT id FROM expense_table WHERE parent_id = $1 ORDER BY version DESC LIMIT 1',
                [parentId]
            );
            if (versionResult.rows.length === 0) return res.status(400).json({ error: 'No expense table found' });
            var expenseTableId = versionResult.rows[0].id;

            // Get column mapping
            var colMapResult = await pool.query(
                'SELECT column_number, column_name FROM expense_table_column_name WHERE expense_table_id = $1',
                [expenseTableId]
            );
            var colMap = {};
            for (var cm = 0; cm < colMapResult.rows.length; cm++) {
                colMap[colMapResult.rows[cm].column_name] = colMapResult.rows[cm].column_number;
            }

            var columnFields = ['expense_table_id', 'require_column_data'];
            var placeholders = ['$1', '$2'];
            var values = [expenseTableId, ''];
            var idx = 3;

            var dataKeys = Object.keys(formData);
            for (var dk = 0; dk < dataKeys.length; dk++) {
                var colNum = colMap[dataKeys[dk]];
                if (colNum !== undefined && colNum <= 60) {
                    columnFields.push('column' + colNum);
                    placeholders.push('$' + idx);
                    values.push(formData[dataKeys[dk]] || '');
                    idx++;
                }
            }

            await pool.query(
                'INSERT INTO content (' + columnFields.join(', ') + ') VALUES (' + placeholders.join(', ') + ')',
                values
            );
            res.json({ message: 'Record inserted successfully.' });
        }
    } catch (err) {
        console.log('Form submit error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;