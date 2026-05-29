import { useState } from 'react';
import { MapPin, Plus, Archive, Loader2, X, Edit2, Check } from 'lucide-react';
import type { Location } from '../types';

interface LocationsPanelProps {
  locations: Location[];
  activeLocationId: string | null;
  onAdd: (name: string, address?: string) => Promise<void>;
  onUpdate: (locationId: string, patch: { name?: string; address?: string; archived?: boolean }) => Promise<void>;
}

/**
 * Settings panel for managing the campaign's locations. A merchant with
 * one shop can ignore this entirely — their initial "Main" location is
 * sufficient. Merchants with multiple branches add and rename here.
 *
 * Archiving (not hard deletion) is intentional: old activities still
 * reference the location, so we keep the row but hide it from pickers.
 */
export function LocationsPanel({ locations, activeLocationId, onAdd, onUpdate }: LocationsPanelProps) {
  const [addingName, setAddingName] = useState('');
  const [addingAddress, setAddingAddress] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const active = locations.filter((l) => !l.archived);
  const archived = locations.filter((l) => l.archived);

  const handleAdd = async () => {
    if (!addingName.trim()) return;
    setBusy(true);
    try {
      await onAdd(addingName.trim(), addingAddress.trim() || undefined);
      setAddingName('');
      setAddingAddress('');
      setIsAdding(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not add location');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditAddress(loc.address ?? '');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      await onUpdate(editingId, { name: editName.trim(), address: editAddress.trim() || undefined });
      setEditingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (loc: Location) => {
    if (active.length <= 1) {
      alert("You must have at least one active location. Add another location before archiving this one.");
      return;
    }
    if (!confirm(`Archive "${loc.name}"? Past stamps will still show this location, but it won't appear in pickers or generate QR codes.`)) return;
    setBusy(true);
    try {
      await onUpdate(loc.id, { archived: true });
    } finally {
      setBusy(false);
    }
  };

  const handleUnarchive = async (loc: Location) => {
    setBusy(true);
    try {
      await onUpdate(loc.id, { archived: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border notion-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-500" /> Locations
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Each branch gets its own QR poster. Stamps are recorded per location.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="text-sm bg-[#37352F] text-white px-3 py-1.5 rounded-md font-medium hover:bg-opacity-90 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add location
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-[#F7F7F5] rounded-md p-4 space-y-3 border notion-border">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            placeholder='Name (e.g. "Mitte branch")'
            className="w-full bg-white border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
            autoFocus
          />
          <input
            value={addingAddress}
            onChange={(e) => setAddingAddress(e.target.value)}
            placeholder="Address (optional)"
            className="w-full bg-white border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setIsAdding(false); setAddingName(''); setAddingAddress(''); }} className="text-sm text-gray-500 hover:text-[#37352F] px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addingName.trim() || busy}
              className="text-sm bg-[#37352F] text-white px-3 py-1.5 rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.map((loc) => (
          <div key={loc.id} className="flex items-center justify-between bg-[#F7F7F5] rounded-md p-3 border notion-border">
            {editingId === loc.id ? (
              <div className="flex-1 space-y-2 mr-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Address (optional)"
                  className="w-full bg-white border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>
            ) : (
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{loc.name}</span>
                  {loc.id === activeLocationId && (
                    <span className="text-[9px] uppercase tracking-wider text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">
                      Active scanner
                    </span>
                  )}
                </div>
                {loc.address && <div className="text-xs text-gray-500 mt-0.5">{loc.address}</div>}
              </div>
            )}
            <div className="flex items-center gap-1">
              {editingId === loc.id ? (
                <>
                  <button onClick={() => setEditingId(null)} className="p-2 text-gray-400 hover:text-[#37352F]" aria-label="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                  <button onClick={saveEdit} disabled={busy} className="p-2 text-green-600 hover:bg-green-50 rounded" aria-label="Save">
                    <Check className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => beginEdit(loc)} className="p-2 text-gray-400 hover:text-[#37352F] rounded" aria-label="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleArchive(loc)} className="p-2 text-gray-400 hover:text-red-500 rounded" aria-label="Archive">
                    <Archive className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {active.length === 0 && (
          <p className="text-sm text-gray-400 italic px-3 py-4 text-center">
            No locations yet. Add one to start stamping.
          </p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="pt-4 border-t notion-border space-y-2">
          <h4 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Archived</h4>
          {archived.map((loc) => (
            <div key={loc.id} className="flex items-center justify-between bg-white rounded-md p-3 border notion-border">
              <div>
                <div className="font-medium text-sm text-gray-500">{loc.name}</div>
                {loc.address && <div className="text-xs text-gray-400">{loc.address}</div>}
              </div>
              <button
                onClick={() => handleUnarchive(loc)}
                className="text-xs text-gray-500 hover:text-[#37352F] px-3 py-1.5 border notion-border rounded"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
