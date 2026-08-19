import { useEffect } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './lib/api.js';
import BookingPage from './pages/BookingPage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import DriverApplyPage from './pages/DriverApplyPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CustomerPage from './pages/CustomerPage.jsx';
import DriverActionPage from './pages/DriverActionPage.jsx';
import WalletPayPage from './pages/WalletPayPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const SESSION_KEY = 'wirralCustomerToken';

function Landing() {
  return localStorage.getItem(SESSION_KEY) ? <BookingPage /> : <Navigate to="/customer" replace />;
}

export default function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    PushNotifications.requestPermissions().then(res => {
      if (res.receive === 'granted') {
        PushNotifications.register();
      }
    }).catch(err => console.error('Push permission error:', err));
    PushNotifications.addListener('registration', token => {
      localStorage.setItem('fcmToken', token.value);
      const customerToken = localStorage.getItem(SESSION_KEY);
      const driverToken = localStorage.getItem('driverToken');
      if (customerToken) {
        api('customer/register-push', { customerToken, fcmToken: token.value }).catch(err => console.error('Customer push registration failed:', err));
      }
      if (driverToken) {
        api('driver/register-push', { driverToken, fcmToken: token.value }).catch(err => console.error('Driver push registration failed:', err));
      }
    });
    PushNotifications.addListener('registrationError', err => {
      console.error('Push registration error:', err);
    });
    PushNotifications.addListener('pushNotificationReceived', notification => {
      // Notification received in foreground
    });
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const data = action.notification?.data;
      if (data?.route) {
        window.location.hash = '';
        window.location.pathname = data.route;
      }
    });
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">Book</Link>
        <Link to="/customer">Customer</Link>
        <Link to="/driver">Driver</Link>
      </nav>
      <main>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/track/:token" element={<TrackingPage />} />
            <Route path="/customer" element={<CustomerPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/driver/apply" element={<DriverApplyPage />} />
            <Route path="/driver/apply/:token" element={<DriverApplyPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/driver-action" element={<DriverActionPage />} />
            <Route path="/wallet-pay" element={<WalletPayPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
