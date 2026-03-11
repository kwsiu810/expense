import './App.css';
import { Route, Switch } from 'react-router-dom';
import ExpenseUpload from './components/Expense/Expenseupload'
import SetupExpense from './components/Expense/ExpenseReportConfig'
import GetExpensePreview from './components/Expense/Expensereportpreview'
import ExpenseReports from './components/Expense/Expensereports'
import ActionConfig from './components/Expense/Actionconfig'
import SharedReportView from './components/Expense/SharedReportView';
import ExpenseReportAdmin from './components/Expense/ExpensereportAdmin';
import DbConnectionConfig from './components/Expense/DBconnectionconfig';

function App() {
  /*
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
  */



  


  return (
    <main>
        <Switch>
    <Route path="/db-connection-config" component={DbConnectionConfig} />

          <Route path="/expense-report-admin" component={ExpenseReportAdmin} />
          <Route path="/expense-shared/:token" component={SharedReportView}/>
          <Route path="/action-config" component={ActionConfig} />
          <Route path="/expense-reports" component={ExpenseReports} />
          <Route path="/expense-report-config" component={SetupExpense}/>

          <Route path="/expense-upload" component={ExpenseUpload}/>

          <Route path="/expense-report-preview" component={GetExpensePreview}/>

         
     
    
          <Route component={Error} />
        </Switch>
    </main>
  )
}

export default App;
