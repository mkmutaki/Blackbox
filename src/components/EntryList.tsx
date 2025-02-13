
import { Clock } from 'lucide-react';

type Entry = {
  id: string;
  title: string;
  date: string;
  duration: string;
};

const EntryList = () => {
  // Mock data - in a real app, this would come from a database
  const entries: Entry[] = [
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
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="text-2xl font-space font-bold text-foreground">Previous Entries</h2>
      <div className="grid gap-4">
        {entries.map((entry) => (
          <div key={entry.id} className="entry-card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-space font-medium text-lg text-foreground">{entry.title}</h3>
                <p className="text-sm text-muted-foreground">{entry.date}</p>
              </div>
              <div className="flex items-center text-muted">
                <Clock size={16} className="mr-1" />
                <span className="text-sm">{entry.duration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EntryList;
