'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireStaff,
    requireOffice,
    generateId,
    getSetting
  } = ctx;

  // ----- Shift endpoints -----
  app.get('/api/shifts', requireStaff, wrapAsync(async (req, res) => {
    const { weekStart } = req.query;
    let result;
    if (weekStart) {
      result = await query(
        `SELECT id, employee_id AS "employeeId", day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"
         FROM shifts WHERE week_start = $1 OR week_start IS NULL ORDER BY day_of_week, start_time`,
        [weekStart]
      );
    } else {
      result = await query(
        `SELECT id, employee_id AS "employeeId", day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"
         FROM shifts ORDER BY day_of_week, start_time`
      );
    }
    res.json(result.rows);
  }));

  app.post('/api/shifts', requireOffice, wrapAsync(async (req, res) => {
    const { employeeId, dayOfWeek, startTime, endTime, notes, weekStart } = req.body;
    // Validate dayOfWeek against operating days
    const dow = Number(dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0-6 (Mon-Sun)' });
    }
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
    const opDays = String(opDaysStr).split(',').map(Number);
    if (!opDays.includes(dow)) {
      return res.status(400).json({ error: 'Shifts can only be created on operating days' });
    }
    // Check for overlapping shifts
    const overlaps = await query(
      `SELECT id FROM shifts
       WHERE employee_id = $1 AND day_of_week = $2
       AND (week_start IS NOT DISTINCT FROM $3)
       AND start_time < $4 AND end_time > $5`,
      [employeeId, dayOfWeek, weekStart || null, endTime, startTime]
    );
    if (overlaps.rows.length > 0) {
      return res.status(409).json({ error: 'This shift overlaps with an existing shift for this driver.' });
    }

    const shift = {
      id: generateId('shift'),
      employeeId,
      dayOfWeek,
      startTime,
      endTime,
      notes: notes || '',
      weekStart: weekStart || null
    };
    await query(
      `INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time, notes, week_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [shift.id, employeeId, dayOfWeek, startTime, endTime, notes || '', weekStart || null]
    );
    res.json(shift);
  }));

  // ----- Duplicate a shift with conflict detection -----
  app.post('/api/shifts/duplicate', requireOffice, wrapAsync(async (req, res) => {
    const { sourceShiftId, targetDayOfWeek, targetWeekStart, startTime, endTime, replaceConflicts } = req.body;

    // Fetch source shift
    const source = await query('SELECT * FROM shifts WHERE id = $1', [sourceShiftId]);
    if (!source.rowCount) return res.status(404).json({ error: 'Source shift not found' });
    const src = source.rows[0];

    // Use provided values or fallback to source
    const newStart = startTime || src.start_time;
    const newEnd = endTime || src.end_time;
    const newDow = targetDayOfWeek !== undefined ? Number(targetDayOfWeek) : src.day_of_week;
    const newWeek = targetWeekStart !== undefined ? targetWeekStart : src.week_start;

    // Validate dayOfWeek
    if (!Number.isInteger(newDow) || newDow < 0 || newDow > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0-6 (Mon-Sun)' });
    }
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
    const opDays = String(opDaysStr).split(',').map(Number);
    if (!opDays.includes(newDow)) {
      return res.status(400).json({ error: 'Shifts can only be created on operating days' });
    }

    // Validate time format
    const timeRe = /^\d{2}:\d{2}$/;
    if (!timeRe.test(newStart)) return res.status(400).json({ error: 'startTime must be HH:MM format' });
    if (!timeRe.test(newEnd)) return res.status(400).json({ error: 'endTime must be HH:MM format' });

    // Check for overlapping shifts on target day for same driver
    const overlaps = await query(
      `SELECT id, start_time AS "startTime", end_time AS "endTime"
       FROM shifts
       WHERE employee_id = $1 AND day_of_week = $2
       AND (week_start IS NOT DISTINCT FROM $3)
       AND start_time < $4 AND end_time > $5`,
      [src.employee_id, newDow, newWeek || null, newEnd, newStart]
    );

    if (overlaps.rows.length > 0 && !replaceConflicts) {
      return res.json({ conflict: true, existingShifts: overlaps.rows });
    }

    // Delete conflicting shifts if replacing
    if (overlaps.rows.length > 0 && replaceConflicts) {
      for (const ov of overlaps.rows) {
        await query('DELETE FROM shifts WHERE id = $1', [ov.id]);
      }
    }

    // Create the duplicated shift
    const newId = generateId('shift');
    await query(
      `INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time, notes, week_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newId, src.employee_id, newDow, newStart, newEnd, src.notes || '', newWeek || null]
    );

    res.json({
      id: newId,
      employeeId: src.employee_id,
      dayOfWeek: newDow,
      startTime: newStart,
      endTime: newEnd,
      notes: src.notes || '',
      weekStart: newWeek,
    });
  }));

  app.delete('/api/shifts/:id', requireOffice, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const result = await query(`DELETE FROM shifts WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Shift not found' });
    res.json({ id });
  }));

  app.put('/api/shifts/:id', requireOffice, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { employeeId, dayOfWeek, startTime, endTime, notes, weekStart } = req.body;

    // Validate dayOfWeek if provided
    if (dayOfWeek !== undefined) {
      const dow = Number(dayOfWeek);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return res.status(400).json({ error: 'dayOfWeek must be 0-6 (Mon-Sun)' });
      }
      const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
      const opDays = String(opDaysStr).split(',').map(Number);
      if (!opDays.includes(dow)) {
        return res.status(400).json({ error: 'Shifts can only be created on operating days' });
      }
    }

    // Validate time format if provided
    const timeRe = /^\d{2}:\d{2}$/;
    if (startTime !== undefined && !timeRe.test(startTime)) {
      return res.status(400).json({ error: 'startTime must be HH:MM format' });
    }
    if (endTime !== undefined && !timeRe.test(endTime)) {
      return res.status(400).json({ error: 'endTime must be HH:MM format' });
    }

    // Validate employeeId exists as a driver if provided
    if (employeeId !== undefined) {
      const emp = await query(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND deleted_at IS NULL`, [employeeId]);
      if (!emp.rowCount) {
        return res.status(400).json({ error: 'Employee not found or not a driver' });
      }
    }

    // Check shift exists and get current values for overlap check
    const existing = await query(`SELECT * FROM shifts WHERE id = $1`, [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    const cur = existing.rows[0];

    // Check for overlapping shifts (using new values or current values as fallback)
    const checkEmpId = employeeId !== undefined ? employeeId : cur.employee_id;
    const checkDow = dayOfWeek !== undefined ? dayOfWeek : cur.day_of_week;
    const checkStart = startTime !== undefined ? startTime : cur.start_time;
    const checkEnd = endTime !== undefined ? endTime : cur.end_time;
    const checkWeek = weekStart !== undefined ? weekStart : cur.week_start;
    const overlaps = await query(
      `SELECT id FROM shifts
       WHERE employee_id = $1 AND day_of_week = $2
       AND (week_start IS NOT DISTINCT FROM $3)
       AND start_time < $4 AND end_time > $5
       AND id != $6`,
      [checkEmpId, checkDow, checkWeek || null, checkEnd, checkStart, id]
    );
    if (overlaps.rows.length > 0) {
      return res.status(409).json({ error: 'This shift overlaps with an existing shift for this driver.' });
    }

    const result = await query(
      `UPDATE shifts
       SET employee_id  = COALESCE($2, employee_id),
           day_of_week  = COALESCE($3, day_of_week),
           start_time   = COALESCE($4, start_time),
           end_time     = COALESCE($5, end_time),
           notes        = COALESCE($6, notes),
           week_start   = COALESCE($7, week_start)
       WHERE id = $1
       RETURNING id, employee_id AS "employeeId", day_of_week AS "dayOfWeek",
                 start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"`,
      [id, employeeId !== undefined ? employeeId : null, dayOfWeek !== undefined ? dayOfWeek : null, startTime !== undefined ? startTime : null, endTime !== undefined ? endTime : null, notes !== undefined ? notes : null, weekStart !== undefined ? weekStart : null]
    );

    res.json(result.rows[0]);
  }));
};
