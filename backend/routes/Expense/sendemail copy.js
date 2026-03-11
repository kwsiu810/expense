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
function sendGraphEmail(accessToken, senderEmail, toEmail, subject, bodyHtml, attachment) {
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
// Query params: ?employee_id=xxx to get logs for that employee only
router.get('/logs/:config_id', async function(req, res, next) {
    var configId = parseInt(req.params.config_id);
    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }

    var employeeId = req.query.employee_id || '';

    try {
        var result;
        if (employeeId) {
            // Get logs for this specific employee
            result = await pool.query(
                'SELECT row_hash, employee_id, employee_name, employee_title, employee_department, action_type, created_date FROM report_action_log WHERE report_config_id = $1 AND employee_id = $2 ORDER BY created_date DESC',
                [configId, employeeId]
            );
        } else {
            // Get all logs
            result = await pool.query(
                'SELECT row_hash, employee_id, employee_name, employee_title, employee_department, action_type, created_date FROM report_action_log WHERE report_config_id = $1 ORDER BY created_date DESC',
                [configId]
            );
        }
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
    var selectedRows = req.body.selected_rows || req.body.rows || [];

    // Read employee info from session headers (try multiple formats)
    var employeeId = req.headers['employee_id'] || req.headers['employeeid'] || req.headers['employee-id'] || req.headers['Employee_Id'] || '020444253';
    var employeeName = req.headers['employee_name'] || req.headers['employeename'] || req.headers['employee-name'] || req.headers['Employee_Name'] || 'Keith Siu';
    var employeeTitle = req.headers['employee_title'] || req.headers['employeetitle'] || req.headers['employee-title'] || req.headers['Employee_Title'] || 'Sr. Clinical Comm Analyst';
    var employeeDepartment = req.headers['employee_department'] || req.headers['employeedepartment'] || req.headers['employee-department'] || req.headers['Employee_Department'] || 'CS Clinical Communications';

    console.log('Send email - employee headers:', { employeeId, employeeName, employeeTitle, employeeDepartment });
    console.log('Send email - all headers:', JSON.stringify(Object.keys(req.headers)));

    if (isNaN(configId)) {
        return res.status(400).json({ error: 'Invalid config ID' });
    }
    if (selectedRows.length === 0) {
        return res.status(400).json({ error: 'No rows selected' });
    }

    try {
        // 1. Get report config with action info
        var configResult = await pool.query(
            'SELECT rc.config_name, rc.action_id, rc.action_button_label, rc.action_column_mapping, ra.action_name, ra.action_type, ra.action_config FROM report_config rc LEFT JOIN report_action ra ON ra.id = rc.action_id WHERE rc.id = $1',
            [configId]
        );

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report config not found' });
        }

        var config = configResult.rows[0];

        if (!config.action_id) {
            return res.status(400).json({ error: 'No action configured for this report' });
        }

        if (config.action_type !== 'send_email') {
            return res.status(400).json({ error: 'Action type "' + config.action_type + '" is not supported yet' });
        }

        var actionConfig = config.action_config || {};
        var columnMapping = config.action_column_mapping || {};
        if (typeof columnMapping === 'string') {
            try { columnMapping = JSON.parse(columnMapping); } catch (e) { columnMapping = {}; }
        }
        if (typeof actionConfig === 'string') {
            try { actionConfig = JSON.parse(actionConfig); } catch (e) { actionConfig = {}; }
        }

        // Validate credentials
        if (!actionConfig.client_id || !actionConfig.client_secret || !actionConfig.tenant_id || !actionConfig.sender_email) {
            return res.status(400).json({ error: 'Email action is missing Microsoft Graph API credentials. Please configure in Action settings.' });
        }

        // Determine recipient and templates from config
        var fixedEmailTo = columnMapping.email_to || "";
        var subjectTemplate = columnMapping.subject_template || "Expense Report Data";
        var bodyTemplate = columnMapping.body_template || "";

        console.log('Email config:', { email_to: fixedEmailTo, subject_template: subjectTemplate, body_template: bodyTemplate ? '(set)' : '(empty)' });

        if (!fixedEmailTo) {
            return res.status(400).json({ error: 'No recipient email configured. Please set the Send To Email in Report Configuration.' });
        }

        // 2. Get access token
        var accessToken = await getAccessToken(actionConfig.tenant_id, actionConfig.client_id, actionConfig.client_secret);

        // 3. Generate CSV from selected rows
        var csvContent = generateCsv(selectedRows);
        var csvBase64 = Buffer.from(csvContent, 'utf-8').toString('base64');

        // 4. Build email body
        var subject = applyTemplate(subjectTemplate, selectedRows[0] || {});

        var reportName = config.config_name || 'Expense Report';

        var body = bodyTemplate ? applyTemplate(bodyTemplate, selectedRows[0] || {}) : "";

        // Add employee info
        if (employeeName || employeeId) {
            body += '<p style="font-family:Arial,sans-serif;font-size:13px;color:#2c3345;margin-top:16px;"><strong>Submitted by:</strong></p>';
            body += '<table style="font-family:Arial,sans-serif;font-size:13px;color:#2c3345;border:none;">';
            if (employeeName) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Name:</td><td>' + employeeName + '</td></tr>';
            if (employeeId) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">ID:</td><td>' + employeeId + '</td></tr>';
            if (employeeTitle) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Title:</td><td>' + employeeTitle + '</td></tr>';
            if (employeeDepartment) body += '<tr><td style="padding:2px 8px 2px 0;color:#7c8ba1;">Department:</td><td>' + employeeDepartment + '</td></tr>';
            body += '</table>';
        }

        body += '<p style="font-family:Arial,sans-serif;font-size:13px;color:#555555;margin-top:20px;padding-top:14px;border-top:1px solid #e2e6ed;">Please find the attached CSV file containing ' + selectedRows.length + ' selected row(s) from ' + reportName + '.</p>';
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
            await sendGraphEmail(accessToken, actionConfig.sender_email, fixedEmailTo, subject, body, attachment);

            // 7. Save action log for each row
            var loggedHashes = [];
            for (var i = 0; i < selectedRows.length; i++) {
                var rowHash = hashRow(selectedRows[i]);
                try {
                    await pool.query(
                        'INSERT INTO report_action_log (report_config_id, employee_id, employee_name, employee_title, employee_department, row_hash, row_data, action_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                        [configId, employeeId, employeeName, employeeTitle, employeeDepartment, rowHash, JSON.stringify(selectedRows[i]), config.action_type || 'send_email']
                    );
                    loggedHashes.push(rowHash);
                } catch (logErr) {
                    console.log('Failed to log action for row ' + (i + 1) + ':', logErr.message);
                }
            }

            res.json({
                message: 'Email sent to ' + fixedEmailTo + ' with ' + selectedRows.length + ' row(s) attached as CSV.',
                sent: 1,
                failed: 0,
                errors: [],
                logged_hashes: loggedHashes
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

module.exports = router;