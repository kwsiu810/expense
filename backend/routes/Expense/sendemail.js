var express = require('express');
var router = express.Router();
var { Pool } = require('pg');
var https = require('https');
const PropertiesReader = require("properties-reader");
const prop = PropertiesReader("./properties/app.properties");

var pool = new Pool({
    host: prop.get("dbHost"),
    user: prop.get("dbUser"),
    password: prop.get("dbPassword"),
    database: 'Expense',
    port: 5432
});

// Get OAuth token from Microsoft Graph API
function getAccessToken(tenantId, clientId, clientSecret) {
    return new Promise(function(resolve, reject) {
        var postData = 'client_id=' + encodeURIComponent(clientId) +
            '&scope=' + encodeURIComponent('https://graph.microsoft.com/.default') +
            '&client_secret=' + encodeURIComponent(clientSecret) +
            '&grant_type=client_credentials';

        var options = {
            hostname: 'login.microsoftonline.com',
            port: 443,
            path: '/' + tenantId + '/oauth2/v2.0/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        var req = https.request(options, function(res) {
            var body = '';
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() {
                try {
                    var data = JSON.parse(body);
                    if (data.access_token) {
                        resolve(data.access_token);
                    } else {
                        reject(new Error(data.error_description || data.error || 'Failed to get access token'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse token response'));
                }
            });
        });

        req.on('error', function(err) { reject(err); });
        req.write(postData);
        req.end();
    });
}

// Generate CSV string from rows
function generateCsv(rows) {
    if (rows.length === 0) return "";
    var headers = Object.keys(rows[0]);

    // Escape CSV field
    function escapeField(val) {
        var str = String(val || "");
        if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    var lines = [];
    lines.push(headers.map(escapeField).join(','));
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var values = [];
        for (var h = 0; h < headers.length; h++) {
            values.push(escapeField(row[headers[h]]));
        }
        lines.push(values.join(','));
    }
    return lines.join('\r\n');
}

// Send email via Microsoft Graph API with optional attachment
function sendGraphEmail(accessToken, senderEmail, toEmail, subject, bodyHtml, attachment, ccEmails) {
    return new Promise(function(resolve, reject) {
        var message = {
            subject: subject,
            body: {
                contentType: "HTML",
                content: bodyHtml
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: toEmail
                    }
                }
            ]
        };

        // Add CC recipients if provided
        if (ccEmails && ccEmails.length > 0) {
            message.ccRecipients = ccEmails.map(function(email) {
                return { emailAddress: { address: email.trim() } };
            });
        }

        if (attachment) {
            message.attachments = [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: attachment.name,
                    contentType: attachment.contentType,
                    contentBytes: attachment.contentBytes
                }
            ];
        }

        var emailPayload = JSON.stringify({
            message: message,
            saveToSentItems: true
        });

        var options = {
            hostname: 'graph.microsoft.com',
            port: 443,
            path: '/v1.0/users/' + encodeURIComponent(senderEmail) + '/sendMail',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(emailPayload)
            }
        };

        var req = https.request(options, function(res) {
            var body = '';
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() {
                if (res.statusCode === 202 || res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    var errorMsg = 'Email send failed (HTTP ' + res.statusCode + ')';
                    try {
                        var errData = JSON.parse(body);
                        if (errData.error && errData.error.message) {
                            errorMsg = errData.error.message;
                        }
                    } catch (e) {}
                    reject(new Error(errorMsg));
                }
            });
        });

        req.on('error', function(err) { reject(err); });
        req.write(emailPayload);
        req.end();
    });
}

// Replace {column_name} placeholders with row data
function applyTemplate(template, rowData) {
    if (!template) return "";
    var result = template;
    var keys = Object.keys(rowData);
    for (var i = 0; i < keys.length; i++) {
        var regex = new RegExp('\\{' + keys[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g');
        result = result.replace(regex, rowData[keys[i]] || "");
    }
    return result;
}

// Generate a consistent hash for a row to identify duplicates
function hashRow(row) {
    var keys = Object.keys(row).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
        if (keys[i] === '_full_data' || keys[i] === '_content_id') continue;
        parts.push(keys[i] + ':' + (row[keys[i]] || ''));
    }
    var str = parts.join('|');
    // Simple djb2 hash
    var hash = 5381;
    for (var j = 0; j < str.length; j++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(j);
        hash = hash & hash; // Convert to 32bit integer
    }
    return String(Math.abs(hash));
}

// GET /expense/send_email/logs/:config_id - get action logs for a report
// Query params: ?employee_id=xxx&config_action_id=xxx
router.get('/logs/:config_id', async function(req, res, next) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    var employeeId = req.query.employee_id || '';
    var configActionId = req.query.config_action_id || '';

    try {
        var query = 'SELECT row_hash, employee_id, employee_name, employee_title, employee_department, action_type, report_config_action_id, created_date FROM report_action_log WHERE report_config_id = $1';
        var params = [configId];
        var paramIdx = 2;

        if (employeeId) {
            query += ' AND employee_id = $' + paramIdx;
            params.push(employeeId);
            paramIdx++;
        }
        if (configActionId) {
            query += ' AND report_config_action_id = $' + paramIdx;
            params.push(parseInt(configActionId));
            paramIdx++;
        }

        query += ' ORDER BY created_date DESC';

        var result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.log('Get action logs error:', err);
        res.json([]);
    }
});

