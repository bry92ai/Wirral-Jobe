# Wirral Jobe product decisions and change log

This file captures the consolidated decisions from the build discussions. It should be treated as the source of truth when documentation and old code disagree.

Last updated: 2026-08-28

---

## 1. What Wirral Jobe is

Wirral Jobe is a trusted booking and dispatch network connecting local passengers with local licensed drivers and operators.

It is **not** trying to compete with drivers. It exists to bring them work.

Core principles:

- **For customers:** free and simple booking, safer/more reliable service, easy communication.
- **For drivers:** more work, simple low platform charges, protection against bogus/time-wasting bookings, Wirral Jobe does **not** take the fare.
- **For operators:** better tools, less admin, access to a wider local network, easier cooperation between independent businesses.

Feature test: *“Does this make things easier, fairer or more reliable for passengers, drivers or operators?”* If not, we probably don’t need it.

---

## 2. Local Wirral identity

Public messaging is pro-Wirral rather than anti-anywhere-else.

Potential themes:

- “Built on the Wirral, for the Wirral.”
- “Keeping Wirral journeys with local licensed drivers.”
- “Independent local drivers. One local network.”
- “Supporting passengers, drivers and operators across Wirral.”

---

## 3. Customer payment model

Customers book **for free**.

Wirral Jobe does **not** collect the taxi fare. The passenger pays the driver/operator directly.

This removes the previous £1 customer payment/card-hold from the normal booking flow and much of the Square complexity.

Square/card payment functionality may remain in the architecture, but should only be triggered where justified (e.g. a card guarantee for persistently unreliable customers), not forced on every customer.

---

## 4. Driver settle model

Drivers pay Wirral Jobe **£1 per completed job**, capped at **£10 per driver, per week**.

- Fee only applies when a job reaches `COMPLETED`.
- No fee for declined offers, expired offers, cancelled jobs, customer cancellations, or failed bookings.
- The £1 fee and £10 weekly cap must be configurable in Admin.
- Each job should store the fee actually charged at the moment, so future price changes don’t retrospectively alter old jobs.

Driver UI should clearly show progress, e.g.:

> This week  
> 7 completed jobs  
> £7.00 settle due  
> Weekly cap: £10.00

Or after reaching the cap:

> Weekly cap reached  
> £10.00 settle due  
> Further jobs this week have no platform fee.

The £10 cap is **introductory** and may increase in future. Drivers must be given clear notice before pricing changes.

---

## 5. Customer trust system

Because the £1 customer payment is removed, Wirral Jobe needs stronger trust/no-show protection.

### Foundations

- SMS verification remains.
- Customer account builds an objective history: completed journeys, cancellations, late cancellations, no-shows, account age, successful bookings, current reliability/restriction status.
- No subjective star ratings. Use factual history.
- Driver sees only limited reassurance, e.g.:
  - “Phone verified · 12 completed bookings · 0 no-shows”
  - “Phone verified · New customer”

### Progressive restrictions

Bad behaviour escalates gradually, not permanently on a first offence:

Normal → Confirmation required → Card guarantee required → Temporarily suspended/restricted → Admin suspension for obvious abuse.

- First genuine no-show → warning.
- Repeated no-shows → stronger confirmation.
- Persistent offenders → card guarantee required before booking.

Trust incidents can decay after 90–180 days of good behaviour.

### Protections for customers

- Driver lateness must be considered before applying customer reliability strikes.
- A customer should generally only have **one active immediate (ASAP) booking at a time**.
- Abuse/rate-limiting for excessive OTP requests, repeated booking attempts, repeated ASAP cancellations, multiple suspicious accounts, etc.
- Pickup-location sanity check: if GPS is far from pickup, ask *“Are you booking this journey for somebody else?”* instead of auto-rejecting.

### Booking for someone else

Customers can explicitly book for another passenger:

- passenger name
- passenger mobile number
- actual passenger receives confirmation/arrival SMS

This avoids flagging legitimate bookings for family/friends as suspicious.

