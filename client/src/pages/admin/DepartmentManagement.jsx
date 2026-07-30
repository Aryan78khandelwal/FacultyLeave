import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { Building2, Plus, Edit, Trash2, X, Users, Award } from 'lucide-react';

const DepartmentManagement = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals Visibility
  const [createOpen, setCreateOpen] = useState(false);
  const [hodOpen, setHodOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [facultyListOpen, setFacultyListOpen] = useState(false);

  // States
  const [selectedDept, setSelectedDept] = useState(null);
  const [name, setName] = useState('');
  const [assignedHodId, setAssignedHodId] = useState('');

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.departments);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!name) return;
    try {
      const response = await api.post('/departments', { name });
      if (response.data.success) {
        toast.success(`Department "${name}" created successfully`);
        setCreateOpen(false);
        setName('');
        await fetchDepartments();
      }
    } catch (error) {
      console.error(error);
      let msg = 'Failed to create department';
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        msg = error.response.data.errors.map((err) => err.msg).join(', ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      }
      toast.error(msg);
    }
  };

  const handleHodClick = (dept) => {
    setSelectedDept(dept);
    setAssignedHodId(dept.hod?._id || '');
    setHodOpen(true);
  };

  const handleHodSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.put(`/departments/${selectedDept._id}`, {
        hodId: assignedHodId || null,
      });
      if (response.data.success) {
        toast.success('HOD assignment updated successfully');
        setHodOpen(false);
        await fetchDepartments();
      }
    } catch (error) {
      console.error(error);
      let msg = 'Failed to assign HOD';
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        msg = error.response.data.errors.map((err) => err.msg).join(', ');
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      }
      toast.error(msg);
    }
  };

  const handleDeleteClick = (dept) => {
    setSelectedDept(dept);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await api.delete(`/departments/${selectedDept._id}`);
      if (response.data.success) {
        toast.success('Department deleted successfully');
        setDeleteOpen(false);
        await fetchDepartments();
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete department');
    }
  };

  const handleViewFaculty = (dept) => {
    setSelectedDept(dept);
    setFacultyListOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Department Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Define college academic departments and appoint Heads of Department (HODs)
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2 self-start sm:self-auto">
          <Plus size={18} />
          <span>Add Department</span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
          <div className="h-44 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
          <div className="h-44 bg-slate-200 dark:bg-gray-800 rounded-xl"></div>
        </div>
      ) : departments.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-455">
          <Building2 size={48} className="stroke-[1.5] mb-2" />
          <p className="text-sm font-medium">No departments registered. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((dept) => (
            <div key={dept._id} className="card relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-2.5 bg-primary-50 dark:bg-primary-950/20 text-primary-600 rounded-lg">
                    <Building2 size={22} />
                  </div>
                  
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleHodClick(dept)}
                      className="p-1.5 text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Assign HOD"
                    >
                      <Award size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(dept)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                      title="Delete Department"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-lg text-slate-800 dark:text-white mt-4">{dept.name}</h3>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-50 dark:border-gray-700">
                    <span className="text-slate-400 font-medium">Department HOD</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {dept.hod ? dept.hod.name : <span className="text-red-505 font-medium italic">Unassigned</span>}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-400 font-medium">Faculty Staff Count</span>
                    <button
                      onClick={() => handleViewFaculty(dept)}
                      className="font-semibold text-primary-600 hover:underline dark:text-primary-400 flex items-center gap-1"
                    >
                      <Users size={12} />
                      <span>{dept.facultyList?.length || 0} Member(s)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Department Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-primary-600 text-white flex justify-between items-center">
              <h3 className="font-bold">Add Academic Department</h3>
              <button onClick={() => setCreateOpen(false)} className="text-white hover:text-primary-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science & Engineering"
                  className="form-input text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="btn-secondary py-1.5"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-1.5">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign HOD Modal */}
      {hodOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-primary-600 text-white flex justify-between items-center">
              <h3 className="font-bold">Assign Department HOD</h3>
              <button onClick={() => setHodOpen(false)} className="text-white hover:text-primary-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleHodSubmit} className="p-6 space-y-4">
              <div className="pb-2 border-b border-slate-100 dark:border-gray-700">
                <p className="text-xs text-slate-400 uppercase font-semibold">Department</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                  {selectedDept?.name}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Appoint HOD</label>
                {selectedDept?.facultyList?.length === 0 ? (
                  <p className="text-xs text-red-500 italic mt-1">
                    No faculty assigned to this department yet. Add users to this department first.
                  </p>
                ) : (
                  <select
                    className="form-input text-sm"
                    value={assignedHodId}
                    onChange={(e) => setAssignedHodId(e.target.value)}
                  >
                    <option value="">Select Department Member</option>
                    {selectedDept?.facultyList?.map((fac) => (
                      <option key={fac._id} value={fac._id}>
                        {fac.name} ({fac.designation})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setHodOpen(false)}
                  className="btn-secondary py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary py-1.5"
                  disabled={selectedDept?.facultyList?.length === 0}
                >
                  Save Appoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Faculty Members Modal */}
      {facultyListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-white flex justify-between items-center border-b border-slate-200 dark:border-gray-700">
              <h3 className="font-bold">{selectedDept?.name} Members</h3>
              <button onClick={() => setFacultyListOpen(false)} className="text-slate-500 hover:text-slate-700 dark:text-slate-350">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedDept?.facultyList?.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6">No department members yet.</p>
              ) : (
                <div className="space-y-3.5">
                  {selectedDept?.facultyList?.map((fac) => (
                    <div key={fac._id} className="flex items-center justify-between border-b border-slate-50 dark:border-gray-700 pb-2 text-xs">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{fac.name}</p>
                        <p className="text-slate-400">{fac.designation} • ID: {fac.employeeId}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        fac.role === 'HOD' 
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-705 border-amber-200' 
                          : 'bg-primary-50 dark:bg-primary-950/20 text-primary-655 border-primary-200'
                      }`}>
                        {fac.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-150 dark:border-gray-700 overflow-hidden animate-scaleIn">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 text-red-655 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-white">Delete Department?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to permanently delete the department <strong>{selectedDept?.name}</strong>? Associated faculty members will remain but will have their department assignment cleared.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="btn-secondary flex-1 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="btn-danger flex-1 py-1.5"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentManagement;
