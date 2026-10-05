'use client';

import React, { useState } from 'react';
import { Appointment } from '@/types/schema';
import { X, Calendar, User, Phone, MapPin, Wrench, DollarSign } from 'lucide-react';

/**
 * The stored value is an absolute datetime, but an appointment arriving from
 * a call is displayed as friendly text ("Today at 2:00 PM"), which a
 * datetime-local input cannot render. Unparseable text yields an empty input
 * so the user picks a real slot rather than saving a date nobody can act on.
 */
function toDateTimeLocal(value?: string): string {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: Partial<Appointment>) => void;
  initialData?: Partial<Appointment> | null;
  /** View only: the dashboard is read-only after the free trial. */
  readOnly?: boolean;
}

export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  readOnly = false,
}) => {
  const [formData, setFormData] = useState<Partial<Appointment>>({
    customerName: '',
    customerPhone: '',
    service: '',
    dateTime: '',
    address: '',
    notes: '',
    priceEstimate: '',
    status: 'confirmed',
    isAiCreated: false,
  });

  // Adjusting during render rather than in an effect: the form must already
  // hold the call's captured details on the first paint of the modal, not
  // one render later.
  const [appliedData, setAppliedData] = useState(initialData);
  if (appliedData !== initialData) {
    setAppliedData(initialData);
    if (initialData) setFormData((prev) => ({ ...prev, ...initialData }));
  }

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[18px] max-w-lg w-full p-6 shadow-2xl border border-[#E4E8F0] space-y-5 animate-scaleUp">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E4E8F0] pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-[#0E1526]">
              {formData.id ? 'Edit appointment' : 'Create appointment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-[#8A93A6] hover:text-[#5C6579]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={readOnly} className="contents">
          
          {/* Customer name */}
          <div>
            <label className="block text-xs font-bold text-[#26304A] mb-1">
              Customer name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A6]" />
              <input
                type="text"
                required
                value={formData.customerName || ''}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="e.g. Sarah Jenkins"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
              />
            </div>
          </div>

          {/* Customer Phone */}
          <div>
            <label className="block text-xs font-bold text-[#26304A] mb-1">
              Customer phone *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A6]" />
              <input
                type="text"
                required
                value={formData.customerPhone || ''}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                placeholder="(555) 000-0000"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
              />
            </div>
          </div>

          {/* Service */}
          <div>
            <label className="block text-xs font-bold text-[#26304A] mb-1">
              Service
            </label>
            <div className="relative">
              <Wrench className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A6]" />
              <input
                type="text"
                value={formData.service || ''}
                onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                placeholder="e.g. Emergency Pipe Leak Repair"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
              />
            </div>
          </div>

          {/* Date & Time Slot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#26304A] mb-1">
                Date & Time Slot
              </label>
              <input
                type="datetime-local"
                value={toDateTimeLocal(formData.dateTime)}
                onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#26304A] mb-1">
                Price estimate
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A6]" />
                <input
                  type="text"
                  value={formData.priceEstimate || ''}
                  onChange={(e) => setFormData({ ...formData, priceEstimate: e.target.value })}
                  placeholder="$180 flat"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
                />
              </div>
            </div>
          </div>

          {/* Service address */}
          <div>
            <label className="block text-xs font-bold text-[#26304A] mb-1">
              Service address
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A6]" />
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address, City, ZIP"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#26304A] mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any job details or gate codes..."
              className="w-full p-3 rounded-xl bg-[#FCFCFD] border border-[#E4E8F0] text-xs sm:text-sm text-[#0E1526] focus:outline-none focus:ring-4 focus:ring-[#2F6BFF]"
            />
          </div>

          </fieldset>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#F2F4F8] text-[#26304A] text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
              >
                Save appointment
              </button>
            )}
          </div>
        </form>

      </div>
    </div>
  );
};
