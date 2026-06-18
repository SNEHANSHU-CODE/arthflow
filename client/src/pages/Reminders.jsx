import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { FaSpinner, FaEdit, FaTrash, FaPlus } from 'react-icons/fa';

import { createReminder, fetchReminders, googleConnect, updateReminder, deleteReminder } from '../app/reminderSlice';
import LoadingSpinner from '../components/LodingSpinner';
import { usePreferences } from '../hooks/usePreferences';

export default function Reminders() {
  const dispatch = useDispatch();
  const { loading, events, error } = useSelector(state => state.reminder);

  const [selectedDate, setSelectedDate] = useState(null);
  const [reminderText, setReminderText] = useState('');
  const [time, setTime] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [editingReminder, setEditingReminder] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  //get all reminder on page load
  useEffect(() => {
    dispatch(fetchReminders());

    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('googleConnected');
    const errorParam = params.get('error');
    
    if (googleConnected === 'true') {
      alert('Google Calendar connected successfully!');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (googleConnected === 'false') {
      const errorMessage = errorParam 
        ? `Failed to connect Google Calendar: ${errorParam}`
        : 'Failed to connect Google Calendar';
      alert(errorMessage);
      console.error('Google connection failed:', errorParam);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [dispatch]);

  const handleDateClick = (info) => {
    const clickedDate = new Date(info.dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (clickedDate < today) {
      alert('You cannot set reminders for past dates');
      return;
    }

    setSelectedDate(info.dateStr);
    setEditingReminder(null);
    setReminderText('');
    setTime('');
    setShowModal(true);
  };

  const handleEventClick = (info) => {
    const event = info.event;
    setSelectedEvent({
      id: event.id,
      title: event.title,
      date: event.start,
      dateStr: event.startStr
    });
    setShowEventModal(true);
  };

  const handleEditReminder = () => {
    const eventDate = new Date(selectedEvent.date);
    const hours = eventDate.getHours();
    const minutes = eventDate.getMinutes();
    
    // Use 24-hour format for the time input
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    setEditingReminder(selectedEvent);
    setSelectedDate(selectedEvent.dateStr.split('T')[0]);
    setReminderText(selectedEvent.title);
    setTime(timeString);
    setShowEventModal(false);
    setShowModal(true);
  };

  const handleDeleteReminder = () => {
    setConfirmDelete(selectedEvent);
    setShowEventModal(false);
  };

  const confirmDeleteReminder = () => {
    if (confirmDelete) {
      dispatch(deleteReminder(confirmDelete.id));
      setConfirmDelete(null);
      setSelectedEvent(null);
    }
  };

  const handleSave = () => {
    if (!reminderText.trim()) return;

    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
      setTimeError('Please enter a valid time');
      return;
    }
    setTimeError('');

    let [hour, minute] = time.split(':').map(Number);

    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateTime = new Date(year, month - 1, day);
    dateTime.setHours(hour);
    dateTime.setMinutes(minute || 0);

    const reminderData = {
      title: reminderText,
      date: dateTime.toISOString()
    };

    if (editingReminder) {
      // Update existing reminder
      dispatch(updateReminder({
        id: editingReminder.id,
        ...reminderData
      }));
    } else {
      // Create new reminder
      dispatch(createReminder(reminderData));
    }

    // Reset
    setReminderText('');
    setTime('');
    setTimeError('');
    setShowModal(false);
    setEditingReminder(null);
  };

  const handleGoogleConnect = async (e) => {
    e.preventDefault();
    console.log('🔐 Google Connect button clicked');
    
    try {
      // Dispatch the action and wait for it
      const result = await dispatch(googleConnect()).unwrap();
      console.log('✅ Google connect result:', result);
    } catch (err) {
      console.error('❌ Google connect error:', err);
      alert(`Failed to connect Google Calendar: ${err.message || 'Unknown error'}`);
    }
  };

  const closeAllModals = () => {
    setShowModal(false);
    setShowEventModal(false);
    setConfirmDelete(null);
    setEditingReminder(null);
    setSelectedEvent(null);
    setTimeError('');
  };

  return (
    <div className="container-fluid p-0">
      <div className="border-bottom px-3 py-3 d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-1">Reminders</h4>
          <p className="text-muted mb-0">Set and manage your reminders</p>
        </div>
        <div>
          <button
            className="btn btn-outline-primary"
            onClick={handleGoogleConnect}
            disabled={loading}
          >
            {loading && <FaSpinner className="fa-spin me-2" />}
            Connect Google Calendar
          </button>
        </div>
      </div>

      <div className="p-3">
        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button type="button" className="btn-close" onClick={() => dispatch({ type: 'reminder/clearReminderError' })}></button>
          </div>
        )}

        {loading && <LoadingSpinner />}

        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          events={events}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
          moreLinkClick="popover"
        />
      </div>

      {/* Add/Edit Reminder Modal */}
      {showModal && (
        <div 
          className="modal fade show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-3 shadow">
              <div className="modal-header border-0">
                <h5 className="modal-title">
                  <FaPlus className="me-2" />
                  {editingReminder ? 'Edit Reminder' : 'Add Reminder'}
                </h5>
                <button className="btn-close" onClick={closeAllModals} />
              </div>
              <div className="modal-body">
                <p className="text-muted">For {new Date(selectedDate).toLocaleDateString()}</p>
                <div className="mb-3">
                  <label className="form-label">Reminder Title</label>
                  <input
                    type="text"
                    className="form-control"
                    value={reminderText}
                    onChange={(e) => setReminderText(e.target.value)}
                    placeholder="What do you want to remind yourself about?"
                    autoFocus
                  />
                </div>
                <div className="d-flex gap-2">
                  <div className="flex-grow-1">
                    <label className="form-label">Time</label>
                    <input
                      type="time"
                      className="form-control"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                </div>
                {timeError && (
                  <p className="text-danger small mt-1">{timeError}</p>
                )}
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-secondary" onClick={closeAllModals}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                  {loading && <FaSpinner className="fa-spin me-2" />}
                  {editingReminder ? 'Update Reminder' : 'Save Reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
        <div 
          className="modal fade show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-3 shadow">
              <div className="modal-header border-0">
                <h5 className="modal-title">Reminder Details</h5>
                <button className="btn-close" onClick={closeAllModals} />
              </div>
              <div className="modal-body">
                <div>
                  <h6 className="mb-3">{selectedEvent.title}</h6>
                  <p className="text-muted mb-2">
                    <strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString()}
                  </p>
                  <p className="text-muted mb-0">
                    <strong>Time:</strong> {new Date(selectedEvent.date).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="modal-footer border-0 d-flex justify-content-between">
                <button className="btn btn-outline-danger" onClick={handleDeleteReminder}>
                  <FaTrash className="me-2" />
                  Delete
                </button>
                <div>
                  <button className="btn btn-secondary me-2" onClick={closeAllModals}>
                    Close
                  </button>
                  <button className="btn btn-primary" onClick={handleEditReminder}>
                    <FaEdit className="me-2" />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div 
          className="modal fade show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content rounded-3 shadow">
              <div className="modal-header border-0 bg-danger text-white">
                <h5 className="modal-title">
                  <FaTrash className="me-2" />
                  Confirm Delete
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setConfirmDelete(null)} />
              </div>
              <div className="modal-body text-center">
                <p className="mb-3">Are you sure you want to delete this reminder?</p>
                <div className="alert alert-light border">
                  <strong>{confirmDelete.title}</strong><br />
                  <small className="text-muted">
                    {new Date(confirmDelete.date).toLocaleDateString()} {new Date(confirmDelete.date).toLocaleTimeString()}
                  </small>
                </div>
                <p className="text-muted small">This action cannot be undone</p>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmDeleteReminder} disabled={loading}>
                  {loading && <FaSpinner className="fa-spin me-2" />}
                  Delete Reminder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}