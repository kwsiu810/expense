var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');




var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));


// Replace this:
//app.use(express.json());
//app.use(express.urlencoded({ extended: false }));

// With this:
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());






var getExpenseTableRouter = require('./routes/Expense/getExpenseTable')
app.use('/expense/get_expense_table', getExpenseTableRouter)

var uploadExpenseTableRouter = require('./routes/Expense/uploadExpenseTable')
app.use('/expense/upload_expense', uploadExpenseTableRouter)

var getColumnsRouter = require('./routes/Expense/getColumns')
app.use('/expense/get_columns', getColumnsRouter)

var getCombineddataRouter = require('./routes/Expense/getcombineddata')
app.use('/expense/get_combined_data', getCombineddataRouter)

var saveReportConfigRouter = require('./routes/Expense/saveReportConfig');
app.use('/expense/save_report_config', saveReportConfigRouter)

var getReportPreviewRouter = require('./routes/Expense/getReportPreview');
app.use('/expense/get_report_preview', getReportPreviewRouter);

var deleteExpenseRouter = require('./routes/Expense/deleteExpense');
app.use('/expense/delete_expense', deleteExpenseRouter);

var sendEmailRouter = require('./routes/Expense/sendemail');
app.use('/expense/send_email', sendEmailRouter);

var saveActionRouter = require('./routes/Expense/saveAction');
app.use('/expense/save_action', saveActionRouter);





// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

/*
app.set('port', process.env.PORT || 3001);
var server = app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + server.address().port);
});
*/
module.exports = app;
