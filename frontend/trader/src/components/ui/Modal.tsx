'use client';

import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Modal({ open, onClose, title, children, width = 'md', className }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn(
        'relative w-full bg-bg-tertiary border border-border-primary rounded-lg shadow-modal animate-fade-in',
        widths[width],
        className,
      )}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
            <h3 className="text-md font-semibold text-text-primary">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 text-text-tertiary hover:text-text-primary transition-fast rounded-sm hover:bg-bg-hover"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
