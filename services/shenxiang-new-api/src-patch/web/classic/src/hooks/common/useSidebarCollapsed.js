/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useState, useCallback } from 'react';

const KEY = 'sidebar_collapsed_preference';
const LEGACY_KEY = 'default_collapse_sidebar';
const DEFAULT_COLLAPSED = true;

const readCollapsedPreference = () => {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
    const legacyStored = localStorage.getItem(LEGACY_KEY);
    if (legacyStored === 'true') return true;
    return DEFAULT_COLLAPSED;
  } catch (error) {
    return DEFAULT_COLLAPSED;
  }
};

const writeCollapsedPreference = (value) => {
  try {
    localStorage.setItem(KEY, value.toString());
  } catch (error) {
    // Ignore storage failures so the sidebar remains usable in restricted contexts.
  }
};

export const useSidebarCollapsed = () => {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPreference(next);
      return next;
    });
  }, []);

  const set = useCallback((value) => {
    const next = Boolean(value);
    setCollapsed(next);
    writeCollapsedPreference(next);
  }, []);

  return [collapsed, toggle, set];
};
