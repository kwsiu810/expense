var express = require('express');
var router = express.Router();
var { Pool } = require('pg');
var multer = require('multer');
var upload = multer({ storage: multer.memoryStorage() });
const PropertiesReader = require("properties-reader");
const prop = PropertiesReader("./properties/app.properties");

var pool = new Pool({
    host: prop.get("dbHost"),
    user: prop.get("dbUser"),
    password: prop.get("dbPassword"),
    database: 'Expense',
    port: 5432
});

// Helper: parse a CSV line handling quoted fields
function parseLine(line) {
    var result = [];
    var current = "";
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

// Helper: detect data type from an array of values
function detectDataType(values) {
    var dominated_by_type = { int: 0, date: 0, string: 0 };
    var nonEmpty = values.filter(function(v) { return v && v.trim() !== ""; });

    if (nonEmpty.length === 0) return "string";

    for (var i = 0; i < nonEmpty.length; i++) {
        var val = nonEmpty[i].trim();

        // Check integer (whole numbers, may have leading zeros like cost center)
        if (/^-?\d+$/.test(val)) {
            dominated_by_type.int++;
            continue;
        }

        // Check date patterns: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(val) ||
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val) ||
            /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(val)) {
            var d = new Date(val);
            if (!isNaN(d.getTime())) {
                dominated_by_type.date++;
                continue;
            }
        }

        dominated_by_type.string++;
    }

    // If majority is one type, use it
    if (dominated_by_type.date > 0 && dominated_by_type.date >= dominated_by_type.int && dominated_by_type.date >= dominated_by_type.string) {
        return "date";
    }
    if (dominated_by_type.int > 0 && dominated_by_type.int >= dominated_by_type.date && dominated_by_type.int >= dominated_by_type.string) {
        return "int";
    }
    return "string";
}

// POST /api/upload - JSON body from database import
router.post('/', express.json({ limit: '50mb' }), async function(req, res, next) {
    // Check if this is a JSON request (database import)
    if (req.body && req.body.source === 'database') {
        var client = null;
        try {
            var data = req.body;
            if (!data.headers || !data.rows) {
                return res.status(400).json({ error: 'Invalid database import payload' });
            }

            var headers = data.headers;
            var dataRows = data.rows;
            var expenseId = data.expense_id;
            var newExpenseName = data.new_expense_name;

            if (!expenseId && !newExpenseName) {
                return res.status(400).json({ error: 'Expense ID or new expense name is required' });
            }
            if (dataRows.length === 0) {
                return res.status(400).json({ error: 'No data rows to import' });
            }

            console.log('Database import: ' + dataRows.length + ' rows, ' + headers.length + ' columns, expense: ' + (newExpenseName || expenseId));

            client = await pool.connect();
            await client.query('BEGIN');

                // Get or create expense_table_id (same logic as CSV upload)
                var expenseTableId = null;

                if (newExpenseName) {
                    var insertExpenseResult = await client.query(
                        'INSERT INTO expense_table (name, version, upload_date) VALUES ($1, 0, NOW()) RETURNING id',
                        [newExpenseName.trim()]
                    );
                    expenseTableId = insertExpenseResult.rows[0].id;
                    await client.query('UPDATE expense_table SET parent_id = $1 WHERE id = $1', [expenseTableId]);
                } else {
                    var existingResult = await client.query('SELECT name FROM expense_table WHERE id = $1', [parseInt(expenseId)]);
                    if (existingResult.rows.length === 0) { return res.status(400).json({ error: 'Expense ID not found' }); }
                    var existingName = existingResult.rows[0].name;
                    var versionResult = await client.query('SELECT COALESCE(MAX(version), -1) AS max_version FROM expense_table WHERE parent_id = $1', [parseInt(expenseId)]);
                    var nextVersion = versionResult.rows[0].max_version + 1;
                    var insertVersionResult = await client.query(
                        'INSERT INTO expense_table (name, parent_id, version, upload_date) VALUES ($1, $2, $3, NOW()) RETURNING id',
                        [existingName, parseInt(expenseId), nextVersion]
                    );
                    expenseTableId = insertVersionResult.rows[0].id;
                }

                // Detect data types
                var columnValues = [];
                for (var c = 0; c < headers.length; c++) { columnValues[c] = []; }
                for (var r = 0; r < dataRows.length; r++) {
                    for (var c = 0; c < headers.length; c++) { columnValues[c].push(dataRows[r][c] || ""); }
                }

                // Insert column names
                for (var c = 0; c < headers.length; c++) {
                    var dataType = detectDataType(columnValues[c]);
                    await client.query(
                        'INSERT INTO expense_table_column_name (expense_table_id, column_number, column_name, data_type, require_column_index) VALUES ($1, $2, $3, $4, false)',
                        [expenseTableId, c, headers[c], dataType]
                    );
                }

                // Insert data rows
                var rowsInserted = 0;
                var rowsSkipped = 0;
                var checkDuplicates = !newExpenseName;

                for (var r = 0; r < dataRows.length; r++) {
                    var row = dataRows[r];
                    var columnFields = ['expense_table_id', 'require_column_data'];
                    var valuePlaceholders = ['$1', '$2'];
                    var values = [expenseTableId, ''];
                    var paramIndex = 3;
                    var whereClauses = [];
                    var checkValues = [];
                    var checkParamIndex = 1;

                    for (var c = 0; c < headers.length && c <= 60; c++) {
                        var cellValue = row[c] || "";
                        columnFields.push('column' + c);
                        valuePlaceholders.push('$' + paramIndex);
                        values.push(cellValue);
                        paramIndex++;

                        if (checkDuplicates) {
                            if (cellValue === "") {
                                whereClauses.push('(column' + c + ' IS NULL OR column' + c + " = '')");
                            } else {
                                whereClauses.push('column' + c + ' = $' + checkParamIndex);
                                checkValues.push(cellValue);
                                checkParamIndex++;
                            }
                        }
                    }

                    if (checkDuplicates) {
                        var checkSql = 'SELECT 1 FROM content WHERE ' + whereClauses.join(' AND ') + ' LIMIT 1';
                        var existsResult = await client.query(checkSql, checkValues);
                        if (existsResult.rows.length > 0) { rowsSkipped++; continue; }
                    }

                    var sql = 'INSERT INTO content (' + columnFields.join(', ') + ') VALUES (' + valuePlaceholders.join(', ') + ')';
                    await client.query(sql, values);
                    rowsInserted++;
                }

                if (rowsInserted === 0) {
                    await client.query('DELETE FROM expense_table_column_name WHERE expense_table_id = $1', [expenseTableId]);
                    await client.query('DELETE FROM expense_table WHERE id = $1', [expenseTableId]);
                    await client.query('COMMIT');
                    return res.json({ message: 'No new rows to insert. All ' + rowsSkipped + ' rows already exist.', expense_table_id: null, rows_inserted: 0, rows_skipped: rowsSkipped, columns_mapped: 0 });
                }

                await client.query('COMMIT');
                var message = 'Database import successful! Inserted ' + rowsInserted + ' rows with ' + headers.length + ' columns.';
                if (rowsSkipped > 0) message += ' Skipped ' + rowsSkipped + ' duplicate rows.';
                res.json({ message: message, expense_table_id: expenseTableId, rows_inserted: rowsInserted, rows_skipped: rowsSkipped, columns_mapped: headers.length });

            } catch (err) {
                if (client) await client.query('ROLLBACK');
                console.log('Database import error:', err);
                res.status(500).json({ error: err.message || 'Import failed' });
            } finally {
                if (client) client.release();
            }
            return;
        }

        // Not JSON / not database source - pass to multer file upload handler
        next();
    });

