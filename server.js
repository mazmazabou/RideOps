const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data stores
let employees = [
  { id: 'emp1', name: 'Jamie Driver', role: 'driver', active: false },
  { id: 'emp2', name: 'Avery Dispatcher', role: 'dispatcher', active: false },
  { id: 'emp3', name: 'Casey Supervisor', role: 'supervisor', active: false },
  { id: 'emp4', name: 'Chris Driver', role: 'driver', active: false }
];

let shifts = [
  { id: 'shift1', employeeId: 'emp1', dayOfWeek: 0, startTime: '08:00', endTime: '12:00' },
  { id: 'shift2', employeeId: 'emp4', dayOfWeek: 2, startTime: '12:00', endTime: '19:00' }
];

let rideRequests = [];
const riderMissCounts = {};

// Helpers
function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function isWithinServiceHours(requestedTime) {
  const date = new Date(requestedTime);
  if (isNaN(date.getTime())) return false;
  const day = date.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (day < 1 || day > 5) return false;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 8 * 60 && totalMinutes <= 19 * 60; // inclusive of 19:00
}

function getTodayISODate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function updateRideMissCount(email, count) {
  riderMissCounts[email] = count;
}

// Employee endpoints
app.get('/api/employees', (req, res) => {
  res.json(employees);
});

app.post('/api/employees/clock-in', (req, res) => {
  const { employeeId } = req.body;
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  emp.active = true;
  res.json(emp);
});

app.post('/api/employees/clock-out', (req, res) => {
  const { employeeId } = req.body;
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  emp.active = false;
  res.json(emp);
});

// Shift endpoints
app.get('/api/shifts', (req, res) => {
  res.json(shifts);
});

app.post('/api/shifts', (req, res) => {
  const { employeeId, dayOfWeek, startTime, endTime } = req.body;
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return res.status(400).json({ error: 'Employee not found' });
  const shift = { id: generateId('shift'), employeeId, dayOfWeek, startTime, endTime };
  shifts.push(shift);
  res.json(shift);
});

app.delete('/api/shifts/:id', (req, res) => {
  const { id } = req.params;
  const index = shifts.findIndex((s) => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Shift not found' });
  const removed = shifts.splice(index, 1)[0];
  res.json(removed);
});

// Ride endpoints
app.get('/api/rides', (req, res) => {
  const { status } = req.query;
  if (status) {
    return res.json(rideRequests.filter((r) => r.status === status));
  }
  res.json(rideRequests);
});

app.post('/api/rides', (req, res) => {
  const {
    riderName,
    riderEmail,
    riderPhone,
    pickupLocation,
    dropoffLocation,
    requestedTime
  } = req.body;
  const missCount = riderMissCounts[riderEmail] || 0;
  const ride = {
    id: generateId('ride'),
    riderName,
    riderEmail,
    riderPhone,
    pickupLocation,
    dropoffLocation,
    requestedTime,
    status: 'pending',
    assignedDriverId: null,
    graceStartTime: null,
    consecutiveMisses: missCount
  };
  rideRequests.push(ride);
  res.json(ride);
});

app.post('/api/rides/:id/approve', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if ((riderMissCounts[ride.riderEmail] || ride.consecutiveMisses || 0) >= 5) {
    return res.status(400).json({ error: 'SERVICE TERMINATED: rider has 5 consecutive no-shows' });
  }
  if (!isWithinServiceHours(ride.requestedTime)) {
    return res.status(400).json({ error: 'Requested time outside service hours (8:00-19:00 Mon-Fri)' });
  }
  ride.status = 'approved';
  res.json(ride);
});

app.post('/api/rides/:id/deny', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'denied';
  res.json(ride);
});

app.post('/api/rides/:id/assign', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const { driverId } = req.body;
  const driver = employees.find((e) => e.id === driverId && e.role === 'driver');
  if (!driver) return res.status(400).json({ error: 'Driver not found' });
  if (!driver.active) return res.status(400).json({ error: 'Driver is not clocked in' });
  ride.assignedDriverId = driverId;
  ride.status = 'scheduled';
  res.json(ride);
});

app.post('/api/rides/:id/status', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const { status } = req.body;
  ride.status = status;
  res.json(ride);
});

// Driver action endpoints
app.post('/api/rides/:id/on-the-way', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'driver_on_the_way';
  res.json(ride);
});

app.post('/api/rides/:id/here', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'driver_arrived_grace';
  ride.graceStartTime = new Date().toISOString();
  res.json(ride);
});

app.post('/api/rides/:id/complete', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'completed';
  ride.consecutiveMisses = 0;
  updateRideMissCount(ride.riderEmail, 0);
  res.json(ride);
});

app.post('/api/rides/:id/no-show', (req, res) => {
  const ride = rideRequests.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  ride.status = 'no_show';
  const newCount = (riderMissCounts[ride.riderEmail] || ride.consecutiveMisses || 0) + 1;
  ride.consecutiveMisses = newCount;
  updateRideMissCount(ride.riderEmail, newCount);
  if (newCount >= 5) {
    console.warn(`SERVICE TERMINATED for rider ${ride.riderEmail}`);
  }
  res.json(ride);
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DART Ops server running on port ${PORT}`);
});
