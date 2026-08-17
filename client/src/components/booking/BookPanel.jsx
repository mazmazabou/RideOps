import { useState, useMemo } from 'react';
import StepIndicator from './StepIndicator';
import StepWhere from './StepWhere';
import StepWhen from './StepWhen';
import StepConfirm from './StepConfirm';
import { useOpsConfig } from '../../hooks/useOpsConfig';
import { campusTimeParts, windowForOurDay } from '../../utils/tz';

export default function BookPanel({ onSubmitSuccess }) {
  const { opsConfig } = useOpsConfig();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    pickup: '',
    dropoff: '',
    date: null,
    time: '',
  });

  // Set default time based on service hours (campus clock, per-day + overnight-aware)
  useMemo(() => {
    if (!opsConfig || formData.time) return;
    const todayOurDay = (campusTimeParts().dow + 6) % 7;
    const w = windowForOurDay(todayOurDay);
    const svcStart = String(w?.start || opsConfig.service_hours_start || '08:00').split(':').map(Number);
    const svcEnd = String(w?.end || opsConfig.service_hours_end || '19:00').split(':').map(Number);
    const overnight = (svcEnd[0] * 60 + (svcEnd[1] || 0)) < (svcStart[0] * 60 + (svcStart[1] || 0));
    const now = campusTimeParts();
    let h = now.h;
    let m = now.min;
    m = m > 30 ? 0 : 30;
    if (m === 0) h = (h + 1) % 24;
    if (overnight) {
      // Inside the window (>= start, or in the early-morning tail) keep the
      // rounded now; otherwise default to opening time.
      const inWindow = h >= svcStart[0] || h <= svcEnd[0];
      if (!inWindow) h = svcStart[0];
    } else {
      if (h < svcStart[0]) h = svcStart[0];
      if (h >= svcEnd[0]) h = svcStart[0];
    }
    const defaultTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    setFormData(prev => ({ ...prev, time: defaultTime }));
  }, [opsConfig]);

  const handleSuccess = () => {
    setFormData({ pickup: '', dropoff: '', date: null, time: '' });
    setCurrentStep(1);
    onSubmitSuccess();
  };

  return (
    <>
      <StepIndicator currentStep={currentStep} />
      {currentStep === 1 && (
        <StepWhere
          data={formData}
          onChange={setFormData}
          onNext={() => setCurrentStep(2)}
          serviceScopeText={opsConfig?.serviceScopeText}
        />
      )}
      {currentStep === 2 && (
        <StepWhen
          data={formData}
          onChange={setFormData}
          onNext={() => setCurrentStep(3)}
          onBack={() => setCurrentStep(1)}
          opsConfig={opsConfig}
        />
      )}
      {currentStep === 3 && (
        <StepConfirm
          data={formData}
          onBack={() => setCurrentStep(2)}
          onSuccess={handleSuccess}
          opsConfig={opsConfig}
        />
      )}
    </>
  );
}
