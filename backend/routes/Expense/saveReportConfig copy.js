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

// GET / - list all saved report configs
router.get('/', function(req, res, next) {

    var employeeInfo = {
        employee_id: req.headers['employee_id'] || req.headers['employeeid'] || req.headers['employee-id'] || '020444253',
        employee_name: req.headers['employee_name'] || req.headers['employeename'] || req.headers['employee-name'] || 'Keith Siu',
        employee_title: req.headers['employee_title'] || req.headers['employeetitle'] || req.headers['employee-title'] || 'Sr. Clinical Comm Analyst',
        employee_department: req.headers['employee_department'] || req.headers['employeedepartment'] || req.headers['employee-department'] || 'CS Clinical Communications'
    };




    console.log('GET configs - employee headers:', employeeInfo);
    console.log('GET configs - all header keys:', JSON.stringify(Object.keys(req.headers)));

    pool.query(
        'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.display_order, rc.action_id, rc.action_button_label, rc.action_column_mapping, rc.created_date, rc.updated_date, et.name AS expense_name, ra.action_name, ra.action_type, (SELECT COUNT(*) FROM report_config_column rcc WHERE rcc.report_config_id = rc.id) AS column_count FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id LEFT JOIN report_action ra ON ra.id = rc.action_id ORDER BY rc.display_order, rc.created_date'
    )
    .then(function(result) {
        res.json({ configs: result.rows, employee: employeeInfo });
    })
    .catch(function(err) {
        // Fallback if action columns don't exist yet
        pool.query(
            'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.display_order, rc.created_date, rc.updated_date, et.name AS expense_name, (SELECT COUNT(*) FROM report_config_column rcc WHERE rcc.report_config_id = rc.id) AS column_count FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id ORDER BY rc.display_order, rc.created_date'
        )
        .then(function(result) {
            res.json({ configs: result.rows, employee: employeeInfo });
        })
        .catch(function(err2) {
            console.log(err2);
            res.status(500).json({ error: 'Failed to fetch report configs' });
        });
    });

});

// GET /:id - get a single report config with its columns
router.get('/:id', async function(req, res, next) {

    var configId = parseInt(req.params.id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    try {
        var configResult;
        try {
            configResult = await pool.query(
                'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.action_id, rc.action_button_label, rc.action_column_mapping, rc.created_date, rc.updated_date, et.name AS expense_name, ra.action_name, ra.action_type FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id LEFT JOIN report_action ra ON ra.id = rc.action_id WHERE rc.id = $1',
                [configId]
            );
        } catch (queryErr) {
            configResult = await pool.query(
                'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.created_date, rc.updated_date, et.name AS expense_name FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id WHERE rc.id = $1',
                [configId]
            );
        }

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }

        var columnsResult = await pool.query(
            'SELECT id, column_name, data_type, require_column_index, is_filter, display_order FROM report_config_column WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );

        var config = configResult.rows[0];
        config.columns = columnsResult.rows;

        res.json(config);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch report config' });
    }

});

// POST / - save a new report config
router.post('/', async function(req, res, next) {

    var client = null;

    try {
        var configName = req.body.config_name;
        var expenseTableParentId = req.body.expense_table_id;
        var columns = req.body.columns;
        var actionId = req.body.action_id || null;
        var actionButtonLabel = req.body.action_button_label || '';
        var actionColumnMapping = req.body.action_column_mapping || {};

        if (!configName || !configName.trim()) {
            return res.status(400).json({ error: 'Configuration name is required' });
        }
        if (!expenseTableParentId) {
            return res.status(400).json({ error: 'Expense table ID is required' });
        }
        if (!columns || !Array.isArray(columns) || columns.length === 0) {
            return res.status(400).json({ error: 'At least one column must be selected' });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Get next display_order
        var orderResult = await client.query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM report_config');
        var nextOrder = orderResult.rows[0].next_order;

        // Insert config header (try with action columns, fallback without)
        var configResult;
        try {
            configResult = await client.query(
                'INSERT INTO report_config (config_name, expense_table_parent_id, display_order, action_id, action_button_label, action_column_mapping, created_date, updated_date) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id',
                [configName.trim(), parseInt(expenseTableParentId), nextOrder, actionId ? parseInt(actionId) : null, actionButtonLabel, JSON.stringify(actionColumnMapping)]
            );
        } catch (insertErr) {
            configResult = await client.query(
                'INSERT INTO report_config (config_name, expense_table_parent_id, display_order, created_date, updated_date) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id',
                [configName.trim(), parseInt(expenseTableParentId), nextOrder]
            );
        }
        var configId = configResult.rows[0].id;

        // Insert config columns
        for (var i = 0; i < columns.length; i++) {
            var col = columns[i];
            await client.query(
                'INSERT INTO report_config_column (report_config_id, column_name, data_type, require_column_index, is_filter, display_order) VALUES ($1, $2, $3, $4, $5, $6)',
                [
                    configId,
                    col.column_name,
                    col.data_type || 'string',
                    col.require_column_index || false,
                    col.is_filter || false,
                    col.display_order
                ]
            );
        }

        await client.query('COMMIT');

        res.json({
            message: 'Configuration "' + configName.trim() + '" saved with ' + columns.length + ' columns.',
            config_id: configId,
            columns_configured: columns.length
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.log('Save config error:', err);
        res.status(500).json({ error: err.message || 'Failed to save configuration' });
    } finally {
        if (client) {
            client.release();
        }
    }

});

// DELETE /:id - delete a report config and its columns
router.delete('/:id', async function(req, res, next) {

    var configId = parseInt(req.params.id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Delete columns first (or rely on CASCADE)
        await client.query(
            'DELETE FROM report_config_column WHERE report_config_id = $1',
            [configId]
        );

        var deleteResult = await client.query(
            'DELETE FROM report_config WHERE id = $1 RETURNING config_name',
            [configId]
        );

        if (deleteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Report config not found' });
        }

        await client.query('COMMIT');

        res.json({
            message: 'Configuration "' + deleteResult.rows[0].config_name + '" has been deleted.'
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.log('Delete config error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete configuration' });
    } finally {
        if (client) {
            client.release();
        }
    }

});

// PUT /reorder - update display_order for all configs
router.put('/reorder', async function(req, res, next) {

    var order = req.body.order; // array of { id, display_order }

    if (!order || !Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'Order array is required' });
    }

    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        for (var i = 0; i < order.length; i++) {
            var item = order[i];
            await client.query(
                'UPDATE report_config SET display_order = $1, updated_date = NOW() WHERE id = $2',
                [item.display_order, item.id]
            );
        }

        await client.query('COMMIT');

        res.json({ message: 'Report order updated successfully.' });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.log('Reorder error:', err);
        res.status(500).json({ error: err.message || 'Failed to update order' });
    } finally {
        if (client) {
            client.release();
        }
    }

});

module.exports = router;