// POST /api/upload - file upload via multer
router.post('/', upload.single('file'), async function(req, res, next) {

    var client = null;

    try {
        // 1. Validate request
        var file = req.file;
        var costCenterColumn = req.body.cost_center_column || null;
        var costCenterColumnIndex = req.body.cost_center_column_index !== undefined ? parseInt(req.body.cost_center_column_index) : -1;
        var expenseId = req.body.expense_id;
        var newExpenseName = req.body.new_expense_name;

        if (!file) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }
        if (!expenseId && !newExpenseName) {
            return res.status(400).json({ error: 'Expense ID or new expense name is required' });
        }

        // 2. Parse CSV
        var csvText = file.buffer.toString('utf-8');
        var lines = csvText.split(/\r?\n/).filter(function(l) { return l.trim(); });

        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
        }

        var headers = parseLine(lines[0]);
        var dataRows = [];
        for (var i = 1; i < lines.length; i++) {
            dataRows.push(parseLine(lines[i]));
        }

        // 3. Begin transaction
        client = await pool.connect();
        await client.query('BEGIN');

        // 4. Get or create expense_table_id
        var expenseTableId = null;

        if (newExpenseName) {
            // Insert new expense, then update parent_id to match its own id, version = 0
            var insertExpenseResult = await client.query(
                'INSERT INTO expense_table (name, version, upload_date) VALUES ($1, 0, NOW()) RETURNING id',
                [newExpenseName.trim()]
            );
            expenseTableId = insertExpenseResult.rows[0].id;
            await client.query(
                'UPDATE expense_table SET parent_id = $1 WHERE id = $1',
                [expenseTableId]
            );
        } else {
            // Get the existing expense name and current max version
            var existingResult = await client.query(
                'SELECT name FROM expense_table WHERE id = $1',
                [parseInt(expenseId)]
            );
            if (existingResult.rows.length === 0) {
                return res.status(400).json({ error: 'Expense ID not found' });
            }
            var existingName = existingResult.rows[0].name;

            // Get max version for this parent chain
            var versionResult = await client.query(
                'SELECT COALESCE(MAX(version), -1) AS max_version FROM expense_table WHERE parent_id = $1',
                [parseInt(expenseId)]
            );
            var nextVersion = versionResult.rows[0].max_version + 1;

            // Insert new versioned record with parent_id pointing to the original
            var insertVersionResult = await client.query(
                'INSERT INTO expense_table (name, parent_id, version, upload_date) VALUES ($1, $2, $3, NOW()) RETURNING id',
                [existingName, parseInt(expenseId), nextVersion]
            );
            expenseTableId = insertVersionResult.rows[0].id;
        }

        // 5. Detect data types per column by sampling all data rows
        var columnValues = [];
        for (var c = 0; c < headers.length; c++) {
            columnValues[c] = [];
        }
        for (var r = 0; r < dataRows.length; r++) {
            for (var c = 0; c < headers.length; c++) {
                columnValues[c].push(dataRows[r][c] || "");
            }
        }

        // 6. Insert into expense_table_column_name
        for (var c = 0; c < headers.length; c++) {
            var columnName = headers[c];
            var dataType = detectDataType(columnValues[c]);
            var isRequireColumn = (costCenterColumnIndex >= 0 && c === costCenterColumnIndex);

            await client.query(
                'INSERT INTO expense_table_column_name (expense_table_id, column_number, column_name, data_type, require_column_index) VALUES ($1, $2, $3, $4, $5)',
                [expenseTableId, c, columnName, dataType, isRequireColumn]
            );
        }

        // 7. Insert data rows into content table (skip duplicates only for existing expense)
        var rowsInserted = 0;
        var rowsSkipped = 0;
        var checkDuplicates = !newExpenseName;

        for (var r = 0; r < dataRows.length; r++) {
            var row = dataRows[r];
            var requireColumnData = costCenterColumnIndex >= 0 ? (row[costCenterColumnIndex] || "") : "";

            // Build column list and values for column0..column60
            var columnFields = ['expense_table_id', 'require_column_data'];
            var valuePlaceholders = ['$1', '$2'];
            var values = [expenseTableId, requireColumnData];
            var paramIndex = 3;

            // Build WHERE clause for duplicate check (column0..columnN only)
            var whereClauses = [];
            var checkValues = [];
            var checkParamIndex = 1;

            for (var c = 0; c < headers.length && c <= 60; c++) {
                var cellValue = row[c] || "";
                columnFields.push('column' + c);
                valuePlaceholders.push('$' + paramIndex);
                values.push(cellValue);
                paramIndex++;

                if (checkDuplicates) {
                    // For duplicate check: handle empty strings as NULL comparison
                    if (cellValue === "") {
                        whereClauses.push('(column' + c + ' IS NULL OR column' + c + " = '')");
                    } else {
                        whereClauses.push('column' + c + ' = $' + checkParamIndex);
                        checkValues.push(cellValue);
                        checkParamIndex++;
                    }
                }
            }

            // Check if row already exists (only for existing expense)
            if (checkDuplicates) {
                var checkSql = 'SELECT 1 FROM content WHERE ' + whereClauses.join(' AND ') + ' LIMIT 1';
                var existsResult = await client.query(checkSql, checkValues);

                if (existsResult.rows.length > 0) {
                    rowsSkipped++;
                    continue;
                }
            }

            var sql = 'INSERT INTO content (' + columnFields.join(', ') + ') VALUES (' + valuePlaceholders.join(', ') + ')';
            await client.query(sql, values);
            rowsInserted++;
        }

        // 8. If no rows inserted, clean up expense_table and expense_table_column_name
        if (rowsInserted === 0) {
            await client.query(
                'DELETE FROM expense_table_column_name WHERE expense_table_id = $1',
                [expenseTableId]
            );
            await client.query(
                'DELETE FROM expense_table WHERE id = $1',
                [expenseTableId]
            );
            await client.query('COMMIT');

            return res.json({
                message: 'No new rows to insert. All ' + rowsSkipped + ' rows already exist. No changes were made.',
                expense_table_id: null,
                rows_inserted: 0,
                rows_skipped: rowsSkipped,
                columns_mapped: 0
            });
        }

        // 9. Commit transaction
        await client.query('COMMIT');

        var message = 'Upload successful! Inserted ' + rowsInserted + ' rows with ' + headers.length + ' columns.';
        if (rowsSkipped > 0) {
            message += ' Skipped ' + rowsSkipped + ' duplicate rows.';
        }

        res.json({
            message: message,
            expense_table_id: expenseTableId,
            rows_inserted: rowsInserted,
            rows_skipped: rowsSkipped,
            columns_mapped: headers.length
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.log('Upload error:', err);
        res.status(500).json({ error: err.message || 'Upload failed' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;