// POST /expense/send_email
// Body: { config_id, rows: [ { col1: val1, col2: val2, ... }, ... ] }
router.post('/', express.json({ limit: '50mb' }), async function(req, res, next) {

    var configId = parseInt(req.body.config_id);
    var configActionId = parseInt(req.body.config_action_id);
    var selectedRows = req.body.selected_rows || req.body.rows || [];

    // Read employee info from session headers (try multiple formats), fallback to request body
    var employeeId = req.headers['employee_id'] || req.headers['employeeid'] || req.headers['employee-id'] || req.headers['Employee_Id'] || req.body.employee_id || '020444253';
    var employeeName = req.headers['employee_name'] || req.headers['employeename'] || req.headers['employee-name'] || req.headers['Employee_Name'] || req.body.employee_name || 'Keith Siu';
    var employeeTitle = req.headers['employee_title'] || req.headers['employeetitle'] || req.headers['employee-title'] || req.headers['Employee_Title'] || req.body.employee_title || 'Sr. Clinical Comm Analyst';
    var employeeDepartment = req.headers['employee_department'] || req.headers['employeedepartment'] || req.headers['employee-department'] || req.headers['Employee_Department'] || req.body.employee_department || 'CS Clinical Communications';
    
    console.log('Send email - employee info:', { employeeId, employeeName, employeeTitle, employeeDepartment });

    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }
    if (selectedRows.length === 0) {
        return res.status(400).json({ error: 'No rows selected' });
    }

    try {
        // 1. Get report config name
        var configResult = await pool.query('SELECT config_name FROM report_config WHERE id = $1', [configId]);
        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }
        var reportName = configResult.rows[0].config_name || 'Expense Report';

        // Helper to check if action_config has valid credentials
        function hasValidCredentials(row) {
            if (!row || !row.action_config) return false;
            var cfg = row.action_config;
            if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch(e) { return false; } }
            return cfg.client_id && cfg.client_secret && cfg.tenant_id && cfg.sender_email;
        }

        // 2. Find the action row (for action_type, column_mapping, etc.)
        var actionRow = null;

        // Step A: try the specific config_action_id
        if (configActionId && !isNaN(configActionId) && configActionId > 0) {
            var actionResult = await pool.query(
                'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.id = $1 AND rca.report_config_id = $2',
                [configActionId, configId]
            );
            if (actionResult.rows.length > 0) {
                actionRow = actionResult.rows[0];
            }
        }

        // Step B: try any config action for this report
        if (!actionRow) {
            var fallbackResult = await pool.query(
                'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order LIMIT 1',
                [configId]
            );
            if (fallbackResult.rows.length > 0) {
                actionRow = fallbackResult.rows[0];
                configActionId = actionRow.id;
            }
        }

        // Step C: try any action module in the system
        if (!actionRow) {
            var anyActionResult = await pool.query(
                'SELECT id AS action_id, action_name, action_config, \'send_email\' AS action_type FROM report_action ORDER BY id LIMIT 1'
            );
            if (anyActionResult.rows.length > 0) {
                actionRow = anyActionResult.rows[0];
                actionRow.action_column_mapping = '{}';
                actionRow.prompt_mode = true;
                configActionId = 0;
            }
        }

        // Step D: create a minimal action row for log-only actions
        if (!actionRow) {
            actionRow = { action_type: 'action', action_column_mapping: '{}', prompt_mode: false, action_config: '{}' };
        }

        var actionConfig = actionRow.action_config || {};
        var columnMapping = actionRow.action_column_mapping || {};
        if (typeof columnMapping === 'string') {
            try { columnMapping = JSON.parse(columnMapping); } catch (e) { columnMapping = {}; }
        }
        if (typeof actionConfig === 'string') {
            try { actionConfig = JSON.parse(actionConfig); } catch (e) { actionConfig = {}; }
        }

        // Determine recipient and templates
        var isPromptMode = actionRow.prompt_mode || req.body.prompt_mode || false;
        var hasActionModule = actionRow.action_id ? true : false;
        var fixedEmailTo, subjectTemplate, bodyTemplate;

        if (isPromptMode) {
            // In prompt mode, user provides these at send time
            fixedEmailTo = req.body.prompt_email_to || '';
            subjectTemplate = req.body.prompt_subject || 'Expense Report Data';
            bodyTemplate = req.body.prompt_body || '';
        } else if (hasActionModule) {
            // Only use configured email when action module is linked
            fixedEmailTo = columnMapping.email_to || "";
            subjectTemplate = columnMapping.subject_template || "Expense Report Data";
            bodyTemplate = columnMapping.body_template || "";
        } else {
            // No action module — log only, no email
            fixedEmailTo = "";
            subjectTemplate = "";
            bodyTemplate = "";
        }

        // Parse CC emails (comma-separated)
        var ccRaw = req.body.prompt_cc || '';
        var ccEmails = ccRaw ? ccRaw.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e; }) : [];

        if (!fixedEmailTo) {
            if (isPromptMode) {
                return res.status(400).json({ error: 'This action requires you to provide an email address. The prompt dialog should have appeared — please try again.' });
            }

            // No email configured and not prompt mode — just log the action without sending email
            var cleanRows = [];
            var fullDataRows = [];
            for (var nr = 0; nr < selectedRows.length; nr++) {
                var row = selectedRows[nr];
                var clean = {};
                var keys = Object.keys(row);
                for (var nk = 0; nk < keys.length; nk++) {
                    if (keys[nk] !== '_full_data' && keys[nk] !== '_content_id') {
                        clean[keys[nk]] = row[keys[nk]];
                    }
                }
                cleanRows.push(clean);
                fullDataRows.push(row._full_data || clean);
            }

            var sharedViewToken = req.body.shared_view_token || null;
            var loggedHashes = [];
            for (var li = 0; li < cleanRows.length; li++) {
                var rowHash = hashRow(cleanRows[li]);
                try {
                    await pool.query(
                        'INSERT INTO report_action_log (report_config_id, report_config_action_id, employee_id, employee_name, employee_title, employee_department, row_hash, row_data, action_type, shared_view_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                        [configId, configActionId || null, employeeId, employeeName, employeeTitle, employeeDepartment, rowHash, JSON.stringify(fullDataRows[li]), req.body.prompt_action_type || actionRow.action_type || 'send_email', sharedViewToken]
                    );
                    loggedHashes.push(rowHash);
                } catch (logErr) {
                    console.log('Failed to log action for row ' + (li + 1) + ':', logErr.message);
                }
            }

            return res.json({
                message: 'Action "' + (req.body.prompt_action_type || actionRow.action_type || 'action') + '" logged for ' + cleanRows.length + ' row(s).',
                sent: 0,
                failed: 0,
                errors: [],
                logged_hashes: loggedHashes,
                shared_link: null
            });
        }

        // 3. We have an email to send — find valid credentials
        // The actionRow might not have credentials (no module linked), so find one that does
        if (!hasValidCredentials(actionRow)) {
            // Try any config action for this report with credentials
            var credResult = await pool.query(
                'SELECT rca.id, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order',
                [configId]
            );
            var foundCreds = false;
            for (var ci = 0; ci < credResult.rows.length; ci++) {
                if (hasValidCredentials(credResult.rows[ci])) {
                    actionConfig = credResult.rows[ci].action_config;
                    if (typeof actionConfig === 'string') { try { actionConfig = JSON.parse(actionConfig); } catch(e) {} }
                    foundCreds = true;
                    break;
                }
            }
            // Try any action module in the system
            if (!foundCreds) {
                var anyCred = await pool.query('SELECT action_config FROM report_action ORDER BY id');
                for (var ac = 0; ac < anyCred.rows.length; ac++) {
                    if (hasValidCredentials(anyCred.rows[ac])) {
                        actionConfig = anyCred.rows[ac].action_config;
                        if (typeof actionConfig === 'string') { try { actionConfig = JSON.parse(actionConfig); } catch(e) {} }
                        foundCreds = true;
                        break;
                    }
                }
            }
            if (!foundCreds) {
                return res.status(400).json({ error: 'No email action module with valid credentials found. Please configure Graph API credentials in the Actions tab.' });
            }
        }

        var accessToken = await getAccessToken(actionConfig.tenant_id, actionConfig.client_id, actionConfig.client_secret);

        // Separate _full_data and _content_id from display columns
        var cleanRows = [];
        var fullDataRows = [];
        for (var i = 0; i < selectedRows.length; i++) {
            var row = selectedRows[i];
            var clean = {};
            var keys = Object.keys(row);
            for (var k = 0; k < keys.length; k++) {
                if (keys[k] !== '_full_data' && keys[k] !== '_content_id') {
                    clean[keys[k]] = row[keys[k]];
                }
            }
            cleanRows.push(clean);
            fullDataRows.push(row._full_data || clean);
        }

        // 3b. Filter columns for CSV if csv_columns specified
        var csvColumns = req.body.csv_columns || null;
        var csvRows = cleanRows;
        if (csvColumns && Array.isArray(csvColumns) && csvColumns.length > 0) {
            csvRows = cleanRows.map(function(row) {
                var filtered = {};
                for (var c = 0; c < csvColumns.length; c++) {
                    filtered[csvColumns[c]] = row[csvColumns[c]] || '';
                }
                return filtered;
            });
        }

        // 3c. Generate CSV
        var csvContent = generateCsv(csvRows);
        var csvBase64 = Buffer.from(csvContent, 'utf-8').toString('base64');

        // 3c. Create shared view record (skip if called from shared view page)
        var skipSharedView = req.body.skip_shared_view || false;
        var sharedLink = '';

        if (!skipSharedView) {
            var crypto = require('crypto');
            var sharedToken = crypto.randomBytes(24).toString('hex');

            // Get column info for shared view
            var colResult = await pool.query(
                'SELECT column_name, data_type, is_filter, display_order FROM report_config_column WHERE report_config_id = $1 ORDER BY display_order',
                [configId]
            );

            try {
                await pool.query(
                    'INSERT INTO report_shared_view (token, report_config_id, report_config_action_id, row_data, columns, config_name, created_by_name, created_by_email, created_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())',
                    [sharedToken, configId, configActionId || null, JSON.stringify(cleanRows), JSON.stringify(colResult.rows), reportName, employeeName || '', fixedEmailTo]
                );
                var baseUrl = req.body.base_url || (req.protocol + '://' + req.get('host'));
                sharedLink = baseUrl + '/expense-shared/' + sharedToken;
            } catch (svErr) {
                console.log('Failed to create shared view:', svErr.message);
            }
        }

        // 4. Build email body
        var subject = applyTemplate(subjectTemplate, cleanRows[0] || {});

        var body = bodyTemplate ? applyTemplate(bodyTemplate, cleanRows[0] || {}) : "";

        // Add employee info ONLY if not prompt mode
        if (!isPromptMode && (employeeName || employeeId)) {
            body += '<p style="font-family:Arial,sans-serif;font-size:13px;color:#2c3345;margin-top:16px;"><strong>Submitted by:</strong></p>';
            body += '<table style="font-family:Arial,sans-serif;font-size:13px;color:#2c3345;border:none;">';
            if (employeeName) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Name:</td><td>' + employeeName + '</td></tr>';
            if (employeeId) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">ID:</td><td>' + employeeId + '</td></tr>';
            if (employeeTitle) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Title:</td><td>' + employeeTitle + '</td></tr>';
            if (employeeDepartment) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Department:</td><td>' + employeeDepartment + '</td></tr>';
            body += '</table>';
        }

        body += '<p style="font-family:Arial,sans-serif;font-size:13px;color:#555555;margin-top:20px;padding-top:14px;border-top:1px solid #e2e6ed;">Please find the attached CSV file containing ' + cleanRows.length + ' selected row(s) from ' + reportName + '.</p>';
        if (sharedLink) {
            body += '<p style="font-family:Arial,sans-serif;font-size:13px;color:#052049;"><a href="' + sharedLink + '" style="color:#052049;font-weight:600;">View selected rows online &rarr;</a></p>';
        }
        body += '<p style="font-family:Arial,sans-serif;font-size:12px;color:#7c8ba1;">This email was sent from UCSF Expense Report System.</p>';

        // 5. Build attachment
        var now = new Date();
        var timestamp = now.getFullYear() + '' +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');
        var fileName = 'expense_report_' + timestamp + '.csv';

        var attachment = {
            name: fileName,
            contentType: 'text/csv',
            contentBytes: csvBase64
        };

        // 6. Send single email with CSV attachment
        try {
            await sendGraphEmail(accessToken, actionConfig.sender_email, fixedEmailTo, subject, body, attachment, ccEmails);

            // 7. Save action log for each row (hash clean row, store full data)
            var sharedViewToken = req.body.shared_view_token || null;
            var loggedHashes = [];
            for (var i = 0; i < cleanRows.length; i++) {
                var rowHash = hashRow(cleanRows[i]);
                try {
                    await pool.query(
                        'INSERT INTO report_action_log (report_config_id, report_config_action_id, employee_id, employee_name, employee_title, employee_department, row_hash, row_data, action_type, shared_view_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                        [configId, configActionId || null, employeeId, employeeName, employeeTitle, employeeDepartment, rowHash, JSON.stringify(fullDataRows[i]), req.body.prompt_action_type || actionRow.action_type || 'send_email', sharedViewToken]
                    );
                    loggedHashes.push(rowHash);
                } catch (logErr) {
                    console.log('Failed to log action for row ' + (i + 1) + ':', logErr.message);
                }
            }

            res.json({
                message: 'Email sent to ' + fixedEmailTo + ' with ' + cleanRows.length + ' row(s) attached as CSV.',
                sent: 1,
                failed: 0,
                errors: [],
                logged_hashes: loggedHashes,
                shared_link: sharedLink || null
            });
        } catch (emailErr) {
            res.json({
                message: 'Failed to send email: ' + emailErr.message,
                sent: 0,
                failed: 1,
                errors: [emailErr.message]
            });
        }

    } catch (err) {
        console.log('Send email error:', err);
        res.status(500).json({ error: err.message || 'Failed to send emails' });
    }
});

