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

// GET / - list all actions
router.get('/', function(req, res, next) {
    pool.query(
        'SELECT id, action_name, action_type, action_config, created_date, updated_date FROM report_action ORDER BY created_date DESC'
    )
    .then(function(result) {
        res.json(result.rows);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch actions' });
    });
});

// GET /:id - get single action
router.get('/:id', function(req, res, next) {
    var actionId = parseInt(req.params.id);
    if (isNaN(actionId)) {
        return res.status(400).json({ error: 'Invalid action ID' });
    }

    pool.query('SELECT * FROM report_action WHERE id = $1', [actionId])
    .then(function(result) {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Action not found' });
        }
        res.json(result.rows[0]);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch action' });
    });
});

// POST / - create new action
router.post('/', function(req, res, next) {
    var actionName = req.body.action_name;
    var actionType = req.body.action_type || 'send_email';
    var actionConfig = req.body.action_config || {};

    if (!actionName || !actionName.trim()) {
        return res.status(400).json({ error: 'Action name is required' });
    }

    pool.query(
        'INSERT INTO report_action (action_name, action_type, action_config, created_date, updated_date) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id',
        [actionName.trim(), actionType, JSON.stringify(actionConfig)]
    )
    .then(function(result) {
        res.json({ message: 'Action "' + actionName.trim() + '" created.', action_id: result.rows[0].id });
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: err.message || 'Failed to create action' });
    });
});

// PUT /:id - update action
router.put('/:id', function(req, res, next) {
    var actionId = parseInt(req.params.id);
    if (isNaN(actionId)) {
        return res.status(400).json({ error: 'Invalid action ID' });
    }

    var actionName = req.body.action_name;
    var actionType = req.body.action_type || 'send_email';
    var actionConfig = req.body.action_config || {};

    if (!actionName || !actionName.trim()) {
        return res.status(400).json({ error: 'Action name is required' });
    }

    pool.query(
        'UPDATE report_action SET action_name = $1, action_type = $2, action_config = $3, updated_date = NOW() WHERE id = $4 RETURNING id',
        [actionName.trim(), actionType, JSON.stringify(actionConfig), actionId]
    )
    .then(function(result) {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Action not found' });
        }
        res.json({ message: 'Action updated successfully.' });
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: err.message || 'Failed to update action' });
    });
});

// DELETE /:id - delete action
router.delete('/:id', function(req, res, next) {
    var actionId = parseInt(req.params.id);
    if (isNaN(actionId)) {
        return res.status(400).json({ error: 'Invalid action ID' });
    }

    // Clear action_id from any report_configs using this action (skip if columns don't exist yet)
    pool.query('UPDATE report_config SET action_id = NULL, action_button_label = \'\', action_column_mapping = \'{}\' WHERE action_id = $1', [actionId])
    .catch(function(err) {
        console.log('Note: Could not clear action references from report_config:', err.message);
    })
    .then(function() {
        return pool.query('DELETE FROM report_action WHERE id = $1 RETURNING action_name', [actionId]);
    })
    .then(function(result) {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Action not found' });
        }
        res.json({ message: 'Action "' + result.rows[0].action_name + '" deleted.' });
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: err.message || 'Failed to delete action' });
    });
});

module.exports = router;