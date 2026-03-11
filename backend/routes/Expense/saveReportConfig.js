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

// GET / - list all saved report configs with actions
router.get('/', function(req, res, next) {

    var employeeInfo = {
        employee_id: req.headers['employee_id'] || req.headers['employeeid'] || req.headers['employee-id'] || '020444253',
        employee_name: req.headers['employee_name'] || req.headers['employeename'] || req.headers['employee-name'] || 'Keith Siu',
        employee_title: req.headers['employee_title'] || req.headers['employeetitle'] || req.headers['employee-title'] || 'Sr. Clinical Comm Analyst',
        employee_department: req.headers['employee_department'] || req.headers['employeedepartment'] || req.headers['employee-department'] || 'CS Clinical Communications'
    };

    pool.query(
        'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.display_order, rc.created_date, rc.updated_date, et.name AS expense_name, (SELECT COUNT(*) FROM report_config_column rcc WHERE rcc.report_config_id = rc.id) AS column_count FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id ORDER BY rc.display_order, rc.created_date'
    )
    .then(function(configResult) {
        var configs = configResult.rows;
        if (configs.length === 0) {
            return res.json({ configs: [], employee: employeeInfo });
        }

        var configIds = configs.map(function(c) { return c.id; });
        pool.query(
            'SELECT rca.id, rca.report_config_id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, rca.display_order, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = ANY($1) ORDER BY rca.display_order',
            [configIds]
        )
        .then(function(actionResult) {
            var actionMap = {};
            for (var i = 0; i < actionResult.rows.length; i++) {
                var a = actionResult.rows[i];
                if (!actionMap[a.report_config_id]) actionMap[a.report_config_id] = [];
                actionMap[a.report_config_id].push(a);
            }
            for (var i = 0; i < configs.length; i++) {
                configs[i].actions = actionMap[configs[i].id] || [];
            }
            res.json({ configs: configs, employee: employeeInfo });
        })
        .catch(function(err) {
            console.log('Actions query failed:', err.message);
            res.json({ configs: configs, employee: employeeInfo });
        });
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch report configs' });
    });

});

// GET /:id - get a single report config with columns and actions
router.get('/:id', async function(req, res, next) {

    var configId = parseInt(req.params.id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    try {
        var configResult = await pool.query(
            'SELECT rc.id, rc.config_name, rc.expense_table_parent_id, rc.created_date, rc.updated_date, et.name AS expense_name FROM report_config rc LEFT JOIN expense_table et ON et.id = rc.expense_table_parent_id WHERE rc.id = $1',
            [configId]
        );

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }

        var columnsResult = await pool.query(
            'SELECT id, column_name, data_type, require_column_index, is_filter, display_order FROM report_config_column WHERE report_config_id = $1 ORDER BY display_order',
            [configId]
        );

        var config = configResult.rows[0];
        config.columns = columnsResult.rows;

        try {
            var actionsResult = await pool.query(
                'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, rca.display_order, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order',
                [configId]
            );
            config.actions = actionsResult.rows;
        } catch (e) {
            config.actions = [];
        }

        res.json(config);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch report config' });
    }

});

