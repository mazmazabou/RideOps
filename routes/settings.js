'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireAuth,
    requireOffice,
    SETTING_DEFAULTS
  } = ctx;

  // ----- Settings endpoints -----
  app.get('/api/settings', requireOffice, wrapAsync(async (req, res) => {
    try {
      const result = await query('SELECT setting_key, setting_value, setting_type, label, description, category FROM tenant_settings ORDER BY category, setting_key');
      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({
          key: row.setting_key,
          value: row.setting_value,
          type: row.setting_type,
          label: row.label,
          description: row.description
        });
      }
      res.json(grouped);
    } catch (err) {
      console.error('settings fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  }));

  app.put('/api/settings', requireOffice, wrapAsync(async (req, res) => {
    try {
      const updates = req.body;
      if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array of { key, value }' });

      // Build lookup of incoming values for cross-field validation
      const incoming = {};
      for (const { key, value } of updates) { if (key) incoming[key] = value; }

      const errors = [];

      // operating_days: non-empty, valid day numbers
      if ('operating_days' in incoming) {
        const val = incoming.operating_days;
        if (!val || String(val).trim() === '') {
          errors.push('At least one operating day must be selected');
        } else {
          const days = String(val).split(',').map(d => d.trim());
          if (!days.every(d => /^[0-6]$/.test(d))) {
            errors.push('Operating days must be integers 0-6');
          }
        }
      }

      // service hours: start must be before end
      const startVal = incoming.service_hours_start;
      const endVal = incoming.service_hours_end;
      if (startVal || endVal) {
        let s = startVal, e = endVal;
        if (!s) { const r = await query("SELECT setting_value FROM tenant_settings WHERE setting_key='service_hours_start'"); s = r.rows[0]?.setting_value || '08:00'; }
        if (!e) { const r = await query("SELECT setting_value FROM tenant_settings WHERE setting_key='service_hours_end'"); e = r.rows[0]?.setting_value || '19:00'; }
        const timeRe = /^\d{2}:\d{2}$/;
        if (s && !timeRe.test(s)) errors.push('Service hours start must be HH:MM');
        if (e && !timeRe.test(e)) errors.push('Service hours end must be HH:MM');
        if (timeRe.test(s) && timeRe.test(e) && s >= e) errors.push('Service hours start must be earlier than end');
      }

      // Numeric minimums
      for (const [key, label, min] of [['grace_period_minutes','Grace period',0],['max_no_show_strikes','Max no-show strikes',1],['tardy_threshold_minutes','Tardy threshold',1]]) {
        if (key in incoming) {
          const val = parseInt(incoming[key], 10);
          if (isNaN(val) || val < min) errors.push(`${label} must be at least ${min}`);
        }
      }

      if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

      for (const { key, value } of updates) {
        if (!key || value === undefined) continue;
        await query(
          `UPDATE tenant_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
          [String(value), key]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error('settings update error:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }));

  app.get('/api/settings/public/operations', wrapAsync(async (req, res) => {
    try {
      const result = await query(
        `SELECT setting_key, setting_value FROM tenant_settings WHERE category = 'operations' OR setting_key IN ('grace_period_minutes', 'max_no_show_strikes', 'strikes_enabled')`
      );
      const config = {};
      for (const row of result.rows) {
        config[row.setting_key] = row.setting_value;
      }
      // Apply defaults for any missing keys
      for (const key of ['service_hours_start', 'service_hours_end', 'operating_days', 'grace_period_minutes', 'max_no_show_strikes', 'strikes_enabled']) {
        if (!config[key]) config[key] = SETTING_DEFAULTS[key];
      }
      res.json(config);
    } catch (err) {
      console.error('public operations config error:', err);
      res.json({
        service_hours_start: '08:00',
        service_hours_end: '19:00',
        operating_days: '0,1,2,3,4,5,6',
        grace_period_minutes: '5',
        max_no_show_strikes: '5',
        strikes_enabled: 'true'
      });
    }
  }));

  app.get('/api/settings/:key', requireAuth, wrapAsync(async (req, res) => {
    try {
      const result = await query('SELECT setting_value, setting_type FROM tenant_settings WHERE setting_key = $1', [req.params.key]);
      if (!result.rowCount) return res.status(404).json({ error: 'Setting not found' });
      res.json({ key: req.params.key, value: result.rows[0].setting_value, type: result.rows[0].setting_type });
    } catch (err) {
      console.error('setting fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  }));
};
