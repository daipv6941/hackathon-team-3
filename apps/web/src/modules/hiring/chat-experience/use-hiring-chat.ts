'use client';

import { useContext } from 'react';
import { HiringContext } from './hiring-context';

export function useHiringChat() {
  const context = useContext(HiringContext);
  if (!context) {
    throw new Error('useHiringChat must be used within HiringProvider');
  }
  return context;
}
