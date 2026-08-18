export default function PrivacyPage() {
  return (
    <div className="card" style={{ maxWidth: 800, margin: '2rem auto', padding: '1.5rem' }}>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> 18 August 2026</p>

      <h2>1. Who we are</h2>
      <p>
        Wirral Jobe (“we”, “us” or “our”) provides a booking and dispatch service for private hire and airport journeys in the Wirral area.
      </p>
      <p>
        If you have any questions about this policy or how your data is used, please contact us at:
        <br />
        <strong>Email:</strong> privacy@wirraljobe.com
      </p>

      <h2>2. What information we collect</h2>
      <p>We collect information that you provide directly and data generated when you use our service:</p>
      <ul>
        <li><strong>Customers:</strong> name, phone number, email (optional), saved places, booking history, and device push-notification token.</li>
        <li><strong>Drivers:</strong> name, phone number, PIN, vehicle details, licence details, badge number, location while using the driver app, and push-notification token.</li>
        <li><strong>Bookings:</strong> pickup and destination addresses, journey times, fare, vehicle type, and status updates.</li>
        <li><strong>Payments:</strong> we use Square to process booking fees. We do not store your full card details; Square handles payment data under its own privacy policy.</li>
      </ul>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To arrange and dispatch your journey to the nearest available driver.</li>
        <li>To send you booking confirmations, driver allocation, arrival, and completion updates by SMS or push notification.</li>
        <li>To share your pickup details and estimated journey information with the assigned driver.</li>
        <li>To maintain driver accounts, track queue position, and calculate driver commission.</li>
        <li>To comply with legal and regulatory requirements, including licencing and record-keeping.</li>
      </ul>

      <h2>4. Location data</h2>
      <p>
        Drivers must share their location while logged in to the driver app so we can allocate jobs by zone and proximity. Location is only collected when the app is active and is stored for a short period to support dispatch and driver queue management.
      </p>

      <h2>5. Who we share data with</h2>
      <ul>
        <li><strong>Your driver</strong> — pickup address, destination, contact phone number, and any access notes you provide.</li>
        <li><strong>Twilio</strong> — for SMS booking notifications and OTP messages.</li>
        <li><strong>Square</strong> — for payment processing.</li>
        <li><strong>Firebase / Google</strong> — for push notifications to the driver and customer apps.</li>
        <li><strong>Google</strong> — for address geocoding and mapping.</li>
      </ul>
      <p>We do not sell your personal data to third parties.</p>

      <h2>6. Data retention and deletion</h2>
      <p>
        We keep booking and driver records for as long as necessary to provide our service and meet legal/tax/licencing obligations. You can request deletion of your personal data by emailing privacy@wirraljobe.com; we will remove it within 30 days unless we are required to keep it by law.
      </p>

      <h2>7. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate information.</li>
        <li>Request deletion of your data (subject to legal obligations).</li>
        <li>Object to certain types of processing.</li>
      </ul>

      <h2>8. Security</h2>
      <p>
        We use hashed PINs, authenticated API tokens, HTTPS for all communications, and access-controlled Google Sheets for our operational records. Payment data is handled by Square under PCI-DSS standards.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this privacy policy from time to time. The latest version will always be available at https://wirraljobe.com/privacy.
      </p>

      <h2>10. Contact us</h2>
      <p>
        Wirral Jobe<br />
        Email: privacy@wirraljobe.com
      </p>
    </div>
  );
}