// GET /expense/send_email/shared/:token - get shared view data
router.get('/shared/:token', async function(req, res, next) {
    var token = req.params.token;
    if (!token) {
        return res.status(400).json({ error: 'Invalid token' });
    }

    try {
        var result = await pool.query(
            'SELECT sv.*, rc.config_name AS current_config_name FROM report_shared_view sv LEFT JOIN report_config rc ON rc.id = sv.report_config_id WHERE sv.token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shared view not found or expired' });
        }

        var view = result.rows[0];

        // Get actions for this config
        var actions = [];
        try {
            var actionsResult = await pool.query(
                'SELECT rca.id, rca.action_id, rca.action_type, rca.action_button_label, rca.action_column_mapping, rca.prompt_mode, rca.display_order, ra.action_name, ra.action_config FROM report_config_action rca LEFT JOIN report_action ra ON ra.id = rca.action_id WHERE rca.report_config_id = $1 ORDER BY rca.display_order',
                [view.report_config_id]
            );
            actions = actionsResult.rows;
        } catch (e) {
            console.log('Shared view actions query failed:', e.message);
        }

        // Get action logs for this shared view token so we can show already-actioned rows
        var actionLogs = [];
        try {
            var logsResult = await pool.query(
                'SELECT row_hash, employee_id, employee_name, action_type, report_config_action_id, created_date FROM report_action_log WHERE report_config_id = $1 AND shared_view_token = $2',
                [view.report_config_id, token]
            );
            actionLogs = logsResult.rows;
        } catch (e) {
            console.log('Shared view action logs query failed:', e.message);
            // Fallback: try without token filter (column might not exist yet)
            try {
                var fallbackLogs = await pool.query(
                    'SELECT row_hash, employee_id, employee_name, action_type, report_config_action_id, created_date FROM report_action_log WHERE report_config_id = $1',
                    [view.report_config_id]
                );
                actionLogs = fallbackLogs.rows;
            } catch (e2) {
                console.log('Fallback action logs query also failed:', e2.message);
            }
        }

        // Parse JSON fields
        var rowData = view.row_data;
        if (typeof rowData === 'string') { try { rowData = JSON.parse(rowData); } catch(e) { rowData = []; } }
        var columns = view.columns;
        if (typeof columns === 'string') { try { columns = JSON.parse(columns); } catch(e) { columns = []; } }

        res.json({
            token: view.token,
            config_id: view.report_config_id,
            config_name: view.config_name || view.current_config_name || 'Report',
            rows: rowData,
            columns: columns,
            actions: actions,
            action_logs: actionLogs,
            created_by_name: view.created_by_name || '',
            created_by_email: view.created_by_email || '',
            created_date: view.created_date
        });

    } catch (err) {
        console.log('Get shared view error:', err);
        res.status(500).json({ error: 'Failed to load shared view' });
    }
});

module.exports = router;