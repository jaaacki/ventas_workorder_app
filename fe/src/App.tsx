import { Routes, Route, Link } from 'react-router-dom';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow px-4 py-3">
        <div className="font-semibold text-slate-800">VB Work Order — AmGraft</div>
        <div className="mt-2 space-x-4 text-sm">
          <Link to="/" className="text-blue-600 hover:underline">Dashboard</Link>
          <Link to="/workorders" className="text-blue-600 hover:underline">Work Orders</Link>
        </div>
      </nav>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workorders" element={<WorkOrders />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-2 text-slate-600">Replacement app for the legacy AppSheet work-order workflow.</p>
    </div>
  );
}

function WorkOrders() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Work Orders</h1>
      <p className="mt-2 text-slate-600">List view coming soon.</p>
    </div>
  );
}

export default App;
