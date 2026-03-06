import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import {
  fetchShiftsForWeek, createShift, updateShift, deleteShift, duplicateShift, checkShiftConflict,
} from '../../../api';
import { getCampusPalette, getCampusSlug } from '../../../utils/campus';
import {
  jsDateToOurDay, ourDayToFCDay, contrastTextColor, formatTimeAmPm, ourDayLabel,
} from '../../../utils/formatters';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function buildDriverColorMap(employees) {
  const palette = getCampusPalette(getCampusSlug());
  const driverIds = employees.filter(e => e.id).map(e => e.id).sort();
  const map = {};
  driverIds.forEach((id, i) => {
    map[id] = palette[i % palette.length];
  });
  return map;
}

function mapShiftsToCalEvents(shiftList, viewStart, employees, colorMap) {
  const monday = getMondayOfWeek(viewStart || new Date());
  return shiftList.map(s => {
    const emp = employees.find(e => e.id === s.employeeId);
    const name = emp?.name || 'Unknown';
    const color = colorMap[s.employeeId] || '#94A3B8';
    const eventDate = new Date(monday);
    eventDate.setDate(monday.getDate() + s.dayOfWeek);
    const dateStr = formatDateLocal(eventDate);
    return {
      id: s.id,
      title: name,
      start: dateStr + 'T' + s.startTime,
      end: dateStr + 'T' + s.endTime,
      backgroundColor: color,
      borderColor: color,
      textColor: contrastTextColor(color),
      extendedProps: {
        shiftId: s.id,
        employeeId: s.employeeId,
        notes: s.notes || '',
        weekStart: s.weekStart || null,
      },
    };
  });
}

