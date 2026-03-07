'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireAuth,
    loginLimiter,
    signupLimiter,
    setSessionFromUser,
    bcrypt,
    getSetting,
    generateId,
    isValidEmail,
    isValidMemberId,
    isDevRequest,
    TENANT,
    DEMO_MODE,
    SIGNUP_ENABLED,
    MIN_PASSWORD_LENGTH,
    campusConfigs,
    isProduction
  } = ctx;

  // ----- Auth endpoints -----
  app.post('/api/auth/login', loginLimiter, wrapAsync(async (req, res) => {
    const { username, password } = req.body;
    const userRes = await query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL', [username.toLowerCase()]);
    const user = userRes.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    setSessionFromUser(req, user);
    const responseData = { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, campus: req.session.campus || null };
    if (user.must_change_password) responseData.mustChangePassword = true;
    res.json(responseData);
  }));

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', wrapAsync(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const userData = {
      id: req.session.userId,
      username: req.session.username,
      name: req.session.name,
      email: req.session.email,
      member_id: req.session.memberId,
      memberId: req.session.memberId,
      role: req.session.role,
      demoMode: DEMO_MODE
    };

    if (req.session.role === 'rider') {
      const strikesEnabled = await getSetting('strikes_enabled');
      if (strikesEnabled === 'true' || strikesEnabled === true) {
        const maxStrikes = parseInt(await getSetting('max_no_show_strikes')) || 5;
        const missResult = await query('SELECT count FROM rider_miss_counts WHERE rider_id = $1', [req.session.userId]);
        const missCount = missResult.rows[0]?.count || 0;
        userData.terminated = missCount >= maxStrikes;
        userData.missCount = missCount;
        userData.maxStrikes = maxStrikes;
      } else {
        userData.terminated = false;
      }
    }

    res.json(userData);
  }));

  app.get('/api/auth/signup-allowed', (req, res) => {
    res.json({ allowed: SIGNUP_ENABLED });
  });

  app.get('/api/client-config', (req, res) => {
    res.json({ isDev: isDevRequest(req) });
  });

  app.get('/api/tenant-config', wrapAsync(async (req, res) => {
    let config = { ...TENANT };
    const campus = req.session.campus || req.query.campus;
    if (campus && campusConfigs[campus]) {
      config = { ...config, ...campusConfigs[campus] };
    }
    try {
      const settingsRes = await query(
        `SELECT setting_key, setting_value FROM tenant_settings WHERE setting_key IN ('grace_period_minutes', 'academic_period_label')`
      );
      for (const row of settingsRes.rows) {
        if (row.setting_key === 'grace_period_minutes') config.grace_period_minutes = parseInt(row.setting_value) || 5;
        if (row.setting_key === 'academic_period_label') config.academic_period_label = row.setting_value || 'Semester';
      }
    } catch (e) { /* defaults applied below */ }
    if (!config.grace_period_minutes) config.grace_period_minutes = 5;
    if (!config.academic_period_label) config.academic_period_label = 'Semester';
    res.json(config);
  }));

  // Change own password
  app.post('/api/auth/change-password', requireAuth, wrapAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [hash, req.session.userId]
    );
    res.json({ success: true });
  }));

  app.post('/api/auth/signup', signupLimiter, wrapAsync(async (req, res) => {
    if (!SIGNUP_ENABLED) {
      return res.status(403).json({ error: 'Signup is currently disabled' });
    }
    const { name, email, phone, password, memberId } = req.body;
    if (!name || !email || !password || !memberId) {
      return res.status(400).json({ error: `Name, email, password, and ${TENANT.idFieldLabel} are required` });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (!isValidMemberId(memberId)) {
      return res.status(400).json({ error: `Invalid ${TENANT.idFieldLabel}` });
    }
    const uname = email.toLowerCase().split('@')[0];
    const existing = await query('SELECT 1 FROM users WHERE (username = $1 OR email = $2 OR phone = $3 OR member_id = $4) AND deleted_at IS NULL', [uname, email.toLowerCase(), phone || null, memberId]);
    if (existing.rowCount) {
      return res.status(400).json({ error: `Username, email, phone, or ${TENANT.idFieldLabel} already exists` });
    }
    const id = generateId('rider');
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (id, username, password_hash, name, email, member_id, phone, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'rider', FALSE)`,
      [id, uname, hash, name, email.toLowerCase(), memberId, phone || null]
    );
    const userRes = await query('SELECT * FROM users WHERE id = $1', [id]);
    const user = userRes.rows[0];
    setSessionFromUser(req, user);
    res.json({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role });
  }));
};
