'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireOffice
  } = ctx;

  // Sanitize office-authored HTML: strip script tags, on* handlers, javascript: URLs.
  // Returns null when a script tag survives stripping (reject the payload).
  function sanitizeHtml(html) {
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    if (/<script/i.test(sanitized)) return null;
    sanitized = sanitized.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
    sanitized = sanitized.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');
    return sanitized;
  }

  app.get('/api/program-rules', wrapAsync(async (req, res) => {
    try {
      const result = await query("SELECT rules_html, student_rules_html FROM program_content WHERE id = 'default'");
      if (!result.rowCount) return res.json({ rulesHtml: '', studentRulesHtml: '' });
      res.json({
        rulesHtml: result.rows[0].rules_html,
        studentRulesHtml: result.rows[0].student_rules_html || ''
      });
    } catch (err) {
      console.error('GET /api/program-rules error:', err);
      res.status(500).json({ error: 'Failed to fetch rules' });
    }
  }));

  app.put('/api/program-rules', requireOffice, wrapAsync(async (req, res) => {
    const { rulesHtml, studentRulesHtml } = req.body;
    if (rulesHtml !== undefined && typeof rulesHtml !== 'string') return res.status(400).json({ error: 'rulesHtml must be a string' });
    if (studentRulesHtml !== undefined && typeof studentRulesHtml !== 'string') return res.status(400).json({ error: 'studentRulesHtml must be a string' });
    if (rulesHtml === undefined && studentRulesHtml === undefined) return res.status(400).json({ error: 'Nothing to save' });

    const updates = [];
    const values = [];
    let idx = 1;
    for (const [column, raw] of [['rules_html', rulesHtml], ['student_rules_html', studentRulesHtml]]) {
      if (raw === undefined) continue;
      const sanitized = sanitizeHtml(raw);
      if (sanitized === null) return res.status(400).json({ error: 'Script tags not allowed' });
      updates.push(`${column} = $${idx++}`);
      values.push(sanitized);
    }
    try {
      const existing = await query("SELECT id FROM program_content WHERE id = 'default'");
      if (existing.rowCount > 0) {
        await query(`UPDATE program_content SET ${updates.join(', ')}, updated_at = NOW() WHERE id = 'default'`, values);
      } else {
        await query(
          "INSERT INTO program_content (id, rules_html, student_rules_html, updated_at) VALUES ('default', $1, $2, NOW())",
          [rulesHtml !== undefined ? sanitizeHtml(rulesHtml) : '', studentRulesHtml !== undefined ? sanitizeHtml(studentRulesHtml) : '']
        );
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('PUT /api/program-rules error:', err);
      res.status(500).json({ error: 'Failed to save rules' });
    }
  }));
};