// POST / - save a new report config with columns and actions
router.post('/', async function(req, res, next) {

    var client = null;

    try {
        var configName = req.body.config_name;
        var expenseTableParentId = req.body.expense_table_id;
        var columns = req.body.columns;
        var actions = req.body.actions || [];

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

        var orderResult = await client.query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM report_config');
        var nextOrder = orderResult.rows[0].next_order;

        var configResult = await client.query(
            'INSERT INTO report_config (config_name, expense_table_parent_id, display_order, created_date, updated_date) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id',
            [configName.trim(), parseInt(expenseTableParentId), nextOrder]
        );
        var configId = configResult.rows[0].id;

        for (var i = 0; i < columns.length; i++) {
            var col = columns[i];
            await client.query(
                'INSERT INTO report_config_column (report_config_id, column_name, data_type, require_column_index, is_filter, display_order) VALUES ($1, $2, $3, $4, $5, $6)',
                [configId, col.column_name, col.data_type || 'string', col.require_column_index || false, col.is_filter || false, col.display_order]
            );
        }

        for (var a = 0; a < actions.length; a++) {
            var act = actions[a];
            await client.query(
                'INSERT INTO report_config_action (report_config_id, action_id, action_type, action_button_label, action_column_mapping, prompt_mode, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [configId, act.action_id ? parseInt(act.action_id) : null, act.action_type || '', act.action_button_label || '', JSON.stringify(act.action_column_mapping || {}), act.prompt_mode || false, a + 1]
            );
        }

        await client.query('COMMIT');

        res.json({
            message: 'Configuration "' + configName.trim() + '" saved with ' + columns.length + ' columns and ' + actions.length + ' action(s).',
            config_id: configId
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.log('Save config error:', err);
        res.status(500).json({ error: err.message || 'Failed to save configuration' });
    } finally {
        if (client) client.release();
    }

});

// PUT /:id - update an existing report config
router.put('/:id', async function(req, res, next) {

    var configId = parseInt(req.params.id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    var client = null;

    try {
        var configName = req.body.config_name;
        var expenseTableParentId = req.body.expense_table_id;
        var columns = req.body.columns;
        var actions = req.body.actions || [];

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

        // Verify config exists
        var existCheck = await client.query('SELECT id FROM report_config WHERE id = $1', [configId]);
        if (existCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Report config not found' });
        }

        // Update header
        await client.query(
            'UPDATE report_config SET config_name = $1, expense_table_parent_id = $2, updated_date = NOW() WHERE id = $3',
            [configName.trim(), parseInt(expenseTableParentId), configId]
        );

        // Replace columns: delete old, insert new
        await client.query('DELETE FROM report_config_column WHERE report_config_id = $1', [configId]);
        for (var i = 0; i < columns.length; i++) {
            var col = columns[i];
            await client.query(
                'INSERT INTO report_config_column (report_config_id, column_name, data_type, require_column_index, is_filter, display_order) VALUES ($1, $2, $3, $4, $5, $6)',
                [configId, col.column_name, col.data_type || 'string', col.require_column_index || false, col.is_filter || false, col.display_order]
            );
        }

        // Replace actions: delete old, insert new
        try { await client.query('DELETE FROM report_config_action WHERE report_config_id = $1', [configId]); } catch (e) {}
        for (var a = 0; a < actions.length; a++) {
            var act = actions[a];
            await client.query(
                'INSERT INTO report_config_action (report_config_id, action_id, action_type, action_button_label, action_column_mapping, prompt_mode, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [configId, act.action_id ? parseInt(act.action_id) : null, act.action_type || '', act.action_button_label || '', JSON.stringify(act.action_column_mapping || {}), act.prompt_mode || false, a + 1]
            );
        }

        await client.query('COMMIT');

        res.json({
            message: 'Configuration "' + configName.trim() + '" updated with ' + columns.length + ' columns and ' + actions.length + ' action(s).',
            config_id: configId
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.log('Update config error:', err);
        res.status(500).json({ error: err.message || 'Failed to update configuration' });
    } finally {
        if (client) client.release();
    }

});

// DELETE /:id
router.delete('/:id', async function(req, res, next) {

    var configId = parseInt(req.params.id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        try { await client.query('DELETE FROM report_config_action WHERE report_config_id = $1', [configId]); } catch (e) {}
        await client.query('DELETE FROM report_config_column WHERE report_config_id = $1', [configId]);

        var deleteResult = await client.query('DELETE FROM report_config WHERE id = $1 RETURNING config_name', [configId]);

        if (deleteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Report config not found' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Configuration "' + deleteResult.rows[0].config_name + '" has been deleted.' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.log('Delete config error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete configuration' });
    } finally {
        if (client) client.release();
    }

});

// PUT /reorder
router.put('/reorder', async function(req, res, next) {

    var order = req.body.order;
    if (!order || !Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'Order array is required' });
    }

    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        for (var i = 0; i < order.length; i++) {
            await client.query('UPDATE report_config SET display_order = $1, updated_date = NOW() WHERE id = $2', [order[i].display_order, order[i].id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Report order updated successfully.' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.log('Reorder error:', err);
        res.status(500).json({ error: err.message || 'Failed to update order' });
    } finally {
        if (client) client.release();
    }

});

module.exports = router;