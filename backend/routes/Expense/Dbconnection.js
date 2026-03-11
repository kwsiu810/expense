var express = require('express');
var router = express.Router();
var { Pool, Client } = require('pg');
const PropertiesReader = require("properties-reader");
const prop = PropertiesReader("./properties/app.properties");

// App's own database pool
var pool = new Pool({
    host: prop.get("dbHost"),
    user: prop.get("dbUser"),
    password: prop.get("dbPassword"),
    database: 'Expense',
    port: 5432
});

// Helper: create a temporary client to an external database
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
            options: {
                encrypt: false,
                trustServerCertificate: true,
                connectTimeout: 10000
            }
        };
        var mssqlPool = await sql.connect(config);
        return { type: 'mssql', pool: mssqlPool, sql: sql };
    } else {
        // postgres
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
        if (ext.type === 'mssql') {
            await ext.pool.close();
        } else {
            await ext.client.end();
        }
    } catch (e) {}
}

// GET /expense/db_connection - list all connections
router.get('/', async function(req, res) {
    try {
        var result = await pool.query(
            'SELECT id, connection_name, db_type, db_host, db_port, db_user, db_name, created_date FROM db_connection ORDER BY connection_name'
        );
        res.json(result.rows);
    } catch (err) {
        console.log('List db connections error:', err.message);
        res.json([]);
    }
});

