import { Routes, Route, Link } from 'react-router-dom';
import BookingPage from './pages/BookingPage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brandbar">
          <img src="/design-refs/logo.jpg" alt="The Wirral Jobe" />
          <div className="brandbar-copy">
            <div className="brandbar-kicker">Wirral taxi app</div>
            <p className="brandbar-title">Local knowledge. Always on call.</p>
            <p className="brandbar-subtitle">
              Bold poster-style branding for booking, driver tracking and dispatch.
            </p>
          </div>
        </div>
        <nav className="nav">
          <Link to="/">Customer</Link>
          <Link to="/driver">Driver</Link>
          <Link to="/admin">Dispatch</Link>
        </nav>
      </header>

      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<BookingPage />} />
            <Route path="/track/:token" element={<TrackingPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
