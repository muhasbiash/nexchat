import { ArrowLeft, Mail, MessageCircle, Pencil, User, UserMinus } from 'lucide-react';
import { useState } from 'react';

import type { ApiUser } from '../types/user';

interface ProfilePageProps {
  user: ApiUser;
  onBack: () => void;
  onEdit?: () => void;
  canRemoveContact?: boolean;
  onRemoveContact?: () => Promise<boolean>;
}

export function ProfilePage({
  user,
  onBack,
  onEdit,
  canRemoveContact = false,
  onRemoveContact,
}: ProfilePageProps) {
  const [removingContact, setRemovingContact] = useState(false);
  const initials = (user.name ?? 'User')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <main className="profile-page">
      <div className="profile-background" aria-hidden="true">
        {user.avatarUrl && (
          <>
            <div
              className="profile-avatar-background profile-avatar-background-blur"
              style={{ backgroundImage: `url("${user.avatarUrl}")` }}
            />
            <div
              className="profile-avatar-background profile-avatar-background-detail"
              style={{ backgroundImage: `url("${user.avatarUrl}")` }}
            />
          </>
        )}

        <div className="profile-background-overlay" />
        <div className="profile-glow profile-glow-one" />
        <div className="profile-glow profile-glow-two" />
      </div>

      <div className="profile-content">
        <header className="profile-header">
          <button type="button" className="profile-back-button" onClick={onBack}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className="profile-brand">
            <h1>Profile</h1>
            <p>View your NexChat account information.</p>
          </div>
        </header>

        <section className="profile-card">
          <div className="profile-hero">
            <div className="profile-avatar">
              {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.name} avatar`} /> : initials}
            </div>

            <div className="profile-identity">
              <h2>{user.name}</h2>
              <p>{user.email || 'No email available'}</p>
            </div>
          </div>

          <div className="profile-divider" />

          <div className="profile-details">
            <div className="profile-detail">
              <div className="profile-detail-icon">
                <User size={18} />
              </div>

              <div>
                <span>Full name</span>
                <strong>{user.name}</strong>
              </div>
            </div>

            <div className="profile-detail profile-detail-bio">
              <div className="profile-detail-icon">
                <MessageCircle size={18} />
              </div>

              <div>
                <span>About</span>
                <strong className="profile-bio-value">{user.bio?.trim() || 'No bio yet.'}</strong>
              </div>
            </div>

            <div className="profile-detail">
              <div className="profile-detail-icon">
                <Mail size={18} />
              </div>

              <div>
                <span>Email address</span>
                <strong>{user.email || 'No email available'}</strong>
              </div>
            </div>
          </div>

          {(onEdit || (canRemoveContact && onRemoveContact)) && (
            <div className="profile-actions">
              {onEdit && (
                <button type="button" className="profile-edit-button" onClick={onEdit}>
                  <Pencil size={17} />
                  Edit profile
                </button>
              )}

              {canRemoveContact && onRemoveContact && (
                <button
                  type="button"
                  className="profile-remove-contact-button"
                  onClick={async () => {
                    if (removingContact) {
                      return;
                    }

                    setRemovingContact(true);

                    try {
                      const removed = await onRemoveContact();

                      if (removed) {
                        onBack();
                      }
                    } finally {
                      setRemovingContact(false);
                    }
                  }}
                  disabled={removingContact}
                >
                  <UserMinus size={17} />
                  {removingContact ? 'Removing...' : 'Remove contact'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