### Trusted customer

After a number of successful journeys (e.g. five), a customer quietly becomes trusted. This happens in the background without showing a trust score.

---

## 6. ASAP booking confirmation

After a driver accepts, the customer receives a confirmation prompt:

> Your driver is on the way. Are you still travelling?

Options: **YES — I’M READY**

If the customer does not respond, Wirral Jobe chases them. The booking may eventually be released/cancelled if the customer remains unresponsive.

---

## 7. Future-booking confirmation

Pre-booked journeys receive confirmations:

- Day before: *“Your Wirral Jobe is booked for tomorrow at 06:30. Please confirm you still require it.”*
- Closer to dispatch: *“Your driver will be allocated shortly. Please confirm you’re ready.”*

Purpose is to prevent wasted journeys, not spam.

---

## 8. Notifications: push first, SMS for critical/fallback

- Push notifications for routine app activity.
- SMS for OTP, important confirmations where push failed, critical journey communication, or passengers who don’t have the app.

---

## 9. Driver arrival and no-show workflow

### Required flow

**ARRIVED** → waiting timer starts → customer notified that driver is waiting → after agreed waiting period → **CUSTOMER NOT HERE** becomes available.

### Arrival geofence

The driver can only initiate the no-show process when GPS confirms they are reasonably close to the pickup.

### No-show evidence

Each no-show should record:

- driver arrival GPS
- arrival timestamp
- wait duration
- customer confirmation status
- attempted calls/messages
- booking timeline

Wirral Jobe does not record private conversation content, only that a contact attempt occurred at a specific time.

### Customer self-cancellation

Cancelling should be very easy. Customer selects a simple reason:

- Plans changed
- Driver taking too long
- Booked accidentally
- No longer travelling
- Other

---

## 10. Passenger PIN

A 4-digit journey PIN protects both sides.

When the passenger gets in the vehicle they give the driver the PIN. Driver enters it and the job becomes `PASSENGER ON BOARD` / `POB`.

Ideal lifecycle:

**Requested** → **Accepted** → **Driver On Way** → **Arrived** → **PIN verified** → **Passenger On Board** → **Completed**

---

## 11. Job audit timeline

Every job should have a clean human-readable timeline, e.g.:

> 21:02 Booking created  
> 21:03 Phone verified  
> 21:04 Driver accepted  
> 21:05 Customer confirmed  
> 21:13 Driver arrived  
> 21:13 Arrival SMS sent  
> 21:18 Passenger PIN verified  
> 21:31 Journey completed  
> 21:31 £1 driver settle fee added

Useful for disputes, support, debugging and admin monitoring.

---

## 12. Driver reliability

The platform should also monitor driver behaviour objectively:

- jobs accepted then abandoned
- driver cancellations
- failure to travel toward passenger
- unusually repeated no-shows
- successful completed jobs
- reliability over time

The platform protects customers, drivers and operators.

---

## 13. Admin and compliance

### Admin authentication

Move from a hidden shared admin password to proper admin email/password.

Required:

- admin email + password login
- server-side admin session (~6 hours)
- logout
- login throttling (5 failed attempts ≈ 10-minute lockout)
- admin security section
  - change admin email
  - change admin password (minimum 12 characters)
  - credential changes invalidate existing sessions
- owner-only Apps Script recovery/setup method if locked out

Primary admin email: **bry92ai@gmail.com**

This is set locally and should be applied to the live backend once the product is complete.

### Operator licence tracking

Admin-only driver compliance section:

- driver badge/licence details
- badge expiry
- vehicle plate/licence details
- plate expiry
- insurance expiry
- works under another operator
- operator they work under
- holds own operator licence: Yes/No
- operator licence number
- operator licence expiry

Future: filtering/alerts for documents approaching expiry.

---

## 14. Technical notes

- Original ZIP is the baseline.
- Working changes are applied to a separate copy.
- Final handover will compare original vs finished and explain what changed and why.
- Where old documentation (e.g. README.md) and source disagree, source code takes priority.
