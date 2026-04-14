import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Play, Users, FileQuestion, CalendarDays, Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './Hero.css';

const FALLBACK_TOTAL_SEATS = 1200;
const FALLBACK_CLAIMED_SEATS = 940;
const FALLBACK_OFFER_END = '2026-05-01T23:59:59+05:30';

interface LaunchCampaignRow {
  id: string;
  total_seats: number;
  claimed_seats: number;
  offer_ends_at: string;
  is_active: boolean;
}

interface RegistrationEventRow {
  id: number;
  display_name: string;
  created_at: string;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return { days: '00', hours: '00', minutes: '00', seconds: '00' };
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

const stats = [
  { value: '25L+', label: 'Candidates', icon: Users },
  { value: '1200+', label: 'PYQs', icon: FileQuestion },
  { value: '10', label: 'Years Coverage', icon: CalendarDays },
  { value: '₹0', label: 'Free Forever Tier', icon: Sparkles },
];

export default function Hero() {
  const [now, setNow] = useState(() => Date.now());
  const [campaign, setCampaign] = useState<LaunchCampaignRow>({
    id: 'fallback',
    total_seats: FALLBACK_TOTAL_SEATS,
    claimed_seats: FALLBACK_CLAIMED_SEATS,
    offer_ends_at: FALLBACK_OFFER_END,
    is_active: true,
  });
  const [liveRegistrant, setLiveRegistrant] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadLaunchData = async () => {
      const [{ data: campaignRow }, { data: latestRegistrant }] = await Promise.all([
        supabase
          .from('launch_campaigns')
          .select('id,total_seats,claimed_seats,offer_ends_at,is_active')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('live_registration_events')
          .select('id,display_name,created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;
      if (campaignRow) setCampaign(campaignRow as LaunchCampaignRow);
      if (latestRegistrant?.display_name) setLiveRegistrant(latestRegistrant.display_name);
    };

    void loadLaunchData();

    const channel = supabase
      .channel('home-live-banner')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'launch_campaigns',
      }, (payload) => {
        const next = payload.new as LaunchCampaignRow;
        if (next?.is_active) setCampaign(next);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_registration_events',
      }, (payload) => {
        const reg = payload.new as RegistrationEventRow;
        if (!reg?.display_name) return;
        setLiveRegistrant(reg.display_name);
        setToastVisible(true);
        window.setTimeout(() => setToastVisible(false), 5000);
      })
      .subscribe();

    const poll = window.setInterval(() => {
      void loadLaunchData();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  const totalSeats = Math.max(1, campaign.total_seats || FALLBACK_TOTAL_SEATS);
  const claimedSeats = Math.max(0, Math.min(totalSeats, campaign.claimed_seats || 0));
  const remainingSeats = Math.max(0, totalSeats - claimedSeats);
  const offerEndMs = new Date(campaign.offer_ends_at || FALLBACK_OFFER_END).getTime();
  const offerMsLeft = Math.max(0, offerEndMs - now);
  const countdown = useMemo(() => formatCountdown(offerMsLeft), [offerMsLeft]);

  return (
    <section className="hero dot-grid" id="hero-section">
      {/* Gradient blobs */}
      <div className="gradient-blob hero-blob-1" />
      <div className="gradient-blob hero-blob-2" />

      <div className="container">
        <div className="hero-launch-banner" role="status" aria-live="polite">
          <div className="hero-launch-left">
            <span className="hero-launch-live-dot" aria-hidden="true" />
            <div>
              <p className="hero-launch-title" lang="hi">ExamSetu Offer: Registration बिल्कुल FREE + Premium Access Live</p>
              <p className="hero-launch-sub">Limited launch window: lock premium features now at no cost.</p>
            </div>
          </div>

          <div className="hero-launch-right">
            <div className="hero-seats-chip">
              <span className="hero-seats-count">{remainingSeats}</span>
              <span className="hero-seats-label">of {totalSeats} seats left</span>
            </div>

            <div className="hero-countdown" aria-label="Launch countdown timer">
              <div className="hero-time-box"><span>{countdown.days}</span><small>D</small></div>
              <div className="hero-time-box"><span>{countdown.hours}</span><small>H</small></div>
              <div className="hero-time-box"><span>{countdown.minutes}</span><small>M</small></div>
              <div className="hero-time-box"><span>{countdown.seconds}</span><small>S</small></div>
            </div>

            <Link to="/signup" className="hero-launch-cta">Claim Free Access</Link>
          </div>
        </div>
      </div>

      {toastVisible && liveRegistrant && (
        <div className="hero-live-registration-toast" role="status" aria-live="polite">
          <span className="hero-live-toast-dot" aria-hidden="true" />
          <div>
            <p className="hero-live-toast-title">New registration</p>
            <p className="hero-live-toast-text">{liveRegistrant} just joined with free premium access.</p>
          </div>
        </div>
      )}

      <div className="container hero-container">
        {/* Left: Text */}
        <div className="hero-text">
          <div className="hero-badge" lang="hi">
            <Sparkles size={14} />
            <span>अब AI-powered तैयारी</span>
          </div>

          <h1 className="hero-headline" lang="hi">
            UPTET की तैयारी अब <span className="text-gradient">Smart</span> तरीके से
          </h1>

          <p className="hero-subhead" lang="hi">
            10 साल के PYQ, topic-wise practice, और AI explanations — सब एक जगह।
            अपनी तैयारी को next level पर ले जाएं।
          </p>

          <div className="hero-ctas">
            <Link to="/signup" className="btn btn-gold btn-lg" id="hero-cta-primary">
              <span lang="hi">Free में शुरू करें</span>
              <ArrowRight size={20} />
            </Link>
            <Link to="/about" className="btn btn-ghost btn-lg" id="hero-cta-secondary">
              <Play size={18} />
              <span lang="hi">देखें कैसे काम करता है</span>
            </Link>
          </div>
        </div>

        {/* Right: Floating Question Card */}
        <div className="hero-visual">
          <div className="hero-question-card card-elevated" id="hero-question-demo">
            <div className="hq-badge" lang="hi">CDP · 2023 · Paper 1</div>
            <p className="hq-number">प्रश्न 7</p>
            <p className="hq-text question-text" lang="hi">
              "सीखने का वक्र" (Learning Curve) किसकी देन है?
            </p>
            <div className="hq-options">
              <div className="hq-option">A. <span lang="hi">पावलोव</span></div>
              <div className="hq-option hq-correct">B. <span lang="hi">एबिंगहॉस</span> ✓</div>
              <div className="hq-option">C. <span lang="hi">थॉर्नडाइक</span></div>
              <div className="hq-option">D. <span lang="hi">स्किनर</span></div>
            </div>
            <div className="hq-explanation" lang="hi">
              💡 एबिंगहॉस ने "भुलक्कड़ वक्र" और "सीखने का वक्र" दोनों दिए।
            </div>
          </div>

          {/* Floating stats pills */}
          <div className="hero-float-pill hero-float-1">
            <span className="pill-emoji">🔥</span>
            <span lang="hi">7 दिन streak!</span>
          </div>
          <div className="hero-float-pill hero-float-2">
            <span className="pill-emoji">🎯</span>
            <span>85% accuracy</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="container">
        <div className="hero-stats">
          {stats.map((stat) => (
            <div className="hero-stat" key={stat.label}>
              <stat.icon size={20} className="hero-stat-icon" />
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
