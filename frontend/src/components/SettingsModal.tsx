import { useState } from 'react';
import {
  User,
  Bot,
  Palette,
  History,
  MapPin,
  Lock,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ProfileSettings } from '@/components/ProfileSettings';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SECTIONS: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your username and date of birth.',
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    icon: Bot,
    description: 'Configure how the AI assistant helps you.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Customize the look and feel of the app.',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: History,
    description: 'Control how your timeline is displayed.',
  },
  {
    id: 'your-places',
    label: 'Your places',
    icon: MapPin,
    description: 'Manage saved locations tied to your entries.',
  },
  {
    id: 'password',
    label: 'Password & encryption',
    icon: Lock,
    description: 'Update your password and encryption settings.',
  },
  {
    id: 'import-export',
    label: 'Import & export',
    icon: ArrowLeftRight,
    description: 'Import existing data or export your entries.',
  },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSectionId, setActiveSectionId] = useState(SECTIONS[0].id);

  const activeSection = SECTIONS.find((section) => section.id === activeSectionId) ?? SECTIONS[0];

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[85vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-secondary/30 p-3">
            <span className="px-3 pb-2 pt-1 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Settings
            </span>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground/80 hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="font-mono text-xl font-semibold">{activeSection.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{activeSection.description}</p>

            <div className="mt-6">
              {activeSection.id === 'profile' ? (
                <ProfileSettings />
              ) : (
                <PlaceholderSection label={activeSection.label} />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      {label} settings are coming soon.
    </div>
  );
}
