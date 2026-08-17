import { createContext, useContext, useState, useEffect } from 'react';
import { fetchTenantConfig } from '../api';
import { getCampusSlug, hexToRgb, shadeHex } from '../utils/campus';
import { setDisplayTimeZone } from '../utils/tz';

const TenantContext = createContext(null);

export function TenantProvider({ children, roleLabel = 'Rider' }) {
  const [tenantConfig, setTenantConfig] = useState(null);
  const campusSlug = getCampusSlug();

  useEffect(() => {
    fetchTenantConfig().then(config => {
      applyTheme(config, roleLabel);
      setDisplayTimeZone(config.timezone);
      setTenantConfig(config);
    }).catch(() => {});
  }, [roleLabel]);

  return (
    <TenantContext.Provider value={{ tenantConfig, campusSlug }}>
      {children}
    </TenantContext.Provider>
  );
}

function applyTheme(config, roleLabel) {
  const root = document.documentElement;

  if (config.primaryColor) {
    root.style.setProperty('--color-primary', config.primaryColor);
    root.style.setProperty('--color-primary-rgb', hexToRgb(config.primaryColor));
    root.style.setProperty('--color-primary-dark', shadeHex(config.primaryColor, -25));
    root.style.setProperty('--color-primary-light', shadeHex(config.primaryColor, 80));
    root.style.setProperty('--color-primary-subtle', shadeHex(config.primaryColor, 120));
  }
  if (config.secondaryColor) {
    root.style.setProperty('--color-accent', config.secondaryColor);
    root.style.setProperty('--color-accent-dark', shadeHex(config.secondaryColor, -20));
    root.style.setProperty('--color-secondary', config.secondaryColor);
    root.style.setProperty('--color-secondary-rgb', hexToRgb(config.secondaryColor));
  }
  if (config.secondaryTextColor) {
    root.style.setProperty('--color-secondary-text', config.secondaryTextColor);
  }

  const headerBg = config.headerBg || '#EEF3F8';
  root.style.setProperty('--color-header-bg', headerBg);

  if (config.sidebarBg) root.style.setProperty('--color-sidebar-bg', config.sidebarBg);
  if (config.sidebarText) root.style.setProperty('--color-sidebar-text', config.sidebarText);
  if (config.sidebarActiveBg) root.style.setProperty('--color-sidebar-active-bg', config.sidebarActiveBg);
  if (config.sidebarHover) root.style.setProperty('--color-sidebar-hover', config.sidebarHover);
  if (config.sidebarBorder) root.style.setProperty('--color-sidebar-border', config.sidebarBorder);
  if (config.primaryColor) root.style.setProperty('--color-sidebar-active', config.primaryColor);

  if (config.orgShortName) {
    document.title = config.orgShortName + ' ' + roleLabel;
  }
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
