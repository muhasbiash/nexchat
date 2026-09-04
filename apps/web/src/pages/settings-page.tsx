import { ArrowLeft, Bell, Camera, Check, Mail, Save, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../hooks/use-auth';
import { uploadAvatar } from '../lib/api';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { user, updateUser } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl ?? '');
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied',
  );

  useEffect(() => {
    if (!selectedAvatarFile) {
      setAvatarPreview(user?.avatarUrl ?? '');
    }
  }, [selectedAvatarFile, user?.avatarUrl]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB.');
      return;
    }

    setError('');
    setSuccess('');
    setSelectedAvatarFile(file);

    const reader = new FileReader();

    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextName = nameInputRef.current?.value.trim() ?? '';

    setError('');
    setSuccess('');

    if (!nextName) {
      setError('Name is required.');
      return;
    }

    setSaving(true);

    try {
      let avatarUrl = user?.avatarUrl ?? null;

      if (selectedAvatarFile) {
        avatarUrl = await uploadAvatar(selectedAvatarFile);
      }

      await updateUser({
        name: nextName,
        ...(selectedAvatarFile ? { avatarUrl } : {}),
      });

      if (nameInputRef.current) {
        nameInputRef.current.value = nextName;
      }

      setSelectedAvatarFile(null);
      setAvatarPreview(avatarUrl ?? '');
      setSuccess('Profile updated successfully.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnableCallNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setError('Browser notifications are not supported in this browser.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const permission = await Notification.requestPermission();

      setNotificationPermission(permission);

      if (permission === 'granted') {
        setSuccess('Call notifications enabled.');
      } else if (permission === 'denied') {
        setError('Call notifications are blocked. Allow notifications in your browser settings.');
      }
    } catch {
      setError('Unable to update notification permission.');
    }
  };

  const initials = (user?.name ?? 'User')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="settings-page">
      <div className="settings-background">
        <div className="settings-glow settings-glow-one" />
        <div className="settings-glow settings-glow-two" />
      </div>

      <div className="settings-content">
        <header className="settings-header">
          <button type="button" className="settings-back-button" onClick={onBack}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className="settings-brand">
            <h1>Settings</h1>
            <p>Manage your NexChat profile.</p>
          </div>
        </header>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <User size={20} />
            </div>

            <div>
              <h2>Profile</h2>
              <p>Update your personal information and profile picture.</p>
            </div>
          </div>

          <form className="settings-profile" onSubmit={handleSave}>
            <div className="settings-avatar-wrapper">
              <div className="settings-avatar">
                {avatarPreview ? <img src={avatarPreview} alt="Profile" /> : initials}
              </div>

              <button
                type="button"
                className="settings-change-photo"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} />
                Change photo
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handlePhotoChange}
              />
            </div>

            <div className="settings-fields">
              <div className="settings-field">
                <label htmlFor="settings-name">Full name</label>

                <div className="settings-input-wrapper">
                  <User size={18} />

                  <input
                    ref={nameInputRef}
                    key={user?.id ?? 'settings-name'}
                    id="settings-name"
                    type="text"
                    defaultValue={user?.name ?? ''}
                    required
                  />
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="settings-email">Email</label>

                <div className="settings-input-wrapper">
                  <Mail size={18} />

                  <input id="settings-email" type="email" value={user?.email ?? ''} disabled />
                </div>

                <small>Email cannot be changed here.</small>
              </div>
            </div>

            {error && <div className="settings-error">{error}</div>}

            {success && (
              <div className="settings-success">
                <Check size={16} />
                {success}
              </div>
            )}

            <div className="settings-actions">
              <button type="submit" className="settings-save-button" disabled={saving}>
                <Save size={17} />

                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card settings-notification-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <Bell size={20} />
            </div>

            <div>
              <h2>Notifications</h2>
              <p>Receive incoming call alerts when NexChat is in the background.</p>
            </div>
          </div>

          <div className="settings-notification-row">
            <div className="settings-notification-info">
              <strong>Call notifications</strong>

              {notificationPermission === 'granted' && (
                <span className="settings-notification-status settings-notification-enabled">
                  Enabled
                </span>
              )}

              {notificationPermission === 'default' && (
                <span className="settings-notification-status">Not enabled</span>
              )}

              {notificationPermission === 'denied' && (
                <span className="settings-notification-status settings-notification-blocked">
                  Blocked
                </span>
              )}

              <small>Browser notifications only appear when NexChat is not the active tab.</small>
            </div>

            {notificationPermission !== 'granted' && notificationPermission !== 'denied' && (
              <button
                type="button"
                className="settings-notification-button"
                onClick={handleEnableCallNotifications}
              >
                <Bell size={16} />
                Enable
              </button>
            )}

            {notificationPermission === 'granted' && (
              <span className="settings-notification-check" aria-label="Call notifications enabled">
                <Check size={18} />
              </span>
            )}
          </div>

          {notificationPermission === 'denied' && (
            <p className="settings-notification-help">
              Notifications are blocked by your browser. Open the browser site settings for NexChat
              and allow notifications.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
