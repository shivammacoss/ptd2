'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Image as ImageIcon, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
  target_page: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const EMPTY_FORM = {
  title: '',
  image_url: '',
  link_url: '',
  position: 'top',
  target_page: 'dashboard',
  sort_order: '0',
};

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get<{ banners: Banner[] }>('/banners');
      setBanners(res.banners || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (b: Banner) => {
    setEditId(b.id);
    setForm({
      title: b.title,
      image_url: b.image_url,
      link_url: b.link_url,
      position: b.position,
      target_page: b.target_page,
      sort_order: String(b.sort_order),
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSubmitting(true);
    try {
      const body = {
        title: form.title,
        image_url: form.image_url,
        link_url: form.link_url,
        position: form.position,
        target_page: form.target_page,
        sort_order: parseInt(form.sort_order) || 0,
      };
      if (editId) {
        await adminApi.put(`/banners/${editId}`, body);
        toast.success('Banner updated');
      } else {
        await adminApi.post('/banners', body);
        toast.success('Banner created');
      }
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.delete(`/banners/${id}`);
      toast.success('Banner deleted');
      setDeleteConfirm(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  const toggleActive = async (b: Banner) => {
    try {
      await adminApi.put(`/banners/${b.id}`, { is_active: !b.is_active });
      toast.success(b.is_active ? 'Banner deactivated' : 'Banner activated');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    }
  };

  const updateForm = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Banner Management</h1>
            <p className="text-xxs text-text-tertiary mt-0.5">Manage promotional banners across the platform</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-buy/15 text-buy border border-buy/30 hover:bg-buy/25 transition-fast">
              <Plus size={14} /> New Banner
            </button>
            <button onClick={fetchData} className="p-1.5 rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover transition-fast">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : banners.length === 0 ? (
          <div className="bg-bg-secondary border border-border-primary rounded-md text-center text-xs text-text-tertiary py-12">
            No banners created yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {banners.map((b) => (
              <div key={b.id} className="bg-bg-secondary border border-border-primary rounded-md overflow-hidden transition-fast hover:border-border-secondary">
                <div className="aspect-[16/7] bg-bg-tertiary relative overflow-hidden">
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-text-tertiary/30" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-sm text-xxs font-medium', b.is_active ? 'bg-success/90 text-white' : 'bg-bg-secondary/90 text-text-tertiary border border-border-primary')}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <h3 className="text-xs font-medium text-text-primary truncate">{b.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex px-1.5 py-0.5 rounded-sm text-xxs font-medium bg-buy/15 text-buy">{b.position}</span>
                    <span className="inline-flex px-1.5 py-0.5 rounded-sm text-xxs font-medium bg-accent/15 text-accent">{b.target_page}</span>
                  </div>
                  {b.link_url && (
                    <div className="flex items-center gap-1 text-xxs text-text-tertiary truncate">
                      <ExternalLink size={10} />
                      <span className="truncate">{b.link_url}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border-primary">
                    <button onClick={() => toggleActive(b)} className={cn('flex-1 px-2 py-1 rounded-md text-xxs font-medium transition-fast border', b.is_active ? 'bg-warning/15 text-warning border-warning/30 hover:bg-warning/25' : 'bg-success/15 text-success border-success/30 hover:bg-success/25')}>
                      {b.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => openEdit(b)} className="p-1 rounded-md text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteConfirm(b.id)} className="p-1 rounded-md text-danger border border-danger/30 hover:bg-danger/15 transition-fast">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">{editId ? 'Edit Banner' : 'Create Banner'}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Title</label>
                <input value={form.title} onChange={(e) => updateForm('title', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" placeholder="Banner title" />
              </div>
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Image URL</label>
                <input value={form.image_url} onChange={(e) => updateForm('image_url', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Link URL</label>
                <input value={form.link_url} onChange={(e) => updateForm('link_url', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xxs text-text-tertiary mb-1">Position</label>
                  <select value={form.position} onChange={(e) => updateForm('position', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md">
                    <option value="top">Top</option>
                    <option value="sidebar">Sidebar</option>
                    <option value="bottom">Bottom</option>
                    <option value="popup">Popup</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xxs text-text-tertiary mb-1">Target Page</label>
                  <select value={form.target_page} onChange={(e) => updateForm('target_page', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md">
                    <option value="dashboard">Dashboard</option>
                    <option value="trading">Trading</option>
                    <option value="deposit">Deposit</option>
                    <option value="all">All Pages</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xxs text-text-tertiary mb-1">Sort Order</label>
                <input type="number" value={form.sort_order} onChange={(e) => updateForm('sort_order', e.target.value)} className="w-full text-xs py-1.5 px-2 bg-bg-input border border-border-primary rounded-md" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 rounded-md text-xs font-medium bg-buy/15 text-buy border border-buy/30 hover:bg-buy/25 transition-fast disabled:opacity-50">
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-bg-secondary border border-border-primary rounded-md shadow-modal w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-primary">
              <h3 className="text-sm font-semibold text-text-primary">Delete Banner</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-text-secondary">Are you sure you want to delete this banner? This action cannot be undone.</p>
            </div>
            <div className="px-5 py-3 border-t border-border-primary flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 rounded-md text-xs text-text-secondary border border-border-primary hover:bg-bg-hover transition-fast">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition-fast">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
