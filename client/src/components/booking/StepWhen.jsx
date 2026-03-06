import { useMemo } from 'react';
import DateChips from './DateChips';
import { formatServiceHoursText } from '../../utils/formatters';

export default function StepWhen({ data, onChange, onNext, onBack, opsConfig }) {
  const serviceHoursText = useMemo(() => {
    return opsConfig ? formatServiceHoursText(opsConfig) : 'Mon\u2013Fri, 8:00 AM \u2013 7:00 PM';
  }, [opsConfig]);

  const timeMin = opsConfig?.service_hours_start || '08:00';
  const timeMax = opsConfig?.service_hours_end || '19:00';
  const canProceed = data.date && data.time;

  return (
    <div className="step active" id="step-2">
      <button className="step-back" id="step2-back" onClick={onBack}>
        <i className="ti ti-arrow-left" /> Back
      </button>
      <h3 className="text-16 fw-700" style={{ margin: '0 0 4px' }}>When do you need a ride?</h3>
      <p className="text-muted text-sm mb-16">{serviceHoursText}</p>
      <label className="ro-label">Date</label>
      <DateChips
        opsConfig={opsConfig}
        selectedDate={data.date}
        onSelect={date => onChange({ ...data, date })}
      />
      <div className="mb-16">
        <label className="ro-label">Time</label>
        <input
          type="time"
          id="ride-time"
          className="ro-input"
          min={timeMin}
          max={timeMax}
          value={data.time}
          onChange={e => onChange({ ...data, time: e.target.value })}
        />
      </div>
      <button
        className="ro-btn ro-btn--primary ro-btn--full"
        id="step2-next"
        disabled={!canProceed}
        onClick={onNext}
      >
        NEXT <i className="ti ti-arrow-right" />
      </button>
    </div>
  );
}