// POST /expense/db_connection - create new connection
router.post('/', express.json(), async function(req, res) {
    try {
        var b = req.body;
        if (!b.connection_name || !b.db_type || !b.db_host || !b.db_user) {
            return res.status(400).json({ error: 'connection_name, db_type, db_host, and db_user are required' });
        }

        var result = await pool.query(
            'INSERT INTO db_connection (connection_name, db_type, db_host, db_port, db_user, db_password, db_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [b.connection_name, b.db_type, b.db_host, b.db_port || (b.db_type === 'mssql' ? '1433' : '5432'), b.db_user, b.db_password || '', b.db_name || '']
        );
        res.json({ id: result.rows[0].id, message: 'Connection created.' });
    } catch (err) {
        console.log('Create db connection error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PUT /expense/db_connection/:id - update connection
router.put('/:id', express.json(), async function(req, res) {
    try {
        var id = parseInt(req.params.id);
        var b = req.body;

        // If password is empty string, keep old password
        var updateFields = [
            'connection_name = $1', 'db_type = $2', 'db_host = $3', 'db_port = $4', 'db_user = $5', 'db_name = $7'
        ];
        var params = [b.connection_name, b.db_type, b.db_host, b.db_port, b.db_user, b.db_password, b.db_name || '', id];

        if (b.db_password) {
            updateFields.push('db_password = $6');
        }

        await pool.query(
            'UPDATE db_connection SET ' + updateFields.join(', ') + ' WHERE id = $8',
            params
        );
        res.json({ message: 'Connection updated.' });
    } catch (err) {
        console.log('Update db connection error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /expense/db_connection/:id
router.delete('/:id', async function(req, res) {
    try {
        await pool.query('DELETE FROM db_connection WHERE id = $1', [parseInt(req.params.id)]);
        res.json({ message: 'Connection deleted.' });
    } catch (err) {
        console.log('Delete db connection error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /expense/db_connection/test - test a connection
router.post('/test', express.json(), async function(req, res) {
    var ext = null;
    try {
        ext = await connectExternal(req.body);
        await closeExternal(ext);
        res.json({ success: true, message: 'Connection successful!' });
    } catch (err) {
        if (ext) await closeExternal(ext);
        res.json({ success: false, message: 'Connection failed: ' + err.message });
    }
});

// POST /expense/db_connection/databases - list databases for a connection
router.post('/databases', express.json(), async function(req, res) {
    var ext = null;
    try {
        var conn = req.body;
        var dbType = (conn.db_type || 'postgres').toLowerCase();

        if (dbType === 'mssql') {
            ext = await connectExternal(conn, 'master');
            var result = await ext.pool.request().query("SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name");
            var databases = result.recordset.map(function(r) { return r.name; });
            await closeExternal(ext);
            res.json(databases);
        } else {
            ext = await connectExternal(conn, 'postgres');
            var result = await ext.client.query("SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres') ORDER BY datname");
            var databases = result.rows.map(function(r) { return r.datname; });
            await closeExternal(ext);
            res.json(databases);
        }
    } catch (err) {
        if (ext) await closeExternal(ext);
        console.log('List databases error:', err.message);
        res.json([]);
    }
});

// POST /expense/db_connection/tables - list tables for a specific database
router.post('/tables', express.json(), async function(req, res) {
    var ext = null;
    try {
        var conn = req.body;
        var database = conn.database;
        var dbType = (conn.db_type || 'postgres').toLowerCase();

        if (dbType === 'mssql') {
            ext = await connectExternal(conn, database);
            var result = await ext.pool.request().query(
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME"
            );
            var tables = result.recordset.map(function(r) { return { schema: r.TABLE_SCHEMA, table: r.TABLE_NAME }; });
            await closeExternal(ext);
            res.json(tables);
        } else {
            ext = await connectExternal(conn, database);
            var result = await ext.client.query(
                "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name"
            );
            var tables = result.rows.map(function(r) { return { schema: r.table_schema, table: r.table_name }; });
            await closeExternal(ext);
            res.json(tables);
        }
    } catch (err) {
        if (ext) await closeExternal(ext);
        console.log('List tables error:', err.message);
        res.json([]);
    }
});

// POST /expense/db_connection/preview - fetch first 5 rows + columns from a table
router.post('/preview', express.json(), async function(req, res) {
    var ext = null;
    try {
        var conn = req.body;
        var database = conn.database;
        var schema = conn.schema || 'public';
        var table = conn.table;
        var dbType = (conn.db_type || 'postgres').toLowerCase();

        if (!table) return res.status(400).json({ error: 'Table is required' });

        var fullTable = schema + '.' + table;

        if (dbType === 'mssql') {
            ext = await connectExternal(conn, database);
            var countResult = await ext.pool.request().query('SELECT COUNT(*) AS cnt FROM [' + schema + '].[' + table + ']');
            var totalRows = countResult.recordset[0].cnt;
            var result = await ext.pool.request().query('SELECT TOP 5 * FROM [' + schema + '].[' + table + ']');
            var columns = result.recordset.columns ? Object.keys(result.recordset.columns) : (result.recordset.length > 0 ? Object.keys(result.recordset[0]) : []);
            await closeExternal(ext);
            res.json({ columns: columns, rows: result.recordset, total_rows: totalRows });
        } else {
            ext = await connectExternal(conn, database);
            var countResult = await ext.client.query('SELECT COUNT(*) AS cnt FROM ' + fullTable);
            var totalRows = parseInt(countResult.rows[0].cnt);
            var result = await ext.client.query('SELECT * FROM ' + fullTable + ' LIMIT 5');
            var columns = result.fields.map(function(f) { return f.name; });
            await closeExternal(ext);
            res.json({ columns: columns, rows: result.rows, total_rows: totalRows });
        }
    } catch (err) {
        if (ext) await closeExternal(ext);
        console.log('Preview table error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /expense/db_connection/fetch - fetch ALL rows from a table (for import)
router.post('/fetch', express.json(), async function(req, res) {
    var ext = null;
    try {
        var conn = req.body;
        var database = conn.database;
        var schema = conn.schema || 'public';
        var table = conn.table;
        var dbType = (conn.db_type || 'postgres').toLowerCase();

        if (!table) return res.status(400).json({ error: 'Table is required' });

        if (dbType === 'mssql') {
            ext = await connectExternal(conn, database);
            var result = await ext.pool.request().query('SELECT * FROM [' + schema + '].[' + table + ']');
            var columns = result.recordset.columns ? Object.keys(result.recordset.columns) : (result.recordset.length > 0 ? Object.keys(result.recordset[0]) : []);
            // Convert rows to string values for consistent handling
            var rows = result.recordset.map(function(row) {
                var clean = {};
                for (var k in row) {
                    clean[k] = row[k] !== null && row[k] !== undefined ? String(row[k]) : '';
                }
                return clean;
            });
            await closeExternal(ext);
            res.json({ columns: columns, rows: rows });
        } else {
            ext = await connectExternal(conn, database);
            var result = await ext.client.query('SELECT * FROM ' + schema + '.' + table);
            var columns = result.fields.map(function(f) { return f.name; });
            var rows = result.rows.map(function(row) {
                var clean = {};
                for (var k in row) {
                    clean[k] = row[k] !== null && row[k] !== undefined ? String(row[k]) : '';
                }
                return clean;
            });
            await closeExternal(ext);
            res.json({ columns: columns, rows: rows });
        }
    } catch (err) {
        if (ext) await closeExternal(ext);
        console.log('Fetch table error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /expense/db_connection/:id - get single connection (with password masked)
router.get('/:id', async function(req, res) {
    try {
        var result = await pool.query(
            'SELECT id, connection_name, db_type, db_host, db_port, db_user, db_password, db_name, created_date FROM db_connection WHERE id = $1',
            [parseInt(req.params.id)]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;