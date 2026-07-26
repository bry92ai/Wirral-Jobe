import { Routes, Route, Link } from 'react-router-dom';
import BookingPage from './pages/BookingPage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import DriverApplyPage from './pages/DriverApplyPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CustomerPage from './pages/CustomerPage.jsx';
import StatusPage from './pages/StatusPage.jsx';

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">Book</Link>
        <Link to="/customer">Customer</Link>
        <Link to="/driver">Driver</Link>
        <Link to="/admin">Dispatch</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/track/:token" element={<TrackingPage />} />
          <Route path="/customer" element={<CustomerPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/driver/apply" element={<DriverApplyPage />} />
          <Route path="/driver/apply/:token" element={<DriverApplyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </main>
    </div>
  );
}
