import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import api from '../../services/api';
import { Calendar, Info, X } from 'lucide-react';
import { toast } from 'react-toastify';

const DepartmentCalendar = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const fetchCalendarEvents = async () => {
      try {
        const response = await api.get('/leaves/calendar');
        if (response.data.success) {
          setEvents(response.data.events);
        }
      } catch (error) {
        console.error('Failed to fetch department calendar:', error);
        toast.error('Failed to load department leaves on calendar');
      } finally {
        setLoading(false);
      }
    };

    fetchCalendarEvents();
  }, []);

  const handleEventClick = (info) => {
    setSelectedEvent({
      title: info.event.title,
      start: info.event.start,
      end: info.event.end ? new Date(info.event.end.getTime() - 24 * 60 * 60 * 1000) : info.event.start, // Subtract 1 day for inclusive end date
      extendedProps: info.event.extendedProps,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Department Leave Calendar</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Monitor approved and pending leaves to manage departmental coverage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar panels */}
        <div className="lg:col-span-1 space-y-6">
          {/* Legend */}
          <div className="card space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Calendar size={18} className="text-primary-600" />
              <span>Legend</span>
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded bg-amber-500 border border-amber-600" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Pending Review</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded bg-blue-500 border border-blue-600" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Casual Leave (Approved)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded bg-red-500 border border-red-600" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sick Leave (Approved)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded bg-emerald-500 border border-emerald-600" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Earned Leave (Approved)</span>
              </div>
            </div>
          </div>

          {/* Details Card */}
          {selectedEvent && (
            <div className="card border-l-4 border-l-primary-500 animate-fadeIn relative">
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-600"
              >
                <X size={14} />
              </button>

              <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5 pr-6">
                <Info size={16} className="text-primary-650" />
                <span>Leave Detail</span>
              </h3>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Faculty Member</span>
                  <span className="text-slate-700 dark:text-slate-200 font-bold">
                    {selectedEvent.extendedProps.facultyName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Type & Duration</span>
                  <span className="text-slate-700 dark:text-slate-200 font-semibold capitalize">
                    {selectedEvent.extendedProps.leaveType} ({selectedEvent.extendedProps.totalDays} day(s))
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Dates</span>
                  <span className="text-slate-700 dark:text-slate-200">
                    {new Date(selectedEvent.start).toLocaleDateString()} to{' '}
                    {new Date(selectedEvent.end).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Reason</span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-serif italic">
                    "{selectedEvent.extendedProps.reason}"
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Status</span>
                  <span
                    className={
                      selectedEvent.extendedProps.status === 'approved'
                        ? 'badge-approved mt-1'
                        : selectedEvent.extendedProps.status === 'rejected'
                        ? 'badge-rejected mt-1'
                        : 'badge-pending mt-1'
                    }
                  >
                    {selectedEvent.extendedProps.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Calendar Grid */}
        <div className="lg:col-span-3 card">
          {loading ? (
            <div className="h-96 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="fc-container">
              <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                events={events}
                eventClick={handleEventClick}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth',
                }}
                height="auto"
                editable={false}
                selectable={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentCalendar;
