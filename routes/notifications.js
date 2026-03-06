'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    pool,
    wrapAsync,
    requireAuth,
    requireOffice,
    generateId,
    addRideEvent,
    getSetting,
    getRiderMissCount,
    isDevRequest,
    formatLocalDate,
    seedNotificationPreferences,
    NOTIFICATION_EVENT_TYPES,
    DEMO_MODE
  } = ctx;

  // ── Notification Preferences ──
  app.get('/api/notification-preferences', requireAuth, wrapAsync(async (req, res) => {
    try {
      // Seed any missing preference rows (idempotent via ON CONFLICT DO NOTHING)
      const userRole = req.session.role;
      await seedNotificationPreferences(req.session.userId, userRole);

      const result = await query(
        'SELECT * FROM notification_preferences WHERE user_id = $1 ORDER BY event_type, channel',
        [req.session.userId]
      );

      // Group by event_type for easier frontend rendering (skip orphaned types not in NOTIFICATION_EVENT_TYPES)
      const roleTypes = NOTIFICATION_EVENT_TYPES.filter(e => e.targetRole === userRole);
      const knownKeys = new Set(roleTypes.map(e => e.key));
      const grouped = {};
      for (const row of result.rows) {
        if (!knownKeys.has(row.event_type)) continue;
        if (!grouped[row.event_type]) {
          const def = roleTypes.find(e => e.key === row.event_type);
          grouped[row.event_type] = {
            key: row.event_type,
            label: def.label,
            description: def.description || '',
            category: def.category,
            thresholdUnit: def.thresholdUnit,
            channels: {}
          };
        }
        grouped[row.event_type].channels[row.channel] = {
          enabled: row.enabled,
          thresholdValue: row.threshold_value
        };
      }

      res.json({ eventTypes: roleTypes, preferences: grouped });
    } catch (err) {
      console.error('GET notification-preferences error:', err);
      res.status(500).json({ error: 'Failed to load notification preferences' });
    }
  }));

  app.put('/api/notification-preferences', requireAuth, wrapAsync(async (req, res) => {
    try {
      const { preferences } = req.body;
      if (!Array.isArray(preferences)) return res.status(400).json({ error: 'preferences must be an array' });

      let updated = 0;
      for (const p of preferences) {
        const r = await query(`
          UPDATE notification_preferences
          SET enabled = $1, threshold_value = $2, updated_at = NOW()
          WHERE user_id = $3 AND event_type = $4 AND channel = $5
        `, [p.enabled, p.thresholdValue ?? null, req.session.userId, p.eventType, p.channel]);
        updated += r.rowCount;
      }

      res.json({ updated });
    } catch (err) {
      console.error('PUT notification-preferences error:', err);
      res.status(500).json({ error: 'Failed to save notification preferences' });
    }
  }));

  // ── In-App Notifications ──

  app.get('/api/notifications', requireAuth, wrapAsync(async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const unreadOnly = req.query.unread_only === 'true';

      const countRes = await query(
        'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE read = FALSE) AS unread FROM notifications WHERE user_id = $1',
        [req.session.userId]
      );
      const unreadCount = parseInt(countRes.rows[0].unread);
      const totalCount = parseInt(countRes.rows[0].total);

      const whereClause = unreadOnly ? 'AND read = FALSE' : '';
      const result = await query(
        `SELECT id, event_type, title, body, metadata, read, created_at
         FROM notifications
         WHERE user_id = $1 ${whereClause}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.session.userId, limit, offset]
      );

      res.json({ notifications: result.rows, unreadCount, totalCount });
    } catch (err) {
      console.error('GET /api/notifications error:', err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }));

  app.put('/api/notifications/read-all', requireAuth, wrapAsync(async (req, res) => {
    try {
      const result = await query(
        'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
        [req.session.userId]
      );
      res.json({ updated: result.rowCount });
    } catch (err) {
      console.error('PUT /api/notifications/read-all error:', err);
      res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
  }));

  app.put('/api/notifications/bulk-read', requireAuth, wrapAsync(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const result = await query(
      'UPDATE notifications SET read = TRUE WHERE id = ANY($1::text[]) AND user_id = $2 AND read = FALSE',
      [ids, req.session.userId]
    );
    res.json({ updated: result.rowCount });
  }));

  app.put('/api/notifications/:id/read', requireAuth, wrapAsync(async (req, res) => {
    try {
      const result = await query(
        'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
        [req.params.id, req.session.userId]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('PUT /api/notifications/:id/read error:', err);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }));

  // Bulk delete notifications
  app.post('/api/notifications/bulk-delete', requireAuth, wrapAsync(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    try {
      const result = await query(
        'DELETE FROM notifications WHERE id = ANY($1::text[]) AND user_id = $2',
        [ids, req.session.userId]
      );
      res.json({ deleted: result.rowCount });
    } catch (err) {
      console.error('POST /api/notifications/bulk-delete error:', err);
      res.status(500).json({ error: 'Failed to delete notifications' });
    }
  }));

  // Delete all notifications
  app.delete('/api/notifications/all', requireAuth, wrapAsync(async (req, res) => {
    try {
      const result = await query('DELETE FROM notifications WHERE user_id = $1', [req.session.userId]);
      res.json({ deleted: result.rowCount });
    } catch (err) {
      console.error('DELETE /api/notifications/all error:', err);
      res.status(500).json({ error: 'Failed to delete all notifications' });
    }
  }));

  app.delete('/api/notifications/:id', requireAuth, wrapAsync(async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        [req.params.id, req.session.userId]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/notifications/:id error:', err);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }));

  // Purge old closed rides based on retention settings
  app.post('/api/rides/purge-old', requireOffice, wrapAsync(async (req, res) => {
    try {
      const retentionValue = parseInt(await getSetting('ride_retention_value', '0'));
      const retentionUnit = await getSetting('ride_retention_unit', 'months');
      if (!retentionValue || retentionValue <= 0) {
        return res.status(400).json({ error: 'Retention is set to keep forever (0). Nothing to purge.' });
      }
      const cutoff = new Date();
      if (retentionUnit === 'weeks') cutoff.setDate(cutoff.getDate() - (retentionValue * 7));
      else if (retentionUnit === 'months') cutoff.setMonth(cutoff.getMonth() - retentionValue);
      else if (retentionUnit === 'years') cutoff.setFullYear(cutoff.getFullYear() - retentionValue);
      else return res.status(400).json({ error: 'Invalid retention unit' });

      await query(
        `DELETE FROM ride_events WHERE ride_id IN (
          SELECT id FROM rides WHERE status IN ('completed', 'no_show', 'denied', 'cancelled')
          AND requested_time < $1
        )`, [cutoff.toISOString()]
      );
      const ridesResult = await query(
        `DELETE FROM rides WHERE status IN ('completed', 'no_show', 'denied', 'cancelled')
         AND requested_time < $1`, [cutoff.toISOString()]
      );
      res.json({ purged: ridesResult.rowCount, cutoffDate: cutoff.toISOString() });
    } catch (err) {
      console.error('POST /api/rides/purge-old error:', err);
      res.status(500).json({ error: 'Failed to purge old rides' });
    }
  }));

  app.post('/api/dev/seed-rides', requireOffice, wrapAsync(async (req, res) => {
    if (!isDevRequest(req)) {
      return res.status(403).json({ error: 'Dev seeding is only available in local development mode' });
    }
    const todayStr = formatLocalDate(new Date());
    const sampleRides = [
      { riderName: 'Alice Student', riderEmail: 'hello+alice@ride-ops.com', riderPhone: '213-555-0101', pickupLocation: 'Leavey Library', dropoffLocation: 'Doheny Library', hour: 9 },
      { riderName: 'Bob Faculty', riderEmail: 'hello+bob@ride-ops.com', riderPhone: '213-555-0102', pickupLocation: 'SGM', dropoffLocation: 'VKC', hour: 10 },
      { riderName: 'Carol Staff', riderEmail: 'hello+carol@ride-ops.com', riderPhone: '213-555-0103', pickupLocation: 'Lyon Center', dropoffLocation: 'RTH', hour: 11 },
      { riderName: 'Dan Grad', riderEmail: 'hello+dan@ride-ops.com', riderPhone: '213-555-0104', pickupLocation: 'USC Village', dropoffLocation: 'JFF', hour: 14 },
    ];
    for (const s of sampleRides) {
      const requestedTime = `${todayStr}T${String(s.hour).padStart(2, '0')}:00`;
      const missCount = 0; // Dev seed — no rider_id available for sample rides
      const rideId = generateId('ride');
      await query(
        `INSERT INTO rides (id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', NULL, NULL, $9, NULL)`,
        [rideId, s.riderName, s.riderEmail, s.riderPhone, s.pickupLocation, s.dropoffLocation, '', requestedTime, missCount]
      );
      await addRideEvent(rideId, req.session.userId, 'approved');
    }
    res.json({ message: `Seeded ${sampleRides.length} sample rides for today`, count: sampleRides.length });
  }));

  // Manual demo reseed (office + demo mode only)
  if (DEMO_MODE) {
    app.post('/api/dev/reseed', requireOffice, wrapAsync(async (req, res) => {
      const { seedDemoData } = require('../demo-seed');
      await seedDemoData(pool);
      console.log('Demo data manually re-seeded');
      res.json({ success: true, message: 'Demo data reseeded' });
    }));
  }
};
