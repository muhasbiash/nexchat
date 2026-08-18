import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { NexChatLogo } from '../components/nexchat-logo';

interface HomePageProps {
  onLogin: () => void;
  onRegister: () => void;
}

const features = [
  {
    icon: Zap,
    title: 'Real-time',
    description: 'Messages arrive instantly through realtime communication.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure',
    description: 'Authentication keeps your conversations protected.',
  },
  {
    icon: MessagesSquare,
    title: 'Simple',
    description: 'A focused messaging experience without unnecessary complexity.',
  },
];

export function HomePage({ onLogin, onRegister }: HomePageProps) {
  return (
    <main className="public-page">
      <div className="public-background">
        <div className="public-glow public-glow-one" />
        <div className="public-glow public-glow-two" />
        <div className="public-grid" />
      </div>

      <nav className="public-navbar">
        <button
          type="button"
          className="public-brand-button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="NexChat home"
        >
          <NexChatLogo size={42} showText />
        </button>

        <div className="public-nav-actions">
          <button type="button" className="public-nav-login" onClick={onLogin}>
            Sign in
          </button>

          <button type="button" className="public-nav-register" onClick={onRegister}>
            Get started
            <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Realtime messaging, made simple
          </div>

          <h1>
            Connect.
            <br />
            <span>Chat.</span>
            <br />
            Stay in sync.
          </h1>

          <p className="hero-description">
            NexChat is a modern real-time messaging experience designed to keep
            conversations fast, simple, and connected.
          </p>

          <div className="hero-actions">
            <button type="button" className="hero-primary-button" onClick={onRegister}>
              Start chatting
              <ArrowRight size={18} />
            </button>

            <button type="button" className="hero-secondary-button" onClick={onLogin}>
              Sign in
            </button>
          </div>

          <div className="hero-trust">
            <div>
              <CheckCircle2 size={16} />
              Instant messaging
            </div>

            <div>
              <CheckCircle2 size={16} />
              Realtime connection
            </div>

            <div>
              <CheckCircle2 size={16} />
              Clean experience
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="chat-preview-glow" />

          <div className="chat-preview">
            <div className="chat-preview-header">
              <div className="preview-profile">
                <div className="preview-avatar">A</div>

                <div>
                  <strong>Alex Morgan</strong>
                  <span>
                    <i />
                    Online
                  </span>
                </div>
              </div>

              <MessageCircle size={20} />
            </div>

            <div className="preview-messages">
              <div className="preview-message incoming">
                <span>Hey! Are you available?</span>
                <small>10:42</small>
              </div>

              <div className="preview-message outgoing">
                <span>Yes! What's up?</span>
                <small>10:43</small>
              </div>

              <div className="preview-message incoming">
                <span>Let's catch up later today.</span>
                <small>10:43</small>
              </div>

              <div className="preview-typing">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="preview-input">
              <span>Type a message...</span>

              <div className="preview-send">
                <ArrowRight size={15} />
              </div>
            </div>
          </div>

          <div className="floating-card floating-card-top">
            <div className="floating-icon">
              <Zap size={17} />
            </div>

            <div>
              <strong>Realtime</strong>
              <span>Connected</span>
            </div>

            <span className="floating-status" />
          </div>

          <div className="floating-card floating-card-bottom">
            <div className="floating-users">
              <span>A</span>
              <span>M</span>
              <span>J</span>
            </div>

            <div>
              <strong>Stay connected</strong>
              <span>with your people</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-heading">
          <span>WHY NEXCHAT</span>
          <h2>Everything you need to stay connected.</h2>
        </div>

        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-icon">
                  <Icon size={21} />
                </div>

                <h3>{feature.title}</h3>

                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="public-footer">
        <NexChatLogo size={30} showText={false} />

        <span>© 2026 NexChat. Built for modern conversations.</span>
      </footer>
    </main>
  );
}