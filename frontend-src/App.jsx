import { useEffect } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
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
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    PushNotifications.requestPermissions().then(res => {
      if (res.receive === 'granted') {
        PushNotifications.register();
      }
    }).catch(err => console.error('Push permission error:', err));

    LocalNotifications.createChannel({
      id: 'job_offers',
      name: 'Job Offers',
      description: 'New job offer alerts and customer updates',
      importance: 5,
      visibility: 1,
      vibration: true
    }).catch(err => console.error('Create notification channel error:', err));

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
      // Foreground push: mirror it as a local notification so the user still sees it.
      LocalNotifications.schedule({
        notifications: [{
          id: Date.now(),
          channelId: 'job_offers',
          title: notification.title || 'Wirral Jobe',
          body: notification.body || '',
          extra: notification.data || {}
        }]
      }).catch(err => console.error('Schedule local notification error:', err));
    });
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const data = action.notification?.data;
      if (data?.route) {
        navigate(data.route);
      }
    });
    LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const route = action.notification?.extra?.route;
      if (route) navigate(route);
    });
  }, [navigate]);

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