export default function ShiftCalendar({ employees, opsConfig }) {
  const { showToast } = useToast();
  const { showModal } = useModal();
  const calendarElRef = useRef(null);
  const calendarRef = useRef(null);
  const employeesRef = useRef(employees);
  const opsConfigRef = useRef(opsConfig);

  // Popover state
  const [popover, setPopover] = useState(null);
  // Context menu state
  const [ctxMenu, setCtxMenu] = useState(null);
  // Employee picker state
  const [empPicker, setEmpPicker] = useState(null);
  // Duplicate modal state
  const [dupModal, setDupModal] = useState(null);

  // Keep refs fresh
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { opsConfigRef.current = opsConfig; }, [opsConfig]);

  // Legend state
  const [legend, setLegend] = useState([]);

  const updateLegend = useCallback(() => {
    const colorMap = buildDriverColorMap(employeesRef.current);
    const drivers = employeesRef.current
      .filter(e => e.id && colorMap[e.id])
      .sort((a, b) => a.id.localeCompare(b.id));
    setLegend(drivers.map(d => ({ id: d.id, name: d.name, color: colorMap[d.id] })));
  }, []);

  const refetchEvents = useCallback(() => {
    if (calendarRef.current) calendarRef.current.refetchEvents();
    updateLegend();
  }, [updateLegend]);

  // -- Calendar select: drag-to-create shift --
  const handleSelect = useCallback((info) => {
    const cfg = opsConfigRef.current || {};
    const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
    const dayOfWeek = jsDateToOurDay(info.start.getDay());
    if (!opDays.includes(dayOfWeek)) return;

    const startTime = info.start.toTimeString().substring(0, 8);
    const endTime = info.end.toTimeString().substring(0, 8);
    const weekStart = formatDateLocal(getMondayOfWeek(info.start));

    setEmpPicker({ dayOfWeek, startTime, endTime, weekStart });
    if (calendarRef.current) calendarRef.current.unselect();
  }, []);

  // -- Calendar event click: show popover --
  const handleEventClick = useCallback((info) => {
    setCtxMenu(null);
    const ev = info.event;
    const rect = info.el.getBoundingClientRect();
    setPopover({
      shiftId: ev.extendedProps.shiftId,
      employeeId: ev.extendedProps.employeeId,
      empName: ev.title,
      dayOfWeek: jsDateToOurDay(ev.start.getDay()),
      startTime: ev.start.toTimeString().substring(0, 5),
      endTime: ev.end.toTimeString().substring(0, 5),
      notes: ev.extendedProps.notes || '',
      weekStart: ev.extendedProps.weekStart,
      rect,
      eventEl: info.el,
    });
  }, []);

  // -- Event drop (drag to move) --
  const handleEventDrop = useCallback(async (info) => {
    const shiftId = info.event.extendedProps.shiftId;
    const dayOfWeek = jsDateToOurDay(info.event.start.getDay());
    const cfg = opsConfigRef.current || {};
    const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
    if (!opDays.includes(dayOfWeek)) {
      info.revert();
      showToast('Shifts must be on operating days', 'error');
      return;
    }
    const startTime = info.event.start.toTimeString().substring(0, 5);
    const endTime = info.event.end.toTimeString().substring(0, 5);
    const weekStart = formatDateLocal(getMondayOfWeek(info.event.start));
    try {
      await updateShift(shiftId, { dayOfWeek, startTime, endTime, weekStart });
      showToast('Shift moved', 'success');
      refetchEvents();
    } catch (err) {
      info.revert();
      showToast(err.message || 'Failed to move shift', 'error');
    }
  }, [showToast, refetchEvents]);

  // -- Event resize --
  const handleEventResize = useCallback(async (info) => {
    const shiftId = info.event.extendedProps.shiftId;
    const endTime = info.event.end.toTimeString().substring(0, 5);
    try {
      await updateShift(shiftId, { endTime });
      showToast('Shift updated', 'success');
      refetchEvents();
    } catch (err) {
      info.revert();
      showToast(err.message || 'Failed to resize shift', 'error');
    }
  }, [showToast, refetchEvents]);

  // -- Right-click context menu --
  const handleEventDidMount = useCallback((info) => {
    info.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setPopover(null);
      const ev = info.event;
      setCtxMenu({
        shiftId: ev.extendedProps.shiftId,
        employeeId: ev.extendedProps.employeeId,
        empName: ev.title,
        dayOfWeek: jsDateToOurDay(ev.start.getDay()),
        startTime: ev.start.toTimeString().substring(0, 5),
        endTime: ev.end.toTimeString().substring(0, 5),
        notes: ev.extendedProps.notes || '',
        weekStart: ev.extendedProps.weekStart,
        x: e.clientX,
        y: e.clientY,
        rect: info.el.getBoundingClientRect(),
        eventEl: info.el,
      });
    });
  }, []);

  // Init FullCalendar
  useEffect(() => {
    if (!calendarElRef.current || !window.FullCalendar) return;
    if (calendarRef.current) return; // already initialized

    const cfg = opsConfigRef.current || {};
    const opDays = String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number);
    const hiddenDays = [];
    for (let d = 0; d < 7; d++) {
      if (!opDays.includes(d)) hiddenDays.push(ourDayToFCDay(d));
    }
    const [startH] = String(cfg.service_hours_start || '08:00').split(':').map(Number);
    const [endH] = String(cfg.service_hours_end || '19:00').split(':').map(Number);
    const slotMin = String(Math.max(0, startH - 1)).padStart(2, '0') + ':00:00';
    const slotMax = String(Math.min(24, endH + 1)).padStart(2, '0') + ':00:00';

    const emps = employeesRef.current;
    const colorMap = buildDriverColorMap(emps);

    const cal = new window.FullCalendar.Calendar(calendarElRef.current, {
      initialView: 'timeGridWeek',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
      slotMinTime: slotMin,
      slotMaxTime: slotMax,
      allDaySlot: false,
      hiddenDays,
      height: 'auto',
      nowIndicator: true,
      events: async (fetchInfo, successCallback) => {
        try {
          const weekStart = formatDateLocal(getMondayOfWeek(fetchInfo.start));
          const shifts = await fetchShiftsForWeek(weekStart);
          successCallback(mapShiftsToCalEvents(shifts, fetchInfo.start, employeesRef.current, buildDriverColorMap(employeesRef.current)));
        } catch {
          successCallback([]);
        }
      },
      selectable: true,
      selectMirror: true,
      editable: true,
      eventStartEditable: true,
      eventDurationEditable: true,
      select: handleSelect,
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventDidMount: handleEventDidMount,
      eventsSet: () => updateLegend(),
    });
    calendarRef.current = cal;
    cal.render();
    updateLegend();

    return () => {
      cal.destroy();
      calendarRef.current = null;
    };
    // Only init once — handlers use refs for fresh data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update calendar options when opsConfig changes
  useEffect(() => {
    const cal = calendarRef.current;
    if (!cal || !opsConfig) return;
    const opDays = String(opsConfig.operating_days || '0,1,2,3,4').split(',').map(Number);
    const hiddenDays = [];
    for (let d = 0; d < 7; d++) {
      if (!opDays.includes(d)) hiddenDays.push(ourDayToFCDay(d));
    }
    const [startH] = String(opsConfig.service_hours_start || '08:00').split(':').map(Number);
    const [endH] = String(opsConfig.service_hours_end || '19:00').split(':').map(Number);
    const slotMin = String(Math.max(0, startH - 1)).padStart(2, '0') + ':00:00';
    const slotMax = String(Math.min(24, endH + 1)).padStart(2, '0') + ':00:00';
    cal.setOption('slotMinTime', slotMin);
    cal.setOption('slotMaxTime', slotMax);
    cal.setOption('hiddenDays', hiddenDays);
  }, [opsConfig]);

  // Refetch when employees change (color map changes)
  useEffect(() => {
    if (calendarRef.current && employees.length) {
      calendarRef.current.refetchEvents();
      updateLegend();
    }
  }, [employees, updateLegend]);

  // -- Popover actions --
  async function handlePopoverDelete() {
    const { shiftId, empName, dayOfWeek } = popover;
    setPopover(null);
    const confirmed = await showModal({
      title: 'Delete Shift',
      message: 'Delete ' + empName + "'s shift on " + DAY_NAMES[dayOfWeek] + '?',
      confirmLabel: 'Delete',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShift(shiftId);
      showToast('Shift deleted', 'success');
      refetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to delete shift', 'error');
    }
  }

  async function handlePopoverSave(newNotes) {
    try {
      await updateShift(popover.shiftId, { notes: newNotes });
      setPopover(null);
      showToast('Notes saved', 'success');
      refetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to save notes', 'error');
    }
  }

  // -- Context menu actions --
  function handleCtxDuplicate() {
    const data = ctxMenu;
    setCtxMenu(null);
    setDupModal({
      shiftId: data.shiftId,
      employeeId: data.employeeId,
      empName: data.empName,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      notes: data.notes,
      weekStart: data.weekStart,
    });
  }

  function handleCtxEdit() {
    const data = ctxMenu;
    setCtxMenu(null);
    setPopover({
      shiftId: data.shiftId,
      employeeId: data.employeeId,
      empName: data.empName,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      notes: data.notes,
      weekStart: data.weekStart,
      rect: data.rect,
      eventEl: data.eventEl,
    });
  }

  async function handleCtxDelete() {
    const { shiftId, empName, dayOfWeek } = ctxMenu;
    setCtxMenu(null);
    const confirmed = await showModal({
      title: 'Delete Shift',
      message: 'Delete ' + empName + "'s shift on " + DAY_NAMES[dayOfWeek] + '?',
      confirmLabel: 'Delete',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShift(shiftId);
      showToast('Shift deleted', 'success');
      refetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to delete shift', 'error');
    }
  }

  // -- Employee picker: confirm to create shift --
  async function handleEmpPickerConfirm(empId) {
    const { dayOfWeek, startTime, endTime, weekStart } = empPicker;
    setEmpPicker(null);
    try {
      await createShift({ employeeId: empId, dayOfWeek, startTime, endTime, weekStart });
      showToast('Shift added', 'success');
      refetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to add shift', 'error');
    }
  }

  // Close popover / context menu on outside click
  useEffect(() => {
    if (!popover && !ctxMenu) return;
    function handleDown(e) {
      if (popover) {
        const pop = document.querySelector('.shift-popover');
        if (pop && !pop.contains(e.target)) setPopover(null);
      }
      if (ctxMenu) {
        const menu = document.querySelector('.shift-context-menu');
        if (menu && !menu.contains(e.target)) setCtxMenu(null);
      }
    }
    function handleEsc(e) {
      if (e.key === 'Escape') { setPopover(null); setCtxMenu(null); }
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handleDown);
      document.addEventListener('keydown', handleEsc);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [popover, ctxMenu]);

  return (
    <div>
      <div ref={calendarElRef} />

      {/* Legend */}
      <div className="shift-calendar-legend">
        {legend.map(d => (
          <span key={d.id} className="shift-legend__item">
            <span className="shift-legend__dot" style={{ background: d.color }} />
            {d.name}
          </span>
        ))}
      </div>

      {/* Shift Popover */}
      {popover && <ShiftPopover
        data={popover}
        onDelete={handlePopoverDelete}
        onSave={handlePopoverSave}
        onClose={() => setPopover(null)}
      />}

      {/* Context Menu */}
      {ctxMenu && <ShiftContextMenu
        data={ctxMenu}
        onDuplicate={handleCtxDuplicate}
        onEdit={handleCtxEdit}
        onDelete={handleCtxDelete}
        onClose={() => setCtxMenu(null)}
      />}

      {/* Duplicate Shift Modal */}
      {dupModal && <DuplicateShiftModal
        data={dupModal}
        opsConfig={opsConfig}
        onSuccess={() => {
          setDupModal(null);
          showToast('Shift duplicated', 'success');
          refetchEvents();
        }}
        onCancel={() => setDupModal(null)}
        showToast={showToast}
      />}

      {/* Employee Picker Modal */}
      {empPicker && <EmployeePickerModal
        employees={employees}
        onConfirm={handleEmpPickerConfirm}
        onCancel={() => setEmpPicker(null)}
      />}
    </div>
  );
}

// -- Popover subcomponent --
function ShiftPopover({ data, onDelete, onSave, onClose }) {
  const [notes, setNotes] = useState(data.notes);

  // Position: below the event element, clamped to viewport
  const style = {};
  if (data.rect) {
    let top = data.rect.bottom + 4;
    let left = data.rect.left;
    if (top + 300 > window.innerHeight) top = Math.max(8, data.rect.top - 304);
    if (left + 300 > window.innerWidth) left = window.innerWidth - 308;
    if (left < 8) left = 8;
    style.top = top;
    style.left = left;
  }

  return createPortal(
    <div className="shift-popover" style={style}>
      <div className="shift-popover__header">
        <h4 className="shift-popover__title">{data.empName}</h4>
        <button className="shift-popover__close" title="Close" onClick={onClose}>
          <i className="ti ti-x" />
        </button>
      </div>
      <div className="shift-popover__body">
        <div className="shift-popover__row">
          <i className="ti ti-calendar" /> {DAY_NAMES[data.dayOfWeek] || ''}
        </div>
        <div className="shift-popover__row">
          <i className="ti ti-clock" /> {formatTimeAmPm(data.startTime)} {'\u2013'} {formatTimeAmPm(data.endTime)}
        </div>
        <div className="shift-popover__notes-label">Notes</div>
        <textarea
          className="shift-popover__notes"
          placeholder="Add shift notes..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
      <div className="shift-popover__footer">
        <button className="shift-popover__btn shift-popover__btn--danger" onClick={onDelete}>
          <i className="ti ti-trash" /> Delete
        </button>
        <button className="shift-popover__btn shift-popover__btn--primary" onClick={() => onSave(notes)}>
          Save Notes
        </button>
      </div>
    </div>,
    document.body,
  );
}

// -- Context Menu subcomponent --
function ShiftContextMenu({ data, onDuplicate, onEdit, onDelete, onClose }) {
  const menuRef = useRef(null);

  // Position at mouse, clamped
  const style = { position: 'fixed' };
  let left = data.x, top = data.y;
  // Will adjust after mount if needed
  style.left = left;
  style.top = top;

  useEffect(() => {
    if (!menuRef.current) return;
    const mw = menuRef.current.offsetWidth;
    const mh = menuRef.current.offsetHeight;
    let l = data.x, t = data.y;
    if (l + mw > window.innerWidth - 8) l = window.innerWidth - mw - 8;
    if (t + mh > window.innerHeight - 8) t = window.innerHeight - mh - 8;
    if (l < 8) l = 8;
    if (t < 8) t = 8;
    menuRef.current.style.left = l + 'px';
    menuRef.current.style.top = t + 'px';
  }, [data.x, data.y]);

  return createPortal(
    <div ref={menuRef} className="shift-context-menu" style={style}>
      <button className="shift-context-menu__item" onClick={onDuplicate}>
        <i className="ti ti-copy" /> Duplicate
      </button>
      <button className="shift-context-menu__item" onClick={onEdit}>
        <i className="ti ti-pencil" /> Edit Details
      </button>
      <button className="shift-context-menu__item shift-context-menu__item--danger" onClick={onDelete}>
        <i className="ti ti-trash" /> Delete
      </button>
    </div>,
    document.body,
  );
}

// -- Duplicate Shift Modal --
function DuplicateShiftModal({ data, opsConfig, onSuccess, onCancel, showToast }) {
  const cfg = opsConfig || {};
  const opDays = useMemo(
    () => String(cfg.operating_days || '0,1,2,3,4').split(',').map(Number),
    [cfg.operating_days]
  );

  // Compute the source shift's actual date for default target calculation
  const srcMonday = data.weekStart ? new Date(data.weekStart + 'T00:00:00') : getMondayOfWeek(new Date());
  const srcDate = new Date(srcMonday);
  srcDate.setDate(srcMonday.getDate() + data.dayOfWeek);

  // Default target: next operating day after source
  function nextOpDay() {
    const d = new Date(srcDate);
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      if (opDays.includes(dow)) return formatDateLocal(d);
    }
    return formatDateLocal(srcDate);
  }

  const [targetDate, setTargetDate] = useState(nextOpDay);
  const [startTime, setStartTime] = useState(data.startTime);
  const [endTime, setEndTime] = useState(data.endTime);
  const [conflict, setConflict] = useState(null);
  const [loading, setLoading] = useState(false);

  // Compute target dayOfWeek and weekStart from the chosen date
  function targetFields() {
    const d = new Date(targetDate + 'T00:00:00');
    const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const weekStart = formatDateLocal(getMondayOfWeek(d));
    return { dayOfWeek, weekStart };
  }

  // Proactive conflict check when target date or times change
  useEffect(() => {
    if (!targetDate || !startTime || !endTime) return;
    const d = new Date(targetDate + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
    if (!opDays.includes(dayOfWeek)) { setConflict(null); return; }
    const weekStart = formatDateLocal(getMondayOfWeek(d));

    const timer = setTimeout(async () => {
      try {
        const res = await checkShiftConflict({
          employeeId: data.employeeId,
          dayOfWeek: String(dayOfWeek),
          weekStart,
          startTime,
          endTime,
        });
        setConflict(res.conflicts && res.conflicts.length > 0 ? res.conflicts : null);
      } catch {
        setConflict(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [targetDate, startTime, endTime, data.employeeId, opDays]);

  async function handleSubmit(replace) {
    const { dayOfWeek, weekStart } = targetFields();
    setLoading(true);
    try {
      const result = await duplicateShift({
        sourceShiftId: data.shiftId,
        targetDayOfWeek: dayOfWeek,
        targetWeekStart: weekStart,
        startTime,
        endTime,
        replaceConflicts: !!replace,
      });
      if (result.conflict) {
        setConflict(result.existingShifts);
      } else {
        onSuccess();
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate shift', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Validate: target date must be an operating day
  const tgt = targetFields();
  const isOpDay = opDays.includes(tgt.dayOfWeek);

  return createPortal(
    <div className="ro-modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ro-modal" style={{ maxWidth: 400 }}>
        <div className="ro-modal__title">Duplicate Shift</div>
        <div className="ro-modal__body" style={{ marginBottom: 0 }}>
          {/* Driver name */}
          <div className="dup-modal__field">
            <label className="dup-modal__label">Driver</label>
            <div className="dup-modal__value">
              <i className="ti ti-user" /> {data.empName}
            </div>
          </div>

          {/* Source info */}
          <div className="dup-modal__field">
            <label className="dup-modal__label">Source</label>
            <div className="dup-modal__value dup-modal__value--muted">
              <i className="ti ti-calendar" /> {DAY_NAMES[data.dayOfWeek]}, {formatTimeAmPm(data.startTime)} {'\u2013'} {formatTimeAmPm(data.endTime)}
            </div>
          </div>

          {/* Target date */}
          <div className="dup-modal__field">
            <label className="dup-modal__label">Target day</label>
            <input
              type="date"
              className="dup-modal__input"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
            />
            {!isOpDay && targetDate && (
              <div className="dup-modal__warning">
                <i className="ti ti-alert-triangle" /> This is not an operating day.
              </div>
            )}
            {isOpDay && conflict && (
              <div className="dup-modal__warning">
                <i className="ti ti-alert-triangle" /> {data.empName} already scheduled this day{conflict.length === 1 ? ` at ${formatTimeAmPm(conflict[0].startTime)}\u2013${formatTimeAmPm(conflict[0].endTime)}` : ` (${conflict.length} shifts)`}.
              </div>
            )}
          </div>

          {/* Time range */}
          <div className="dup-modal__field">
            <label className="dup-modal__label">Time</label>
            <div className="dup-modal__time-row">
              <input
                type="time"
                className="dup-modal__input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
              <span className="dup-modal__time-sep">{'\u2013'}</span>
              <input
                type="time"
                className="dup-modal__input"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ro-modal__actions" style={{ marginTop: 16 }}>
          <button className="ro-btn ro-btn--outline" onClick={onCancel} disabled={loading}>Cancel</button>
          {conflict ? (
            <button className="ro-btn ro-btn--danger" onClick={() => handleSubmit(true)} disabled={loading}>
              {loading ? 'Replacing\u2026' : 'Replace & Duplicate'}
            </button>
          ) : (
            <button className="ro-btn ro-btn--primary" onClick={() => handleSubmit(false)} disabled={loading || !isOpDay}>
              {loading ? 'Duplicating\u2026' : 'Duplicate'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// -- Employee Picker Modal --
function EmployeePickerModal({ employees, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(employees[0]?.id || '');

  return createPortal(
    <div className="ro-modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ro-modal">
        <div className="ro-modal__title">Add Shift</div>
        <div className="ro-modal__body">
          <p className="text-13 text-secondary" style={{ margin: '0 0 12px' }}>
            Select the driver for this shift:
          </p>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="w-full text-13" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
          >
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}{e.active ? ' (Active)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="ro-modal__actions">
          <button className="ro-btn ro-btn--outline" onClick={onCancel}>Cancel</button>
          <button className="ro-btn ro-btn--primary" onClick={() => onConfirm(selected)}>Add Shift</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
