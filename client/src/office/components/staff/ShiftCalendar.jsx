import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../../contexts/ToastContext';
import { useModal } from '../../../components/ui/Modal';
import {
  fetchShiftsForWeek, createShift, updateShift, deleteShift,
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
  async function handleCtxDuplicate() {
    const { employeeId, dayOfWeek, startTime, endTime, notes, weekStart } = ctxMenu;
    setCtxMenu(null);
    try {
      await createShift({ employeeId, dayOfWeek, startTime, endTime, notes, weekStart });
      showToast('Shift duplicated', 'success');
      refetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to duplicate shift', 'error');
    }
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
