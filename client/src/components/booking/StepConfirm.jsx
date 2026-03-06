import { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { submitRide, createRecurringRides } from '../../api';
import { jsDateToOurDay, ourDayLabel } from '../../utils/formatters';

export default function StepConfirm({ data, onBack, onSuccess, opsConfig }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState(() => {
    if (!data.date) return [];
    const jsDay = new Date(data.date + 'T12:00:00').getDay();
    return [jsDateToOurDay(jsDay)];
  });
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const opDays = useMemo(() => {
    return opsConfig
      ? String(opsConfig.operating_days || '0,1,2,3,4').split(',').map(Number).sort()
      : [0, 1, 2, 3, 4];
  }, [opsConfig]);

  const whenDisplay = useMemo(() => {
    if (!data.date || !data.time) return '';
    const dt = new Date(data.date + 'T' + data.time + ':00');
    return dt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, [data.date, data.time]);

  const toggleDay = (day) => {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const btnLabel = isRecurring ? 'CONFIRM RECURRING REQUEST' : 'CONFIRM REQUEST';
    try {
      if (isRecurring) {
        if (!recurringDays.length) {
          showToast('Select at least one day of the week', 'error');
          setSubmitting(false);
          return;
        }
        if (!endDate) {
          showToast('Select an end date for the recurring rides', 'error');
          setSubmitting(false);
          return;
        }
        const result = await createRecurringRides({
          pickupLocation: data.pickup,
          dropoffLocation: data.dropoff,
          timeOfDay: data.time,
          daysOfWeek: recurringDays,
          startDate: data.date,
          endDate,
          notes,
          riderPhone: user.phone || null,
        });
        showToast(result.createdRides + ' recurring ride' + (result.createdRides !== 1 ? 's' : '') + ' created!', 'success');
      } else {
        const requestedTime = new Date(data.date + 'T' + data.time + ':00').toISOString();
        await submitRide({
          pickupLocation: data.pickup,
          dropoffLocation: data.dropoff,
          requestedTime,
          riderName: user.name,
          notes,
        });
        showToast('Ride requested!', 'success');
      }
      onSuccess();
    } catch (e) {
      showToast(e.message || 'Network error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="step active" id="step-3">
      <button className="step-back" id="step3-back" onClick={onBack}>
        <i className="ti ti-arrow-left" /> Back
      </button>
      <h3 className="text-16 fw-700" style={{ margin: '0 0 12px' }}>Confirm your ride</h3>
      <div className="p-16 mb-16" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
        <div className="confirm-row">
          <span className="confirm-label">From</span>
          <span className="confirm-value" id="confirm-from">{data.pickup}</span>
        </div>
        <div className="confirm-row">
          <span className="confirm-label">To</span>
          <span className="confirm-value" id="confirm-to">{data.dropoff}</span>
        </div>
        <div className="confirm-row">
          <span className="confirm-label">When</span>
          <span className="confirm-value" id="confirm-when">{whenDisplay}</span>
        </div>
      </div>

      <div className="mb-16">
        <label className="ro-label">Notes (optional)</label>
        <textarea
          id="notes"
          className="ro-input"
          rows={3}
          placeholder="Accessibility needs, exact spot, etc."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Recurring ride toggle */}
      <div className="mb-16">
        <label className="flex items-center gap-8 cursor-pointer text-14 fw-600">
          <input
            type="checkbox"
            id="recurring-toggle"
            checked={isRecurring}
            onChange={e => setIsRecurring(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
          />
          <i className="ti ti-repeat text-16" style={{ color: 'var(--color-primary)' }} />
          Make this a recurring ride
        </label>
      </div>

      <div id="recurring-options" className="p-16 mb-16" style={{ display: isRecurring ? 'block' : 'none', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
        <label className="ro-label">
          Repeat on ({opDays.length > 2
            ? ourDayLabel(opDays[0]) + '\u2013' + ourDayLabel(opDays[opDays.length - 1])
            : opDays.map(ourDayLabel).join(', ')})
        </label>
        <div className="flex gap-8 flex-wrap mb-16" id="recurring-days">
          {opDays.map(d => (
            <label key={d} className="flex items-center gap-4 text-13 cursor-pointer">
              <input
                type="checkbox"
                value={d}
                className="recurring-day-cb"
                checked={recurringDays.includes(d)}
                onChange={() => toggleDay(d)}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              {ourDayLabel(d)}
            </label>
          ))}
        </div>
        <label className="ro-label">End date</label>
        <input
          type="date"
          id="recurring-end-date"
          className="ro-input"
          min={data.date}
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
      </div>

      <button
        className="ro-btn ro-btn--primary ro-btn--action ro-btn--full"
        id="confirm-btn"
        disabled={submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting...' : isRecurring ? 'CONFIRM RECURRING REQUEST' : 'CONFIRM REQUEST'}
      </button>
    </div>
  );
}
