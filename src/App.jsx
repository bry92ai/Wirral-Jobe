import { Routes, Route, Link } from 'react-router-dom';
import BookingPage from './pages/BookingPage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">Book</Link>
        <Link to="/driver">Driver</Link>
        <Link to="/admin">Dispatch</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/track/:token" element={<TrackingPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
