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

// DELETE /expense/delete_expense/:parent_id
// Deletes an expense type and all versions, columns, content, and related report configs
router.delete('/:parent_id', async function(req, res, next) {

    var parentId = parseInt(req.params.parent_id);

    if (isNaN(parentId)) {
        return res.status(400).json({ error: 'Invalid parent ID' });
    }

    var client = null;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Get all expense_table IDs for this parent
        var expenseResult = await client.query(
            'SELECT id FROM expense_table WHERE parent_id = $1',
            [parentId]
        );

        if (expenseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Expense type not found' });
        }

        var expenseIds = expenseResult.rows.map(function(r) { return r.id; });

        // 2. Delete content rows for all versions
        var contentResult = await client.query(
            'DELETE FROM content WHERE expense_table_id = ANY($1)',
            [expenseIds]
        );
        var contentDeleted = contentResult.rowCount;

        // 3. Delete column definitions for all versions
        var colResult = await client.query(
            'DELETE FROM expense_table_column_name WHERE expense_table_id = ANY($1)',
            [expenseIds]
        );
        var columnsDeleted = colResult.rowCount;

        // 4. Delete related report configs (columns cascade via FK)
        var configResult = await client.query(
            'DELETE FROM report_config WHERE expense_table_parent_id = $1',
            [parentId]
        );
        var configsDeleted = configResult.rowCount;

        // 5. Delete all expense_table records for this parent
        var expenseDeleteResult = await client.query(
            'DELETE FROM expense_table WHERE parent_id = $1',
            [parentId]
        );
        var versionsDeleted = expenseDeleteResult.rowCount;

        await client.query('COMMIT');

        res.json({
            message: 'Expense type deleted successfully.',
            versions_deleted: versionsDeleted,
            content_rows_deleted: contentDeleted,
            columns_deleted: columnsDeleted,
            configs_deleted: configsDeleted
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.log('Delete expense error:', err);
        res.status(500).json({ error: err.message || 'Delete failed' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;