
import { useState } from 'react';
import { Clock, Pencil, Check } from 'lucide-react';

type Entry = {
  id: string;
  title: string;
  date: string;
  duration: string;
};

const EntryList = () => {
  const [entries, setEntries] = useState<Entry[]>([
    {
      id: '1',
      title: 'Mission Log #1',
      date: '2024-02-20',
      duration: '2:15',
    },
    {
      id: '2',
      title: 'Mission Log #2',
      date: '2024-02-21',
      duration: '1:45',
    },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEditing = (entry: Entry) => {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
  };

  const saveEdit = (id: string) => {
    setEntries(entries.map(entry => 
      entry.id === id ? { ...entry, title: editingTitle } : entry
    ));
    setEditingId(null);
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
      <div className="grid gap-4">
        {entries.map((entry) => (
          <div key={entry.id} className="entry-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editingId === entry.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="bg-transparent border-b border-accent/50 focus:border-accent outline-none px-1 py-0.5 font-mono text-lg"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(entry.id)}
                      className="p-1 hover:text-accent"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono font-medium text-lg text-foreground">{entry.title}</h3>
                    <button
                      onClick={() => startEditing(entry)}
                      className="p-1 text-muted hover:text-accent"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-mono">{entry.date}</p>
              </div>
              <div className="flex items-center text-muted">
                <Clock size={16} className="mr-1" />
                <span className="text-sm font-mono">{entry.duration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EntryList;
