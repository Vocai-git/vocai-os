require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/proposals', require('./routes/proposals'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/episodes', require('./routes/episodes'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/my-tasks', require('./routes/my-tasks'));
app.use('/api/my-events', require('./routes/my-events'));
app.use('/api/business-events', require('./routes/business-events'));
app.use('/api/marketing-calendar', require('./routes/marketing-calendar'));
app.use('/api/marketing-planning', require('./routes/marketing-planning'));
app.use('/api/marketing-intelligence', require('./routes/marketing-intelligence'));
app.use('/api/marketing-generator', require('./routes/marketing-generator'));
app.use('/api/marketing-carousel', require('./routes/marketing-carousel'));
app.use('/api/marketing-biblioteca', require('./routes/marketing-biblioteca'));
app.use('/api/marketing-web', require('./routes/marketing-web'));
app.use('/api/marketing-analytics', require('./routes/marketing-analytics'));
app.use('/api/radar', require('./routes/radar'));
app.use('/api/asistente', require('./routes/asistente'));
app.use('/api/tito', require('./routes/tito'));
const googleAuthRouter = require('./routes/google-auth');
app.use('/api/google', googleAuthRouter);
app.use('/auth/google', googleAuthRouter);

// SPA fallback
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VOCAI OS corriendo en puerto ${PORT}`);
  require('./config/storage').asegurarBucket();
  require('./automations/scheduler').iniciarScheduler();
});
