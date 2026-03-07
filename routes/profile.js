'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireAuth,
    isValidPhone
  } = ctx;

  // Self-service profile
  app.get('/api/me', requireAuth, wrapAsync(async (req, res) => {
    const result = await query(
      `SELECT id, username, name, email, member_id, phone, role, avatar_url, preferred_name, major, graduation_year, bio FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.session.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }));

  app.put('/api/me', requireAuth, wrapAsync(async (req, res) => {
    const { name, phone, preferredName, major, graduationYear, bio, avatarUrl } = req.body;
    if (name && name.length > 120) return res.status(400).json({ error: 'Name too long' });
    if (phone !== undefined && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
    // Validate new profile fields
    const stripTags = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g, '') : s;
    if (preferredName !== undefined && preferredName !== null) {
      if (stripTags(preferredName).length > 50) return res.status(400).json({ error: 'Preferred name too long (max 50)' });
      if (preferredName !== stripTags(preferredName)) return res.status(400).json({ error: 'HTML not allowed in preferred name' });
    }
    if (major !== undefined && major !== null) {
      if (stripTags(major).length > 100) return res.status(400).json({ error: 'Major too long (max 100)' });
      if (major !== stripTags(major)) return res.status(400).json({ error: 'HTML not allowed in major' });
    }
    if (graduationYear !== undefined && graduationYear !== null) {
      const yr = parseInt(graduationYear, 10);
      if (isNaN(yr) || yr < 2020 || yr > 2035) return res.status(400).json({ error: 'Graduation year must be between 2020 and 2035' });
    }
    if (bio !== undefined && bio !== null) {
      if (stripTags(bio).length > 120) return res.status(400).json({ error: 'Bio too long (max 120)' });
      if (bio !== stripTags(bio)) return res.status(400).json({ error: 'HTML not allowed in bio' });
    }
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') {
      const isDiceBear = avatarUrl.startsWith('https://api.dicebear.com/');
      const isDataUri = avatarUrl.startsWith('data:image/');
      if (!isDiceBear && !isDataUri) return res.status(400).json({ error: 'Avatar must be a DiceBear URL or image data URI' });
      if (isDataUri) {
        const base64Part = avatarUrl.split(',')[1] || '';
        const sizeBytes = Math.ceil(base64Part.length * 3 / 4);
        if (sizeBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Avatar image must be under 2MB' });
      }
    }
    // For profile fields: undefined = not sent (keep old), empty string = clear, value = update
    const profileVal = (v) => v === undefined ? undefined : (v || null);
    const sets = ['name = COALESCE($1, name)', 'phone = COALESCE($2, phone)'];
    const params = [name || null, phone || null];
    let pIdx = 3;
    // Only include profile fields in SET clause when explicitly provided
    const profileFields = [
      { key: 'preferred_name', val: preferredName },
      { key: 'major', val: major },
      { key: 'graduation_year', val: graduationYear !== undefined ? (graduationYear ? parseInt(graduationYear, 10) : null) : undefined },
      { key: 'bio', val: bio },
      { key: 'avatar_url', val: avatarUrl }
    ];
    for (const f of profileFields) {
      if (f.val !== undefined) {
        sets.push(`${f.key} = $${pIdx}`);
        params.push(f.val || null);
        pIdx++;
      }
    }
    sets.push('updated_at = NOW()');
    params.push(req.session.userId);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${pIdx}
       RETURNING id, username, name, email, member_id, phone, role, avatar_url, preferred_name, major, graduation_year, bio`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    // refresh session display name
    req.session.name = user.name;
    res.json(user);
  }));
};
