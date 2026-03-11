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



// GET /api/expenses - return all expenses [{id, name}]
router.get('/', function(req, res, next) {

    pool.query('SELECT id, name FROM expense_table where version = 0 ORDER BY name')
    .then(function(result) {
        res.json(result.rows);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    });

});

// GET /api/expenses/:id - return single expense by id
router.get('/:id', function(req, res, next) {

    var id = req.params.id;

    pool.query('SELECT id, name FROM expense_table WHERE id = $1', [id])
    .then(function(result) {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(result.rows[0]);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch expense' });
    });

});

// POST /api/expenses - create a new expense name
router.post('/', function(req, res, next) {

    var name = req.body.name;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Expense name is required' });
    }

    pool.query('INSERT INTO expense_table (name) VALUES ($1) RETURNING id, name', [name.trim()])
    .then(function(result) {
        res.status(201).json(result.rows[0]);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to create expense' });
    });

});

module.exports = router;