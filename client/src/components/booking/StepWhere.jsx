import { useState } from 'react';
import { useLocations } from '../../hooks/useLocations';
import { useToast } from '../../contexts/ToastContext';
import { useTenant } from '../../contexts/TenantContext';
import AddressInput from './AddressInput';

export default function StepWhere({ data, onChange, onNext, serviceScopeText }) {
  const { locations } = useLocations();
  const { showToast } = useToast();
  const { tenantConfig } = useTenant();
  const [pickupError, setPickupError] = useState(false);
  const [dropoffError, setDropoffError] = useState(false);
  // Address entry is offered when the campus opts in and a Maps key exists;
  // campus-building select stays the default mode.
  const addressEnabled = !!(tenantConfig?.addressAutocomplete && tenantConfig?.mapsApiKey);
  const [pickupMode, setPickupMode] = useState('campus');
  const [dropoffMode, setDropoffMode] = useState('campus');

  const modeToggle = (mode, setMode, field) => (
    <div className="flex gap-4 mb-8">
      {['campus', 'address'].map(m => (
        <button
          key={m}
          type="button"
          className={`filter-pill${mode === m ? ' active' : ''}`}
          data-mode={`${field}-${m}`}
          onClick={() => { setMode(m); onChange({ ...data, [field]: '' }); }}
        >
          {m === 'campus' ? 'Campus building' : 'Street address'}
        </button>
      ))}
    </div>
  );

  const handleNext = () => {
    let valid = true;
    if (!data.pickup) {
      setPickupError(true);
      showToast('Please select a pickup location', 'error');
      valid = false;
    }
    if (!data.dropoff) {
      setDropoffError(true);
      showToast('Please select a dropoff location', 'error');
      valid = false;
    }
    if (valid) onNext();
  };

  return (
    <div className="step active" id="step-1">
      <h3 className="text-16 fw-700" style={{ margin: '0 0 4px' }}>Where are you going?</h3>
      <p className="text-muted text-sm mb-16" id="service-scope-text">{serviceScopeText || 'Campus locations only.'}</p>
      <div className="mb-12">
        <label className="ro-label">From</label>
        {addressEnabled && modeToggle(pickupMode, setPickupMode, 'pickup')}
        {addressEnabled && pickupMode === 'address' ? (
          <AddressInput
            id="pickup-address"
            value={data.pickup}
            hasError={pickupError}
            placeholder="e.g. 414 Clay Ave"
            onChange={v => { onChange({ ...data, pickup: v }); setPickupError(false); }}
          />
        ) : (
          <select
            id="pickup-location"
            className="ro-select"
            value={data.pickup}
            style={pickupError ? { borderColor: 'var(--status-no-show)' } : undefined}
            onChange={e => { onChange({ ...data, pickup: e.target.value }); setPickupError(false); }}
          >
            <option value="">Select pickup</option>
            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
      </div>
      <div className="mb-16">
        <label className="ro-label">To</label>
        {addressEnabled && modeToggle(dropoffMode, setDropoffMode, 'dropoff')}
        {addressEnabled && dropoffMode === 'address' ? (
          <AddressInput
            id="dropoff-address"
            value={data.dropoff}
            hasError={dropoffError}
            placeholder="e.g. Backyard Ale House"
            onChange={v => { onChange({ ...data, dropoff: v }); setDropoffError(false); }}
          />
        ) : (
          <select
            id="dropoff-location"
            className="ro-select"
            value={data.dropoff}
            style={dropoffError ? { borderColor: 'var(--status-no-show)' } : undefined}
            onChange={e => { onChange({ ...data, dropoff: e.target.value }); setDropoffError(false); }}
          >
            <option value="">Select dropoff</option>
            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
      </div>
      <button className="ro-btn ro-btn--primary ro-btn--full" id="step1-next" onClick={handleNext}>
        NEXT <i className="ti ti-arrow-right" />
      </button>
    </div>
  );
}
