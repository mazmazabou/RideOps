import { useState, useCallback, useRef } from 'react';
import { useToast } from '../../../../contexts/ToastContext';
import { WIDGET_REGISTRY, WIDGET_LAYOUT_VERSION } from '../constants.js';

/**
 * Build the localStorage key for a user's widget layout on a given tab.
 */
function getStorageKey(storagePrefix, userId) {
  return 'rideops_widget_layout_' + storagePrefix + '_' + (userId || 'default');
}

/**
 * Build the localStorage key for a user's custom default layout on a given tab.
 */
function getCustomDefaultKey(storagePrefix, userId) {
  return 'rideops_widget_custom_default_' + storagePrefix + '_' + (userId || 'default');
}

/**
 * Read and validate a saved layout from localStorage.
 * Returns the array of widget items, or null if nothing valid is stored.
 */
function readLayout(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (!saved || saved.version !== WIDGET_LAYOUT_VERSION || !Array.isArray(saved.widgets)) {
      return null;
    }

    // Filter out widgets that no longer exist in the registry
    const widgets = saved.widgets.filter((w) => WIDGET_REGISTRY[w.id]);

    // Clamp saved dimensions to current registry constraints
    for (const w of widgets) {
      const def = WIDGET_REGISTRY[w.id];
      if (!def) continue;
      if (typeof def.minW === 'number' && w.w < def.minW) w.w = def.minW;
      if (typeof def.maxW === 'number' && w.w > def.maxW) w.w = def.maxW;
      if (typeof def.minH === 'number' && w.h < def.minH) w.h = def.minH;
      if (typeof def.maxH === 'number' && w.h > def.maxH) w.h = def.maxH;
    }

    return widgets;
  } catch {
    return null;
  }
}

/**
 * Write a layout array to localStorage under the given key.
 */
function writeLayout(storageKey, items) {
  try {
    const widgets = items.map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    localStorage.setItem(storageKey, JSON.stringify({
      version: WIDGET_LAYOUT_VERSION,
      widgets,
    }));
  } catch (e) {
    console.warn('Failed to save widget layout:', e);
  }
}

/**
 * useWidgetLayout -- manages layout persistence for a GridStack analytics tab.
 *
 * @param {object} tabConfig - { storagePrefix, defaultLayout, allowedWidgets }
 * @param {string} userId    - current user ID (or 'default')
 * @returns {{ layout, setLayout, saveLayout, loadCustomDefault, saveCustomDefault, resetLayout }}
 */
export function useWidgetLayout(tabConfig, userId) {
  const { storagePrefix, defaultLayout, allowedWidgets } = tabConfig;
  const storageKey = getStorageKey(storagePrefix, userId);
  const customDefaultKeyVal = getCustomDefaultKey(storagePrefix, userId);
  const { showToast } = useToast();

  // Lazy initializer: load from localStorage or fall back to built-in default
  const [layout, setLayout] = useState(() => {
    let items = readLayout(storageKey);
    if (!items) {
      items = JSON.parse(JSON.stringify(defaultLayout));
    }
    // Filter to only allowed widgets for this tab
    if (allowedWidgets) {
      const allowed = new Set(allowedWidgets);
      items = items.filter((w) => allowed.has(w.id));
    }
    return items;
  });

  // Keep a ref to the latest layout so callbacks always see current state
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  /**
   * Save the given items (from GridStack) to localStorage and update state.
   */
  const saveLayout = useCallback((items) => {
    const normalized = items.map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    writeLayout(storageKey, normalized);
    setLayout(normalized);
  }, [storageKey]);

  /**
   * Load the user's custom default layout (or null if none saved).
   */
  const loadCustomDefault = useCallback(() => {
    return readLayout(customDefaultKeyVal);
  }, [customDefaultKeyVal]);

  /**
   * Save the current layout as the user's custom default for this tab.
   */
  const saveCustomDefault = useCallback(() => {
    writeLayout(customDefaultKeyVal, layoutRef.current);
    showToast('Default layout saved', 'success');
  }, [customDefaultKeyVal, showToast]);

  /**
   * Reset the layout: prefer user's custom default, otherwise built-in default.
   * Saves the result to localStorage and updates state.
   */
  const resetLayout = useCallback(() => {
    const customDefault = readLayout(customDefaultKeyVal);
    const target = customDefault || JSON.parse(JSON.stringify(defaultLayout));

    let items = target;
    if (allowedWidgets) {
      const allowed = new Set(allowedWidgets);
      items = items.filter((w) => allowed.has(w.id));
    }

    writeLayout(storageKey, items);
    setLayout(items);
    showToast('Layout reset', 'success');
  }, [customDefaultKeyVal, defaultLayout, allowedWidgets, storageKey, showToast]);

  return {
    layout,
    setLayout,
    saveLayout,
    loadCustomDefault,
    saveCustomDefault,
    resetLayout,
  };
}
