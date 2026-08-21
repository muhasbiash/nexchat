import { useRef, useState } from 'react';
import { ArrowLeft, Camera, Save } from 'lucide-react';

import { NexChatLogo } from '../components/nexchat-logo';
import { useAuth } from '../hooks/use-auth';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { user, updateUser } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    user?.avatarUrl ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const getInitials = (value: string) => {
    return value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  };

  const handlePhotoChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Profile photo must be smaller than 2 MB.');
      return;
    }

    setError(null);
    setSuccess(false);

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      await updateUser({
        name: trimmedName,
        avatarUrl: previewUrl,
      });

      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <div className="settings-background">
        <div className="settings-glow settings-glow-one" />
        <div className="settings-glow settings-glow-two" />
        <div className="settings-grid" />
      </div>

      <header className="settings-header">
        <div className="settings-brand">
          <NexChatLogo size={42} showText />
        </div>

        <button
          type="button"
          className="settings-back-button"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          Back to chat
        </button>
      </header>

      <section className="settings-content">
        <div className="settings-heading">
          <span>ACCOUNT</span>

          <h1>Settings</h1>

          <p>
            Manage your profile and account preferences.
          </p>
        </div>

        <form
          className="settings-card"
          onSubmit={handleSave}
        >
          <div className="settings-card-heading">
            <div>
              <h2>Profile</h2>

              <p>
                Update your personal information.
              </p>
            </div>
          </div>

          <div className="settings-profile">
            <div className="settings-avatar-wrapper">
              <div className="settings-avatar">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Profile preview"
                  />
                ) : (
                  getInitials(user?.name ?? 'User')
                )}
              </div>

              <button
                type="button"
                className="settings-avatar-button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                aria-label="Change profile photo"
                title="Change profile photo"
              >
                <Camera size={16} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                hidden
              />
            </div>

            <div className="settings-profile-info">
              <strong>
                {user?.name ?? 'User'}
              </strong>

              <span>{user?.email ?? ''}</span>

              <button
                type="button"
                className="settings-change-photo"
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                Change profile photo
              </button>
            </div>
          </div>

          <div className="settings-fields">
            <label>
              <span>Name</span>

              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Your name"
                required
              />
            </label>

            <label>
              <span>Email</span>

              <input
                type="email"
                value={user?.email ?? ''}
                disabled
              />
            </label>
          </div>

          {error && (
            <p className="settings-error">
              {error}
            </p>
          )}

          {success && (
            <p className="settings-success">
              Profile updated successfully.
            </p>
          )}

          <div className="settings-actions">
            <button
              type="submit"
              className="settings-save-button"
              disabled={saving}
            >
              <Save size={16} />

              {saving
                ? 'Saving...'
                : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}