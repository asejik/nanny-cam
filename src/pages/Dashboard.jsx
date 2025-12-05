import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Video, Trash2, ExternalLink } from 'lucide-react';

export default function Dashboard({ session }) {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
  }, [session]);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching rooms:', error);
    else setRooms(data || []);
    setLoading(false);
  };

  const createRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    const { data, error } = await supabase
      .from('rooms')
      .insert([{
        name: newRoomName,
        owner_id: session.user.id
      }])
      .select()
      .single();

    if (error) {
      console.error(error);
      alert('Error creating room');
    } else {
      setRooms([data, ...rooms]);
      setNewRoomName('');
    }
  };

  const deleteRoom = async (roomId) => {
    if (!confirm('Are you sure you want to delete this camera?')) return;

    const { error } = await supabase.from('rooms').delete().match({ id: roomId });
    if (!error) {
      setRooms(rooms.filter(r => r.id !== roomId));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Cameras</h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Sign Out
          </button>
        </header>

        {/* Create Room Form */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <form onSubmit={createRoom} className="flex gap-4">
            <input
              type="text"
              placeholder="e.g. Nursery, Living Room"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
            />
            <button
              type="submit"
              disabled={!newRoomName.trim()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={20} />
              Add Camera
            </button>
          </form>
        </div>

        {/* Room List */}
        {loading ? (
          <p className="text-center text-gray-500">Loading cameras...</p>
        ) : rooms.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            No cameras yet. Create one above!
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <div key={room.id} className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 p-2 text-blue-600">
                      <Video size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{room.name}</h3>
                      <p className="text-xs text-gray-500">ID: {room.id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => navigate(`/room/${room.id}`)}
                    className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Open Camera
                  </button>
                  <button
                    onClick={() => {
                        // Copy link to clipboard
                        navigator.clipboard.writeText(`${window.location.origin}/room/${room.id}`);
                        alert('Link copied!');
                    }}
                    className="flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-gray-600 hover:bg-gray-50"
                  >
                    <ExternalLink size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}