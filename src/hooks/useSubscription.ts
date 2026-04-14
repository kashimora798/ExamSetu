import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type SubTier = 'free' | 'pro';

interface SubscriptionState {
  tier: SubTier;
  loading: boolean;
  isPro: boolean;
  isFree: boolean;
  isGrandfatheredFree: boolean;
  launchAccessExpiresAt: string | null;
  /* Limits for the free tier */
  mockTestLimit: number;
  bookmarkLimit: number;
}

const FREE_LIMITS = {
  mockTestLimit: 5,
  bookmarkLimit: 20,
};

const LAUNCH_LIMITS = {
  mockTestLimit: Infinity,
  bookmarkLimit: 100,
};

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubTier>('free');
  const [loading, setLoading] = useState(true);
  const [isGrandfatheredFree, setIsGrandfatheredFree] = useState(false);
  const [launchAccessExpiresAt, setLaunchAccessExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTier('free');
      setIsGrandfatheredFree(false);
      setLaunchAccessExpiresAt(null);
      setLoading(false);
      return;
    }

    async function fetchSubscription() {
      const [{ data: subscriptionData }, { data: launchGateData }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('status, plans!inner(code)')
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase.rpc('check_launch_gate_eligibility', {
          p_user_id: user!.id,
          p_feature_name: 'launch_free_access',
        }),
      ]);

      const nextTier: SubTier = subscriptionData
        ? ((subscriptionData as any).plans?.code ?? '').startsWith('pro')
          ? 'pro'
          : 'free'
        : 'free';

      setTier(nextTier);

      const launchEligible = Boolean((launchGateData as any)?.eligible);
      setIsGrandfatheredFree(launchEligible && nextTier === 'free');
      setLaunchAccessExpiresAt((launchGateData as any)?.expires_at ?? null);
      setLoading(false);
    }

    fetchSubscription();
  }, [user]);

  const hasLaunchAccess = isGrandfatheredFree && tier === 'free';

  return {
    tier,
    loading,
    isPro: tier === 'pro',
    isFree: tier === 'free',
    isGrandfatheredFree,
    launchAccessExpiresAt,
    mockTestLimit: tier === 'pro' || hasLaunchAccess ? LAUNCH_LIMITS.mockTestLimit : FREE_LIMITS.mockTestLimit,
    bookmarkLimit: tier === 'pro' || hasLaunchAccess ? LAUNCH_LIMITS.bookmarkLimit : FREE_LIMITS.bookmarkLimit,
  };
}
