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

// GET /api/expense/get_columns/:expense_table_id
router.get('/:expense_table_id', function(req, res, next) {

    var expenseTableId = parseInt(req.params.expense_table_id);

    if (isNaN(expenseTableId)) {
        return res.status(400).json({ error: 'Invalid expense table ID' });
    }

    pool.query(
        'SELECT ROW_NUMBER() OVER (ORDER BY min(etcn.column_number)) AS id, etcn.column_name, min(etcn.column_number) AS column_number, etcn.data_type, bool_or(etcn.require_column_index) AS require_column_index FROM expense_table_column_name etcn WHERE etcn.expense_table_id IN (SELECT id FROM expense_table et WHERE et.parent_id = $1) GROUP BY etcn.column_name, etcn.data_type ORDER BY min(etcn.column_number)',
        [expenseTableId]
    )
    .then(function(result) {
        res.json(result.rows);
    })
    .catch(function(err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to fetch columns' });
    });

});

module.exports = router;